#!/usr/bin/env python3
"""
Command-line front end for the Lifetime Allocation Optimizer.

Optimizes (by simulation, not a lookup table) the portfolio allocation per step for YOUR inputs and
prints the schedule + outcome stats. Supports forward-CMA iid Monte Carlo, raw-history iid or
block bootstrap, and forward-block (history rescaled to the forward CMAs, then
block-bootstrapped). Flag-driven wrapper around
`analysis.glide_path.recommender.recommend_glide_path`; `-i/--interactive` prompts for the
inputs instead and prints the equivalent flag command.

EXAMPLES
--------
  # constant-$ spending, 30y accumulation + 30y retirement, per-age, labelled by age
  python3 analysis/recommend_glide.py --accum 30 --retire 30 --flex 0 --guaranteed-income 20000 --start-age 35

  # semi-flexible, 5-year steps, more risk-averse, and save a plot
  python3 analysis/recommend_glide.py --accum 25 --retire 35 --flex 0.5 --guaranteed-income 30000 \\
      --interval 5 --gamma 6 --start-age 40 --plot myglide.png

  # allow lifecycle leverage: up to 1.5x equity, borrowing at 1.5% real
  python3 analysis/recommend_glide.py --accum 30 --retire 30 --gamma 2 --max-leverage 1.5 --borrow-cost 1.5

  # use your own capital-market curve (CSV rows: equity_weight,mean,vol — nominal geometric % by
  # default; iid-mc and forward-block only)
  python3 analysis/recommend_glide.py --curve mycurve.csv --flex 1 --guaranteed-income 40000

  # raw history (pooled per-country sequences), preserving sequencing in stationary circular blocks
  python3 analysis/recommend_glide.py --mode historical-block --block-years 10 --interval 5

  # the equal-weight world average instead of per-country sequences
  python3 analysis/recommend_glide.py --mode forward-block --dataset world

  # retire at 60, CPP/OAS from 65 (the portfolio funds the whole target until then), some bequest
  python3 analysis/recommend_glide.py --start-age 40 --accum 20 --retire 35 \
      --guaranteed-start-age 65 --bequest-weight 0.25

  # the same household under all four return models in one table
  python3 analysis/recommend_glide.py --compare-modes --paths 8000

  # answer prompts instead of writing flags
  python3 analysis/recommend_glide.py -i

  # the built-in showcase (3 spending rules × 2 levers + overview)
  python3 analysis/recommend_glide.py --demo

Run with -h to see every flag and its default.
"""

from __future__ import annotations

import argparse

from .markets import DATASETS, PWL_CURVE, RETURN_MODES
from .recommender import recommend_glide_path
from .report import format_summary, plot_glide_path, run_demo

