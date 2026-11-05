#!/usr/bin/env python3
"""
Year-by-year optimal equity glide path (before & after retirement) under OUR
assumptions + iid Monte Carlo.

THE QUESTION
------------
For a saver who then retires, what equity weight should they hold AT EACH AGE to
maximize lifetime welfare —
  * BEFORE retirement (accumulation):  rising, flat, or falling equity with age?
  * AFTER retirement  (decumulation):  rising, flat, or falling equity with age?
and how does the answer change with
  * the SPENDING RULE — a constant real dollar withdrawal vs a flexible one that lets
    income vary with the market (we sweep several flexibility levels), and
  * the HORIZON — how long retirement (and accumulation) lasts?

Earlier versions searched a 3-knot LINEAR glide (equity @start / @retirement / @end,
straight lines between). That cannot represent "flat ~100% through accumulation, then a
sharp dip concentrated at retirement" — the shape ACO's Figure 3 finds for constant-$
spending — because a single line from age 35 to 65 forces any pre-retirement decline to
begin at age 35. So this version optimizes the equity weight at EVERY age independently
(coordinate ascent with common random numbers), giving the true age-based glidepath shape
and letting "flat-then-dip" emerge if it is in fact optimal.

WHY iid + OUR CMAs (not historical backtests)
---------------------------------------------
Two well-known studies answer this from realized history:
  * ACO (Anarkulova–Cederburg–O'Doherty, SSRN 4590406): a 38-country block bootstrap says
    hold ~100% equity FLAT across the whole lifecycle (no bonds, no glide); for constant-$
    spending their optimal age profile is flat ~100% in accumulation with a shallow
    bills/bonds "tent" right AT retirement.
  * ERN (earlyretirementnow.com Part 20): a US Shiller backtest says a RISING glide in
    retirement (e.g. 60%->100%) adds ~0.1-0.3pp to the SWR, but only when CAPE > 20.
Both lean on properties of realized sequences (mean reversion, valuation signals,
US-exceptional equity returns). This script instead asks what falls out of *our* forward
Canadian capital-market assumptions (PWL / FP Canada — the /retirement tool's numbers) under
a plain iid Monte Carlo with NO valuation signal and NO mean reversion. That isolates how
much of each study's conclusion is an artifact of historical sequencing vs a robust result.

MODEL (real, today's dollars)
-----------------------------
  * Returns: the app's nominal-geometric allocation curve (presets.ts), converted to matching
    arithmetic means before inflation deflation and interpolated to any equity weight w. Draws
    are iid normal around those real arithmetic means (matching monteCarlo.ts: mid-year cash flow
    earns half a year, depleted portfolio absorbs at 0).
  * Accumulation: START_SAVINGS, fixed real contributions for `accum_years`. Accumulation
    consumption is allocation-invariant, so it drops out of the objective — the accumulation
    glide matters only through the wealth distribution it hands to retirement.
  * Retirement (`retire_years`, a fixed planning horizon): a guaranteed real income floor
    plus a portfolio withdrawal. Spending rule blends a constant target and a
    proportional-to-portfolio target by FLEX in [0,1]:
        target_t = (1-FLEX)*GAP + FLEX*(WITHDRAWAL_RATE*balance_t)
    FLEX=0  -> constant real dollar (income fixed until the portfolio is exhausted),
    FLEX=1  -> fully flexible (income rises and falls with the market).
  * Objective: expected discounted CRRA utility of retirement consumption (no bequest
    motive). We optimize equity weight per age by coordinate ascent
    over a shared set of shocks (common random numbers), so every weight is compared on the
    same simulated markets and the resulting profile is noise-free relative to that draw.

OUTPUTS
-------
  analysis/artifacts/glide_path/research/*.png
  console: per-age optimal glide tables (retirement-horizon sweep & accumulation-horizon
  sweep) for each spending rule, plus a risk-aversion sweep and the SWR sanity anchor.

USAGE:  python3 -m analysis.glide_path.research     (requires numpy, matplotlib)
"""

from __future__ import annotations

import os
import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from analysis.shared.returns import arithmetic_to_geometric

from .markets import PWL_CURVE, IidMarket, build_alloc
from .recommender import BlockLayout, optimize_blocks
from .simulate import Lifecycle, path_outcomes

