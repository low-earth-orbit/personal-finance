"""Tests for pooled-country history, sequence-preserving sampling, rescaling, and
the variance-ratio diagnostic added to ``analysis.shared.jst_history``.

Most tests are network-free: loaders are exercised with a patched ``load_jst_frame`` and the
low-level helpers with synthetic arrays. One regression test uses the local workbook when it is
available and skips otherwise.
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from analysis.shared.jst_history import (
    DATA_FILE,
    ReturnHistory,
    _affine_to_target,
    _assign_segments,
    _normalize_year_windows,
    _segment_bounds,
    _split_segments,
    BOND_COMPONENTS,
    load_pooled_bill_components,
    load_pooled_bills,
    load_pooled_bond_components,
    load_pooled_country_returns,
    real_bond_components,
    rescale_to_targets,
    sample_indices,
    sample_return_paths,
    variance_decomposition,
    variance_ratio,
)


def _vr_reference(returns, horizon, segment_ids, basis="arithmetic"):
    """Independent (explicit-loop) variance ratio for cross-checking the cumsum impl."""
    values = np.asarray(returns, dtype=float)
    if basis == "log":
        values = np.log1p(values)
    var_one = values.var()
    sums = []
    for run in _split_segments(values, segment_ids):
        for start in range(len(run) - horizon + 1):
            sums.append(run[start : start + horizon].sum())
    return np.var(sums) / (horizon * var_one)


class SegmentHelperTests(unittest.TestCase):
    def test_assign_segments_breaks_on_country_change_and_year_gap(self):
        countries = np.array(["X", "X", "X", "Y", "Y", "Y"])
        years = np.array([2000, 2001, 2002, 2010, 2011, 2013])
        # X 2000-2002 contiguous; Y restarts (country change), then 2011->2013 gap splits Y.
        np.testing.assert_array_equal(
            _assign_segments(countries, years), [0, 0, 0, 1, 1, 2]
        )

    def test_segment_bounds_none_is_single_circular_segment(self):
        seg_start, seg_len = _segment_bounds(None, 5)
        np.testing.assert_array_equal(seg_start, [0, 0, 0, 0, 0])
        np.testing.assert_array_equal(seg_len, [5, 5, 5, 5, 5])

    def test_segment_bounds_multi_segment(self):
        seg_start, seg_len = _segment_bounds(np.array([0, 0, 0, 1, 1]), 5)
        np.testing.assert_array_equal(seg_start, [0, 0, 0, 3, 3])
        np.testing.assert_array_equal(seg_len, [3, 3, 3, 2, 2])

    def test_split_segments(self):
        runs = _split_segments(np.arange(5), np.array([0, 0, 0, 1, 1]))
        self.assertEqual(len(runs), 2)
        np.testing.assert_array_equal(runs[0], [0, 1, 2])
        np.testing.assert_array_equal(runs[1], [3, 4])

    def test_normalize_year_windows_accepts_scalars_and_pairs(self):
        self.assertEqual(_normalize_year_windows(None), [])
        self.assertEqual(
            _normalize_year_windows([1923, (1939, 1948), (1948, 1939)]),
            [(1923, 1923), (1939, 1948), (1939, 1948)],
        )


class SegmentAwareSamplingTests(unittest.TestCase):
    def test_single_segment_ids_match_unsegmented(self):
        kwargs = dict(mode="historical-block", block_years=3, seed=11)
        unsegmented = sample_indices(5, 8, 6, **kwargs)
        as_one_segment = sample_indices(
            5, 8, 6, segment_ids=np.zeros(5, dtype=int), **kwargs
        )
        np.testing.assert_array_equal(unsegmented, as_one_segment)

    def test_block_continuations_never_cross_segments(self):
        segment_ids = np.array([0, 0, 0, 1, 1])
        observations, n_years, n_paths, block_years, seed = 5, 30, 200, 2, 19
        seg_start, seg_len = _segment_bounds(segment_ids, observations)

        indices = sample_indices(
            observations,
            n_years,
            n_paths,
            mode="historical-block",
            block_years=block_years,
            seed=seed,
            segment_ids=segment_ids,
        )

        # Reconstruct the exact RNG draw order to label restart vs continuation steps.
        rng = np.random.default_rng(seed)
        expected = np.empty_like(indices)
        expected[0] = rng.integers(0, observations, size=n_paths)
        restart_rows = []
        for year in range(1, n_years):
            starts = rng.integers(0, observations, size=n_paths)
            restarts = rng.random(n_paths) < 1 / block_years
            restart_rows.append(restarts)
            previous = expected[year - 1]
            origin = seg_start[previous]
            continuation = origin + ((previous - origin + 1) % seg_len[previous])
            expected[year] = np.where(restarts, starts, continuation)
        np.testing.assert_array_equal(indices, expected)

        continuations = ~np.stack(restart_rows)
        previous_segment = segment_ids[indices[:-1]]
        current_segment = segment_ids[indices[1:]]
        np.testing.assert_array_equal(
            previous_segment[continuations], current_segment[continuations]
        )
        # The within-segment circular wrap fires (segment tail -> segment head),
        # and never bridges into the next segment's head.
        self.assertTrue(np.any((indices[:-1] == 2) & (indices[1:] == 0)))
        self.assertFalse(np.any(continuations & (indices[:-1] == 2) & (indices[1:] == 3)))

    def test_sample_return_paths_threads_segments_through(self):
        history = ReturnHistory(
            years=np.array([2000, 2001, 2002, 2010, 2011]),
            equity=np.array([0.1, 0.2, 0.3, 0.4, 0.5]),
            fixed_income=np.array([0.01, 0.02, 0.03, 0.04, 0.05]),
            label="pooled synthetic",
            country_count=2,
            segment_ids=np.array([0, 0, 0, 1, 1]),
        )
        equity, bonds = sample_return_paths(
            history, 12, 8, mode="historical-block", block_years=2, seed=5
        )
        indices = sample_indices(
            history.observations,
            12,
            8,
            mode="historical-block",
            block_years=2,
            seed=5,
            segment_ids=history.segment_ids,
        )
        np.testing.assert_array_equal(equity, history.equity[indices])
        np.testing.assert_array_equal(bonds, history.fixed_income[indices])

    def test_segment_ids_length_mismatch_raises(self):
        with self.assertRaisesRegex(ValueError, "segment_ids length"):
            sample_indices(
                5, 4, 2, mode="historical-block", block_years=2, seed=1,
                segment_ids=np.zeros(4, dtype=int),
            )


class RescaleTests(unittest.TestCase):
    def _history(self):
        rng = np.random.default_rng(0)
        equity = rng.normal(0.05, 0.18, size=120)
        fixed_income = 0.4 * equity + rng.normal(0.01, 0.06, size=120)
        return ReturnHistory(
            years=np.arange(1900, 2020),
            equity=equity,
            fixed_income=fixed_income,
            label="synthetic",
            country_count=1,
            segment_ids=np.repeat([0, 1], 60),
        )

    def test_affine_hits_target_moments(self):
        out = _affine_to_target(np.array([0.1, -0.2, 0.3, -0.4]), 0.07, 0.15)
        self.assertAlmostEqual(out.mean(), 0.07)
        self.assertAlmostEqual(out.std(), 0.15)

    def test_affine_constant_series_maps_to_target_mean(self):
        out = _affine_to_target(np.full(5, 0.03), 0.07, 0.15)
        np.testing.assert_allclose(out, 0.07)

    def test_rescale_matches_targets_and_preserves_structure(self):
        history = self._history()
        rescaled = rescale_to_targets(
            history,
            equity_mean=0.068,
            equity_vol=0.157,
            fixed_income_mean=0.018,
            fixed_income_vol=0.06,
        )
        self.assertAlmostEqual(rescaled.equity.mean(), 0.068)
        self.assertAlmostEqual(rescaled.equity.std(), 0.157)
        self.assertAlmostEqual(rescaled.fixed_income.mean(), 0.018)
        self.assertAlmostEqual(rescaled.fixed_income.std(), 0.06)

        def autocorr(series):
            return np.corrcoef(series[:-1], series[1:])[0, 1]

        # Affine maps leave autocorrelation and cross-correlation invariant.
        self.assertAlmostEqual(autocorr(history.equity), autocorr(rescaled.equity))
        self.assertAlmostEqual(
            np.corrcoef(history.equity, history.fixed_income)[0, 1],
            np.corrcoef(rescaled.equity, rescaled.fixed_income)[0, 1],
        )
        np.testing.assert_array_equal(rescaled.segment_ids, history.segment_ids)
        np.testing.assert_array_equal(rescaled.years, history.years)
        self.assertIn("rescaled", rescaled.label)


class VarianceRatioTests(unittest.TestCase):
    def test_horizon_one_is_unity(self):
        rng = np.random.default_rng(3)
        returns = rng.normal(0.05, 0.15, size=200)
        self.assertAlmostEqual(variance_ratio(returns, 1), 1.0)

    def test_mean_reverting_below_one_persistent_above_one(self):
        reverting = np.tile([0.2, -0.15], 50)
        self.assertLess(variance_ratio(reverting, 2), 1.0)

        persistent = np.concatenate([np.full(30, 0.1), np.full(30, -0.1)])
        self.assertGreater(variance_ratio(persistent, 2), 1.0)

    def test_matches_explicit_loop_reference(self):
        returns = np.array([0.0, 0.1, 0.2, 1.0, 1.1])
        segment_ids = np.array([0, 0, 0, 1, 1])
        self.assertAlmostEqual(
            variance_ratio(returns, 2, segment_ids),
            _vr_reference(returns, 2, segment_ids),
        )

    def test_log_basis_remains_available(self):
        returns = np.array([0.0, 0.1, 0.2, 1.0, 1.1])
        segment_ids = np.array([0, 0, 0, 1, 1])
        self.assertAlmostEqual(
            variance_ratio(returns, 2, segment_ids, basis="log"),
            _vr_reference(returns, 2, segment_ids, basis="log"),
        )

    def test_segments_exclude_boundary_window(self):
        returns = np.array([0.0, 0.1, 0.2, 1.0, 1.1])
        segment_ids = np.array([0, 0, 0, 1, 1])
        # Segmenting drops the bridging (index 2 -> 3) 2-year window, changing the result.
        self.assertNotAlmostEqual(
            variance_ratio(returns, 2, segment_ids),
            variance_ratio(returns, 2, None),
        )

    def test_returns_nan_when_no_segment_long_enough(self):
        returns = np.array([0.1, 0.2, 0.3, 0.4])
        segment_ids = np.array([0, 0, 1, 1])
        self.assertTrue(np.isnan(variance_ratio(returns, 3, segment_ids)))


class PooledLoaderTests(unittest.TestCase):
    @staticmethod
    def _frame():
        # Three countries; X has a one-year hole (2002 missing) that should split it.
        rows = [
            ("X", 2000, None, None, None, 100.0),
            ("X", 2001, 0.10, 0.02, 0.01, 102.0),
            ("X", 2002, 0.12, 0.03, 0.01, 104.0),
            ("X", 2004, 0.08, 0.01, 0.01, 110.0),
            ("Y", 2000, None, None, None, 100.0),
            ("Y", 2001, 0.20, 0.05, 0.02, 103.0),
            ("Y", 2002, 0.15, 0.04, 0.02, 106.0),
            ("Z", 2000, None, None, None, 100.0),
            ("Z", 2001, 0.05, 0.01, 0.00, 101.0),
            ("Z", 2002, 0.06, 0.02, 0.00, 102.0),
        ]
        return pd.DataFrame(
            rows, columns=["country", "year", "eq_tr", "bond_tr", "bill_rate", "cpi"]
        )

    def test_pooled_concatenates_and_segments_per_country(self):
        with patch(
            "analysis.shared.jst_history.load_jst_frame", return_value=self._frame()
        ):
            history = load_pooled_country_returns()

        # X: 2001,2002 then a gap then 2004 -> two segments; Y and Z one each.
        # (The 2000 rows yield no return — first valid CPI change is dropped.)
        np.testing.assert_array_equal(
            history.years, [2001, 2002, 2004, 2001, 2002, 2001, 2002]
        )
        np.testing.assert_array_equal(history.segment_ids, [0, 0, 1, 2, 2, 3, 3])
        self.assertEqual(history.country_count, 3)
        self.assertIn("pooled", history.label)

    def test_pooled_exclude_country_and_year_window(self):
        with patch(
            "analysis.shared.jst_history.load_jst_frame", return_value=self._frame()
        ):
            history = load_pooled_country_returns(
                exclude_countries=["Z"], exclude_years=[(2002, 2002)]
            )

        # Z dropped; 2002 removed everywhere. X keeps 2001 and (separately) 2004; Y keeps 2001.
        np.testing.assert_array_equal(history.years, [2001, 2004, 2001])
        np.testing.assert_array_equal(history.segment_ids, [0, 1, 2])
        self.assertEqual(history.country_count, 2)

    def test_pooled_empty_selection_raises(self):
        with patch(
            "analysis.shared.jst_history.load_jst_frame", return_value=self._frame()
        ):
            with self.assertRaisesRegex(ValueError, "no countries selected"):
                load_pooled_country_returns(countries=["Nowhere"])

    @unittest.skipUnless(os.path.exists(DATA_FILE), "JST workbook unavailable")
    def test_full_pooled_bond_vr_uses_arithmetic_engine_basis(self):
        history = load_pooled_country_returns()
        self.assertGreater(variance_ratio(history.fixed_income, 10, history.segment_ids), 2.5)


class BondComponentTests(unittest.TestCase):
    @staticmethod
    def _frame():
        # Country X with a 2003 hole; 2004 has a return but no yield (all carry).
        rows = [
            ("X", 2000, None, None, 0.050, 100.0),
            ("X", 2001, 0.10, 0.02, 0.060, 104.0),
            ("X", 2002, 0.12, 0.09, 0.040, 105.0),
            ("X", 2004, 0.08, 0.03, None, 111.0),
            ("X", 2005, 0.05, 0.04, 0.050, 113.0),
            ("Y", 2000, None, None, 0.030, 100.0),
            ("Y", 2001, 0.20, -0.02, 0.050, 110.0),
            ("Y", 2002, 0.15, 0.07, 0.040, 112.0),
        ]
        frame = pd.DataFrame(
            rows, columns=["country", "year", "eq_tr", "bond_tr", "bond_rate", "cpi"]
        )
        frame["bill_rate"] = 0.01
        return frame

    def test_components_sum_to_real_bond_return(self):
        parts = real_bond_components(self._frame()[lambda f: f["country"] == "X"])
        np.testing.assert_array_equal(parts["year"], [2001, 2002, 2004, 2005])
        np.testing.assert_allclose(parts[list(BOND_COMPONENTS)].sum(axis=1), parts["fixed_income"])
        # Prior-year yield as carry; 2004 has neither a 2003 row nor its own yield, so its
        # whole nominal return is carry; 2005's prior yield is missing, so it uses its own.
        deflator = np.array([1.04, 105 / 104, 111 / 105, 113 / 111])
        np.testing.assert_allclose(parts["carry"], np.array([0.05, 0.06, 0.03, 0.05]) / deflator)
        self.assertAlmostEqual(parts["price"].iloc[2], 0.0)

    def test_pooled_components_match_pooled_history_rows(self):
        with patch(
            "analysis.shared.jst_history.load_jst_frame", return_value=self._frame()
        ):
            panel, segments = load_pooled_bond_components()
            history = load_pooled_country_returns()
        np.testing.assert_allclose(panel["fixed_income"], history.fixed_income)
        np.testing.assert_array_equal(segments, history.segment_ids)

    def test_pooled_bill_components_match_pooled_bills(self):
        with patch(
            "analysis.shared.jst_history.load_jst_frame", return_value=self._frame()
        ):
            panel, segments = load_pooled_bill_components(exclude_years=[2002])
            bills, bill_segments = load_pooled_bills(exclude_years=[2002])
        np.testing.assert_allclose(panel["bills"], bills)
        np.testing.assert_allclose(panel["rate"] + panel["inflation"], bills)
        np.testing.assert_array_equal(segments, bill_segments)

    def test_decomposition_sums_to_variance_ratio(self):
        rng = np.random.default_rng(5)
        a = np.cumsum(rng.normal(0, 0.01, 120)) * 0.1 + rng.normal(0, 0.02, 120)
        b = rng.normal(0, 0.03, 120)
        segment_ids = np.repeat([0, 1], 60)
        contrib = variance_decomposition(a + b, {"a": a, "b": b}, 10, segment_ids)
        self.assertAlmostEqual(
            sum(contrib.values()), variance_ratio(a + b, 10, segment_ids), places=12
        )

    @unittest.skipUnless(os.path.exists(DATA_FILE), "JST workbook unavailable")
    def test_full_pooled_bond_persistence_is_mostly_inflation(self):
        panel, segments = load_pooled_bond_components()
        total = panel["fixed_income"].to_numpy()
        contrib = variance_decomposition(
            total, {n: panel[n].to_numpy() for n in BOND_COMPONENTS}, 10, segments
        )
        self.assertGreater(contrib["inflation"], contrib["price"] + contrib["carry"])


if __name__ == "__main__":
    unittest.main()
