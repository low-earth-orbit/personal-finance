#!/usr/bin/env python3
"""
Glide-path RECOMMENDER — optimizes the equity weight at each step by simulation.

Given a household's horizons, spending flexibility, guaranteed income, and a capital-market
curve (equity weight → expected return + volatility), this returns the welfare-maximizing
equity weight at each step of a chosen interval (1y, 5y, …) across accumulation and
retirement. The path is found by SIMULATION (per-interval coordinate ascent under common
market paths), not from any hard-coded table or fitted formula — so it adapts to whatever
return mode, guaranteed income, and flexibility you feed it.

It is the productized form of the analysis in `docs/glide-path/methodology.md`
(`analysis/glide_path/research.py`): same model (real dollars, arithmetic-normal returns,
mid-year cash flow, absorbing-at-zero, CRRA utility), exposed as one function.

KEY INPUTS
----------
  accum_years, retire_years : lengths of the two phases (retirement is a fixed planning horizon).
  flexibility               : spending rule in [0,1]. 0 = constant real $ (rigid floor),
                              1 = fully flexible (spend `withdrawal_rate` of the live balance),
                              0.5 = half-and-half. Blends the two targets proportionally each year.
                              NOTE: the depletion/shortfall outputs are "couldn't fund the target
                              draw" rates. With flexibility=1 the target IS a fraction of the live
                              balance (`withdrawal_rate * bal`), which is fundable by construction, so
                              shortfall is ~0 regardless of market luck. That is correct, not a bug:
                              flexible spending never overdraws — it trades depletion risk for income
                              VOLATILITY. At high flexibility read `income_cv` / `ce_income`, not
                              shortfall, to judge tail risk.
  withdrawal_rate           : the flexible-spending fraction of the live balance (used only when
                              flexibility > 0). E.g. 0.04 = spend 4% of current balance per year.
  guaranteed_income         : guaranteed real annual income in retirement (CPP/OAS/DB, in dollars).
                              Acts like a bond you own outside the portfolio: the higher it is, the
                              less the portfolio must fund. It is paid every retirement year
                              (guaranteed income starts at retirement; a pre-pension "bridge" is out
                              of scope — model that funding question separately).
  target_income             : the household's real annual spending target in retirement (dollars).
  annual_contribution       : real annual savings added during accumulation (dollars).
  current_savings           : portfolio balance at the start of accumulation (dollars).
  alloc_curve               : the capital-market assumptions, as anchors
                              [(equity_weight, mean_return, volatility), …] spanning w∈[0,1].
                              Interpolated to any weight. Units controlled by `returns_in_percent`
                              and deflated to real with `inflation`. Used only by `iid-mc`.
  inflation                 : annual inflation rate used to convert nominal returns to real.
                              Must match the units of `alloc_curve` (default: percent, i.e. 2.1).
                              Used only by `iid-mc`.
  returns_in_percent        : if True (default), `alloc_curve` means/vols are in % per year.
  return_mode               : "iid-mc" (default — forward-CMA normal Monte Carlo, no
                              sequencing; the regime-robust choice — see the methodology's
                              §2f robustness notes), "forward-block" (history rescaled to
                              forward-CMA marginals, then block-bootstrapped — the
                              historical-sequencing scenario), "historical-iid" (paired
                              stock/bond years sampled with replacement), or
                              "historical-block" (paired stock/bond years in a stationary
                              circular block bootstrap).
  block_years               : average years per historical block (default 10). Used only by the
                              block modes; realized block lengths are geometric.
  dataset                   : "pooled" (default — each country's own sequence concatenated, so
                              blocks carry single-country sequence risk; previously "world") or
                              "world" (equal-weight cross-country average). Historical modes only.
  exclude_countries,
  exclude_years             : drop countries / inclusive year windows from the pooled dataset.
  max_leverage              : cap on the equity weight. 1.0 = no leverage (default); 1.5 = the
                              optimizer may borrow to hold up to 150% equity. A weight w>1 borrows
                              (w−1) at `borrow_cost` to hold w in the all-equity portfolio, so its
                              real return is w·eq − (w−1)·borrow and its vol scales as w·eq_vol. A
                              leveraged wipeout is treated as ruin (balance floored at 0).
  borrow_cost               : the REAL annual cost of borrowing (same units as the curve, e.g.
                              2.0 = 2% real). Only matters when `max_leverage` > 1. Higher cost ⇒
                              the optimizer leverages less. The optimizer leverages only where the
                              risk-adjusted gain beats the borrowing drag — typically early
                              accumulation under a low γ ("lifecycle investing"); it avoids leverage
                              in retirement where sequence risk dominates.
  retirement_max_equity     : equity ceiling during retirement only. Expressed as a fraction
                              (0.6 = 60%); it may be lower than `max_leverage` and does not
                              restrict accumulation allocations.
  interval                  : years per glide step (1 = per-age, 5 = change allocation every 5y…).
                              Equity weight is held constant within each interval block.
  gamma                     : CRRA risk aversion applied to RETIREMENT CONSUMPTION. Higher = more
                              averse to consumption swings → lower equity. 1 ≈ log, 4 = base (default),
                              8 = very cautious. The user's chosen γ is their retirement-spending risk
                              aversion: higher γ penalizes low retirement-spending outcomes more
                              heavily across simulated market scenarios. This is distinct from
                              spending flexibility, which controls how spending responds to portfolio
                              value. There is no separate current or accumulation γ.
  beta                      : annual time-discount factor (default 0.985 → ~1.5% time preference).
                              Applied within retirement only: the first retirement year has weight 1,
                              then each year receives β times the previous year's weight. Choose 1 to
                              value all retirement years equally, 0.985 for a modest preference for
                              earlier years, or 0.97 to strongly prioritize early retirement. Over
                              30 years, the final-year weights are about 100%, 65%, and 41%.
                              Accumulation years are not discounted.

USAGE
-----
  from analysis.glide_path.recommender import PWL_CURVE, recommend_glide_path
  rec = recommend_glide_path(accum_years=30, retire_years=30, flexibility=0.0,
                             guaranteed_income=20_000, alloc_curve=PWL_CURVE, interval=1)
  print(rec["schedule"])

Run this module directly for the interactive recommender:
  python3 -m analysis.glide_path.recommender
  python3 analysis/glide_path/recommender.py
Requires numpy. Historical modes also require pandas + openpyxl and auto-download JST R6.
"""

from __future__ import annotations

import math
import os
import shlex
import sys
from typing import Sequence

import numpy as np

# Direct file execution has no package context and puts only this directory on
# sys.path. Add the repository root so deferred historical imports still resolve.
if __package__ in (None, ""):
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    sys.path.insert(0, repo_root)

