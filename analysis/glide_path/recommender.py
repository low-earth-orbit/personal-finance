#!/usr/bin/env python3
"""Glide-path recommender — the public API.

``recommend_glide_path`` finds the welfare-maximizing equity weight for each ``interval``-year
step of accumulation and retirement by simulation (coordinate ascent under common random
numbers), then scores the result and the best single constant weight on independent samples.
``evaluate_path`` scores a fixed per-year path. Module map:

  markets.py      return models (curve conversion, iid / historical / forward-block markets)
  simulate.py     lifecycle cash flows, CRRA utility, outcome statistics
  recommender.py  this file — optimizer + public API
  report.py       summaries, plots, demo sweep      interactive.py  prompt flow
  cli.py          flag CLI (analysis/recommend_glide.py)

Method and results: docs/glide-path/methodology.md.

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
                              less the portfolio must fund. It is paid from `guaranteed_delay`
                              years after retirement onward (default 0 = from retirement).
  guaranteed_delay          : years between retirement and the first guaranteed-income payment
                              (e.g. retire at 60, CPP/OAS at 65 → 5). The target stays gross, so
                              the portfolio funds the whole target during this bridge; inside
                              u(c) bridge consumption is floored at `guaranteed_income` (the
                              shortfall itself is still counted).
  bequest_weight, bequest_offset :
                              optional bequest motive θ·u(final balance + k) with the same γ,
                              added once to each path's retirement utility (not discounted).
                              θ = 0 (default) = money left at death is worth nothing. k defaults to
                              `target_income` (about one year of spending) and keeps u finite when
                              nothing is left.
  target_income             : the household's real annual spending target in retirement (dollars).
  annual_contribution       : real annual savings added during accumulation (dollars).
  current_savings           : portfolio balance at the start of accumulation (dollars).
  alloc_curve               : the capital-market assumptions, as anchors
                              [(equity_weight, mean_return, volatility), …] spanning w∈[0,1].
                              Means are nominal geometric returns by default; set
                              `curve_mean_basis="arithmetic"` for a custom curve whose means
                              are already arithmetic. Interpolated to any weight. Units
                              controlled by `returns_in_percent` and deflated to real with
                              `inflation`. Used only by `iid-mc` and forward-block rescaling.
  inflation                 : annual inflation rate used to convert nominal returns to real.
                              Must match the units of `alloc_curve` (default: percent, i.e. 2.1).
                              Used by `iid-mc` and forward-block rescaling.
  returns_in_percent        : if True (default), `alloc_curve` means/vols are in % per year.
  return_mode               : "iid-mc" (default — forward-CMA normal Monte Carlo, no
                              sequencing; the conservative no-recovery baseline — see the
                              methodology's §3 and §3d), "forward-block" (history rescaled to
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
                              value. There is no separate current or accumulation γ. With
                              flexibility=0, γ barely changes the allocation because the plan is
                              driven by avoiding shortfall years; γ matters once spending is flexible.
  beta                      : annual time-discount factor (default 0.985 → ~1.5% time preference).
                              Applied within retirement only: the first retirement year has weight 1,
                              then each year receives β times the previous year's weight. Choose 1 to
                              value all retirement years equally, 0.985 for a modest preference for
                              earlier years, or 0.97 to strongly prioritize early retirement. Over
                              30 years, the final-year weights are about 100%, 65%, and 41%.
                              Accumulation years are not discounted.

  history, sampler          : research hooks. ``history`` replaces the JST load (forward-block still
                              rescales it); ``sampler`` replaces jst_history.sample_return_paths.

USAGE
-----
  from analysis.glide_path.recommender import recommend_glide_path
  rec = recommend_glide_path(accum_years=30, retire_years=30, flexibility=0.0,
                             guaranteed_income=20_000, interval=1)
  print(rec["schedule"])

Interactive prompts: ``python3 analysis/recommend_glide.py -i`` (or
``python3 -m analysis.glide_path.recommender``; ``--demo`` runs the sweep).
Requires numpy; historical modes also need pandas + openpyxl and auto-download JST R6.
"""

