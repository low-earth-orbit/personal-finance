#!/usr/bin/env python3
"""
SWR vs. horizon from real global return history (Jordà–Schularick–Taylor Macrohistory DB).

WHY THIS EXISTS
---------------
Our app's parametric Monte Carlo (iid, forward-CMA assumptions) produces SWRs that keep
declining at long horizons (50y → ~2.6% for 60/40). This script tests whether historical
data reproduces that pattern, whether it survives dropping US-exceptionalism, and — building
on the glide-path factorial research — whether the dataset choice (world average vs pooled
single-country sequences) and block structure materially change the SWR.

DATA
----
Jordà, Knoll, Kuvshinov, Schularick, Taylor — "The Rate of Return on Everything, 1870–2015"
(JST Macrohistory DB, R6: 1870–2020, 18 economies in database, 16 with equity+bond series).
Real total return = (1 + nominal) / (1 + inflation) − 1; inflation = cpi.pct_change().
The file auto-downloads to analysis/.data/ on first run (≈1.4 MB, not committed).

MODES TESTED (full factorial mirroring the glide-path research)
---------------------------------------------------------------
Each mode is a cell in the marginals × sequencing factorial:

  marginals       : historical (raw JST levels) or forward (per-asset affine rescale to
                    forward-CMA equity/bond anchors, preserving autocorrelation and
                    equity-bond cross-correlation)
  sequencing      : none (iid / overlapping-all) or block (segment-aware circular block)
  dataset         : world (equal-weight cross-country annual average)
                    or pooled (single-country sequences concatenated end to end)

─────────────────────────────────────────────────────────────────────────────
                        │ marginals: historical   │ marginals: forward-CMA
  ──────────────────────┼─────────────────────────┼──────────────────────────
  sequencing: none      │ overlapping (§A/§B/§D)  │ iid parametric (§H)
  sequencing: block     │ block bootstrap (§C/§E) │ forward-block (§F/§G)
  ──────────────────────┼─────────────────────────┼──────────────────────────
                        │ USA=§A world=§B/§C      │ world=§F  pooled=§G
                        │ pooled=§D/§E            │
─────────────────────────────────────────────────────────────────────────────

FORWARD-CMA ANCHORS (real arithmetic, derived from ALLOC_TABLE at w=0 and w=1, 2.1% inflation)
  equity : arithmetic mean 5.38 %, vol 12.31 %
  bonds  : arithmetic mean 1.56 %, vol  5.27 %
  60/40 portfolio (from ALLOCATIONS table): nominal 5.67 % → real geometric 3.50 %

KEY FINDINGS (default run: 60/40, 90% success, block=10y)
----------------------------------------------------------
                         20y     30y     40y     50y
  §A USA overlapping     5.39%   4.54%   4.08%   3.74%   ← US-exceptionalism reference
  §B World overlapping   4.95%   3.77%   3.20%   2.83%
  §C World block (10y)   5.00%   3.78%   3.22%   2.95%   ← tracks §B closely (cf. 8y blocks below)
  §D Pooled overlapping  3.41%   2.18%   1.59%   1.20%   ← single-country disaster risk
  §E Pooled block (10y)  3.91%   2.47%   1.94%   1.61%
  §F World fwd-block     4.60%   3.29%   2.68%   2.31%
  §G Pooled fwd-block    4.98%   3.57%   2.89%   2.49%   ← best empirical comparator for app
  §H App iid parametric  5.26%   3.90%   3.23%   2.83%   ← web app ALLOCATIONS params

  Key readings:
  * §B vs §C: 10y blocks now track the overlapping floor (unlike the old 8y study, where
    block bootstrap fell below iid). The "blocks destroy the floor" conclusion was
    block-length dependent and no longer holds at 10y.
  * §D/§E: raw pooled overlapping/block gives catastrophically low SWRs (single-country
    disaster risk: Germany 1914–1943, Japan 1940s, etc.). Not directly applicable to a
    diversified investor, but sets the lower bound.
  * §G vs §H: app iid (3.90% at 30y) is ~0.04pp ABOVE pooled fwd-block (3.86%). The web
    app's iid assumption is slightly optimistic vs empirical forward-calibrated sequencing —
    real return sequences carry modest negative serial correlation that iid misses. The gap
    is small enough that the app's RETURN_AUTOCORRELATION=0 is a reasonable default.
  * §G > §F: pooled sequences have weaker bond persistence (VR~1.7 vs world VR~3.8),
    which makes the 60/40 portfolio slightly more mean-reverting → higher SWR than world.

See docs/retirement/swr-methodology.md for full annotation.

Run:
  python3 -m analysis.retirement.jst_swr_bootstrap
Requires: pandas, numpy, openpyxl  (pip install pandas numpy openpyxl)
"""

