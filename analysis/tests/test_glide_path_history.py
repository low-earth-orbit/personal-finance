from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import io
import os
import runpy
import shlex
import sys
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from analysis.glide_path.interactive import _ask_choice, collect_argv, format_reproduction_command
from analysis.glide_path.markets import (
    PWL_CURVE,
    HistoricalMarket,
    IidMarket,
    build_alloc,
    build_market,
    forward_anchors,
)
from analysis.glide_path.recommender import recommend_glide_path
from analysis.glide_path.simulate import Lifecycle, tie_middle_argmax
from analysis.shared.returns import arithmetic_to_geometric, geometric_to_arithmetic
from analysis.shared.jst_history import (
    ReturnHistory,
    load_world_returns,
    real_stock_fixed_income_returns,
    sample_indices,
    sample_return_paths,
)
from analysis.glide_path.cli import build_parser, main as cli_main, parse_year_windows


def synthetic_history() -> ReturnHistory:
    return ReturnHistory(
        years=np.arange(2000, 2005),
        equity=np.array([0.10, -0.20, 0.30, -0.40, 0.50]),
        fixed_income=np.array([0.01, 0.02, 0.03, 0.04, 0.05]),
        label="synthetic world",
        country_count=2,
    )


class JstHistoryTests(unittest.TestCase):
    def test_real_returns_and_world_aggregation(self):
        frame = pd.DataFrame(
            [
                ("A", 2000, None, None, 100.0),
                ("A", 2001, 0.20, 0.10, 110.0),
                ("B", 2000, None, None, 100.0),
                ("B", 2001, 0.10, 0.00, 100.0),
            ],
            columns=["country", "year", "eq_tr", "bond_tr", "cpi"],
        )
        country = real_stock_fixed_income_returns(frame[frame["country"] == "A"])
        self.assertAlmostEqual(country.iloc[0]["equity"], 1.2 / 1.1 - 1)
        self.assertAlmostEqual(country.iloc[0]["fixed_income"], 0.0)

        with patch("analysis.shared.jst_history.load_jst_frame", return_value=frame):
            world = load_world_returns()
        self.assertEqual(world.country_count, 2)
        self.assertEqual(world.observations, 1)
        self.assertAlmostEqual(world.equity[0], ((1.2 / 1.1 - 1) + 0.10) / 2)
        self.assertAlmostEqual(world.fixed_income[0], 0.0)

    def test_historical_iid_preserves_pairs(self):
        history = synthetic_history()
        seed = 42
        expected = np.random.default_rng(seed).integers(
            0, history.observations, size=(6, 4)
        )
        indices = sample_indices(
            history.observations,
            6,
            4,
            mode="historical-iid",
            block_years=8,
            seed=seed,
        )
        np.testing.assert_array_equal(indices, expected)

        equity, bonds = sample_return_paths(
            history, 6, 4, mode="historical-iid", block_years=8, seed=seed
        )
        np.testing.assert_array_equal(equity, history.equity[expected])
        np.testing.assert_array_equal(bonds, history.fixed_income[expected])

    def test_historical_block_is_stationary_preserves_pairs_and_wrap(self):
        history = synthetic_history()
        seed = 7
        block_years = 3
        indices = sample_indices(
            history.observations,
            8,
            5,
            mode="historical-block",
            block_years=block_years,
            seed=seed,
        )

        rng = np.random.default_rng(seed)
        expected = np.empty_like(indices)
        expected[0] = rng.integers(0, history.observations, size=indices.shape[1])
        restarts_by_year = []
        for year in range(1, len(expected)):
            starts = rng.integers(0, history.observations, size=indices.shape[1])
            restarts = rng.random(indices.shape[1]) < 1 / block_years
            restarts_by_year.append(restarts)
            expected[year] = np.where(
                restarts,
                starts,
                (expected[year - 1] + 1) % history.observations,
            )
        np.testing.assert_array_equal(indices, expected)

        restarts = np.stack(restarts_by_year)
        continuations = ~restarts
        diffs = np.diff(indices, axis=0) % history.observations
        np.testing.assert_array_equal(
            diffs[continuations], np.ones(continuations.sum(), dtype=int)
        )

        equity, bonds = sample_return_paths(
            history, 8, 5, mode="historical-block", block_years=block_years, seed=seed
        )
        np.testing.assert_array_equal(equity, history.equity[indices])
        np.testing.assert_array_equal(bonds, history.fixed_income[indices])
        self.assertTrue(np.any((indices[:-1] == history.observations - 1) & (indices[1:] == 0)))

    def test_historical_block_uses_configured_average_length(self):
        indices = sample_indices(
            10_000,
            500,
            1_000,
            mode="historical-block",
            block_years=10,
            seed=19,
        )
        restart_rate = np.mean(indices[1:] != (indices[:-1] + 1) % 10_000)
        self.assertAlmostEqual(restart_rate, 0.1, delta=0.002)

    def test_invalid_historical_sampling_inputs(self):
        with self.assertRaisesRegex(ValueError, "block_years"):
            sample_indices(5, 4, 2, mode="historical-block", block_years=0, seed=1)
        with self.assertRaisesRegex(ValueError, "unsupported historical mode"):
            sample_indices(5, 4, 2, mode="other", block_years=2, seed=1)