# ───────────────────────────── CONFIG ─────────────────────────────
INFLATION = 2.1  # %, to deflate nominal CMAs to real

# (equity_weight, nominal_geometric_return_%, volatility_%) — mirrors presets.ts ALLOCATIONS.
ALLOC_ANCHORS = PWL_CURVE

# Household (broadly the /retirement DEFAULTS), real dollars.
START_AGE = 35
START_SAVINGS = 200_000.0
INCOME = 100_000.0
CONTRIB = 0.20 * INCOME           # saved per accumulation year
TARGET_GROSS = 0.60 * INCOME      # desired real retirement income
GUARANTEED = 0.20 * INCOME        # CPP/OAS/DB floor, paid every retirement year
GAP = TARGET_GROSS - GUARANTEED   # what the portfolio is asked to fund each year
WITHDRAWAL_RATE = 0.04            # proportional-spending rate used by the flexible rule

# Preferences
GAMMA = 4.0                       # CRRA relative risk aversion (base case)
BETA = 0.985                      # annual subjective discount factor

# Spending regimes (income-variation levels): FLEX in [0,1].
SPENDING_REGIMES = [
    ("constant $", 0.0),
    ("semi-flex 50%", 0.5),
    ("flexible 100%", 1.0),
]
RETIRE_HORIZONS = [30, 40, 50]    # years of retirement (fixed planning horizon)
ACCUM_HORIZONS = [20, 30, 40]     # years of accumulation (for the pre-retirement sweep)
BASE_ACCUM = 30                   # accumulation length used in the retirement-horizon sweep
BASE_RETIRE = 30                  # retirement length used in the accumulation-length sweep

# Monte Carlo / optimizer
OPT_N = 8_000                     # paths per coordinate-ascent evaluation (CRN, lean)
OPT_PASSES = 10                   # max full sweeps over the age vector (early-stops on convergence)
N_FINAL = 60_000                  # paths for full stats on the optimized glide
GRID_STEP = 0.1                   # equity-weight resolution of the per-age search
FLAT_BAND = 0.10                  # |Δ equity| <= this over a phase => "Flat"
SEED = 20260602

OUT_DIR = os.path.join("analysis", "artifacts", "glide_path", "research")
# ───────────────────────────────────────────────────────────────────

# The research sweep runs on the shared engine (markets/simulate/recommender), so it cannot drift
# from the product recommender. Draws come from MARKET.sample — standard normals per seed.
MARKET = IidMarket(build_alloc(ALLOC_ANCHORS, INFLATION, True))


def alloc(w):
    """Real arithmetic mean and stdev (fractions) for equity weight(s) w."""
    return MARKET.alloc(np.asarray(w, dtype=float))


def classify(delta):
    if delta > FLAT_BAND:
        return "Rising"
    if delta < -FLAT_BAND:
        return "Falling"
    return "Flat"


def predraw(n_years, n_sims, seed):
    return MARKET.sample(n_years, n_sims, seed)


def lifecycle(accum_years, retire_years, flex, gamma=GAMMA, beta=BETA):
    """The research household (CONFIG block) as an engine Lifecycle."""
    return Lifecycle.build(
        accum_years=accum_years, retire_years=retire_years, current_savings=START_SAVINGS,
        annual_contribution=CONTRIB, target_income=TARGET_GROSS, guaranteed_income=GUARANTEED,
        flexibility=flex, withdrawal_rate=WITHDRAWAL_RATE, gamma=gamma, beta=beta,
    )


def full_stats(weights, Z, accum_years, retire_years, flex, gamma=GAMMA, beta=BETA):
    """CE consumption, income CV, and income-shortfall rate for one per-age glide."""
    out = path_outcomes(np.asarray(weights, dtype=float), Z, MARKET,
                        lifecycle(accum_years, retire_years, flex, gamma, beta))
    return {"ce": out["ce_income"], "cv": out["income_cv"], "depletion": out["depletion"]}


def optimize_glide(accum_years, retire_years, flex, gamma=GAMMA, n=OPT_N, seed=SEED,
                   passes=OPT_PASSES):
    """EU-maximizing equity weight at EACH age (the recommender's optimizer with 1-year steps)."""
    life = lifecycle(accum_years, retire_years, flex, gamma)
    grid = np.round(np.arange(0.0, 1.0001, GRID_STEP), 4)
    layout = BlockLayout.build(accum_years, retire_years, 1)
    return optimize_blocks(predraw(life.n_years, n, seed), MARKET, life, layout, grid,
                           np.full(layout.n_blocks, len(grid) - 1), passes)