from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass
from typing import Sequence

import numpy as np

# Direct file execution has no package context; put the repository root on sys.path.
if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from analysis.glide_path.markets import (  # noqa: E402  (after the sys.path fix above)
    DATASETS,
    PWL_CURVE,
    RETURN_MODES,
    build_market,
)
from analysis.glide_path.simulate import (  # noqa: E402
    Lifecycle,
    drawdown_outcomes,
    expected_utility,
    path_outcomes,
    tie_middle_argmax,
)

__all__ = ["DATASETS", "PWL_CURVE", "RETURN_MODES", "TENT_WINDOW", "BlockLayout",
           "describe_shape", "evaluate_path", "optimize_blocks", "recommend_glide_path"]

SELECT_SEED_OFFSET = 4242  # flat-comparator selection sample (also evaluate_path's sample)
EVAL_SEED_OFFSET = 9999    # independent evaluation sample
MIN_STATS_PATHS = 40_000
OVER_FUNDED_TOL = 0.005    # every constant within 0.5% of target CE and < 0.5% shortfall


# ── step layout + coordinate ascent ───────────────────────────────────────────
@dataclass(frozen=True)
class BlockLayout:
    """Interval blocks over the lifecycle; a block never straddles retirement."""

    starts: tuple
    ends: tuple
    block_of_year: np.ndarray

    @classmethod
    def build(cls, accum_years, retire_years, interval):
        n_years = accum_years + retire_years
        starts, ends, start = [], [], 0
        while start < n_years:
            phase_end = accum_years if start < accum_years else n_years
            end = min(start + interval, phase_end)
            starts.append(start)
            ends.append(end)
            start = end
        block_of_year = np.empty(n_years, dtype=int)
        for b, (s, e) in enumerate(zip(starts, ends)):
            block_of_year[s:e] = b
        return cls(tuple(starts), tuple(ends), block_of_year)

    @property
    def n_blocks(self):
        return len(self.starts)


def _constant_paths(weights, n_years):
    """(n_years, G) matrix whose column g holds weights[g] in every year."""
    return np.broadcast_to(weights, (n_years,) + np.shape(weights))


def optimize_blocks(sample, market, life, layout, candidates, max_candidate_i, passes):
    """Coordinate ascent on per-block equity weights under common random numbers.

    Starts from the best constant weight (shape-neutral; exact ties take the middle tied weight),
    then sweeps blocks in alternating directions, each time scanning every candidate for one block with the others held fixed.
    A block only moves if a candidate beats its current weight by a relative 1e-12, so exact
    ties (e.g. an objective-neutral final year) keep the incoming value instead of falling to 0%.
    Returns per-block weights."""
    flat_candidates = candidates[: int(max_candidate_i.min()) + 1]
    flat_eu = expected_utility(_constant_paths(flat_candidates, life.n_years), sample, market, life)
    block_w = np.full(layout.n_blocks, flat_candidates[tie_middle_argmax(flat_eu)])
    for p in range(passes):
        order = range(layout.n_blocks) if p % 2 == 0 else range(layout.n_blocks - 1, -1, -1)
        changed = False
        for b in order:
            block_candidates = candidates[: max_candidate_i[b] + 1]
            W = np.repeat(block_w[layout.block_of_year][:, None], len(block_candidates), axis=1)
            W[layout.block_of_year == b] = block_candidates
            eu = expected_utility(W, sample, market, life)
            current_u = eu[int(np.flatnonzero(block_candidates == block_w[b])[0])]
            best, best_u = block_w[b], current_u
            tol = 1e-12 * abs(current_u)  # relative: CRRA utilities can be ~1e-14
            for candidate, u in zip(block_candidates, eu):
                if u > best_u + tol:
                    best, best_u = candidate, u
            if best != block_w[b]:
                block_w[b] = best
                changed = True
        if not changed:
            break
    return block_w


# ── shape descriptors ─────────────────────────────────────────────────────────
def _classify(delta, flat_band):
    return "Rising" if delta > flat_band else ("Falling" if delta < -flat_band else "Flat")