# Example curve: the app's PWL/FP-Canada allocation table (presets.ts), nominal % + 2.1% inflation.
PWL_CURVE = [
    (1.00, 6.87, 12.57), (0.90, 6.59, 11.59), (0.80, 6.29, 10.62),
    (0.70, 5.99, 9.68), (0.60, 5.67, 8.79), (0.50, 5.35, 7.94),
    (0.40, 5.01, 7.17), (0.30, 4.66, 6.49), (0.20, 4.30, 5.94),
    (0.10, 3.93, 5.56), (0.00, 3.55, 5.38),
]

RETURN_MODES = ("iid-mc", "historical-iid", "historical-block", "forward-block")
# Historical modes whose blocks preserve sequencing; forward-block additionally rescales
# the marginals to the forward-CMA anchors before block sampling.
_BLOCK_MODES = ("historical-block", "forward-block")
DATASETS = ("world", "pooled")


# ── utility ─────────────────────────────────────────────────────────────────--

# Numerical floor used by _crra. Prevents log(0)/division blowup; not a real-world
# consumption floor assumption. All values are in real dollars, so $1 is effectively
# zero consumption.
_FLOOR = 1.0


def _crra(c, gamma):
    c = np.maximum(c, _FLOOR)
    if abs(gamma - 1.0) < 1e-9:
        return np.log(c)
    return c ** (1.0 - gamma) / (1.0 - gamma)


def _ce_from_util(util_per_period, gamma):
    if abs(gamma - 1.0) < 1e-9:
        return float(np.exp(util_per_period))
    return float(((1.0 - gamma) * util_per_period) ** (1.0 / (1.0 - gamma)))


def _build_alloc(alloc_curve, inflation, returns_in_percent, borrow_cost=0.0):
    """Return alloc(w)->(real_mean, vol) interpolating the curve. Accepts any-shape w.

    For w > 1 (leverage), borrow (w-1) at the REAL `borrow_cost` to hold w in the all-equity
    portfolio: real_mean = w·eq_mean − (w−1)·borrow, vol = w·eq_vol. `borrow_cost` is already
    real (the user's real cost of borrowing); only its unit is scaled to a fraction."""
    arr = sorted(((float(w), float(m), float(v)) for w, m, v in alloc_curve), key=lambda t: t[0])
    cw = np.array([t[0] for t in arr])
    cm = np.array([t[1] for t in arr])
    cv = np.array([t[2] for t in arr])
    scale = 100.0 if returns_in_percent else 1.0
    infl = inflation / scale
    real_mean = (1.0 + cm / scale) / (1.0 + infl) - 1.0   # deflate nominal mean to real
    vol = cv / scale
    borrow_real = borrow_cost / scale
    eq_mean = float(np.interp(1.0, cw, real_mean))        # 100%-equity anchor (what we lever)
    eq_vol = float(np.interp(1.0, cw, vol))

    def alloc(w):
        w = np.asarray(w, dtype=float)
        wc = np.minimum(w, 1.0)                            # curve portion (interpolated)
        m = np.interp(wc.ravel(), cw, real_mean).reshape(w.shape)
        s = np.interp(wc.ravel(), cw, vol).reshape(w.shape)
        over = w > 1.0                                     # leveraged region
        if np.any(over):
            m = np.where(over, w * eq_mean - (w - 1.0) * borrow_real, m)
            s = np.where(over, w * eq_vol, s)
        return m, s

    return alloc


class _IidMarket:
    """Forward-CMA normal returns; preserves the original recommender behavior."""

    def __init__(self, alloc):
        self.alloc = alloc
        self.metadata = {
            "return_mode": "iid-mc",
            "block_method": None,
            "block_years": None,
        }

    def sample(self, n_years, n_paths, seed):
        return np.random.default_rng(seed).standard_normal((n_years, n_paths))

    @staticmethod
    def path_count(sample):
        return sample.shape[1]

    def annual_returns(self, weights, sample, year):
        means, vols = self.alloc(weights)
        weights = np.asarray(weights)
        if weights.ndim == 0:
            return means + vols * sample[year]
        return means[:, None] + vols[:, None] * sample[year][None, :]

    def mean_returns(self, weights):
        means, _ = self.alloc(weights)
        return means

    @staticmethod
    def candidate_allocations(equity_grid, grid_step):
        return equity_grid

    @staticmethod
    def equity_weights(allocations):
        return np.asarray(allocations)

    @staticmethod
    def allocation_weights(allocation):
        return float(allocation)


class _HistoricalMarket:
    """Raw paired real stock/bond returns sampled from the JST history."""

    def __init__(self, history, *, mode, block_years, borrow_real, return_mode=None, dataset=None):
        self.history = history
        # `mode` is the index-sampling mode (historical-iid | historical-block); `return_mode`
        # is the reported label, which differs for forward-block (it samples as a block mode).
        self.mode = mode
        self.block_years = block_years
        self.borrow_real = borrow_real
        report_mode = return_mode or mode
        self.metadata = {
            "return_mode": report_mode,
            "dataset": dataset,
            "history_source": history.label,
            "history_start_year": history.start_year,
            "history_end_year": history.end_year,
            "history_observations": history.observations,
            "history_country_count": history.country_count,
            "block_method": "stationary-circular" if mode == "historical-block" else None,
            "block_years": block_years if mode == "historical-block" else None,
        }

    def sample(self, n_years, n_paths, seed):
        from analysis.shared.jst_history import sample_return_paths

        return sample_return_paths(
            self.history,
            n_years,
            n_paths,
            mode=self.mode,
            block_years=self.block_years,
            seed=seed,
        )

    @staticmethod
    def path_count(sample):
        return sample[0].shape[1]

    def _mix(self, weights, equity, fixed_income):
        weights = np.asarray(weights, dtype=float)
        over = weights > 1.0
        if np.ndim(equity) == 0:
            base = weights * equity + (1.0 - weights) * fixed_income
            if not np.any(over):
                return base
            leveraged = weights * equity - (weights - 1.0) * self.borrow_real
            return np.where(over, leveraged, base)
        base = weights[..., None] * equity + (1.0 - weights[..., None]) * fixed_income
        if not np.any(over):
            return base
        leveraged = weights[..., None] * equity - (weights[..., None] - 1.0) * self.borrow_real
        return np.where(over[..., None], leveraged, base)

    def annual_returns(self, weights, sample, year):
        equity, fixed_income = sample
        return self._mix(weights, equity[year], fixed_income[year])

    def mean_returns(self, weights):
        return self._mix(
            weights,
            self.history.equity.mean(),
            self.history.fixed_income.mean(),
        )

    @staticmethod
    def candidate_allocations(equity_grid, grid_step):
        return equity_grid

    @staticmethod
    def equity_weights(allocations):
        return np.asarray(allocations)

    @staticmethod
    def allocation_weights(allocation):
        return float(allocation)


def _load_world_history():
    """Lazy import keeps the default iid mode numpy-only."""
    from analysis.shared.jst_history import load_world_returns

    return load_world_returns()