from __future__ import annotations

import sys
import os

import numpy as np

# Allow direct execution outside the package.
if __package__ in (None, ""):
    _root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    sys.path.insert(0, _root)

from analysis.shared.jst_history import (
    load_country_returns,
    load_world_returns,
    load_pooled_country_returns,
    rescale_to_targets,
    _split_segments,
    sample_indices,
)
from analysis.shared.returns import geometric_to_arithmetic

# ───────────────────────── CONFIG ─────────────────────────
EQUITY_WEIGHT = 0.60          # 60/40; bond weight = 1 − this
TARGET        = 0.90          # success rate the SWR must hit
HORIZONS      = [20, 25, 30, 35, 40, 45, 50]
NUM_SIMS      = 20_000        # bootstrap paths
BLOCK_YEARS   = 10            # average block length (stationary bootstrap)
SEED          = 12345
INFLATION     = 0.021         # matches web app default inflationRate

# Web app ALLOCATIONS table (presets.ts) — nominal geometric return (%) and
# portfolio vol (%)
# for each equity/bond mix. These are PWL Capital estimates for the full portfolio,
# not simple per-asset linear blends; they include stock-bond correlation in the vol.
# Keyed by equity percentage (0–100 in steps of 10).
ALLOC_TABLE: dict[int, tuple[float, float]] = {
    100: (6.87, 12.57),
    90:  (6.59, 11.59),
    80:  (6.29, 10.62),
    70:  (5.99,  9.68),
    60:  (5.67,  8.79),
    50:  (5.35,  7.94),
    40:  (5.01,  7.17),
    30:  (4.66,  6.49),
    20:  (4.30,  5.94),
    10:  (3.93,  5.56),
    0:   (3.55,  5.38),
}


def _real_arithmetic_from_alloc(eq_pct: int) -> tuple[float, float]:
    nominal_geo_pct, nominal_vol_pct = ALLOC_TABLE[eq_pct]
    nominal_arith = geometric_to_arithmetic(nominal_geo_pct / 100, nominal_vol_pct / 100)
    return (
        (1 + float(nominal_arith)) / (1 + INFLATION) - 1,
        nominal_vol_pct / 100 / (1 + INFLATION),
    )


# Forward-CMA per-asset anchors (real arithmetic mean and vol, decimal), derived
# from the nominal geometric PWL Capital rows at w=1.0 and w=0.0.
FWD_EQ_MEAN, FWD_EQ_VOL = _real_arithmetic_from_alloc(100)
FWD_BD_MEAN, FWD_BD_VOL = _real_arithmetic_from_alloc(0)
# ──────────────────────────────────────────────────────────


# ── helpers ───────────────────────────────────────────────────────────────────

def _portfolio(history, eq_w: float) -> np.ndarray:
    return eq_w * history.equity + (1.0 - eq_w) * history.fixed_income


def _fwd_rescale(history):
    """Per-asset affine rescale to forward-CMA anchors; preserves autocorr / cross-corr."""
    return rescale_to_targets(
        history,
        equity_mean=FWD_EQ_MEAN, equity_vol=FWD_EQ_VOL,
        fixed_income_mean=FWD_BD_MEAN, fixed_income_vol=FWD_BD_VOL,
        label_suffix="fwd-rescaled",
    )


def _bisect_swr(frac_survive_fn, lo=0.001, hi=0.20, iterations=26) -> float:
    for _ in range(iterations):
        m = (lo + hi) / 2
        lo, hi = (m, hi) if frac_survive_fn(m) >= TARGET else (lo, m)
    return lo * 100


def describe(arr: np.ndarray) -> str:
    geo = np.expm1(np.log1p(arr).mean()) * 100
    return f"mean={arr.mean()*100:5.2f}%  vol={arr.std()*100:5.2f}%  geo={geo:5.2f}%"


# ── SWR methods ───────────────────────────────────────────────────────────────