TENT_WINDOW = 15  # years either side of retirement searched for the tent bottom


def describe_shape(weights, accum_years, layout, flat_band):
    """Accumulation/retirement slopes and the tent (lowest equity within 15 years of retirement).

    The final retirement step is left out of the retirement slope and the tent when at least two
    steps remain: without a bequest motive its allocation is either objective-neutral (flex=1) or
    a weak-gradient horizon optimum, not advice. The tent looks 15 years either side of
    retirement; ties go to the retirement side, then to the year nearest retirement. ``tent_i``
    is a year index from the start of the plan."""
    acc, ret = weights[:accum_years], weights[accum_years:]
    retire_starts = [s for s in layout.starts if s >= accum_years]
    ret_eff = ret[: retire_starts[-1] - accum_years] if len(retire_starts) >= 3 else ret
    tent_i = accum_years + int(np.argmin(ret_eff[:TENT_WINDOW]))
    for i in range(accum_years - 1, max(accum_years - TENT_WINDOW, 0) - 1, -1):
        if weights[i] < weights[tent_i]:
            tent_i = i
    return {
        "accum_dir": _classify(acc[-1] - acc[0], flat_band) if len(acc) >= 2 else "n/a",
        "retire_dir": _classify(ret_eff[-1] - ret_eff[0], flat_band) if len(ret_eff) >= 2 else "n/a",
        "tent_i": tent_i,
    }


# ── public API ────────────────────────────────────────────────────────────────
def _validate(*, flexibility, guaranteed_income, target_income, interval, accum_years,
              retire_years, grid_step, max_leverage, retirement_max_equity, curve_mean_basis,
              guaranteed_delay=0, bequest_weight=0.0, bequest_offset=None):
    if accum_years < 0 or retire_years < 1:
        raise ValueError("accum_years must be >= 0 and retire_years must be >= 1")
    if not (0.0 <= flexibility <= 1.0):
        raise ValueError("flexibility must be in [0, 1]")
    if curve_mean_basis not in ("geometric", "arithmetic"):
        raise ValueError("curve_mean_basis must be 'geometric' or 'arithmetic'")
    if not math.isfinite(guaranteed_income) or guaranteed_income < 0:
        raise ValueError("guaranteed_income must be a finite value >= 0")
    if interval < 1:
        raise ValueError("interval must be >= 1 year")
    if not (math.isfinite(bequest_weight) and bequest_weight >= 0):
        raise ValueError("bequest_weight must be a finite value >= 0")
    if bequest_weight > 0 and bequest_offset is not None and not bequest_offset > 0:
        raise ValueError("bequest_offset must be > 0 when bequest_weight > 0")
    if int(guaranteed_delay) != guaranteed_delay or not (0 <= guaranteed_delay < max(retire_years, 1)):
        raise ValueError("guaranteed_delay must be a whole number of years in [0, retire_years)")
    # A bridge does not break the tie: bridge years are floored at the guaranteed amount.
    if flexibility == 0.0 and guaranteed_income >= target_income and bequest_weight == 0.0:
        raise ValueError(
            "allocation undetermined: guaranteed income covers the target, spending is not "
            "flexible (flexibility=0) and there is no bequest motive; raise the target, set "
            "flexibility > 0 or add a bequest weight"
        )
    if not (grid_step <= max_leverage <= 3.0):
        raise ValueError("max_leverage must be in [grid_step, 3.0] (1.0 = no leverage)")
    if not (0.0 <= retirement_max_equity <= max_leverage):
        raise ValueError("retirement_max_equity must be in [0, max_leverage]")


