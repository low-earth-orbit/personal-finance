"""Return models for the glide-path engine.

A *market* turns an equity weight (or a per-year vector of weights) into annual real portfolio
returns on a shared sample of simulated paths. Two implementations:

  IidMarket        forward-CMA curve, iid normal draws (``iid-mc``)
  HistoricalMarket paired real stock/bond years from JST history, sampled iid or in stationary
                   blocks (``historical-iid`` / ``historical-block`` / ``forward-block``)

The capital-market curve lists NOMINAL GEOMETRIC (compound) returns by default. ``build_alloc``
converts each anchor to the matching arithmetic mean (exact lognormal relation) before deflating,
so simulated compound growth matches the curve's stated rate.
"""

from __future__ import annotations

from typing import Callable, Sequence

import numpy as np

from analysis.shared.returns import arithmetic_to_geometric, geometric_to_arithmetic

# The app's PWL / FP-Canada allocation table (presets.ts): (equity weight, nominal geometric %,
# volatility %). Deflated with 2.1% inflation by default.
PWL_CURVE = [
    (1.00, 6.87, 12.57), (0.90, 6.59, 11.59), (0.80, 6.29, 10.62),
    (0.70, 5.99, 9.68), (0.60, 5.67, 8.79), (0.50, 5.35, 7.94),
    (0.40, 5.01, 7.17), (0.30, 4.66, 6.49), (0.20, 4.30, 5.94),
    (0.10, 3.93, 5.56), (0.00, 3.55, 5.38),
]

RETURN_MODES = ("iid-mc", "historical-iid", "historical-block", "forward-block")
BLOCK_MODES = ("historical-block", "forward-block")  # modes that preserve sequencing
DATASETS = ("world", "pooled")
CURVE_MEAN_BASES = ("geometric", "arithmetic")

Sampler = Callable[..., tuple]  # same signature as jst_history.sample_return_paths


# ── forward-CMA curve ─────────────────────────────────────────────────────────
def build_alloc(alloc_curve=PWL_CURVE, inflation=2.1, returns_in_percent=True, borrow_cost=0.0,
                curve_mean_basis="geometric"):
    """Return ``alloc(w) -> (real arithmetic mean, real vol)`` interpolated along the curve.

    For w > 1 (leverage) the investor borrows (w−1) at the REAL ``borrow_cost`` to hold w in the
    all-equity portfolio: mean = w·eq_mean − (w−1)·borrow, vol = w·eq_vol.
    """
    if curve_mean_basis not in CURVE_MEAN_BASES:
        raise ValueError("curve_mean_basis must be 'geometric' or 'arithmetic'")
    anchors = sorted((float(w), float(m), float(v)) for w, m, v in alloc_curve)
    cw = np.array([a[0] for a in anchors])
    cm = np.array([a[1] for a in anchors])
    cv = np.array([a[2] for a in anchors])
    scale = 100.0 if returns_in_percent else 1.0
    infl = inflation / scale
    nominal_vol = cv / scale
    nominal_arith = (geometric_to_arithmetic(cm / scale, nominal_vol)
                     if curve_mean_basis == "geometric" else cm / scale)
    real_mean = (1.0 + nominal_arith) / (1.0 + infl) - 1.0
    real_vol = nominal_vol / (1.0 + infl)
    borrow_real = borrow_cost / scale
    eq_mean = float(np.interp(1.0, cw, real_mean))
    eq_vol = float(np.interp(1.0, cw, real_vol))

    def alloc(w):
        w = np.asarray(w, dtype=float)
        wc = np.minimum(w, 1.0)
        m = np.interp(wc.ravel(), cw, real_mean).reshape(w.shape)
        s = np.interp(wc.ravel(), cw, real_vol).reshape(w.shape)
        over = w > 1.0
        if np.any(over):
            m = np.where(over, w * eq_mean - (w - 1.0) * borrow_real, m)
            s = np.where(over, w * eq_vol, s)
        return m, s

    return alloc


def forward_anchors(alloc_curve=PWL_CURVE, inflation=2.1, returns_in_percent=True,
                    curve_mean_basis="geometric"):
    """Real arithmetic (equity mean, equity vol, bond mean, bond vol) at w=1 and w=0.

    These are the targets forward-block rescales history to, so its marginals match iid-mc."""
    alloc = build_alloc(alloc_curve, inflation, returns_in_percent, 0.0, curve_mean_basis)
    means, vols = alloc(np.array([0.0, 1.0]))
    return float(means[1]), float(vols[1]), float(means[0]), float(vols[0])


# ── markets ───────────────────────────────────────────────────────────────────
class IidMarket:
    """Forward-CMA returns: iid normal draws around the curve's real arithmetic mean."""

    def __init__(self, alloc):
        self.alloc = alloc
        self.metadata = {"return_mode": "iid-mc", "block_method": None, "block_years": None}

    def sample(self, n_years, n_paths, seed):
        return np.random.default_rng(seed).standard_normal((n_years, n_paths))

    @staticmethod
    def path_count(sample):
        return sample.shape[1]

    def annual_returns(self, weights, sample, year):
        """Returns for one year: scalar weight → (n,), weight vector (G,) → (G, n)."""
        means, vols = self.alloc(weights)
        if np.ndim(weights) == 0:
            return means + vols * sample[year]
        return means[:, None] + vols[:, None] * sample[year][None, :]

    def geometric_returns(self, weights):
        """Median-path (compound) annual return for each weight."""
        means, vols = self.alloc(weights)
        return arithmetic_to_geometric(means, vols)