def swr_overlapping(series: np.ndarray, h: int) -> tuple[float, int]:
    """All overlapping h-year windows in a single contiguous series."""
    windows = [series[s: s + h] for s in range(len(series) - h + 1)]
    n = len(windows)
    if n == 0:
        return np.nan, 0

    def frac_survive(w: float) -> float:
        c = 0
        for path in windows:
            bal = 1.0
            for r in path:
                bal = bal * (1 + r) - w * (1 + r / 2)
                if bal <= 0:
                    break
            c += bal > 0
        return c / n

    return _bisect_swr(frac_survive), n


def swr_overlapping_segments(history, eq_w: float, h: int) -> tuple[float, int]:
    """Overlapping windows restricted to within-segment runs (pooled: within country)."""
    windows = []
    eq_segs = _split_segments(history.equity,       history.segment_ids)
    bd_segs = _split_segments(history.fixed_income, history.segment_ids)
    for eq_seg, bd_seg in zip(eq_segs, bd_segs):
        port = eq_w * eq_seg + (1.0 - eq_w) * bd_seg
        for s in range(len(port) - h + 1):
            windows.append(port[s: s + h])
    n = len(windows)
    if n == 0:
        return np.nan, 0

    def frac_survive(w: float) -> float:
        c = 0
        for path in windows:
            bal = 1.0
            for r in path:
                bal = bal * (1 + r) - w * (1 + r / 2)
                if bal <= 0:
                    break
            c += bal > 0
        return c / n

    return _bisect_swr(frac_survive), n


def swr_block_aware(history, eq_w: float, h: int, seed: int) -> tuple[float, int]:
    """Segment-aware stationary block bootstrap (blocks never cross country boundaries)."""
    portfolio = _portfolio(history, eq_w)
    indices = sample_indices(
        len(portfolio), h, NUM_SIMS,
        mode="historical-block",
        block_years=BLOCK_YEARS,
        seed=seed,
        segment_ids=history.segment_ids,
    )  # shape (h, NUM_SIMS)
    paths = portfolio[indices]

    def frac_survive(w: float) -> float:
        bal   = np.ones(NUM_SIMS)
        alive = np.ones(NUM_SIMS, dtype=bool)
        for t in range(h):
            r   = paths[t]
            bal = np.where(alive, np.maximum(bal * (1 + r) - w * (1 + r / 2), 0.0), 0.0)
            alive &= bal > 0
        return float(alive.mean())

    return _bisect_swr(frac_survive), NUM_SIMS