def recommend_glide_path(
    accum_years: int = 30,
    retire_years: int = 30,
    flexibility: float = 0,
    guaranteed_income: float = 20_000.0,
    alloc_curve: Sequence[tuple] = PWL_CURVE,
    interval: int = 5,
    *,
    # capital-market inputs
    inflation: float = 2.1,
    returns_in_percent: bool = True,
    curve_mean_basis: str = "geometric",
    return_mode: str = "iid-mc",
    block_years: int = 10,
    dataset: str = "pooled",
    exclude_countries: Sequence[str] | None = None,
    exclude_years=None,
    history=None,
    sampler=None,
    # leverage (1.0 = none)
    max_leverage: float = 1.0,
    retirement_max_equity: float | None = None,
    borrow_cost: float = 2.0,
    # household (real dollars)
    current_savings: float = 200_000.0,
    annual_contribution: float = 20_000.0,
    target_income: float = 60_000.0,
    withdrawal_rate: float = 0.04,
    guaranteed_delay: int = 0,
    # preferences
    gamma: float = 4.0,
    beta: float = 0.985,
    bequest_weight: float = 0.0,
    bequest_offset: float | None = None,
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
      schedule        : blocks {step, year_start, year_end, phase, equity_pct[, age_start]}
      equity_by_year  : per-year equity weights (fractions)
      accum_dir, retire_dir : 'Rising' | 'Flat' | 'Falling'
      tent_pct, tent_age|tent_year : lowest equity within 15y either side of retirement (the
                        final retirement step is left out, as it is for retire_dir)
      ce_income, depletion, income_cv : the glide's outcomes on the independent evaluation sample
      welfare_ce, median_bequest : CE including the bequest term (= ce_income when θ = 0) and the
                        median balance left at the end of the plan; flat_* twins for the constant
      drawdown_depletion, expected_retirement_balance : retirement-only view from the median
                        (geometric-growth) retirement balance
      flat_equity_pct, flat_ce_income, flat_depletion, flat_drawdown_depletion : the best single
                        constant weight (chosen on its own selection sample) and its outcomes
      initial_target_draw, funding_ratio : year-1 portfolio draw and its share of the expected
                        balance (at flexibility=1 `target_income` is ignored)
      over_funded     : True when (θ = 0) every constant weight already delivers the target (CE
                        within 0.5% of it, < 0.5% shortfall): the allocation does not change
                        income, so decide by bequest or retire earlier. The reported weights are
                        then the middle of a tie, not an optimum.
      flat_curve      : (if return_flat_curve) CE/depletion of every constant weight
      params          : echo of the resolved inputs + market metadata
    """
    if retirement_max_equity is None:
        retirement_max_equity = max_leverage
    _validate(flexibility=flexibility, guaranteed_income=guaranteed_income,
              target_income=target_income, interval=interval, accum_years=accum_years,
              retire_years=retire_years, grid_step=grid_step, max_leverage=max_leverage,
              retirement_max_equity=retirement_max_equity, curve_mean_basis=curve_mean_basis,
              guaranteed_delay=guaranteed_delay, bequest_weight=bequest_weight,
              bequest_offset=bequest_offset)

    market = build_market(
        return_mode, alloc_curve, inflation, returns_in_percent, borrow_cost, block_years, history,
        curve_mean_basis=curve_mean_basis, dataset=dataset, exclude_countries=exclude_countries,
        exclude_years=exclude_years, sampler=sampler,
    )
    life = Lifecycle.build(
        accum_years=accum_years, retire_years=retire_years, current_savings=current_savings,
        annual_contribution=annual_contribution, target_income=target_income,
        guaranteed_income=guaranteed_income, flexibility=flexibility,
        withdrawal_rate=withdrawal_rate, gamma=gamma, beta=beta,
        guaranteed_delay=guaranteed_delay, bequest_weight=bequest_weight,
        bequest_offset=bequest_offset,
    )
    n_years = life.n_years

    candidates = np.round(np.arange(0.0, max_leverage + 1e-9, grid_step), 6)
    retirement_grid_i = int(math.floor((retirement_max_equity + 1e-9) / grid_step))
    layout = BlockLayout.build(accum_years, retire_years, interval)
    max_candidate_i = np.array([len(candidates) - 1 if s < accum_years else retirement_grid_i
                                for s in layout.starts])

    # 1. Optimize on one sample; 2. score on an independent evaluation sample.
    block_w = optimize_blocks(market.sample(n_years, n_paths, seed), market, life, layout,
                              candidates, max_candidate_i, passes)
    weights = block_w[layout.block_of_year]
    n_stats = max(n_paths, MIN_STATS_PATHS)
    eval_sample = market.sample(n_years, n_stats, seed + EVAL_SEED_OFFSET)
    st = path_outcomes(weights, eval_sample, market, life)
    drawdown_st = drawdown_outcomes(weights, eval_sample, market, life)

    # 3. Best single constant weight, chosen on its own selection sample (selecting on the
    #    evaluation sample would hand it an argmax advantage over the fixed glide), then scored
    #    on the evaluation sample alongside the glide.
    select_sample = market.sample(n_years, n_stats, seed + SELECT_SEED_OFFSET)
    flat_candidates = candidates[: retirement_grid_i + 1]
    flat_stats = [path_outcomes(_constant_paths(w, n_years), select_sample, market, life)
                  for w in flat_candidates]
    best_flat = flat_candidates[tie_middle_argmax([s["total_utility"] for s in flat_stats])]
    over_funded = bequest_weight == 0.0 and all(
        abs(s["ce_income"] / target_income - 1.0) <= OVER_FUNDED_TOL
        and s["depletion"] < OVER_FUNDED_TOL
        for s in flat_stats
    )
    flat_st = path_outcomes(_constant_paths(best_flat, n_years), eval_sample, market, life)
    flat_drawdown_st = drawdown_outcomes(_constant_paths(best_flat, n_years), eval_sample,
                                         market, life)

    shape = describe_shape(weights, accum_years, layout, flat_band)
    tent_i = shape["tent_i"]
    schedule = []
    for b, (s, e) in enumerate(zip(layout.starts, layout.ends)):
        entry = {"step": b, "year_start": s, "year_end": e - 1,
                 "phase": "accum" if s < accum_years else "retire",
                 "equity_pct": round(float(block_w[b]) * 100, 1)}
        if start_age is not None:
            entry["age_start"] = start_age + s
        schedule.append(entry)

    expected_balance = drawdown_st["start_balance"]
    initial_target_draw = (
        (1.0 - flexibility) * life.gap[0] + flexibility * withdrawal_rate * expected_balance
        if retire_years else 0.0
    )
    funding_ratio = initial_target_draw / expected_balance if expected_balance > 0 else None
    tent_label = "tent_age" if start_age is not None else "tent_year"
    result = {
        "schedule": schedule,
        "equity_by_year": [round(float(w), 4) for w in weights],
        "accum_dir": shape["accum_dir"],
        "retire_dir": shape["retire_dir"],
        "tent_pct": round(float(weights[tent_i]) * 100, 1),
        tent_label: (start_age or 0) + tent_i,
        "ce_income": round(st["ce_income"], 0),
        "welfare_ce": round(st["welfare_ce"], 0) if math.isfinite(st["welfare_ce"]) else None,
        "median_bequest": round(st["median_bequest"], 0),
        "flat_equity_pct": round(float(best_flat) * 100, 1),
        "flat_ce_income": round(flat_st["ce_income"], 0),
        "flat_welfare_ce": (round(flat_st["welfare_ce"], 0)
                            if math.isfinite(flat_st["welfare_ce"]) else None),
        "flat_median_bequest": round(flat_st["median_bequest"], 0),
        "over_funded": bool(over_funded),
        "depletion": round(st["depletion"], 4),
        "drawdown_depletion": round(drawdown_st["depletion"], 4),
        "expected_retirement_balance": round(expected_balance, 0),
        "initial_target_draw": round(float(initial_target_draw), 0),
        "funding_ratio": round(float(funding_ratio), 4) if funding_ratio is not None else None,
        "flat_depletion": round(flat_st["depletion"], 4),
        "flat_drawdown_depletion": round(flat_drawdown_st["depletion"], 4),
        "income_cv": round(st["income_cv"], 4),
        "params": {
            "accum_years": accum_years, "retire_years": retire_years,
            "flexibility": flexibility, "guaranteed_income": guaranteed_income,
            "target_income": target_income, "guaranteed": guaranteed_income,
            "portfolio_income_gap": float(target_income - guaranteed_income), "interval": interval,
            "gamma": gamma, "curve_mean_basis": curve_mean_basis,
            "guaranteed_delay": guaranteed_delay, "bequest_weight": bequest_weight,
            "bequest_offset": float(life.bequest_offset),
            "max_leverage": max_leverage, "borrow_cost": borrow_cost,
            "retirement_max_equity": retirement_max_equity,
            "n_paths": n_paths, "grid_step": grid_step,
            **market.metadata,
        },
    }
    if return_flat_curve:
        result["flat_curve"] = [
            {"equity_pct": round(float(w) * 100, 1), "ce_income": round(s["ce_income"], 0),
             "depletion": round(s["depletion"], 4)}
            for w, s in zip(flat_candidates, flat_stats)
        ]
    return result


def evaluate_path(
    weights,
    accum_years: int = 30,
    retire_years: int = 30,
    flexibility: float = 0,
    guaranteed_income: float = 20_000.0,
    alloc_curve: Sequence[tuple] = PWL_CURVE,
    *,
    inflation: float = 2.1,
    returns_in_percent: bool = True,
    curve_mean_basis: str = "geometric",
    return_mode: str = "iid-mc",
    block_years: int = 10,
    dataset: str = "pooled",
    exclude_countries: Sequence[str] | None = None,
    exclude_years=None,
    history=None,
    sampler=None,
    borrow_cost: float = 2.0,
    current_savings: float = 200_000.0,
    annual_contribution: float = 20_000.0,
    target_income: float = 60_000.0,
    withdrawal_rate: float = 0.04,
    guaranteed_delay: int = 0,
    gamma: float = 4.0,
    beta: float = 0.985,
    bequest_weight: float = 0.0,
    bequest_offset: float | None = None,
    n_paths: int = 15_000,
    seed: int = 20260602,
    # Optimizer-only arguments, accepted so callers can share one kwargs dict with
    # recommend_glide_path; they do not affect a fixed-path evaluation.
    interval=None, grid_step=None, passes=None, max_leverage=None, retirement_max_equity=None,
    start_age=None, flat_band=None, return_flat_curve=None,
) -> dict:
    """Score a fixed per-year equity path on the selection sample (``seed + 4242``).

    Same market and lifecycle as :func:`recommend_glide_path` but no optimization. Paths scored
    with the same ``n_paths`` and ``seed`` share one sample, so they can be compared with each
    other. They match the CEs in :func:`recommend_glide_path`'s ``flat_curve`` only when
    ``n_paths`` equals that function's selection-sample size, ``max(n_paths, 40_000)``; pass
    ``n_paths >= 40_000`` to both for that comparison."""
    weights = np.asarray(weights, dtype=float)
    if weights.shape != (accum_years + retire_years,):
        raise ValueError(f"weights must have shape ({accum_years + retire_years},), "
                         f"got {weights.shape}")
    if not (0.0 <= flexibility <= 1.0):
        raise ValueError("flexibility must be in [0, 1]")
    market = build_market(
        return_mode, alloc_curve, inflation, returns_in_percent, borrow_cost, block_years, history,
        curve_mean_basis=curve_mean_basis, dataset=dataset, exclude_countries=exclude_countries,
        exclude_years=exclude_years, sampler=sampler,
    )
    life = Lifecycle.build(
        accum_years=accum_years, retire_years=retire_years, current_savings=current_savings,
        annual_contribution=annual_contribution, target_income=target_income,
        guaranteed_income=guaranteed_income, flexibility=flexibility,
        withdrawal_rate=withdrawal_rate, gamma=gamma, beta=beta,
        guaranteed_delay=guaranteed_delay, bequest_weight=bequest_weight,
        bequest_offset=bequest_offset,
    )
    sample = market.sample(life.n_years, n_paths, seed + SELECT_SEED_OFFSET)
    return path_outcomes(weights, sample, market, life)


if __name__ == "__main__":
    from analysis.glide_path.interactive import main

    main()