class HistoricalMarket:
    """Paired real stock/bond years from a ``ReturnHistory``, sampled iid or in blocks.

    ``mode`` is the index-sampling mode (historical-iid | historical-block); ``return_mode`` is
    the reported label (forward-block samples as a block mode on a rescaled history).
    ``sampler`` replaces ``jst_history.sample_return_paths`` (research experiments use it to,
    e.g., block-sample one asset and shuffle the other).
    """

    def __init__(self, history, *, mode, block_years, borrow_real, return_mode=None, dataset=None,
                 sampler: Sampler | None = None):
        self.history = history
        self.mode = mode
        self.block_years = block_years
        self.borrow_real = borrow_real
        self.sampler = sampler
        is_block = mode == "historical-block"
        self.metadata = {
            "return_mode": return_mode or mode,
            "dataset": dataset,
            "history_source": history.label,
            "history_start_year": history.start_year,
            "history_end_year": history.end_year,
            "history_observations": history.observations,
            "history_country_count": history.country_count,
            "block_method": "stationary-circular" if is_block else None,
            "block_years": block_years if is_block else None,
        }

    def sample(self, n_years, n_paths, seed):
        sampler = self.sampler
        if sampler is None:
            from analysis.shared.jst_history import sample_return_paths as sampler
        return sampler(self.history, n_years, n_paths, mode=self.mode,
                       block_years=self.block_years, seed=seed)

    @staticmethod
    def path_count(sample):
        return sample[0].shape[1]

    def _mix(self, weights, equity, fixed_income):
        """w·equity + (1−w)·bonds, or the leveraged w·equity − (w−1)·borrow for w > 1."""
        weights = np.asarray(weights, dtype=float)
        w = weights if np.ndim(equity) == 0 else weights[..., None]
        base = w * equity + (1.0 - w) * fixed_income
        over = weights > 1.0
        if not np.any(over):
            return base
        leveraged = w * equity - (w - 1.0) * self.borrow_real
        return np.where(over if np.ndim(equity) == 0 else over[..., None], leveraged, base)

    def annual_returns(self, weights, sample, year):
        equity, fixed_income = sample
        return self._mix(weights, equity[year], fixed_income[year])

    def mean_returns(self, weights):
        """Arithmetic mean annual return of the mix over the history rows."""
        return self._mix(weights, self.history.equity.mean(), self.history.fixed_income.mean())

    def geometric_returns(self, weights):
        """Median-path (compound) annual return of the mix over the history rows."""
        mixed = self._mix(weights, self.history.equity, self.history.fixed_income)
        return np.expm1(np.mean(np.log1p(np.clip(mixed, -0.999999, np.inf)), axis=-1))


# ── history loading + market construction ─────────────────────────────────────
def load_world_history():
    """Equal-weight world history (lazy import keeps iid-mc numpy-only)."""
    from analysis.shared.jst_history import load_world_returns

    return load_world_returns()


def load_history(dataset, exclude_countries=None, exclude_years=None):
    """Raw JST history: ``world`` (equal-weight average) or ``pooled`` (per-country sequences).

    Country/year exclusions apply only to ``pooled``."""
    if dataset == "world":
        if exclude_countries or exclude_years:
            raise ValueError("country/year exclusions require dataset='pooled'")
        return load_world_history()
    if dataset == "pooled":
        from analysis.shared.jst_history import load_pooled_country_returns

        return load_pooled_country_returns(exclude_countries=exclude_countries,
                                           exclude_years=exclude_years)
    raise ValueError(f"dataset must be one of {', '.join(DATASETS)}")


def build_market(return_mode, alloc_curve=PWL_CURVE, inflation=2.1, returns_in_percent=True,
                 borrow_cost=0.0, block_years=10, history=None, *, curve_mean_basis="geometric",
                 dataset="pooled", exclude_countries=None, exclude_years=None,
                 sampler: Sampler | None = None):
    """Build the market for ``return_mode``.

    ``history`` overrides the JST load (e.g. a synthetic or cut series); forward-block still
    rescales it to the curve's anchors. ``sampler`` overrides the index sampler."""
    if return_mode not in RETURN_MODES:
        raise ValueError(f"return_mode must be one of {', '.join(RETURN_MODES)}")
    if block_years < 1:
        raise ValueError("block_years must be >= 1")
    if dataset not in DATASETS:
        raise ValueError(f"dataset must be one of {', '.join(DATASETS)}")
    if return_mode == "iid-mc":
        if exclude_countries or exclude_years:
            raise ValueError("dataset/exclusions apply only to historical modes")
        return IidMarket(build_alloc(alloc_curve, inflation, returns_in_percent, borrow_cost,
                                     curve_mean_basis))

    raw = history if history is not None else load_history(dataset, exclude_countries,
                                                           exclude_years)
    market_history = raw
    if return_mode == "forward-block":
        from analysis.shared.jst_history import rescale_to_targets

        eq_mean, eq_vol, bond_mean, bond_vol = forward_anchors(
            alloc_curve, inflation, returns_in_percent, curve_mean_basis)
        market_history = rescale_to_targets(
            raw, equity_mean=eq_mean, equity_vol=eq_vol, fixed_income_mean=bond_mean,
            fixed_income_vol=bond_vol, label_suffix="forward-CMA rescaled")

    scale = 100.0 if returns_in_percent else 1.0
    return HistoricalMarket(
        market_history,
        mode="historical-block" if return_mode in BLOCK_MODES else "historical-iid",
        block_years=block_years,
        borrow_real=borrow_cost / scale,
        return_mode=return_mode,
        dataset=dataset,
        sampler=sampler,
    )