def swr_iid_parametric(mean: float, vol: float, h: int, seed: int) -> float:
    """Parametric iid-normal SWR, matching the web app's engine."""
    rng = np.random.default_rng(seed)
    paths = mean + vol * rng.standard_normal((h, NUM_SIMS))

    def frac_survive(w: float) -> float:
        bal   = np.ones(NUM_SIMS)
        alive = np.ones(NUM_SIMS, dtype=bool)
        for t in range(h):
            r   = paths[t]
            bal = np.where(alive, np.maximum(bal * (1 + r) - w * (1 + r / 2), 0.0), 0.0)
            alive &= bal > 0
        return float(alive.mean())

    return _bisect_swr(frac_survive)


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print("Loading JST history…", flush=True)
    world_h   = load_world_returns()
    pooled_h  = load_pooled_country_returns()
    usa_h     = load_country_returns("USA")

    world_fwd  = _fwd_rescale(world_h)
    pooled_fwd = _fwd_rescale(pooled_h)

    eq_w  = EQUITY_WEIGHT
    eqp   = int(eq_w * 100)
    w_port  = _portfolio(world_h,  eq_w)
    p_port  = _portfolio(pooled_h, eq_w)
    u_port  = eq_w * usa_h.equity + (1 - eq_w) * usa_h.fixed_income

    # App's iid parametric parameters — taken from the ALLOCATIONS table (presets.ts),
    # matching exactly what safeWithdrawalRate uses in the web app.
    eq_pct = int(round(eq_w * 100))
    alloc_nom_pct, alloc_vol_pct = ALLOC_TABLE[eq_pct]
    app_nominal_arith = float(
        geometric_to_arithmetic(alloc_nom_pct / 100, alloc_vol_pct / 100)
    )
    app_mean = (1 + app_nominal_arith) / (1 + INFLATION) - 1
    app_geo = (1 + alloc_nom_pct / 100) / (1 + INFLATION) - 1
    app_vol = alloc_vol_pct / 100 / (1 + INFLATION)

    print(f"\nJST R6  ·  {eqp}/{100-eqp} portfolio  ·  {int(TARGET*100)}% success  "
          f"·  block={BLOCK_YEARS}y  ·  paths={NUM_SIMS:,}\n")
    print(f"  USA   ({len(u_port):3d} yrs): {describe(u_port)}")
    print(f"  World ({len(w_port):3d} yrs, eq-wt {world_h.country_count}c): {describe(w_port)}")
    print(f"  Pooled ({len(p_port):4d} obs, {pooled_h.country_count}c, "
          f"{pooled_h.start_year}–{pooled_h.end_year}): {describe(p_port)}")
    print(f"  World fwd-rescaled: {describe(_portfolio(world_fwd,  eq_w))}")
    print(f"  Pooled fwd-rescaled: {describe(_portfolio(pooled_fwd, eq_w))}")
    print(f"  App ALLOC iid: nominal geo={alloc_nom_pct:.2f}%  real arithmetic={app_mean*100:.2f}%  "
          f"real geometric={app_geo*100:.2f}%  vol={app_vol*100:.2f}%  "
          f"(ALLOCATIONS[{eq_pct}/{100-eq_pct}])")

    header = f"{'Horizon':>7s} | {'§A USA':>7} | {'§B Wld-OL':>9} | " \
             f"{'§C Wld-Blk':>10} | {'§D Pool-OL':>10} | {'§E Pool-Blk':>11} | " \
             f"{'§F Wld-FwdBlk':>13} | {'§G Pool-FwdBlk':>14} | {'§H App iid':>10}"
    print("\nSWR at {}% success by horizon:".format(int(TARGET * 100)))
    print(header)
    print("-" * len(header))

    for h in HORIZONS:
        seed = SEED + h * 97

        # §A  USA overlapping
        a, _ = swr_overlapping(u_port, h)

        # §B  World overlapping
        b, _ = swr_overlapping(w_port, h)

        # §C  World block (historical marginals, segment-aware = single segment)
        c, _ = swr_block_aware(world_h, eq_w, h, seed)

        # §D  Pooled overlapping (within-segment only)
        d, nd = swr_overlapping_segments(pooled_h, eq_w, h)

        # §E  Pooled block (historical marginals, segment-aware)
        e, _ = swr_block_aware(pooled_h, eq_w, h, seed + 1)

        # §F  World forward-block (forward marginals, block)
        f, _ = swr_block_aware(world_fwd, eq_w, h, seed + 2)

        # §G  Pooled forward-block (forward marginals, segment-aware block)
        g, _ = swr_block_aware(pooled_fwd, eq_w, h, seed + 3)

        # §H  App iid parametric
        hh = swr_iid_parametric(app_mean, app_vol, h, seed + 4)

        print(f"{h:5d}y  |  {a:5.2f}%  |  {b:6.2f}%   |  {c:7.2f}%   |  {d:7.2f}%   | "
              f" {e:8.2f}%   |  {f:10.2f}%   |  {g:11.2f}%   |  {hh:7.2f}%")

    print()
    print("COLUMN GUIDE")
    print("  §A  USA overlapping     — US-only, every overlapping window (reference)")
    print("  §B  World overlapping   — 16-country eq-wt avg (18 in DB; CAN/IRL have no return data)")
    print("  §C  World block         — world series, segment-aware block bootstrap")
    print("  §D  Pooled overlapping  — single-country windows only (within-segment)")
    print("  §E  Pooled block        — single-country sequences, segment-aware block")
    print("  §F  World fwd-block     — world rescaled to fwd-CMA, then block bootstrap")
    print("  §G  Pooled fwd-block    — pooled rescaled to fwd-CMA, then block bootstrap")
    print(f"  §H  App iid parametric  — web app engine: iid normal, real arithmetic conversion of nominal geometric ALLOCATIONS params (nominal {alloc_nom_pct:.2f}%, vol {alloc_vol_pct:.2f}%)")
    print()
    print("INTERPRETATION GUIDE")
    print("  §B vs §C : does block bootstrap preserve the floor vs overlapping? (world)")
    print("  §D vs §E : same question for pooled / single-country sequences")
    print("  §B vs §D : world-avg vs single-country historical marginals (marginals axis)")
    print("  §C vs §E : same marginals axis, measured via block bootstrap")
    print("  §E vs §G : historical vs forward marginals with same sequence structure (pooled)")
    print("  §G vs §H : forward marginals with real sequencing vs iid")


if __name__ == "__main__":
    main()