def _load_history(dataset, exclude_countries=None, exclude_years=None):
    """Load the raw JST history for the chosen dataset.

    `world` is the equal-weight cross-country average (one rebalanced portfolio); `pooled`
    concatenates each country's own sequence so blocks preserve single-country sequence
    risk. Country/year exclusions only apply to `pooled` (the world average has no
    per-country structure to filter)."""
    if dataset == "world":
        if exclude_countries or exclude_years:
            raise ValueError("country/year exclusions require dataset='pooled'")
        return _load_world_history()
    if dataset == "pooled":
        from analysis.shared.jst_history import load_pooled_country_returns

        return load_pooled_country_returns(
            exclude_countries=exclude_countries,
            exclude_years=exclude_years,
        )
    raise ValueError(f"dataset must be one of {', '.join(DATASETS)}")


def _forward_anchors(alloc_curve, inflation, returns_in_percent):
    """Real (decimal) equity and bond mean/vol anchors from the capital-market curve.

    Reads the w=1.0 (all-equity) and w=0.0 (all-bond) points the same way iid-mc does, so
    forward-block's rescaled marginals match the iid-mc marginals exactly."""
    alloc = _build_alloc(alloc_curve, inflation, returns_in_percent, borrow_cost=0.0)
    means, vols = alloc(np.array([0.0, 1.0]))
    return float(means[1]), float(vols[1]), float(means[0]), float(vols[0])


def _build_market(
    return_mode,
    alloc_curve,
    inflation,
    returns_in_percent,
    borrow_cost,
    block_years,
    history=None,
    *,
    dataset="pooled",
    exclude_countries=None,
    exclude_years=None,
):
    if return_mode not in RETURN_MODES:
        raise ValueError(f"return_mode must be one of {', '.join(RETURN_MODES)}")
    if block_years < 1:
        raise ValueError("block_years must be >= 1")
    if dataset not in DATASETS:
        raise ValueError(f"dataset must be one of {', '.join(DATASETS)}")
    if return_mode == "iid-mc":
        if exclude_countries or exclude_years:
            raise ValueError("dataset/exclusions apply only to historical modes")
        return _IidMarket(_build_alloc(alloc_curve, inflation, returns_in_percent, borrow_cost))

    raw = history or _load_history(dataset, exclude_countries, exclude_years)
    if return_mode == "forward-block":
        from analysis.shared.jst_history import rescale_to_targets

        eq_mean, eq_vol, bond_mean, bond_vol = _forward_anchors(
            alloc_curve, inflation, returns_in_percent
        )
        market_history = rescale_to_targets(
            raw,
            equity_mean=eq_mean,
            equity_vol=eq_vol,
            fixed_income_mean=bond_mean,
            fixed_income_vol=bond_vol,
            label_suffix="forward-CMA rescaled",
        )
    else:
        market_history = raw

    # forward-block samples with stationary-circular blocks but reports its own label.
    sampling_mode = "historical-block" if return_mode in _BLOCK_MODES else "historical-iid"
    scale = 100.0 if returns_in_percent else 1.0
    return _HistoricalMarket(
        market_history,
        mode=sampling_mode,
        block_years=block_years,
        borrow_real=borrow_cost / scale,
        return_mode=return_mode,
        dataset=dataset,
    )


# ── core lifecycle simulator over a bundle of candidate paths (common random numbers) ──
#
# `gap_arr` and `guar_arr` are per-retirement-year arrays (length retire_years). Guaranteed
# income is paid every retirement year; the portfolio funds the remaining gap.
def _eu(W, sample, accum_years, retire_years, market, *, flex, gap_arr, guar_arr, wr,
        contrib, start_savings, gamma, beta):
    """Return expected discounted utility for each of G candidate allocation paths.

    W : (n_years, G[, assets]) — one column per candidate path; allocation constant within
        each interval block but potentially different across blocks.
    sample : shared market paths, so candidates are evaluated on the same draws.
    gamma : CRRA risk aversion used for this evaluation (a single value throughout).
    Returns a (G,) array: mean discounted utility across the n paths, for each candidate.
    """
    G, n = W.shape[1], market.path_count(sample)
    bal = np.full((G, n), start_savings)
    for i in range(accum_years):
        r = market.annual_returns(W[i], sample, i)
        # Floor at 0 before contributing: a leveraged wipeout (margin call) is ruin, not debt.
        # A no-op without leverage, where annual returns never approach −100%.
        bal = np.maximum(bal * (1 + r), 0.0) + contrib * (1 + r / 2)
    disc = beta ** np.arange(retire_years)
    eu = np.zeros((G, n))
    for t in range(retire_years):
        i = accum_years + t
        r = market.annual_returns(W[i], sample, i)
        grown = np.maximum(bal * (1 + r), 0.0)
        target = (1 - flex) * gap_arr[t] + flex * (wr * bal)
        afford = grown / (1 + r / 2)
        wdr = np.minimum(target, afford)
        bal = grown - wdr * (1 + r / 2)
        eu += disc[t] * _crra(guar_arr[t] + wdr, gamma)
    return eu.mean(axis=1)


def _stats(weights, sample, accum_years, retire_years, market, *, flex, gap_arr, guar_arr, wr,
           contrib, start_savings, gamma, beta):
    """Outcome stats for one path (independent evaluation sample). CE income is CONSUMPTION-ONLY.
    `gamma` here is the retirement-phase risk aversion (the CE is a retirement-consumption
    metric)."""
    n_paths = market.path_count(sample)
    bal = np.full(n_paths, start_savings)
    for i in range(accum_years):
        r = market.annual_returns(weights[i], sample, i)
        bal = np.maximum(bal * (1 + r), 0.0) + contrib * (1 + r / 2)  # floor: leverage ruin
    disc = beta ** np.arange(retire_years)
    C = np.empty((retire_years, n_paths))
    cons_eu = np.zeros(n_paths)
    depleted = np.zeros(n_paths, bool)
    for t in range(retire_years):
        i = accum_years + t
        r = market.annual_returns(weights[i], sample, i)
        grown = np.maximum(bal * (1 + r), 0.0)
        target = (1 - flex) * gap_arr[t] + flex * (wr * bal)
        wdr = np.minimum(target, grown / (1 + r / 2))
        bal = grown - wdr * (1 + r / 2)
        C[t] = guar_arr[t] + wdr
        cons_eu += disc[t] * _crra(C[t], gamma)
        # Shortfall = the portfolio couldn't fund the targeted draw (income fell short of
        # plan). Not "balance hit zero": a fully guaranteed-income-covered year has target 0
        # and no shortfall. Matches the web engine's computeStats semantics.
        # CAVEAT: at flex=1 `target = wr * bal` is self-scaling and ~always affordable, so this
        # is structurally ~0. Read income_cv / ce_income for tail risk there, not shortfall.
        depleted |= wdr < target
    return {
        "ce_income": _ce_from_util(cons_eu.mean() / disc.sum(), gamma),
        "depletion": float(depleted.mean()),
        "income_cv": float(np.mean(C.std(axis=0) / C.mean(axis=0))),
    }


