"""Lifecycle simulator: accumulation → retirement cash flows, CRRA utility, outcome statistics.

Conventions (shared with the web engine, src/utils/glide-path/engine.ts):
  * real (today's) dollars; mid-year contributions/withdrawals earn half a year's return;
  * a balance that would go negative is floored at 0 (absorbing; a leveraged wipeout is ruin);
  * guaranteed income starts ``guaranteed_delay`` years into retirement (0 = at retirement); the
    target is gross, so during that bridge the portfolio funds the whole target;
  * each retirement year targets  (1−flex)·gap + flex·withdrawal_rate·start-of-year balance,
    capped at what the portfolio can afford; consumption = guaranteed income + withdrawal;
  * welfare = expected Σ βᵗ·u(consumptionₜ) over retirement years (CRRA u), plus an optional
    bequest term θ·u(final balance + k) with the same γ (θ = 0 by default);
  * during a bridge, consumption inside u(c) is floored at the later guaranteed income (the
    spending floor the household would otherwise fall back on); shortfall is still counted;
  * "depletion" = income shortfall: at least one year where the withdrawal fell short of target.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

# Numerical floor on consumption inside u(c): prevents log(0)/division blow-ups. Not a modelled
# spending floor — guaranteed income keeps consumption well above it.
CONSUMPTION_FLOOR = 1.0


@dataclass(frozen=True)
class Lifecycle:
    """Household + preference inputs that stay fixed while allocations vary."""

    accum_years: int
    retire_years: int
    start_savings: float
    contribution: float
    guaranteed: np.ndarray       # guaranteed income per retirement year (0 before it starts)
    gap: np.ndarray              # target − guaranteed (≥ 0) per retirement year
    flexibility: float           # 0 = constant real $, 1 = withdrawal_rate × balance
    withdrawal_rate: float
    gamma: float                 # CRRA risk aversion on retirement consumption
    beta: float                  # annual discount factor within retirement
    consumption_floor: np.ndarray | None = None  # per-year floor inside u(c) (bridge years)
    bequest_weight: float = 0.0  # θ on u(final balance + bequest_offset); 0 = no bequest motive
    bequest_offset: float = 1.0  # k > 0: keeps u finite when nothing is left

    @classmethod
    def build(cls, *, accum_years, retire_years, current_savings, annual_contribution,
              target_income, guaranteed_income, flexibility, withdrawal_rate, gamma, beta,
              guaranteed_delay=0, bequest_weight=0.0, bequest_offset=None):
        years = np.arange(retire_years)
        started = years >= guaranteed_delay
        guaranteed = np.where(started, float(guaranteed_income), 0.0)
        floor = np.where(started, 0.0, float(guaranteed_income))
        offset = float(target_income if bequest_offset is None else bequest_offset)
        return cls(accum_years, retire_years, current_savings, annual_contribution, guaranteed,
                   np.maximum(target_income - guaranteed, 0.0), flexibility, withdrawal_rate,
                   gamma, beta, floor, float(bequest_weight), offset)

    @property
    def n_years(self):
        return self.accum_years + self.retire_years

    @property
    def discount(self):
        return self.beta ** np.arange(self.retire_years)


def crra(c, gamma):
    c = np.maximum(c, CONSUMPTION_FLOOR)
    if abs(gamma - 1.0) < 1e-9:
        return np.log(c)
    return c ** (1.0 - gamma) / (1.0 - gamma)


def ce_from_util(util_per_period, gamma):
    """Certainty-equivalent consumption for a per-period average utility."""
    if abs(gamma - 1.0) < 1e-9:
        return float(np.exp(util_per_period))
    x = (1.0 - gamma) * util_per_period
    if x <= 0.0:  # only reachable when a bequest gain pushes utility past the CRRA bound
        return math.inf
    return float(x ** (1.0 / (1.0 - gamma)))


def _consumption(life, t, withdrawal):
    c = life.guaranteed[t] + withdrawal
    if life.consumption_floor is not None and life.consumption_floor[t] > 0:
        c = np.maximum(c, life.consumption_floor[t])
    return c


def _bequest_utility(final_balance, life):
    """θ·u(W_T + k) per path (zeros when there is no bequest motive)."""
    if life.bequest_weight == 0.0:
        return np.zeros_like(final_balance)
    return life.bequest_weight * crra(final_balance + life.bequest_offset, life.gamma)


def tie_middle_argmax(values, rtol=1e-12):
    """Index of the maximum; among (near-)exact ties, the middle one.

    An over-funded plan makes every weight score identically; ``np.argmax`` would then return
    the first (0% equity) candidate, a corner the objective did not choose."""
    values = np.asarray(values, dtype=float)
    best = float(values.max())
    tied = np.flatnonzero(values >= best - rtol * abs(best))
    return int(tied[len(tied) // 2])


def _accumulate(bal, weights_by_year, sample, market, life):
    """Grow balances through the working years (weights_by_year[i] may be scalar or (G,))."""
    for i in range(life.accum_years):
        r = market.annual_returns(weights_by_year[i], sample, i)
        bal = np.maximum(bal * (1 + r), 0.0) + life.contribution * (1 + r / 2)
    return bal


def _retirement_year(bal, r, t, life):
    """One retirement year → (new balance, withdrawal, target)."""
    grown = np.maximum(bal * (1 + r), 0.0)
    target = (1 - life.flexibility) * life.gap[t] + life.flexibility * (life.withdrawal_rate * bal)
    withdrawal = np.minimum(target, grown / (1 + r / 2))
    return grown - withdrawal * (1 + r / 2), withdrawal, target


def expected_utility(W, sample, market, life):
    """Mean discounted retirement utility for each of G candidate paths.

    W is (n_years, G): one column per candidate allocation path, all evaluated on the same
    ``sample`` (common random numbers). Includes the bequest term. Returns a (G,) array."""
    n = market.path_count(sample)
    bal = _accumulate(np.full((W.shape[1], n), life.start_savings), W, sample, market, life)
    disc = life.discount
    eu = np.zeros_like(bal)
    for t in range(life.retire_years):
        r = market.annual_returns(W[life.accum_years + t], sample, life.accum_years + t)
        bal, withdrawal, _ = _retirement_year(bal, r, t, life)
        eu += disc[t] * crra(_consumption(life, t, withdrawal), life.gamma)
    return (eu + _bequest_utility(bal, life)).mean(axis=1)


def _retirement_outcomes(bal, weights, sample, market, life):
    disc = life.discount
    consumption = np.empty((life.retire_years, bal.shape[0]))
    util = np.zeros(bal.shape[0])
    shortfall = np.zeros(bal.shape[0], bool)
    for t in range(life.retire_years):
        i = life.accum_years + t
        r = market.annual_returns(weights[i], sample, i)
        bal, withdrawal, target = _retirement_year(bal, r, t, life)
        consumption[t] = _consumption(life, t, withdrawal)
        util += disc[t] * crra(consumption[t], life.gamma)
        # At flex=1 the target is a fraction of the live balance and always affordable, so
        # shortfall is ~0 by construction; read CE / income CV for tail risk there.
        shortfall |= withdrawal < target
    bequest_u = _bequest_utility(bal, life)
    # Welfare CE folds the bequest gain over leaving nothing into consumption units; it equals
    # ce_income when θ = 0.
    bequest_gain = float(bequest_u.mean()) - (
        life.bequest_weight * float(crra(life.bequest_offset, life.gamma))
        if life.bequest_weight else 0.0)
    return {
        "ce_income": ce_from_util(util.mean() / disc.sum(), life.gamma),
        "welfare_ce": ce_from_util((util.mean() + bequest_gain) / disc.sum(), life.gamma),
        "total_utility": float(util.mean() + bequest_u.mean()),
        "median_bequest": float(np.median(bal)),
        "depletion": float(shortfall.mean()),
        # Mean over paths of each path's coefficient of variation of spending over time.
        "income_cv": float(np.mean(consumption.std(axis=0) / consumption.mean(axis=0))),
    }


def path_outcomes(weights, sample, market, life):
    """CE income, shortfall rate, income CV for one per-year path, simulated from today."""
    n = market.path_count(sample)
    bal = _accumulate(np.full(n, life.start_savings), weights, sample, market, life)
    return _retirement_outcomes(bal, weights, sample, market, life)


def median_retirement_balance(weights, market, life):
    """Balance at retirement compounding each year's geometric (median-path) return."""
    growth = market.geometric_returns(weights)
    bal = float(life.start_savings)
    for i in range(life.accum_years):
        r = float(growth[i])
        bal = max(bal * (1 + r), 0.0) + life.contribution * (1 + r / 2)
    return bal


def drawdown_outcomes(weights, sample, market, life):
    """Retirement-only outcomes starting from the deterministic median retirement balance."""
    start = median_retirement_balance(weights, market, life)
    outcomes = _retirement_outcomes(np.full(market.path_count(sample), start), weights, sample,
                                    market, life)
    return {**outcomes, "start_balance": start}
