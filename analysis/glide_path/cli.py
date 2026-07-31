#!/usr/bin/env python3
"""
Command-line front end for the Lifetime Allocation Optimizer.

Optimizes (by simulation, not a lookup table) the portfolio allocation per step for YOUR inputs and
prints the schedule + outcome stats. Supports forward-CMA iid Monte Carlo and raw-history iid
or block bootstrap. Flag-driven wrapper around
`analysis.glide_path.recommender.recommend_glide_path` (the engine, which also has an
interactive prompt mode: `python3 -m analysis.glide_path.recommender`).

EXAMPLES
--------
  # constant-$ spending, 30y accumulation + 30y retirement, per-age, labelled by age
  python3 analysis/recommend_glide.py --accum 30 --retire 30 --flex 0 --guaranteed-income 20000 --start-age 35

  # semi-flexible, 5-year steps, more risk-averse, and save a plot
  python3 analysis/recommend_glide.py --accum 25 --retire 35 --flex 0.5 --guaranteed-income 30000 \\
      --interval 5 --gamma 6 --start-age 40 --plot myglide.png

  # allow lifecycle leverage: up to 1.5x equity, borrowing at 1.5% real
  python3 analysis/recommend_glide.py --accum 30 --retire 30 --gamma 2 --max-leverage 1.5 --borrow-cost 1.5

  # use your own capital-market curve (CSV rows: equity_weight,mean,vol  — nominal %, deflated by --inflation)
  python3 analysis/recommend_glide.py --curve mycurve.csv --flex 1 --guaranteed-income 40000

  # raw equal-weight world history, preserving sequencing in stationary circular blocks
  python3 analysis/recommend_glide.py --mode historical-block --block-years 10 --interval 5

  # per-country sequences (single-country sequence risk) instead of the equal-weight world average
  python3 analysis/recommend_glide.py --mode forward-block --dataset pooled

  # the built-in showcase (3 spending rules × 2 levers + overview)
  python3 analysis/recommend_glide.py --demo

Run with -h to see every flag and its default.
"""

from __future__ import annotations

import argparse
from .recommender import (
    DATASETS,
    PWL_CURVE,
    RETURN_MODES,
    format_summary,
    plot_glide_path,
    recommend_glide_path,
    run_demo,
)


def parse_year_windows(tokens):
    """Parse `--exclude-years` tokens into scalars/`(lo, hi)` windows.

    Each token is a single year (`1923`) or an inclusive range (`1914-1923`)."""
    windows = []
    for token in tokens:
        if "-" in token[1:]:  # range; token[1:] skips a leading minus (no negative years)
            lo, hi = token.split("-", 1)
            windows.append((int(lo), int(hi)))
        else:
            windows.append(int(token))
    return windows


def load_curve(path):
    """Load a return/vol curve from CSV/whitespace rows of `equity_weight, mean, vol`.
    A non-numeric header line is skipped; lines starting with # are comments."""
    rows = []
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.replace(",", " ").split()
            try:
                rows.append((float(parts[0]), float(parts[1]), float(parts[2])))
            except (ValueError, IndexError):
                continue  # header or malformed line
    if not rows:
        raise SystemExit(f"no usable (w, mean, vol) rows found in {path}")
    return rows