TRANSITION_WINDOW = 15  # years around retirement in which we locate the "tent" bottom


def summarize(w, accum_years, retire_years):
    """Compact description of an age→equity path: levels at key points + per-phase slope.

    ``tent`` is the minimum equity in the first TRANSITION_WINDOW retirement years. The
    retirement slope covers the whole retirement phase, dropping the final year when there are
    at least three years: at flex=1 that final-year allocation is objective-neutral and ties keep
    the incoming value; at flex<1 the terminal value is a genuine no-bequest-horizon optimum."""
    acc, ret = w[:accum_years], w[accum_years:]
    twin = min(TRANSITION_WINDOW, retire_years)
    tr_i = int(np.argmin(ret[:twin]))
    return {
        "w": w,
        "start": w[0],
        "accum_avg": float(acc.mean()),
        "pre_ret": acc[-1],
        "at_ret": ret[0],
        "tent": float(ret[:twin].min()),          # lowest equity near retirement (the tent bottom)
        "tent_age": START_AGE + accum_years + tr_i,
        "end": w[-1],                              # terminal-year equity
        # Retirement slope uses the whole phase, except the arbitrary final-year flex=1 tie.
        "accum_dir": classify(acc[-1] - acc[0]),
        "retire_dir": classify(
            (ret[:-1] if len(ret) >= 3 else ret)[-1]
            - (ret[:-1] if len(ret) >= 3 else ret)[0]
        ),
    }


# ══════════════════════════════════════════════════════════════════════════════
def _eval_path(w, accum_years, retire_years, flex, gamma):
    Zf = predraw(accum_years + retire_years, N_FINAL, SEED + 7)
    return full_stats(w, Zf, accum_years, retire_years, flex, gamma)


def run_retire_sweep():
    """Year-by-year optimal glide vs RETIREMENT horizon (accum = BASE_ACCUM), per spending rule."""
    print("\n" + "=" * 104)
    print(f"PER-AGE OPTIMAL GLIDE — retirement-horizon sweep  (γ={GAMMA:.0f}, accum={BASE_ACCUM}y, iid, our CMAs)")
    print("=" * 104)
    print(f"{'spending':<14} {'retH':>4} | {'start':>5} {'acc.avg':>7} {'pre-ret':>7} "
          f"{'@ret':>4} {'tent(age)':>11} {'end':>4} | {'BEFORE':>7} {'AFTER':>7} | {'CE':>8} {'depl':>5}")
    results = {}
    for label, flex in SPENDING_REGIMES:
        print("-" * 104)
        for h in RETIRE_HORIZONS:
            w = optimize_glide(BASE_ACCUM, h, flex)
            s = summarize(w, BASE_ACCUM, h)
            st = _eval_path(w, BASE_ACCUM, h, flex, GAMMA)
            results[(label, h)] = {"summary": s, "stats": st, "accum": BASE_ACCUM, "retire": h}
            print(f"{label:<14} {h:>3}y | {s['start']*100:>4.0f}% {s['accum_avg']*100:>6.0f}% "
                  f"{s['pre_ret']*100:>6.0f}% {s['at_ret']*100:>3.0f}% "
                  f"{s['tent']*100:>4.0f}%(@{s['tent_age']:>2}) {s['end']*100:>3.0f}% | "
                  f"{s['accum_dir']:>7} {s['retire_dir']:>7} | ${st['ce']:>6,.0f} {st['depletion']*100:>4.1f}%")
    print("-" * 104)
    print("Equity %. 'tent' = lowest equity within 15y of retirement (the retirement-date tent bottom);")
    print("'end' = terminal-year equity; flex=1 makes it objective-neutral, while flex<1 has a genuine no-bequest terminal optimum.")
    print("BEFORE/AFTER = accumulation slope / whole-retirement slope (final year omitted when >=3y; see docstring).")
    return results