class GlidePathMarketTests(unittest.TestCase):
    def test_geometric_arithmetic_curve_conversion_round_trips(self):
        geometric = np.array([0.0142, 0.0467, 0.0687])
        volatility = np.array([0.0538, 0.1231, 0.1257])
        arithmetic = geometric_to_arithmetic(geometric, volatility)
        np.testing.assert_allclose(
            arithmetic_to_geometric(arithmetic, volatility), geometric, rtol=0, atol=1e-14
        )

    def test_iid_compound_growth_matches_geometric_curve_means(self):
        market = IidMarket(build_alloc(PWL_CURVE, 2.1, True))
        sample = market.sample(500, 5_000, seed=17)
        for weight, expected in ((1.0, 0.0467), (0.0, 0.0142)):
            growth = np.expm1(
                np.mean(
                    np.log1p(
                        np.clip(
                            market.annual_returns(weight, sample, np.arange(500)),
                            -0.999999,
                            np.inf,
                        )
                    ),
                    axis=0,
                )
            )
            self.assertAlmostEqual(float(np.mean(growth)), expected, delta=0.0005)

    def test_arithmetic_curve_basis_preserves_old_deflation(self):
        curve = [(1.0, 8.0, 12.0), (0.0, 3.0, 5.0)]
        alloc = build_alloc(curve, 2.0, True, curve_mean_basis="arithmetic")
        means, vols = alloc(np.array([0.0, 1.0]))
        np.testing.assert_allclose(means, [(1.03 / 1.02) - 1, (1.08 / 1.02) - 1])
        np.testing.assert_allclose(vols, [0.05 / 1.02, 0.12 / 1.02])

    def test_interactive_prompts_build_cli_argv(self):
        answers = [
            "40", "60", "95", "500000", "30000",      # about you
            "70000", "30000", "65",                     # target, guaranteed, start age
            "0.5", "0.035",                             # flex, withdrawal rate
            "6", "0.97", "b",                           # gamma, beta, bequest "some"
            "150", "100", "1.5",                        # max equity, retirement max, borrow
            "c", "",                                    # historical-block, pooled
            "8", "5", "30000", "out",                   # block years, interval, paths, plot
        ]
        with patch("builtins.input", side_effect=answers), redirect_stdout(io.StringIO()):
            argv = collect_argv()
        self.assertEqual(argv, [
            "--start-age", "40", "--accum", "20", "--retire", "35", "--savings", "500000",
            "--contrib", "30000", "--target-income", "70000", "--guaranteed-income", "30000",
            "--flex", "0.5", "--gamma", "6", "--beta", "0.97", "--max-leverage", "1.5",
            "--interval", "5", "--paths", "30000", "--guaranteed-start-age", "65",
            "--withdrawal-rate", "0.035", "--bequest-weight", "0.25",
            "--retirement-max-equity", "1", "--borrow-cost", "1.5",
            "--mode", "historical-block", "--block-years", "8", "--plot", "out.png",
        ])
        self.assertEqual(
            shlex.split(format_reproduction_command(argv)),
            ["python3", "analysis/recommend_glide.py", *argv],
        )
        # Every emitted flag parses in the CLI.
        args = build_parser().parse_args(argv)
        self.assertEqual(args.guaranteed_start_age, 65)
        self.assertEqual(args.bequest_weight, 0.25)

    def test_interactive_defaults_emit_compare_and_skip_optional_flags(self):
        answers = [""] * 9 + ["", "", ""] + ["", "", "e", "", "", "", ""]
        # defaults: no flex rate prompt, no borrow prompt; "e" picks compare (block years asked)
        with patch("builtins.input", side_effect=answers), redirect_stdout(io.StringIO()):
            argv = collect_argv()
        self.assertIn("--compare-modes", argv)
        for flag in ("--mode", "--guaranteed-start-age", "--bequest-weight", "--withdrawal-rate",
                     "--retirement-max-equity", "--borrow-cost", "--dataset", "--plot"):
            self.assertNotIn(flag, argv)
        build_parser().parse_args(argv)

    def test_cli_interactive_flag_runs_prompt_flow(self):
        with patch("analysis.glide_path.interactive.run_interactive") as run:
            cli_main(["-i"])
        run.assert_called_once_with()

    def test_cli_guaranteed_start_age_becomes_delay(self):
        with patch(
            "analysis.glide_path.cli.recommend_glide_path", return_value={}
        ) as recommend, patch("analysis.glide_path.cli.print_rec"):
            cli_main(["--start-age", "40", "--accum", "20", "--guaranteed-start-age", "65",
                      "--bequest-weight", "0.5"])
        kwargs = recommend.call_args.kwargs
        self.assertEqual(kwargs["guaranteed_delay"], 5)
        self.assertEqual(kwargs["bequest_weight"], 0.5)
        stderr = io.StringIO()
        with redirect_stderr(stderr), self.assertRaises(SystemExit):
            cli_main(["--guaranteed-start-age", "65"])
        self.assertIn("requires --start-age", stderr.getvalue())

    def test_cli_compare_modes_runs_four_models(self):
        rec = {"schedule": [{"year_start": 0, "phase": "accum", "equity_pct": 50.0}],
               "ce_income": 1.0, "depletion": 0.0, "flat_equity_pct": 50.0,
               "flat_ce_income": 1.0, "over_funded": False}
        with patch(
            "analysis.glide_path.cli.recommend_glide_path", return_value=rec
        ) as recommend, redirect_stdout(io.StringIO()) as out:
            cli_main(["--compare-modes"])
        modes = [c.kwargs["return_mode"] for c in recommend.call_args_list]
        self.assertEqual(modes, ["iid-mc", "forward-block", "historical-block", "historical-block"])
        self.assertEqual(recommend.call_args_list[-1].kwargs["exclude_years"], [(1871, 1989)])
        self.assertIn("hist-block 1990-2020", out.getvalue())
        stderr = io.StringIO()
        with redirect_stderr(stderr), self.assertRaises(SystemExit):
            cli_main(["--compare-modes", "--mode", "iid-mc"])

    def test_cli_forwards_beta_and_path_count(self):
        with patch(
            "analysis.glide_path.cli.recommend_glide_path", return_value={}
        ) as recommend, patch("analysis.glide_path.cli.print_rec"):
            cli_main(["--beta", "0.97", "--paths", "1234"])

        self.assertEqual(recommend.call_args.kwargs["beta"], 0.97)
        self.assertEqual(recommend.call_args.kwargs["n_paths"], 1234)

    def test_cli_forwards_retirement_equity_ceiling(self):
        with patch(
            "analysis.glide_path.cli.recommend_glide_path", return_value={}
        ) as recommend, patch("analysis.glide_path.cli.print_rec"):
            cli_main(["--max-leverage", "1.5", "--retirement-max-equity", "0.6"])

        self.assertEqual(recommend.call_args.kwargs["retirement_max_equity"], 0.6)

    def test_cli_uses_shared_baseline_model_defaults(self):
        with patch(
            "analysis.glide_path.cli.recommend_glide_path", return_value={}
        ) as recommend, patch("analysis.glide_path.cli.print_rec"):
            cli_main([])

        defaults = recommend.call_args.kwargs
        self.assertEqual(defaults["flexibility"], 0.0)
        self.assertEqual(defaults["withdrawal_rate"], 0.04)
        self.assertEqual(defaults["interval"], 5)
        self.assertEqual(defaults["gamma"], 4.0)
        self.assertEqual(defaults["beta"], 0.985)
        self.assertEqual(defaults["borrow_cost"], 2.0)

    def test_direct_script_historical_imports_resolve(self):
        script = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "glide_path",
            "recommender.py",
        )
        original_path = sys.path.copy()
        try:
            namespace = runpy.run_path(script)
            history = synthetic_history()
            with patch(
                "analysis.shared.jst_history.load_world_returns", return_value=history
            ) as loader:
                market = namespace["build_market"]("historical-iid", dataset="world")
            loader.assert_called_once_with()
            self.assertIs(market.history, history)

            sample = market.sample(2, 3, seed=7)
            self.assertEqual(sample[0].shape, (2, 3))
            self.assertEqual(sample[1].shape, (2, 3))
        finally:
            sys.path[:] = original_path

    def test_historical_mix_and_leverage(self):
        history = synthetic_history()
        market = HistoricalMarket(
            history, mode="historical-iid", block_years=8, borrow_real=0.02
        )
        sample = (
            np.array([[0.10, -0.20]]),
            np.array([[0.04, 0.06]]),
        )
        weights = np.array([0.0, 0.5, 1.0, 1.5])
        actual = market.annual_returns(weights, sample, 0)
        expected = np.array(
            [
                [0.04, 0.06],
                [0.07, -0.07],
                [0.10, -0.20],
                [0.14, -0.31],
            ]
        )
        np.testing.assert_allclose(actual, expected)

        mean = market.mean_returns(weights)
        eq_mean = history.equity.mean()
        bond_mean = history.fixed_income.mean()
        np.testing.assert_allclose(
            mean,
            [
                bond_mean,
                0.5 * eq_mean + 0.5 * bond_mean,
                eq_mean,
                1.5 * eq_mean - 0.5 * 0.02,
            ],
        )

    def test_market_validation_and_metadata(self):
        history = synthetic_history()
        with self.assertRaisesRegex(ValueError, "return_mode"):
            build_market("other", PWL_CURVE, 2.1, True, 2.0, 8, history)
        with self.assertRaisesRegex(ValueError, "block_years"):
            build_market("historical-block", PWL_CURVE, 2.1, True, 2.0, 0, history)

        market = build_market(
            "historical-block", PWL_CURVE, 2.1, True, 2.0, 3, history
        )
        self.assertEqual(market.metadata["return_mode"], "historical-block")
        self.assertEqual(market.metadata["history_start_year"], 2000)
        self.assertEqual(market.metadata["history_end_year"], 2004)
        self.assertEqual(market.metadata["history_observations"], 5)
        self.assertEqual(market.metadata["block_method"], "stationary-circular")
        self.assertEqual(market.metadata["block_years"], 3)

    def test_forward_block_rescales_marginals_and_samples_as_block(self):
        history = synthetic_history()
        market = build_market("forward-block", PWL_CURVE, 2.1, True, 2.0, 5, history)
        # Reports forward-block but samples with stationary-circular blocks.
        self.assertEqual(market.mode, "historical-block")
        self.assertEqual(market.metadata["return_mode"], "forward-block")
        self.assertEqual(market.metadata["block_method"], "stationary-circular")
        self.assertEqual(market.metadata["block_years"], 5)
        # Marginals are rescaled to exactly the iid-mc curve anchors.
        eq_mean, eq_vol, bond_mean, bond_vol = forward_anchors(PWL_CURVE, 2.1, True)
        self.assertAlmostEqual(market.history.equity.mean(), eq_mean)
        self.assertAlmostEqual(market.history.equity.std(), eq_vol)
        self.assertAlmostEqual(market.history.fixed_income.mean(), bond_mean)
        self.assertAlmostEqual(market.history.fixed_income.std(), bond_vol)

    def test_pooled_dataset_routes_to_pooled_loader(self):
        history = synthetic_history()
        with patch(
            "analysis.shared.jst_history.load_pooled_country_returns",
            return_value=history,
        ) as loader:
            market = build_market(
                "historical-block", PWL_CURVE, 2.1, True, 2.0, 5,
                dataset="pooled",
                exclude_countries=["Germany"],
                exclude_years=[(1914, 1923)],
            )
        loader.assert_called_once_with(
            exclude_countries=["Germany"],
            exclude_years=[(1914, 1923)],
        )
        self.assertEqual(market.metadata["dataset"], "pooled")

    def test_iid_rejects_exclusions(self):
        with self.assertRaisesRegex(ValueError, "dataset/exclusions apply only"):
            build_market("iid-mc", PWL_CURVE, 2.1, True, 2.0, 5,
                          exclude_countries=["Germany"])

    def test_world_dataset_rejects_exclusions(self):
        with self.assertRaisesRegex(ValueError, "exclusions require dataset='pooled'"):
            build_market(
                "historical-block", PWL_CURVE, 2.1, True, 2.0, 5,
                dataset="world", exclude_countries=["Germany"],
            )

    def test_ask_choice_accepts_letter_name_and_default(self):
        choices = ["iid-mc", "historical-iid", "historical-block"]
        with patch("builtins.input", return_value="c"):
            self.assertEqual(_ask_choice("Mode", "iid-mc", choices), "historical-block")
        with patch("builtins.input", return_value=""):
            self.assertEqual(_ask_choice("Mode", "iid-mc", choices), "iid-mc")
        with patch("builtins.input", return_value="historical-iid"):
            self.assertEqual(_ask_choice("Mode", "iid-mc", choices), "historical-iid")
        # An invalid token re-prompts, then a valid letter resolves.
        with patch("builtins.input", side_effect=["z", "b"]):
            self.assertEqual(_ask_choice("Mode", "iid-mc", choices), "historical-iid")

    def test_cli_rejects_exclusions_with_world_dataset(self):
        stderr = io.StringIO()
        with redirect_stderr(stderr), self.assertRaises(SystemExit):
            cli_main(["--mode", "historical-block", "--dataset", "world",
                      "--exclude-countries", "Germany"])
        self.assertIn("require --dataset pooled", stderr.getvalue())

    def test_cli_forwards_dataset_and_exclusions(self):
        with patch(
            "analysis.glide_path.cli.recommend_glide_path", return_value={}
        ) as recommend, patch("analysis.glide_path.cli.print_rec"):
            cli_main([
                "--mode", "forward-block", "--dataset", "pooled",
                "--exclude-countries", "Germany", "Japan",
                "--exclude-years", "1923", "1914-1923",
            ])
        kwargs = recommend.call_args.kwargs
        self.assertEqual(kwargs["dataset"], "pooled")
        self.assertEqual(kwargs["exclude_countries"], ["Germany", "Japan"])
        self.assertEqual(kwargs["exclude_years"], [1923, (1914, 1923)])

    def test_default_mode_is_iid_mc(self):
        # Default recommend_glide_path call uses iid-mc (the no-recovery baseline;
        # forward-block is the historical-sequencing scenario mode).
        result = self._recommend()
        self.assertEqual(result["params"]["return_mode"], "iid-mc")

    def test_all_modes_are_deterministic_end_to_end(self):
        history = synthetic_history()
        for mode in ("iid-mc", "historical-iid", "historical-block"):
            with self.subTest(mode=mode), patch(
                "analysis.glide_path.markets.load_history", return_value=history
            ):
                first = self._recommend(return_mode=mode, block_years=2)
                second = self._recommend(return_mode=mode, block_years=2)
            self.assertEqual(first, second)
            self.assertEqual(first["params"]["return_mode"], mode)
            if mode != "iid-mc":
                self.assertEqual(first["params"]["history_source"], "synthetic world")

    def test_parse_year_windows_handles_scalars_and_ranges(self):
        self.assertEqual(
            parse_year_windows(["1923", "1914-1923"]), [1923, (1914, 1923)]
        )

    def test_cli_rejects_custom_curve_for_historical_mode(self):
        stderr = io.StringIO()
        with redirect_stderr(stderr), self.assertRaises(SystemExit):
            cli_main(["--mode", "historical-iid", "--curve", "curve.csv"])
        self.assertIn("--curve is only supported", stderr.getvalue())

    def test_retirement_equity_ceiling_does_not_limit_accumulation(self):
        rec = self._recommend(
            accum_years=3,
            retire_years=3,
            interval=2,
            gamma=1.0,
            max_leverage=1.5,
            retirement_max_equity=0.5,
            borrow_cost=0.0,
        )
        self.assertLessEqual(max(rec["equity_by_year"][3:]), 0.5)
        self.assertEqual(rec["schedule"][1]["year_end"], 2)
        self.assertEqual(rec["schedule"][2]["year_start"], 3)

    def test_flexible_terminal_year_keeps_incoming_equity_on_tie(self):
        rec = self._recommend(
            accum_years=2,
            retire_years=3,
            interval=1,
            flexibility=1.0,
            withdrawal_rate=0.04,
            n_paths=120,
            passes=4,
        )
        self.assertEqual(rec["equity_by_year"][-1], rec["equity_by_year"][-2])

    def test_coordinate_ascent_moves_off_the_flat_start(self):
        # Regression: an absolute tie tolerance (1e-12) exceeded CRRA utility differences
        # (~1e-14 at gamma=4) and froze the ascent at the flat initialisation.
        rec = recommend_glide_path(n_paths=2_000, passes=3)
        self.assertGreater(len(set(rec["equity_by_year"])), 1)

    def test_fully_covered_constant_spending_is_undetermined(self):
        with self.assertRaisesRegex(ValueError, "allocation undetermined"):
            self._recommend(flexibility=0.0, target_income=40_000, guaranteed_income=40_000)
        # A bridge does not help (bridge years are floored at the guaranteed amount)...
        with self.assertRaisesRegex(ValueError, "allocation undetermined"):
            self._recommend(flexibility=0.0, target_income=40_000, guaranteed_income=40_000,
                            retire_years=3, guaranteed_delay=1)
        # ...but a bequest motive makes the allocation matter again.
        self._recommend(flexibility=0.0, target_income=40_000, guaranteed_income=40_000,
                        bequest_weight=0.25)

    def test_defaults_reproduce_no_bequest_no_bridge(self):
        base = self._recommend()
        explicit = self._recommend(bequest_weight=0.0, guaranteed_delay=0)
        self.assertEqual(base, explicit)
        self.assertEqual(base["welfare_ce"], base["ce_income"])
        self.assertGreater(base["median_bequest"], 0)
        self.assertTrue(base["over_funded"])  # the tiny test household is over-funded
        self.assertFalse(self._recommend(current_savings=0)["over_funded"])

    def test_guaranteed_delay_zeroes_income_during_bridge(self):
        life = Lifecycle.build(accum_years=0, retire_years=4, current_savings=1e6,
                               annual_contribution=0, target_income=60_000,
                               guaranteed_income=20_000, flexibility=0.0, withdrawal_rate=0.04,
                               gamma=4.0, beta=1.0, guaranteed_delay=2)
        np.testing.assert_array_equal(life.guaranteed, [0, 0, 20_000, 20_000])
        np.testing.assert_array_equal(life.gap, [60_000, 60_000, 40_000, 40_000])
        np.testing.assert_array_equal(life.consumption_floor, [20_000, 20_000, 0, 0])
        no_bridge = self._recommend(retire_years=4)
        bridge = self._recommend(retire_years=4, guaranteed_delay=2)
        self.assertGreater(bridge["initial_target_draw"], no_bridge["initial_target_draw"])
        self.assertEqual(bridge["params"]["guaranteed_delay"], 2)

    def test_bequest_weight_raises_welfare_and_rewards_money_left(self):
        rec = self._recommend(bequest_weight=0.5)
        self.assertGreater(rec["welfare_ce"], rec["ce_income"])
        self.assertEqual(rec["params"]["bequest_offset"], 40_000)
        with self.assertRaisesRegex(ValueError, "bequest_offset"):
            self._recommend(bequest_weight=0.5, bequest_offset=0)

    def test_over_funded_plan_is_flagged_and_ties_take_the_middle(self):
        rec = self._recommend(current_savings=5_000_000, grid_step=0.25)
        self.assertTrue(rec["over_funded"])
        # Every weight ties exactly: the flat comparator is the middle of 0..100%, not 0%.
        self.assertEqual(rec["flat_equity_pct"], 50.0)
        self.assertFalse(self._recommend(current_savings=5_000_000, grid_step=0.25,
                                         bequest_weight=0.25)["over_funded"])

    def test_tie_middle_argmax(self):
        self.assertEqual(tie_middle_argmax([1.0, 1.0, 1.0, 1.0, 1.0]), 2)
        self.assertEqual(tie_middle_argmax([0.0, 3.0, 1.0]), 1)
        self.assertEqual(tie_middle_argmax([-2.0, -1.0, -1.0, -3.0]), 2)

    @staticmethod
    def _recommend(**overrides):
        params = dict(
            accum_years=2,
            retire_years=2,
            interval=2,
            n_paths=40,
            grid_step=0.5,
            passes=1,
            seed=123,
            current_savings=100_000,
            annual_contribution=10_000,
            target_income=40_000,
            guaranteed_income=20_000,
        )
        params.update(overrides)
        return recommend_glide_path(**params)


if __name__ == "__main__":
    unittest.main()