def _deterministic_accum_balance(weights, accum_years, market, *, contrib, start_savings):
    """Mean-return balance at retirement under a fixed glide path."""
    means = market.mean_returns(weights)
    bal = float(start_savings)
    for i in range(accum_years):
        r = float(means[i])
        bal = max(bal * (1 + r), 0.0) + contrib * (1 + r / 2)
    return bal


def _drawdown_stats(weights, sample, accum_years, retire_years, market, *, flex, gap_arr, guar_arr,
                    wr, contrib, start_savings, gamma, beta):
    """Retirement-phase stats from the deterministic expected retirement balance.

    This matches the `/retirement` calculator headline semantics. `_stats` above
    remains the full-path result from today and includes accumulation market luck.
    """
    start_balance = _deterministic_accum_balance(
        weights, accum_years, market, contrib=contrib, start_savings=start_savings
    )
    n_paths = market.path_count(sample)
    bal = np.full(n_paths, start_balance)
    disc = beta ** np.arange(retire_years)
    C = np.empty((retire_years, n_paths))
    cons_eu = np.zeros(n_paths)
    depleted = np.zeros(n_paths, bool)
    for t in range(retire_years):
        i = accum_years + t
        r = market.annual_returns(weights[i], sample, i)
        grown = np.maximum(bal * (1 + r), 0.0)
        target = (1 - flex) * gap_arr[t] + flex * (wr * bal)
        wdr = np.minimum(target, grown / (1 + r / 2))
        bal = grown - wdr * (1 + r / 2)
        C[t] = guar_arr[t] + wdr
        cons_eu += disc[t] * _crra(C[t], gamma)
        depleted |= wdr < target  # shortfall semantics — see _stats (flex=1 ⇒ ~0 by construction)
    return {
        "ce_income": _ce_from_util(cons_eu.mean() / disc.sum(), gamma),
        "depletion": float(depleted.mean()),
        "income_cv": float(np.mean(C.std(axis=0) / C.mean(axis=0))),
        "start_balance": start_balance,
    }