def run_accum_sweep():
    """Year-by-year optimal glide vs ACCUMULATION horizon (retire = BASE_RETIRE), per spending rule."""
    print("\n" + "=" * 104)
    print(f"PER-AGE OPTIMAL GLIDE — accumulation-horizon sweep  (γ={GAMMA:.0f}, retire={BASE_RETIRE}y)")
    print("=" * 104)
    print(f"{'spending':<14} {'accH':>4} | {'start':>5} {'acc.avg':>7} {'pre-ret':>7} "
          f"{'@ret':>4} {'tent(age)':>11} {'end':>4} | {'BEFORE':>7} {'AFTER':>7} | {'CE':>8} {'depl':>5}")
    out = {}
    for label, flex in SPENDING_REGIMES:
        print("-" * 104)
        for a in ACCUM_HORIZONS:
            w = optimize_glide(a, BASE_RETIRE, flex)
            s = summarize(w, a, BASE_RETIRE)
            st = _eval_path(w, a, BASE_RETIRE, flex, GAMMA)
            out[(label, a)] = {"summary": s, "stats": st, "accum": a, "retire": BASE_RETIRE}
            print(f"{label:<14} {a:>3}y | {s['start']*100:>4.0f}% {s['accum_avg']*100:>6.0f}% "
                  f"{s['pre_ret']*100:>6.0f}% {s['at_ret']*100:>3.0f}% "
                  f"{s['tent']*100:>4.0f}%(@{s['tent_age']:>2}) {s['end']*100:>3.0f}% | "
                  f"{s['accum_dir']:>7} {s['retire_dir']:>7} | ${st['ce']:>6,.0f} {st['depletion']*100:>4.1f}%")
    print("-" * 104)
    return out


def run_gamma_sensitivity():
    """Per-age optimal glide vs risk aversion (constant $ and flexible 100%, base horizons)."""
    print("\n" + "=" * 104)
    print(f"RISK-AVERSION SENSITIVITY  (accum={BASE_ACCUM}y, ret={BASE_RETIRE}y)")
    print("=" * 104)
    print(f"{'spending':<14} {'γ':>4} | {'start':>5} {'acc.avg':>7} {'pre-ret':>7} {'@ret':>4} "
          f"{'tent(age)':>11} {'end':>4} | {'BEFORE':>7} {'AFTER':>7}")
    out = {}
    for label, flex in (("constant $", 0.0), ("flexible 100%", 1.0)):
        for g in (2.0, 4.0, 8.0):
            w = optimize_glide(BASE_ACCUM, BASE_RETIRE, flex, gamma=g)
            s = summarize(w, BASE_ACCUM, BASE_RETIRE)
            out[(label, g)] = s
            print(f"{label:<14} {g:>4.0f} | {s['start']*100:>4.0f}% {s['accum_avg']*100:>6.0f}% "
                  f"{s['pre_ret']*100:>6.0f}% {s['at_ret']*100:>3.0f}% "
                  f"{s['tent']*100:>4.0f}%(@{s['tent_age']:>2}) {s['end']*100:>3.0f}% | "
                  f"{s['accum_dir']:>7} {s['retire_dir']:>7}")
    return out


