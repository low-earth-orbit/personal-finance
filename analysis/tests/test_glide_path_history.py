from __future__ import annotations

from contextlib import redirect_stderr
import io
import os
import runpy
import shlex
import sys
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from analysis.glide_path.recommender import (
    PWL_CURVE,
    _HistoricalMarket,
    _build_market,
    _forward_anchors,
    format_reproduction_command,
    recommend_glide_path,
)
from analysis.shared.jst_history import (
    ReturnHistory,
    load_world_returns,
    real_stock_fixed_income_returns,
    sample_indices,
    sample_return_paths,
)
from analysis.glide_path.cli import main as cli_main, parse_year_windows


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
    def test_reproduction_command_includes_resolved_interactive_inputs(self):
        command = format_reproduction_command(
            accum_years=25,
            retire_years=35,
            flexibility=0.5,
            guaranteed_income=30_000.0,
            interval=5,
            gamma=6.0,
            beta=0.97,
            max_leverage=1.5,
            borrow_cost=1.5,
            current_savings=500_000.0,
            annual_contribution=30_000.0,
            target_income=70_000.0,
            withdrawal_rate=0.04,
            start_age=40,
            return_mode="historical-block",
            block_years=8,
            n_paths=30_000,
        )

        self.assertEqual(
            shlex.split(command),
            [
                "python3",
                "analysis/recommend_glide.py",
                "--accum",
                "25",
                "--retire",
                "35",
                "--flex",
                "0.5",
                "--guaranteed-income",
                "30000",
                "--interval",
                "5",
                "--gamma",
                "6",
                "--beta",
                "0.97",
                "--start-age",
                "40",
                "--savings",
                "500000",
                "--contrib",
                "30000",
                "--target-income",
                "70000",
                "--withdrawal-rate",
                "0.04",
                "--mode",
                "historical-block",
                "--max-leverage",
                "1.5",
                "--paths",
                "30000",
                "--borrow-cost",
                "1.5",
                "--block-years",
                "8",
            ],
        )

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
                loaded = namespace["_load_world_history"]()
            loader.assert_called_once_with()
            self.assertIs(loaded, history)

            market = namespace["_HistoricalMarket"](
                history, mode="historical-iid", block_years=2, borrow_real=0.02
            )
            sample = market.sample(2, 3, seed=7)
            self.assertEqual(sample[0].shape, (2, 3))
            self.assertEqual(sample[1].shape, (2, 3))
        finally:
            sys.path[:] = original_path

    def test_historical_mix_and_leverage(self):
        history = synthetic_history()
        market = _HistoricalMarket(
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
            _build_market("other", PWL_CURVE, 2.1, True, 2.0, 8, history)
        with self.assertRaisesRegex(ValueError, "block_years"):
            _build_market("historical-block", PWL_CURVE, 2.1, True, 2.0, 0, history)

        market = _build_market(
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
        market = _build_market("forward-block", PWL_CURVE, 2.1, True, 2.0, 5, history)
        # Reports forward-block but samples with stationary-circular blocks.
        self.assertEqual(market.mode, "historical-block")
        self.assertEqual(market.metadata["return_mode"], "forward-block")
        self.assertEqual(market.metadata["block_method"], "stationary-circular")
        self.assertEqual(market.metadata["block_years"], 5)
        # Marginals are rescaled to exactly the iid-mc curve anchors.
        eq_mean, eq_vol, bond_mean, bond_vol = _forward_anchors(PWL_CURVE, 2.1, True)
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
            market = _build_market(
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
            _build_market("iid-mc", PWL_CURVE, 2.1, True, 2.0, 5,
                          exclude_countries=["Germany"])

    def test_world_dataset_rejects_exclusions(self):
        with self.assertRaisesRegex(ValueError, "exclusions require dataset='pooled'"):
            _build_market(
                "historical-block", PWL_CURVE, 2.1, True, 2.0, 5,
                dataset="world", exclude_countries=["Germany"],
            )

    def test_ask_choice_accepts_letter_name_and_default(self):
        from analysis.glide_path.recommender import _ask_choice

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

    def test_reproduction_command_emits_dataset_only_when_not_pooled(self):
        base = dict(
            accum_years=0, retire_years=30, flexibility=0.0, guaranteed_income=20_000.0,
            interval=5, gamma=4.0, beta=0.985, max_leverage=1.0, borrow_cost=2.0,
            current_savings=1_000_000.0, annual_contribution=0.0, target_income=60_000.0,
            withdrawal_rate=0.04, start_age=None, return_mode="forward-block",
            block_years=10, n_paths=5_000,
        )
        # pooled is the new default — should be omitted from the command
        self.assertNotIn("--dataset", shlex.split(format_reproduction_command(dataset="pooled", **base)))
        # world is non-default — should be emitted
        world = shlex.split(format_reproduction_command(dataset="world", **base))
        self.assertEqual(world[world.index("--dataset") + 1], "world")

    def test_reproduction_command_forward_block_emits_block_years(self):
        command = format_reproduction_command(
            accum_years=0, retire_years=30, flexibility=0.0, guaranteed_income=20_000.0,
            interval=5, gamma=4.0, beta=0.985, max_leverage=1.0,
            borrow_cost=2.0, current_savings=1_000_000.0, annual_contribution=0.0,
            target_income=60_000.0, withdrawal_rate=0.04, start_age=None,
            return_mode="forward-block", block_years=7,
            n_paths=5_000,
        )
        tokens = shlex.split(command)
        self.assertIn("forward-block", tokens)
        self.assertEqual(tokens[tokens.index("--block-years") + 1], "7")

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
        # Default recommend_glide_path call uses iid-mc (the regime-robust default;
        # forward-block is the historical-sequencing scenario mode).
        result = self._recommend()
        self.assertEqual(result["params"]["return_mode"], "iid-mc")

    def test_all_modes_are_deterministic_end_to_end(self):
        history = synthetic_history()
        for mode in ("iid-mc", "historical-iid", "historical-block"):
            with self.subTest(mode=mode), patch(
                "analysis.glide_path.recommender._load_history", return_value=history
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