# ══════════════════════════════════════════════════════════════════════════════
def recommend_glide_path(
    accum_years: int = 30,
    retire_years: int = 30,
    flexibility: float = 0,
    guaranteed_income: float = 20_000.0,
    alloc_curve: Sequence[tuple] = PWL_CURVE,
    interval: int = 5,
    *,
    # capital-market input units
    inflation: float = 2.1,
    returns_in_percent: bool = True,
    return_mode: str = "iid-mc",
    block_years: int = 10,
    dataset: str = "pooled",
    exclude_countries: Sequence[str] | None = None,
    exclude_years=None,
    # leverage (borrowing to invest); 1.0 = none
    max_leverage: float = 1.0,                  # cap on equity weight (1.5 = up to 150%)
    retirement_max_equity: float | None = None, # retirement-only cap; None = max_leverage
    borrow_cost: float = 2.0,                   # REAL cost of borrowing (used only when leveraged)
    # household scale (real dollars) — affects the constant-$ floor/gap economics
    current_savings: float = 200_000.0,
    annual_contribution: float = 20_000.0,
    target_income: float = 60_000.0,
    withdrawal_rate: float = 0.04,
    # preferences
    gamma: float = 4.0,                         # CRRA risk aversion (single value; drives the glide)
    beta: float = 0.985,
    # optimizer / Monte Carlo
    n_paths: int = 15_000,
    grid_step: float = 0.05,
    passes: int = 12,
    seed: int = 20260602,
    start_age: int | None = None,
    flat_band: float = 0.10,
    return_flat_curve: bool = False,
) -> dict:
    """Recommend the welfare-maximizing allocation per `interval`-year step, by simulation.

    Returns a dict with:
      schedule      : list of blocks {step, year_start, year_end, age_start, phase, equity_pct}
      equity_by_year: the expanded per-year equity weights (fractions)
      accum_dir/retire_dir : 'Rising' | 'Flat' | 'Falling' slope of each phase
      tent_pct, tent_year/tent_age : lowest equity within 15y of retirement (the tent bottom)
      ce_income, depletion, income_cv : independent-evaluation outcome stats for the recommended path
      flat_equity_pct, flat_ce_income : the best single CONSTANT allocation and its CE income
                                        (the simpler alternative; the glide's edge is usually tiny)
      params        : echo of the resolved inputs
    """
    if not (0.0 <= flexibility <= 1.0):
        raise ValueError("flexibility must be in [0, 1]")
    if not math.isfinite(guaranteed_income) or guaranteed_income < 0:
        raise ValueError("guaranteed_income must be a finite value >= 0")
    if interval < 1:
        raise ValueError("interval must be >= 1 year")
    n_years = accum_years + retire_years
    if n_years < 1:
        raise ValueError("need at least one year")
    if not (grid_step <= max_leverage <= 3.0):
        raise ValueError("max_leverage must be in [grid_step, 3.0] (1.0 = no leverage)")
    if retirement_max_equity is None:
        retirement_max_equity = max_leverage
    if not (0.0 <= retirement_max_equity <= max_leverage):
        raise ValueError("retirement_max_equity must be in [0, max_leverage]")

    market = _build_market(
        return_mode,
        alloc_curve,
        inflation,
        returns_in_percent,
        borrow_cost,
        block_years,
        dataset=dataset,
        exclude_countries=exclude_countries,
        exclude_years=exclude_years,
    )
    # Guaranteed income is paid every retirement year (a pre-pension bridge is out of scope);
    # the portfolio funds the remaining gap.
    guaranteed = guaranteed_income
    guar_arr = np.full(retire_years, guaranteed)
    gap_arr = np.maximum(target_income - guar_arr, 0.0)

    # Internal short aliases passed to _eu/_stats. NOTE: gamma is passed per-call; the rest
    # live here.
    common = dict(flex=flexibility, gap_arr=gap_arr, guar_arr=guar_arr, wr=withdrawal_rate,
                  contrib=annual_contribution, start_savings=current_savings, beta=beta)

    # Candidate allocations vary the equity weight (stocks vs bonds) alone.
    equity_grid = np.round(np.arange(0.0, max_leverage + 1e-9, grid_step), 6)
    candidates = market.candidate_allocations(equity_grid, grid_step)
    G = len(candidates)

    def _constant_paths(allocations):
        return np.broadcast_to(
            allocations,
            (n_years,) + np.shape(allocations),
        )

    def _constant_path(allocation):
        return np.broadcast_to(allocation, (n_years,) + np.shape(allocation))

    # Split a block at retirement. This makes the retirement ceiling exact without
    # applying it to the final working years of an otherwise crossing interval.
    block_starts, block_ends = [], []
    start = 0
    while start < n_years:
        phase_end = accum_years if start < accum_years else n_years
        end = min(start + interval, phase_end)
        block_starts.append(start)
        block_ends.append(end)
        start = end
    n_blocks = len(block_starts)
    block_of_year = np.empty(n_years, dtype=int)
    for b, (start, end) in enumerate(zip(block_starts, block_ends)):
        block_of_year[start:end] = b
    retirement_grid_i = int(math.floor((retirement_max_equity + 1e-9) / grid_step))
    max_candidate_i = np.array([
        len(candidates) - 1 if start < accum_years else retirement_grid_i
        for start in block_starts
    ])

    def _optimize(opt_sample, max_passes):
        """Coordinate-ascent the per-block equity weights.

        Returns the per-block weights that maximise expected discounted consumption utility."""
        # Initialise at the best flat weight (shape-neutral) to avoid biasing the shape and
        # reduce the risk of the coordinate ascent settling in a poor local optimum.
        flat_candidates = candidates[:retirement_grid_i + 1]
        flat = _eu(_constant_paths(flat_candidates), opt_sample, accum_years, retire_years, market,
                   gamma=gamma, **common)
        best_flat = flat_candidates[int(np.argmax(flat))]
        block_w = np.broadcast_to(
            best_flat,
            (n_blocks,) + np.shape(best_flat),
        ).copy()
        for p in range(max_passes):
            order = range(n_blocks) if p % 2 == 0 else range(n_blocks - 1, -1, -1)
            changed = False
            for b in order:
                years = block_w[block_of_year]
                # Current path in all columns; block b's rows evaluate every candidate.
                block_candidates = candidates[:max_candidate_i[b] + 1]
                W = np.repeat(years[:, None, ...], len(block_candidates), axis=1)
                W[block_of_year == b, ...] = block_candidates
                eu = _eu(W, opt_sample, accum_years, retire_years, market,
                         gamma=gamma, **common)
                best = block_candidates[int(np.argmax(eu))]
                if not np.array_equal(best, block_w[b]):
                    block_w[b] = best
                    changed = True
            if not changed:
                break
        return block_w

    opt_sample = market.sample(n_years, n_paths, seed)
    block_w = _optimize(opt_sample, max_passes=passes)
    weights = block_w[block_of_year]

    # Independent evaluation sample for the recommended path.
    eval_sample = market.sample(n_years, max(n_paths, 40_000), seed + 9999)
    st = _stats(weights, eval_sample, accum_years, retire_years, market,
                gamma=gamma, **common)
    drawdown_st = _drawdown_stats(weights, eval_sample, accum_years, retire_years, market,
                                  gamma=gamma, **common)

    # Best single CONSTANT (flat) equity weight — the simpler alternative to the glide path.
    # Choose it on its own SELECTION sample (independent of both the optimization sample and
    # the evaluation sample), then score the winner on the evaluation sample. Selecting on the
    # optimization sample lets tail-sensitive utility plus leverage overfit rare bad paths;
    # selecting on the evaluation sample would hand the flat comparator an argmax advantage
    # over the fixed glide on the very draw that scores them both. The raw optimized glide is
    # still returned and charted; callers can recommend this flatter comparator when it is
    # materially better.
    select_sample = market.sample(n_years, max(n_paths, 40_000), seed + 4242)
    flat_stats = []
    for allocation in candidates[:retirement_grid_i + 1]:
        candidate = _stats(_constant_path(allocation), select_sample, accum_years, retire_years,
                           market, gamma=gamma, **common)
        flat_stats.append(candidate)
    best_flat_i = int(np.argmax([s["ce_income"] for s in flat_stats]))
    best_flat_allocation = candidates[best_flat_i]
    flat_st = _stats(_constant_path(best_flat_allocation), eval_sample, accum_years, retire_years,
                     market, gamma=gamma, **common)
    flat_drawdown_st = _drawdown_stats(_constant_path(best_flat_allocation), eval_sample, accum_years,
                                       retire_years, market, gamma=gamma, **common)

    # Shape descriptors.
    def classify(d):
        return "Rising" if d > flat_band else ("Falling" if d < -flat_band else "Flat")

    equity_weights = market.equity_weights(weights)
    acc = equity_weights[:accum_years] if accum_years else np.array([])
    ret = equity_weights[accum_years:]
    twin = min(15, retire_years)
    tent_i = int(np.argmin(ret[:twin])) if retire_years else 0
    accum_dir = classify(acc[-1] - acc[0]) if accum_years >= 2 else "n/a"
    # The retirement slope drops the final year: with no bequest the optimizer drives equity
    # toward 0 at the fixed horizon (an artifact, not real) that would otherwise skew the
    # read. Matches the web engine. Accumulation has no such artifact.
    ret_eff = ret[:-1] if len(ret) >= 3 else ret
    retire_dir = classify(ret_eff[-1] - ret_eff[0]) if len(ret_eff) >= 2 else "n/a"

    # Build the interval schedule.
    schedule = []
    for b in range(n_blocks):
        entry = {
            "step": b,
            "year_start": block_starts[b],
            "year_end": block_ends[b] - 1,
            "phase": "accum" if block_starts[b] < accum_years else "retire",
        }
        entry["equity_pct"] = round(market.allocation_weights(block_w[b]) * 100, 1)
        if start_age is not None:
            entry["age_start"] = start_age + block_starts[b]
        schedule.append(entry)

    tent_label = "tent_age" if start_age is not None else "tent_year"
    tent_value = (start_age + accum_years + tent_i) if start_age is not None else (accum_years + tent_i)

    best_flat_equity = market.allocation_weights(best_flat_allocation)
    result = {
        "schedule": schedule,
        "equity_by_year": [round(float(w), 4) for w in equity_weights],
        "accum_dir": accum_dir,
        "retire_dir": retire_dir,
        "tent_pct": round(float(ret[tent_i]) * 100, 1) if retire_years else None,
        tent_label: tent_value,
        "ce_income": round(st["ce_income"], 0),
        # Best single constant allocation + its CE income (the simpler alternative).
        "flat_equity_pct": round(best_flat_equity * 100, 1),
        "flat_ce_income": round(flat_st["ce_income"], 0),
        "depletion": round(st["depletion"], 4),
        "drawdown_depletion": round(drawdown_st["depletion"], 4),
        "expected_retirement_balance": round(drawdown_st["start_balance"], 0),
        "flat_depletion": round(flat_st["depletion"], 4),
        "flat_drawdown_depletion": round(flat_drawdown_st["depletion"], 4),
        "income_cv": round(st["income_cv"], 4),
        "params": {
            "accum_years": accum_years, "retire_years": retire_years,
            "flexibility": flexibility, "guaranteed_income": guaranteed_income,
            "target_income": target_income, "guaranteed": guaranteed,
            "portfolio_income_gap": float(target_income - guaranteed), "interval": interval,
            "gamma": gamma,
            "max_leverage": max_leverage, "borrow_cost": borrow_cost,
            "retirement_max_equity": retirement_max_equity,
            "n_paths": n_paths, "grid_step": grid_step,
            **market.metadata,
        },
    }
    # The full best-constant CE-vs-equity-weight curve (from the selection sample, already
    # computed above), so callers can see how peaked the optimum is rather than just the
    # argmax. No extra simulation cost.
    if return_flat_curve:
        result["flat_curve"] = [
            {
                "equity_pct": round(market.allocation_weights(allocation) * 100, 1),
                "ce_income": round(candidate["ce_income"], 0),
                "depletion": round(candidate["depletion"], 4),
            }
            for allocation, candidate in zip(candidates, flat_stats)
        ]
    return result