def run_shape_value(retire_sweep):
    """How much CE does the optimized SHAPE actually buy — tested OUT OF SAMPLE?

    The optimizer picks the per-age weights on one shock draw (SEED). Accumulation equity is a
    weak-gradient region (accumulation consumption is allocation-invariant; it only matters via
    the wealth handed to retirement), so the optimizer can chase in-sample noise there. We
    re-score four strategies on an INDEPENDENT draw (SEED+9999):
      • optimum        — the full per-age glide,
      • opt ret/100 acc — keep the optimal retirement glide but force flat 100% in accumulation,
      • flat 100%      — 100% equity at every age,
      • best flat (w*) — the single constant weight that maximizes CE.
    If 'opt' ≈ 'opt ret/100 acc', the falling-accumulation shape is noise and the honest reading
    is "hold ~100% through accumulation" (reconciling with ACO). The retirement-glide value is
    'opt' − 'best flat'."""
    print("\n" + "=" * 104)
    print("SHAPE VALUE (out-of-sample CE, independent draw) — is the glide worth more than flat?")
    print("=" * 104)
    print(f"{'spending':<14} {'retH':>4} | {'optimum':>9} {'opt ret/100 acc':>16} "
          f"{'flat 100%':>10} {'best flat (w*)':>16}")
    grid = np.round(np.arange(0.0, 1.0001, GRID_STEP), 4)
    for label, flex in SPENDING_REGIMES:
        print("-" * 104)
        for h in RETIRE_HORIZONS:
            w_opt = retire_sweep[(label, h)]["summary"]["w"]
            n_years = BASE_ACCUM + h
            Zf = predraw(n_years, N_FINAL, SEED + 9999)
            ce_opt = full_stats(w_opt, Zf, BASE_ACCUM, h, flex, GAMMA)["ce"]
            w_acc100 = w_opt.copy(); w_acc100[:BASE_ACCUM] = 1.0
            ce_acc100 = full_stats(w_acc100, Zf, BASE_ACCUM, h, flex, GAMMA)["ce"]
            ce_flat100 = full_stats(np.ones(n_years), Zf, BASE_ACCUM, h, flex, GAMMA)["ce"]
            Zs = predraw(n_years, N_FINAL, SEED + 4242)
            flat_selection = [
                full_stats(np.full(n_years, w), Zs, BASE_ACCUM, h, flex, GAMMA)
                for w in grid
            ]
            best_flat_i = int(np.argmax([s["ce"] for s in flat_selection]))
            bw = grid[best_flat_i]
            ce_flat = full_stats(np.full(n_years, bw), Zf, BASE_ACCUM, h, flex, GAMMA)["ce"]
            print(f"{label:<14} {h:>3}y | ${ce_opt:>7,.0f} ${ce_acc100:>14,.0f} "
                  f"${ce_flat100:>8,.0f} ${ce_flat:>9,.0f} (w={bw*100:>3.0f})")
    print("-" * 104)
    print("All certainty-equivalent annual retirement consumption ($), scored on a fresh draw.")
    return None


def run_swr_anchor():
    """Sanity check vs the /retirement tool & ERN: retirement-only constant-$ SWR by flat weight,
    and whether a rising glide beats the best flat weight (it should not, under iid)."""
    print("\n" + "=" * 104)
    print("SWR ANCHOR  (retirement-only, constant $, 90% success) — validates engine & tests ERN")
    print("=" * 104)
    rng = np.random.default_rng(SEED + 99)
    grid = np.round(np.arange(0.0, 1.0001, 0.05), 4)

    def swr(weights, Z, target=0.90):
        means, vols = alloc(weights)
        R = means[:, None] + vols[:, None] * Z
        h = len(weights)

        def surv(x):
            bal = np.ones(Z.shape[1]); alive = np.ones(Z.shape[1], bool)
            for t in range(h):
                new = bal * (1 + R[t]) - x * (1 + R[t] / 2)
                alive &= new > 0
                bal = np.where(alive, new, 0.0)
            return alive.mean()
        lo, hi = 0.0, 0.20
        for _ in range(22):
            m = (lo + hi) / 2
            lo, hi = (m, hi) if surv(m) >= target else (lo, m)
        return lo * 100

    out = {}
    print(f"{'horizon':>8} | {'best flat (w*)':>16} | {'flat 100%':>9} | {'rise 60→100':>12}")
    for h in RETIRE_HORIZONS:
        Z = rng.standard_normal((h, 40_000))
        flat = {w: swr(np.full(h, w), Z) for w in grid}
        bw = max(flat, key=flat.get)
        ret = np.linspace(0.60, 1.00, h)                  # retirement-only rising glide
        rise = swr(ret, Z)
        out[h] = {"best_w": bw, "best": flat[bw], "flat100": flat[1.0], "rise": rise, "flat": flat}
        print(f"{h:>6}y  | {flat[bw]:>6.2f}% (w={bw*100:>3.0f}) | {flat[1.0]:>7.2f}% | {rise:>10.2f}%")
    return out