def print_rec(rec):
    """Header line, summary stats, and the per-step schedule."""
    p = rec["params"]
    spend = {0.0: "constant $", 0.5: "semi-flex 50%", 1.0: "flexible 100%"}.get(
        p["flexibility"], f"flex {p['flexibility']:.2f}")
    by_age = "age_start" in rec["schedule"][0]
    lev = (f" | leverage≤{p['max_leverage']:g}× @{p['borrow_cost']:g}% real"
           if p.get("max_leverage", 1.0) > 1 else "")
    retirement_cap = p.get("retirement_max_equity", p.get("max_leverage", 1.0))
    ret_cap_note = (
        f" | retirement equity≤{retirement_cap * 100:g}%"
        if retirement_cap < p.get("max_leverage", 1.0) else ""
    )
    print("Optimized equity glide path")
    print(f"  {p['accum_years']}y accumulation + {p['retire_years']}y retirement | {spend} | "
          f"guaranteed income ${p['guaranteed_income']:,.0f}/yr | γ {p['gamma']:g}{lev}{ret_cap_note} | "
          f"{p['interval']}y steps")
    print(f"  return mode: {p['return_mode']}")
    if p["return_mode"] != "iid-mc":
        block = (
            f" | stationary circular blocks averaging {p['block_years']}y"
            if p["block_years"]
            else ""
        )
        print(f"  history: {p['history_source']} {p['history_start_year']}-{p['history_end_year']} | "
              f"dataset: {p.get('dataset')} | "
              f"{p['history_observations']} annual observations | "
              f"{p['history_country_count']} countries{block}")
    print(format_summary(rec))
    if rec.get("flat_equity_pct") is not None:
        edge = rec["ce_income"] - rec["flat_ce_income"]
        flat_allocation = f"{rec['flat_equity_pct']:.0f}% equity"
        if rec["flat_ce_income"] > rec["ce_income"] * 1.05:
            print(f"  robust recommendation: constant {flat_allocation} "
                  f"(CE ${rec['flat_ce_income']:,.0f}/yr)")
        edge_label = f"+${edge:,.0f}" if edge >= 0 else f"-${abs(edge):,.0f}"
        print(f"  best constant {flat_allocation} → CE "
              f"${rec['flat_ce_income']:,.0f}/yr (glide {edge_label}/yr)")
    print(f"\n  {'age' if by_age else 'year':>5}  equity%  phase")
    for e in rec["schedule"]:
        x = e["age_start"] if by_age else e["year_start"]
        print(f"  {x:>5}   {e['equity_pct']:>5.0f}   {e['phase']}")


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Recommend a simulation-optimized allocation glide path for your inputs.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("--demo", action="store_true", help="run the built-in showcase (writes figures) and exit")
    # core inputs
    ap.add_argument("--accum", type=int, default=30, help="accumulation years")
    ap.add_argument("--retire", type=int, default=30, help="retirement (planning-horizon) years")
    ap.add_argument("--flex", type=float, default=0.0, help="spending flexibility 0..1 (0=constant $, 1=flexible)")
    ap.add_argument("--guaranteed-income", type=float, default=20_000.0,
                    help="guaranteed retirement income ($/yr, paid every retirement year)")
    ap.add_argument("--interval", type=int, default=5, help="years per glide step (1=per-age, 5=every 5y)")
    ap.add_argument("--gamma", type=float, default=4.0, help="CRRA risk aversion (1 log, 4 base, 8 cautious)")
    ap.add_argument("--beta", type=float, default=0.985, help="annual retirement-consumption discount factor")
    ap.add_argument("--start-age", type=int, default=None, help="label the schedule by age instead of year")
    # household scale (real dollars)
    ap.add_argument("--savings", type=float, default=200_000.0, help="Start savings ($)")
    ap.add_argument("--contrib", type=float, default=20_000.0, help="annual contribution ($/yr, accumulation)")
    ap.add_argument("--target-income", type=float, default=60_000.0, help="target real retirement income ($/yr)")
    ap.add_argument("--withdrawal-rate", type=float, default=0.04, help="rate for the flexible spending part")
    ap.add_argument("--inflation", type=float, default=2.1,
                    help="inflation %% used to deflate the iid-mc curve to real")
    ap.add_argument("--mode", choices=RETURN_MODES,
                    default=None, help="return path generation mode "
                    "(default: iid-mc — forward-CMA iid normal Monte Carlo, the regime-robust "
                    "choice; forward-block = historical sequences rescaled to the forward-CMA "
                    "marginals then block-bootstrapped, the historical-sequencing scenario)")
    ap.add_argument("--block-years", type=int, default=10,
                    help="average stationary circular-block length for block modes "
                    "(historical-block, forward-block)")
    ap.add_argument("--dataset", choices=DATASETS, default="pooled",
                    help="historical dataset: pooled (default — each country's own sequence) or "
                    "world (equal-weight cross-country average)")
    ap.add_argument("--exclude-countries", nargs="*", default=None, metavar="COUNTRY",
                    help="JST country names to drop (requires --dataset pooled)")
    ap.add_argument("--exclude-years", nargs="*", default=None, metavar="YEAR|LO-HI",
                    help="years/ranges to drop, e.g. 1923 1914-1923 (requires --dataset pooled)")
    # leverage
    ap.add_argument("--max-leverage", type=float, default=1.0,
                    help="cap on equity weight (1.0=none, 1.5=up to 150%% via borrowing)")
    ap.add_argument("--retirement-max-equity", type=float, default=None,
                    help="retirement-only equity ceiling (0.6=60%%; default: --max-leverage)")
    ap.add_argument("--borrow-cost", type=float, default=2.0,
                    help="real cost of borrowing %%/yr (used only when --max-leverage > 1)")
    ap.add_argument("--paths", "--n-paths", dest="n_paths", type=int, default=15_000,
                    help="number of simulation paths used by the optimizer")
    # capital-market curve + outputs
    ap.add_argument("--curve", type=str, default=None,
                    help="iid-mc CSV of 'equity_weight,mean,vol' rows (default: built-in PWL curve)")
    ap.add_argument("--plot", type=str, default=None, help="save a step-plot of the recommendation to this PNG")
    ap.add_argument("--show", action="store_true", help="display the plot interactively")
    args = ap.parse_args(argv)
    mode = args.mode or "iid-mc"

    if args.block_years < 1:
        ap.error("--block-years must be >= 1")
    if args.curve and mode != "iid-mc":
        ap.error("--curve is only supported with --mode iid-mc; historical modes use raw JST returns")
    exclusions = bool(args.exclude_countries or args.exclude_years)
    if mode == "iid-mc" and exclusions:
        ap.error("--exclude-* apply only to historical modes")
    if exclusions and args.dataset != "pooled":
        ap.error("--exclude-countries/--exclude-years require --dataset pooled")
    exclude_years = parse_year_windows(args.exclude_years) if args.exclude_years else None
    if args.demo:
        run_demo("analysis/artifacts/glide_path/demo", return_mode=mode)
        return

    curve = load_curve(args.curve) if args.curve else PWL_CURVE
    rec = recommend_glide_path(
        args.accum, args.retire, flexibility=args.flex, guaranteed_income=args.guaranteed_income,
        alloc_curve=curve, interval=args.interval, gamma=args.gamma, beta=args.beta,
        max_leverage=args.max_leverage, borrow_cost=args.borrow_cost,
        retirement_max_equity=args.retirement_max_equity,
        start_age=args.start_age, current_savings=args.savings, annual_contribution=args.contrib,
        target_income=args.target_income, withdrawal_rate=args.withdrawal_rate, inflation=args.inflation,
        return_mode=mode, block_years=args.block_years,
        dataset=args.dataset, exclude_countries=args.exclude_countries,
        exclude_years=exclude_years,
        n_paths=args.n_paths,
    )
    print_rec(rec)
    if args.plot or args.show:
        plot_glide_path(rec, start_age=args.start_age, path=args.plot, show=args.show)
        if args.plot:
            print(f"\nPlot written to {args.plot}")


if __name__ == "__main__":
    main()