# ── plotting ──────────────────────────────────────────────────────────────────
def plot_glide_path(recs, *, start_age=None, path=None, title=None, show=False):
    """Plot one or more recommended glide paths.

    recs      : a single result dict from recommend_glide_path, or a {label: result}
                mapping to overlay multiple paths.
    start_age : if given, the x-axis is labelled as age; otherwise years-from-start.
    path      : if given, save the figure there (PNG).
    show      : if True, display interactively.
    Returns the saved path (or None).
    """
    import matplotlib
    if path is not None and not show:
        matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    # A single recommendation is itself a dict (it has a "schedule" key); a {label: rec}
    # mapping does not. Distinguish them so a lone result isn't iterated as a mapping.
    if isinstance(recs, dict) and "schedule" not in recs:
        items = list(recs.items())
    else:
        items = [(None, recs)]
    x0 = start_age if start_age is not None else 0
    xlabel = "age" if start_age is not None else "year from start"

    # Try to import scipy spline once; degrade gracefully if unavailable.
    _spline = None

    # Upper y-limit: 100% normally, higher when any path uses leverage (equity > 100%).
    lev_cap = max((rec["params"].get("max_leverage", 1.0) for _, rec in items), default=1.0) * 100

    fig, ax = plt.subplots(figsize=(9, 5.2))
    boundaries = set()
    for label, rec in items:
        accum = rec["params"]["accum_years"]
        n_years = accum + rec["params"]["retire_years"]
        boundaries.add(x0 + accum)

        # Original staircase: equity is constant within each interval block.
        xs = [x0 + e["year_start"] for e in rec["schedule"]] + [x0 + n_years]
        ys = [e["equity_pct"] for e in rec["schedule"]]
        ys = ys + [ys[-1]]  # extend the last block to the horizon end
        ax.step(xs, ys, where="post", lw=2.3, label=label)

    for b in boundaries:
        ax.axvline(b, color="k", alpha=0.3, ls="--")
    if len(boundaries) == 1:
        ax.text(next(iter(boundaries)) + 0.4, 4, "retirement", alpha=0.6)
    if lev_cap > 100:  # mark the unleveraged ceiling when leverage is in play
        ax.axhline(100, color="gray", alpha=0.4, ls=":")
        ax.text(x0 + 0.4, 101.5, "100% (unleveraged)", alpha=0.6, fontsize=9)

    ax.set_xlabel(xlabel)
    ax.set_ylabel("recommended equity weight (%)")
    ax.set_ylim(0, max(105, lev_cap + 5))
    ax.grid(alpha=0.3)
    ax.set_title(title or "Recommended equity glide path (simulation optimized)")
    if any(lbl for lbl, _ in items):
        ax.legend()
    fig.tight_layout()
    if path is not None:
        fig.savefig(path, dpi=110)
    if show:
        plt.show()
    plt.close(fig)
    return path


# ── formatting helpers ───────────────────────────────────────────────────────-
def format_summary(rec):
    sched = " | ".join(
        f"{e.get('age_start', 'y'+str(e['year_start']))}:{e['equity_pct']:.0f}%"
        for e in rec["schedule"]
    )
    tent = rec.get("tent_age", rec.get("tent_year"))
    return (f"  before={rec['accum_dir']:<7} after={rec['retire_dir']:<7} "
            f"tent={rec['tent_pct']}%@{tent}  CE=${rec['ce_income']:,.0f} "
            f"drawdown={rec['drawdown_depletion']*100:.1f}% "
            f"full={rec['depletion']*100:.1f}% incCV={rec['income_cv']*100:.0f}%\n"
            f"  schedule: {sched}")


def _ask(prompt, default, cast=float, example=None):
    """Prompt the user for a value, returning `default` on blank input."""
    hint = f"  (default: {default}"
    if example is not None:
        hint += f",  e.g. {example}"
    hint += ")"
    while True:
        raw = input(f"{prompt}\n{hint}\n> ").strip()
        if raw == "":
            return default
        try:
            return cast(raw)
        except ValueError:
            print(f"  ! Invalid input — expected a number. Try again.\n")


def _ask_choice(prompt, default, choices, labels=None):
    """Prompt for one of a small set of string choices, selectable by letter (a, b, c…).

    Accepts the letter, the full choice value, or blank for the default. `labels` optionally
    maps a choice to a short description shown beside it."""
    letters = [chr(ord("a") + i) for i in range(len(choices))]
    by_letter = dict(zip(letters, choices))
    lines = []
    for letter, choice in zip(letters, choices):
        tag = "  (default)" if choice == default else ""
        desc = f" — {labels[choice]}" if labels and choice in labels else ""
        lines.append(f"    {letter}) {choice}{tag}{desc}")
    menu = "\n".join(lines)
    while True:
        raw = input(f"{prompt}\n{menu}\n  (enter a letter or name; default {default})\n> ").strip().lower()
        if raw == "":
            return default
        if raw in by_letter:
            return by_letter[raw]
        if raw in choices:
            return raw
        print(f"  ! Invalid choice — enter a letter (a–{letters[-1]}) or the name. Try again.\n")


def _section(title):
    print(f"\n{'─' * 50}")
    print(f"  {title}")
    print(f"{'─' * 50}")


def format_reproduction_command(
    *,
    accum_years,
    retire_years,
    flexibility,
    guaranteed_income,
    interval,
    gamma,
    beta,
    max_leverage,
    borrow_cost,
    current_savings,
    annual_contribution,
    target_income,
    withdrawal_rate,
    start_age,
    return_mode,
    block_years,
    n_paths,
    dataset="pooled",
    retirement_max_equity=None,
):
    """Build a shell-safe flag-CLI command matching an interactive run."""

    def value(x):
        return f"{x:g}" if isinstance(x, float) else str(x)

    args = [
        "python3",
        "analysis/recommend_glide.py",
        "--accum",
        value(accum_years),
        "--retire",
        value(retire_years),
        "--flex",
        value(flexibility),
        "--guaranteed-income",
        value(guaranteed_income),
        "--interval",
        value(interval),
        "--gamma",
        value(gamma),
        "--beta",
        value(beta),
        "--start-age",
        value(start_age),
        "--savings",
        value(current_savings),
        "--contrib",
        value(annual_contribution),
        "--target-income",
        value(target_income),
        "--withdrawal-rate",
        value(withdrawal_rate),
        "--mode",
        return_mode,
        "--max-leverage",
        value(max_leverage),
        "--paths",
        value(int(n_paths)),
    ]
    if retirement_max_equity is not None:
        args.extend(["--retirement-max-equity", value(retirement_max_equity)])
    if max_leverage > 1:
        args.extend(["--borrow-cost", value(borrow_cost)])
    if return_mode in _BLOCK_MODES:
        args.extend(["--block-years", value(block_years)])
    if dataset != "pooled":
        args.extend(["--dataset", dataset])
    return shlex.join(args)