# ══════════════════════════════════════════════════════════════════════════════
def plots(retire_sweep, accum_sweep, swr):
    os.makedirs(OUT_DIR, exist_ok=True)
    colors = {"constant $": "#ef4444", "semi-flex 50%": "#3b82f6", "flexible 100%": "#0d9488"}

    # 1. Headline: the per-age optimal equity glide for each spending regime (base horizons).
    fig, ax = plt.subplots(figsize=(9, 5.2))
    for label, _ in SPENDING_REGIMES:
        s = retire_sweep[(label, BASE_RETIRE)]["summary"]
        ages = np.arange(START_AGE, START_AGE + len(s["w"]))
        ax.plot(ages, s["w"] * 100, lw=2.5, color=colors[label], label=label)
    ax.axvline(START_AGE + BASE_ACCUM, color="k", alpha=0.3, ls="--")
    ax.text(START_AGE + BASE_ACCUM + 0.5, 5, "retirement", alpha=0.6)
    ax.set_xlabel("age"); ax.set_ylabel("optimal equity weight (%)"); ax.set_ylim(0, 105)
    ax.set_title(f"Year-by-year maximum-utility equity glide path by spending rule\n(γ={GAMMA:.0f}, "
                 f"{BASE_ACCUM}y accumulation + {BASE_RETIRE}y retirement, iid, our CMAs)")
    ax.legend(); ax.grid(alpha=0.3); fig.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "optimal_glidepath_by_spending.png"), dpi=110)
    plt.close(fig)

    # 2. Constant-$ glide as the retirement horizon grows — where the tent sits & how deep.
    fig, ax = plt.subplots(figsize=(9, 5.2))
    cmap = plt.cm.viridis(np.linspace(0.15, 0.85, len(RETIRE_HORIZONS)))
    for c, h in zip(cmap, RETIRE_HORIZONS):
        s = retire_sweep[("constant $", h)]["summary"]
        ages = np.arange(START_AGE, START_AGE + len(s["w"]))
        ax.plot(ages, s["w"] * 100, lw=2.2, color=c, label=f"{h}y retirement")
    ax.axvline(START_AGE + BASE_ACCUM, color="k", alpha=0.3, ls="--")
    ax.text(START_AGE + BASE_ACCUM + 0.5, 5, "retirement", alpha=0.6)
    ax.set_xlabel("age"); ax.set_ylabel("optimal equity weight (%)"); ax.set_ylim(0, 105)
    ax.set_title("Constant-$ spending: per-age optimal equity vs retirement horizon\n"
                 "(the bond 'tent' — where does it sit, how deep?)")
    ax.legend(); ax.grid(alpha=0.3); fig.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "retire_equity_vs_horizon.png"), dpi=110)
    plt.close(fig)

    # 3. SWR anchor — SWR vs flat weight with the rising-glide marker.
    fig, ax = plt.subplots(figsize=(8.5, 5))
    for h in RETIRE_HORIZONS:
        ws = sorted(swr[h]["flat"])
        ax.plot([w * 100 for w in ws], [swr[h]["flat"][w] for w in ws], marker="o", ms=3,
                label=f"{h}y flat")
        ax.scatter([60], [swr[h]["rise"]], marker="^", s=80, zorder=5,
                   color=ax.lines[-1].get_color())
    ax.set_xlabel("equity weight (%)"); ax.set_ylabel("SWR @ 90% success (%)")
    ax.set_title("SWR anchor: constant-$ SWR vs equity weight\n▲ = rising 60→100 glide (no edge over best flat under iid)")
    ax.legend(); ax.grid(alpha=0.3); fig.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "swr_anchor.png"), dpi=110)
    plt.close(fig)

    print(f"\nFigures written to {OUT_DIR}/")


def main():
    print("Year-by-year optimal equity glide path — iid Monte Carlo on our forward CMAs")
    eq_a, eq_v = (float(x) for x in alloc(1.0))
    bd_a, bd_v = (float(x) for x in alloc(0.0))
    eq_g = float(arithmetic_to_geometric(eq_a, eq_v))
    bd_g = float(arithmetic_to_geometric(bd_a, bd_v))
    print(f"Real endpoints: 100%eq arithmetic {eq_a*100:.2f}% / geometric {eq_g*100:.2f}% (vol {eq_v*100:.1f}%) … "
          f"0%eq arithmetic {bd_a*100:.2f}% / geometric {bd_g*100:.2f}% (vol {bd_v*100:.1f}%); "
          f"premiums: arithmetic {(eq_a-bd_a)*100:.2f}pp / geometric {(eq_g-bd_g)*100:.2f}pp")
    swr = run_swr_anchor()
    retire_sweep = run_retire_sweep()
    accum_sweep = run_accum_sweep()
    run_gamma_sensitivity()
    run_shape_value(retire_sweep)
    plots(retire_sweep, accum_sweep, swr)


if __name__ == "__main__":
    main()