# --compare-modes: (label, engine overrides). The last row is the post-1990 monetary regime.
COMPARE_MODES = (
    ("iid-mc", {"return_mode": "iid-mc"}),
    ("forward-block", {"return_mode": "forward-block"}),
    ("historical-block", {"return_mode": "historical-block"}),
    ("hist-block 1990-2020", {"return_mode": "historical-block",
                              "exclude_years": [(1871, 1989)]}),
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
    delay = p.get("guaranteed_delay", 0)
    delay_note = f" from retirement year {delay + 1}" if delay else ""
    bequest = p.get("bequest_weight", 0.0)
    bequest_note = f" | bequest θ {bequest:g} (k ${p['bequest_offset']:,.0f})" if bequest else ""
    print("Optimized equity glide path")
    print(f"  {p['accum_years']}y accumulation + {p['retire_years']}y retirement | {spend} | "
          f"guaranteed income ${p['guaranteed_income']:,.0f}/yr{delay_note} | "
          f"γ {p['gamma']:g}{bequest_note}{lev}{ret_cap_note} | {p['interval']}y steps")
    print(f"  return mode: {p['return_mode']}")
    print(f"  curve mean basis: {p.get('curve_mean_basis', 'geometric')}")
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
    ratio = rec.get("funding_ratio")
    ratio_text = f" ({ratio * 100:.1f}% of expected retirement balance)" if ratio is not None else ""
    print(f"  year-1 portfolio draw: ${rec['initial_target_draw']:,.0f}{ratio_text}")
    if rec.get("flat_equity_pct") is not None:
        edge = rec["ce_income"] - rec["flat_ce_income"]
        flat_allocation = f"{rec['flat_equity_pct']:.0f}% equity"
        if rec["flat_ce_income"] > rec["ce_income"] * 1.05:
            print(f"  robust recommendation: constant {flat_allocation} "
                  f"(CE ${rec['flat_ce_income']:,.0f}/yr)")
        edge_label = f"+${edge:,.0f}" if edge >= 0 else f"-${abs(edge):,.0f}"
        print(f"  best constant {flat_allocation} → CE "
              f"${rec['flat_ce_income']:,.0f}/yr (glide {edge_label}/yr)")
    if rec.get("median_bequest") is not None:
        print(f"  median money left at end of plan: ${rec['median_bequest']:,.0f} "
              f"(best constant ${rec['flat_median_bequest']:,.0f})")
    if bequest and rec.get("welfare_ce") is not None:
        print(f"  welfare CE incl. bequest: ${rec['welfare_ce']:,.0f}/yr "
              f"(best constant ${rec['flat_welfare_ce']:,.0f}/yr)")
    if rec.get("over_funded"):
        print("  ! Your plan is over-funded: the allocation doesn't change your income. Add a "
              "bequest weight or retire earlier.\n    (The weights shown are the middle of a tie, "
              "not an optimum.)")
    print(f"\n  {'age' if by_age else 'year':>5}  equity%  phase")
    for e in rec["schedule"]:
        x = e["age_start"] if by_age else e["year_start"]
        print(f"  {x:>5}   {e['equity_pct']:>5.0f}   {e['phase']}")


def print_mode_comparison(recs):
    """One table: each return model's schedule, CE, full-path shortfall and best constant."""
    labels = list(recs)
    first = recs[labels[0]]
    by_age = "age_start" in first["schedule"][0]
    width = max(len(lbl) for lbl in labels) + 2
    print("Glide path by return model (same household and preferences)")
    print(f"  {'age' if by_age else 'year':>6}  phase  " + "".join(f"{lbl:>{width}}" for lbl in labels))
    for i, e in enumerate(first["schedule"]):
        x = e["age_start"] if by_age else e["year_start"]
        row = "".join(f"{recs[lbl]['schedule'][i]['equity_pct']:>{width - 1}.0f}%" for lbl in labels)
        print(f"  {x:>6}  {e['phase']:<6} {row}")
    rows = (
        ("CE $/yr", lambda r: f"{r['ce_income']:,.0f}"),
        ("shortfall", lambda r: f"{r['depletion'] * 100:.1f}%"),
        ("best const.", lambda r: f"{r['flat_equity_pct']:.0f}%"),
        ("const. CE", lambda r: f"{r['flat_ce_income']:,.0f}"),
        ("over-funded", lambda r: "yes" if r.get("over_funded") else "no"),
    )
    for name, fmt in rows:
        print(f"  {name:<14}" + "".join(f"{fmt(recs[lbl]):>{width}}" for lbl in labels))
    print("  shortfall = full-path rate (includes pre-retirement markets). See "
          "docs/glide-path/methodology.md \"Applying this\" for how to choose between models.")


def build_parser():
    ap = argparse.ArgumentParser(
        description="Recommend a simulation-optimized allocation glide path for your inputs.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("--demo", action="store_true", help="run the built-in showcase (writes figures) and exit")
    ap.add_argument("-i", "--interactive", action="store_true",
                    help="prompt for the inputs, run, and print the equivalent flag command")
    ap.add_argument("--compare-modes", action="store_true",
                    help="run iid-mc, forward-block, historical-block and historical-block "
                    "1990-2020 and print one comparison table")
    # core inputs
    ap.add_argument("--accum", type=int, default=30, help="accumulation years")
    ap.add_argument("--retire", type=int, default=30, help="retirement (planning-horizon) years")
    ap.add_argument("--flex", type=float, default=0.0, help="spending flexibility 0..1 (0=constant $, 1=flexible)")
    ap.add_argument("--guaranteed-income", type=float, default=20_000.0,
                    help="guaranteed retirement income ($/yr, from --guaranteed-start-age on)")
    ap.add_argument("--guaranteed-start-age", type=int, default=None,
                    help="age guaranteed income starts (requires --start-age; default: retirement "
                    "age). Before it the portfolio funds the whole target")
    ap.add_argument("--interval", type=int, default=5, help="years per glide step (1=per-age, 5=every 5y)")
    ap.add_argument("--gamma", type=float, default=4.0, help="CRRA risk aversion (1 log, 4 base, 8 cautious)")
    ap.add_argument("--beta", type=float, default=0.985, help="annual retirement-consumption discount factor")
    ap.add_argument("--bequest-weight", type=float, default=0.0,
                    help="θ on u(money left + offset); 0 = no bequest motive, 0.25 some, 0.5 strong")
    ap.add_argument("--bequest-offset", type=float, default=None,
                    help="k in u(money left + k) ($; default: --target-income)")
    ap.add_argument("--start-age", type=int, default=None, help="label the schedule by age instead of year")
    # household scale (real dollars)
    ap.add_argument("--savings", type=float, default=200_000.0, help="Start savings ($)")
    ap.add_argument("--contrib", type=float, default=20_000.0, help="annual contribution ($/yr, accumulation)")
    ap.add_argument("--target-income", type=float, default=60_000.0, help="target real retirement income ($/yr)")
    ap.add_argument("--withdrawal-rate", type=float, default=0.04, help="rate for the flexible spending part")
    ap.add_argument("--inflation", type=float, default=2.1,
                    help="inflation %% used to deflate the curve to real (iid-mc and forward-block)")
    ap.add_argument("--curve-mean-basis", choices=("geometric", "arithmetic"), default="geometric",
                    help="whether --curve means are nominal geometric or already arithmetic")
    ap.add_argument("--mode", choices=RETURN_MODES,
                    default=None, help="return path generation mode "
                    "(default: iid-mc — forward-CMA iid normal Monte Carlo, the no-recovery "
                    "baseline; forward-block = historical sequences rescaled to the forward-CMA "
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
                    help="CSV of 'equity_weight,mean,vol' rows for iid-mc and forward-block; means "
                    "are nominal geometric %% by default (default: built-in PWL curve)")
    ap.add_argument("--plot", type=str, default=None, help="save a step-plot of the recommendation to this PNG")
    ap.add_argument("--show", action="store_true", help="display the plot interactively")
    return ap


def _guaranteed_delay(ap, args):
    if args.guaranteed_start_age is None:
        return 0
    if args.start_age is None:
        ap.error("--guaranteed-start-age requires --start-age")
    retirement_age = args.start_age + args.accum
    if args.guaranteed_start_age >= retirement_age + args.retire:
        ap.error("--guaranteed-start-age must be before the end of the plan "
                 f"(age {retirement_age + args.retire})")
    return max(0, args.guaranteed_start_age - retirement_age)


def main(argv=None):
    ap = build_parser()
    args = ap.parse_args(argv)
    if args.interactive:
        from .interactive import run_interactive  # lazy: interactive imports this module

        run_interactive()
        return
    mode = args.mode or "iid-mc"

    if args.accum < 0:
        ap.error("--accum must be >= 0")
    if args.retire < 1:
        ap.error("--retire must be >= 1")
    if args.block_years < 1:
        ap.error("--block-years must be >= 1")
    if args.compare_modes and (args.mode or args.curve or args.dataset != "pooled"
                               or args.exclude_countries or args.exclude_years):
        ap.error("--compare-modes sets the return model itself; drop --mode, --curve, "
                 "--dataset and --exclude-*")
    if args.curve and mode not in ("iid-mc", "forward-block"):
        ap.error("--curve is only supported with --mode iid-mc or forward-block; historical-iid "
                 "and historical-block use raw JST returns")
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
    kwargs = dict(
        flexibility=args.flex, guaranteed_income=args.guaranteed_income,
        guaranteed_delay=_guaranteed_delay(ap, args),
        alloc_curve=curve, interval=args.interval, gamma=args.gamma, beta=args.beta,
        bequest_weight=args.bequest_weight, bequest_offset=args.bequest_offset,
        max_leverage=args.max_leverage, borrow_cost=args.borrow_cost,
        retirement_max_equity=args.retirement_max_equity,
        start_age=args.start_age, current_savings=args.savings, annual_contribution=args.contrib,
        target_income=args.target_income, withdrawal_rate=args.withdrawal_rate, inflation=args.inflation,
        curve_mean_basis=args.curve_mean_basis, block_years=args.block_years,
        dataset=args.dataset, n_paths=args.n_paths,
    )
    if args.compare_modes:
        recs = {}
        for label, overrides in COMPARE_MODES:
            print(f"  running {label}…", flush=True)
            recs[label] = recommend_glide_path(args.accum, args.retire, **{**kwargs, **overrides})
        print()
        print_mode_comparison(recs)
        to_plot = recs
    else:
        rec = recommend_glide_path(
            args.accum, args.retire, return_mode=mode,
            exclude_countries=args.exclude_countries, exclude_years=exclude_years, **kwargs,
        )
        print_rec(rec)
        to_plot = rec
    if args.plot or args.show:
        plot_glide_path(to_plot, start_age=args.start_age, path=args.plot, show=args.show)
        if args.plot:
            print(f"\nPlot written to {args.plot}")


if __name__ == "__main__":
    main()