# ── demo (sweep mode) ─────────────────────────────────────────────────────────
def run_demo(out_dir, return_mode="iid-mc"):
    """Sweep key levers across three spending rules and write plots.

    Defaults to `iid-mc` (the recommender's default): the lever sweeps are meant to show
    how the tent moves, and under forward-block every cell is near-flat ~100% equity.
    Pass another mode to sweep under it."""
    import os
    os.makedirs(out_dir, exist_ok=True)
    AGE, INTERVAL = 35, 5

    SPENDING = [
        ("constant", 0.0, "constant $"),
        ("semiflex", 0.5, "semi-flex 50%"),
        ("flexible", 1.0, "flexible 100%"),
    ]
    SWEEPS = [
        ("guaranteed", "guaranteed income", "guaranteed_income",
         lambda v: f"guaranteed ${v/1000:.0f}k", (0.0, 20_000.0, 50_000.0)),
        ("gamma",   "risk aversion γ", "gamma",         lambda v: f"γ = {v:g}",            (1.0, 2.0, 3.0, 4.0, 5.0)),
    ]

    def one(flex, **kw):
        return recommend_glide_path(flexibility=flex, alloc_curve=PWL_CURVE,
                                    start_age=AGE, interval=INTERVAL,
                                    return_mode=return_mode, **kw)

    print(f"Demo mode — PWL curve, start age {AGE}, {INTERVAL}y steps, {return_mode}\n")
    figs = []
    for slug, flex, label in SPENDING:
        for lslug, ltitle, kwarg, fmt, values in SWEEPS:
            print(f"{label}  —  varying {ltitle}")
            group = {}
            for v in values:
                rec = one(flex, **{kwarg: v})
                group[fmt(v)] = rec
                print(f"   {fmt(v):<13} {format_summary(rec).splitlines()[0].strip()}")
            f = plot_glide_path(
                group, start_age=AGE,
                path=os.path.join(out_dir, f"glide_{slug}_by_{lslug}.png"),
                title=f"{label}: optimal equity glide vs {ltitle}\n"
                      f"(other inputs at defaults — 30y accum + 30y retire, {INTERVAL}y steps)")
            figs.append(f)
            print()

    overview = {label: one(flex) for slug, flex, label in SPENDING}
    figs.append(plot_glide_path(
        overview, start_age=AGE, path=os.path.join(out_dir, "glide_by_spending.png"),
        title="Optimal equity glide by spending rule\n(all other inputs at defaults)"))

    print("Figures written:")
    for f in figs:
        print(f"  {f}")


# ── interactive CLI ───────────────────────────────────────────────────────────
def _run_interactive():
    """Walk the user through their inputs and print the recommended glide path."""
    print("\n╔══════════════════════════════════════════════════╗")
    print("║   Lifetime Allocation Optimizer — interactive    ║")
    print("╚══════════════════════════════════════════════════╝")
    print("  Press Enter to accept the default shown in (  ).")
    print("  All dollar amounts are in today's real dollars.")

    # ── About you ────────────────────────────────────────────────────────────
    _section("About you")
    current_age     = _ask("Current age",                      35,  int)
    retirement_age  = _ask("Planned retirement age",           65,  int,  "60 for early retirement")
    planning_age    = _ask("Plan until age (life expectancy)", 95,  int,  "90–100 is typical")
    current_savings = _ask("Current portfolio balance ($)",    200_000, float, "500000")
    annual_contrib  = _ask("Annual savings / contribution ($)", 20_000, float, "30000")

    accum_years = max(1, retirement_age - current_age)
    retire_years = max(1, planning_age - retirement_age)

    # ── Retirement income ─────────────────────────────────────────────────────
    _section("Retirement income")
    target_income = _ask(
        "Target annual spending in retirement ($)",
        60_000, float, "70000  (gross, in today's dollars)")
    guaranteed_income = _ask(
        "Guaranteed annual income (CPP + OAS + DB pension, $)",
        20_000.0, float, "0 = none,  20000 = typical CPP/OAS")

    # ── Spending rule ─────────────────────────────────────────────────────────
    _section("Spending rule")
    print("  Flexibility = how much your spending follows the market:")
    print("    0   = fixed real $ every year (rigid; safest default)")
    print("    1   = fully proportional — a 20% portfolio drop ⇒ ~20% spending cut")
    print("    0.5 = half-and-half")
    flexibility = _ask("Spending flexibility [0–1]", 0.0, float, "0 = no flexibility")
    if flexibility > 0:
        withdrawal_rate = _ask(
            "  When spending flexibly, what % of the balance to draw each year?\n"
            "  (the proportional draw rate — like the 4% rule)",
            0.04, float, "0.04 = 4%")
    else:
        withdrawal_rate = 0.04  # unused when flexibility == 0

    # ── Preferences ───────────────────────────────────────────────────────────
    _section("Preferences & risk")
    print("  Risk aversion (γ): 1 = very aggressive, 2 = aggressive, 3 = moderate, 4 = cautious, 5+ = very cautious.")
    gamma = _ask("Risk aversion γ", 4.0, float, "4 = cautious base case")

    beta = _ask(
        "Time-discount factor β",
        0.985, float, "(1.0 = equal weight, 0.985 = balanced, 0.97 = stronger early-years tilt)")

    print("\n  Leverage: allow borrowing to invest more than 100% in equity?")
    print("  Enter the max equity % (100 = no leverage, 150 = up to 1.5×).")
    max_equity_pct = _ask("Max equity %", 100.0, float, "100 = none, 150 = max 1.5x leverage")
    max_leverage = max(max_equity_pct / 100.0, 0.05)
    retirement_max_equity = _ask(
        "Retirement max equity %", min(max_equity_pct, 100.0), float,
        "equity ceiling only after retirement; cannot exceed max equity") / 100.0
    if max_leverage > 1.0:
        borrow_cost = _ask("  Real cost of borrowing (% per year)", 2.0, float,
                           "2 = margin/HELOC real rate")
    else:
        borrow_cost = 2.0  # unused when not leveraging

    # ── Return paths ──────────────────────────────────────────────────────────
    _section("Return paths")
    print("  iid-mc uses the app's forward capital-market assumptions;")
    print("  historical modes bootstrap raw paired stock/bond returns from JST history.")
    return_mode = _ask_choice(
        "Return mode", "iid-mc", RETURN_MODES,
        labels={
            "iid-mc": "forward-CMA normal Monte Carlo, no sequencing (recommended)",
            "historical-iid": "raw history, years sampled independently",
            "historical-block": "raw history, stationary circular blocks (keeps sequencing)",
            "forward-block": "history rescaled to forward marginals, then block-bootstrapped (historical-sequencing scenario)",
        },
    )
    dataset = (
        _ask_choice(
            "Historical dataset", "pooled", DATASETS,
            labels={
                "world": "equal-weight cross-country average (one rebalanced portfolio)",
                "pooled": "each country's own sequence — single-country sequence risk (recommended)",
            },
        )
        if return_mode != "iid-mc"
        else "world"
    )
    block_years = (
        _ask("Average stationary-block length in years", 10, int,
             "10")
        if return_mode in _BLOCK_MODES
        else 10
    )

    # ── Optimizer ─────────────────────────────────────────────────────────────
    _section("Optimizer settings")
    interval = _ask(
        "Glide-step interval in years (1 = per-age path, 5 = coarser but faster)",
        5, int, "1 for smoothest result, 5 for quick run")
    n_paths = _ask(
        "Number of simulation paths (more = more stable, slower)",
        15_000, int, "5000 for quick, 30000 for publication quality")

    # ── Run ───────────────────────────────────────────────────────────────────
    lev_note = f", leverage≤{max_leverage:g}× @{borrow_cost:g}% real" if max_leverage > 1 else ""
    print(f"\n  Running optimiser ({return_mode}, {int(n_paths):,} paths, {interval}y steps, "
          f"γ={gamma}, β={beta}{lev_note})…")
    rec = recommend_glide_path(
        accum_years=accum_years,
        retire_years=retire_years,
        flexibility=flexibility,
        guaranteed_income=guaranteed_income,
        interval=interval,
        current_savings=current_savings,
        annual_contribution=annual_contrib,
        target_income=target_income,
        withdrawal_rate=withdrawal_rate,
        gamma=gamma,
        beta=beta,
        max_leverage=max_leverage,
        retirement_max_equity=retirement_max_equity,
        borrow_cost=borrow_cost,
        n_paths=int(n_paths),
        start_age=current_age,
        alloc_curve=PWL_CURVE,
        return_mode=return_mode,
        block_years=block_years,
        dataset=dataset,
    )

    # ── Results ───────────────────────────────────────────────────────────────
    print(f"\n{'═' * 50}")
    print(f"  OPTIMIZED GLIDE PATH")
    print(f"{'═' * 50}")
    print(f"  Accumulation ({current_age}→{retirement_age}): {rec['accum_dir']}")
    print(f"  Retirement   ({retirement_age}→{planning_age}): {rec['retire_dir']}")
    tent_label = "tent_age" if "tent_age" in rec else "tent_year"
    print(f"  Equity trough: {rec['tent_pct']}% at age {rec[tent_label]}")
    print(f"  Return mode: {rec['params']['return_mode']}")
    if return_mode != "iid-mc":
        p = rec["params"]
        block = (
            f", stationary circular blocks averaging {p['block_years']}y"
            if p["block_years"]
            else ""
        )
        print(f"  History: {p['history_source']} {p['history_start_year']}–{p['history_end_year']}"
              f" ({p['history_observations']} years{block})")
    print()
    print(f"  Outcome stats (independent evaluation sample):")
    print(f"    CE income     : ${rec['ce_income']:>10,.0f} /yr  (certainty-equivalent spending)")
    if rec["flat_ce_income"] > rec["ce_income"] * 1.05:
        print(f"    Robust pick   : {rec['flat_equity_pct']:>9.0f} % constant equity "
              f"(CE ${rec['flat_ce_income']:,.0f}/yr)")
    print(f"    Best constant : {rec['flat_equity_pct']:>9.0f} %   "
          f"(CE ${rec['flat_ce_income']:,.0f}/yr — robust flat comparator)")
    print(f"    Drawdown dep.  : {rec['drawdown_depletion']*100:>8.1f} %  "
          f"(from expected retirement balance ${rec['expected_retirement_balance']:,.0f})")
    print(f"    Full-path dep. : {rec['depletion']*100:>8.1f} %  "
          f"(includes pre-retirement markets)")
    print(f"    Income CV     : {rec['income_cv']*100:>8.1f} %  (spending variability; lower = steadier)")
    print()
    print(f"  Schedule (equity % per block):")
    for e in rec["schedule"]:
        age_lbl = f"age {e['age_start']:>3}" if "age_start" in e else f"year {e['year_start']:>3}"
        print(f"    {age_lbl}  [{e['phase']:<6}]  {e['equity_pct']:>5.1f}% equity")

    # ── Plot ──────────────────────────────────────────────────────────────────
    print()
    save = input("  Save a chart? Enter a file path (or press Enter to skip):\n> ").strip()
    if save:
        if not save.endswith(".png"):
            save += ".png"
        lev_t = f", lev≤{max_leverage:g}×" if max_leverage > 1 else ""
        out = plot_glide_path(rec, start_age=current_age, path=save,
                              title=f"Recommended glide path  (γ={gamma}, "
                                    f"β={beta}, guaranteed=${guaranteed_income:,.0f}, "
                                    f"flex={flexibility}{lev_t})")
        print(f"  Chart saved to: {out}")

    command = format_reproduction_command(
        accum_years=accum_years,
        retire_years=retire_years,
        flexibility=flexibility,
        guaranteed_income=guaranteed_income,
        interval=interval,
        gamma=gamma,
        beta=beta,
        max_leverage=max_leverage,
        retirement_max_equity=retirement_max_equity,
        borrow_cost=borrow_cost,
        current_savings=current_savings,
        annual_contribution=annual_contrib,
        target_income=target_income,
        withdrawal_rate=withdrawal_rate,
        start_age=current_age,
        return_mode=return_mode,
        block_years=block_years,
        n_paths=n_paths,
        dataset=dataset,
    )
    print("\n  Run this simulation again or modify it with:")
    print(f"  {command}")


# ── entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import os
    import sys

    if "--demo" in sys.argv:
        demo_mode = "iid-mc"
        for i, arg in enumerate(sys.argv):
            if arg == "--mode" and i + 1 < len(sys.argv):
                demo_mode = sys.argv[i + 1]
            elif arg.startswith("--mode="):
                demo_mode = arg.split("=", 1)[1]
        out_dir = os.path.join("analysis", "artifacts", "glide_path", "demo")
        run_demo(out_dir, return_mode=demo_mode)
    else:
        _run_interactive()
