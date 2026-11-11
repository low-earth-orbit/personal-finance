"""Interactive prompt flow for the glide-path recommender.

The prompts only build a flag list for the CLI (``cli.main``), so an interactive run and its
printed reproduction command are the same code path.

  python3 analysis/recommend_glide.py -i                 # prompts for your inputs
  python3 -m analysis.glide_path.interactive             # same
  python3 -m analysis.glide_path.interactive --demo      # lever sweep (writes figures)
"""

from __future__ import annotations

import os
import shlex
import sys

from analysis.glide_path.markets import BLOCK_MODES, DATASETS, RETURN_MODES
from analysis.glide_path.report import run_demo

COMPARE = "compare"  # pseudo return mode: run all four models side by side
BEQUEST_WEIGHTS = {"none": 0.0, "some": 0.25, "strong": 0.5}


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
            print("  ! Invalid input — expected a number. Try again.\n")


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


def _fmt(x):
    # repr keeps every digit (f"{x:g}" rounded $1,234,567 to 1.23457e+06).
    if isinstance(x, float):
        return str(int(x)) if x.is_integer() else repr(x)
    return str(x)


def format_reproduction_command(argv):
    """Shell-safe flag-CLI command for a CLI argument list."""
    return shlex.join(["python3", "analysis/recommend_glide.py", *argv])


def collect_argv():
    """Walk the user through their inputs; return the equivalent CLI argument list."""
    _section("About you")
    current_age = _ask("Current age", 35, int)
    retirement_age = _ask("Planned retirement age", 65, int, "60 for early retirement")
    planning_age = _ask("Plan until age (life expectancy)", 95, int, "90–100 is typical")
    savings = _ask("Current portfolio balance ($)", 200_000.0, float, "500000")
    contrib = _ask("Annual savings / contribution ($)", 20_000.0, float, "30000")
    accum_years = max(0, retirement_age - current_age)
    retire_years = max(1, planning_age - max(retirement_age, current_age))

    _section("Retirement income")
    target = _ask("Target annual spending in retirement ($)", 60_000.0, float,
                  "70000  (gross, in today's dollars)")
    guaranteed = _ask("Guaranteed annual income (CPP + OAS + DB pension, $)", 20_000.0, float,
                      "0 = none,  20000 = typical CPP/OAS")
    guaranteed_age = retirement_age
    if guaranteed > 0:
        guaranteed_age = _ask("  Age it starts (the portfolio funds the whole target before then)",
                              retirement_age, int, "65 if you retire at 60 and start CPP/OAS at 65")

    _section("Spending rule")
    print("  Flexibility = how much your spending follows the market:")
    print("    0   = fixed real $ every year (rigid; safest default)")
    print("    1   = fully proportional — a 20% portfolio drop ⇒ ~20% spending cut")
    print("    0.5 = half-and-half")
    flex = _ask("Spending flexibility [0–1]", 0.0, float, "0 = no flexibility")
    withdrawal_rate = 0.04
    if flex > 0:
        withdrawal_rate = _ask("  Share of the balance drawn each year when spending flexibly",
                               0.04, float, "0.04 = 4%")

    _section("Preferences & risk")
    print("  Risk aversion (γ): 1 to 2 = very aggressive, 3 to 5 = moderate, "
          "6 to 10 = very cautious.")
    gamma = _ask("Risk aversion γ", 4.0, float, "4 = moderate base case")
    beta = _ask("Time-discount factor β", 0.985, float,
                "1.0 = equal weight, 0.985 = balanced, 0.97 = stronger early-years tilt")
    bequest = _ask_choice(
        "Leave money to heirs?", "none", list(BEQUEST_WEIGHTS),
        labels={"none": "money left at the end is worth nothing (θ 0)",
                "some": "θ 0.25", "strong": "θ 0.5"},
    )
    print("\n  Leverage: max equity % (100 = no leverage, 150 = up to 1.5× via borrowing).")
    max_equity = _ask("Max equity %", 100.0, float, "100 = none, 150 = max 1.5x leverage")
    while True:
        retirement_max_equity = _ask("Retirement max equity %", min(max_equity, 100.0), float,
                                     "equity ceiling only after retirement; cannot exceed max equity")
        if retirement_max_equity <= max_equity:
            break
        print(f"  ! Must not exceed max equity ({_fmt(max_equity)}%). Try again.\n")
    borrow_cost = None
    if max_equity > 100:
        borrow_cost = _ask("  Real cost of borrowing (% per year)", 2.0, float,
                           "2 = margin/HELOC real rate")

    _section("Return paths")
    print("  iid-mc uses the app's forward capital-market assumptions; the historical modes")
    print("  bootstrap paired stock/bond returns from JST history. The models disagree, so")
    print("  'compare' runs all four and prints one table.")
    mode = _ask_choice(
        "Return mode", "iid-mc", [*RETURN_MODES, COMPARE],
        labels={
            "iid-mc": "forward-CMA normal Monte Carlo, no sequencing (default)",
            "historical-iid": "raw history, years sampled independently",
            "historical-block": "raw history, stationary circular blocks (keeps sequencing)",
            "forward-block": "history rescaled to forward marginals, then block-bootstrapped",
            COMPARE: "iid-mc, forward-block, historical-block and post-1990 historical-block",
        },
    )
    dataset = "pooled"
    if mode not in ("iid-mc", COMPARE):
        dataset = _ask_choice(
            "Historical dataset", "pooled", DATASETS,
            labels={"pooled": "each country's own sequence (recommended)",
                    "world": "equal-weight cross-country average"},
        )
    block_years = 10
    if mode in BLOCK_MODES or mode == COMPARE:
        block_years = _ask("Average stationary-block length in years", 10, int, "10")

    _section("Optimizer & output")
    interval = _ask("Glide-step interval in years (1 = per-age path, 5 = coarser but faster)",
                    5, int, "1 for smoothest result, 5 for quick run")
    n_paths = _ask("Number of simulation paths (more = more stable, slower)", 15_000, int,
                   "5000 for quick, 30000 for publication quality")
    plot = input("  Save a chart? Enter a .png path (or press Enter to skip):\n> ").strip()

    argv = [
        "--start-age", _fmt(current_age), "--accum", _fmt(accum_years),
        "--retire", _fmt(retire_years), "--savings", _fmt(savings), "--contrib", _fmt(contrib),
        "--target-income", _fmt(target), "--guaranteed-income", _fmt(guaranteed),
        "--flex", _fmt(flex), "--gamma", _fmt(gamma), "--beta", _fmt(beta),
        "--max-leverage", _fmt(max(max_equity, 5.0) / 100), "--interval", _fmt(interval),
        "--paths", _fmt(n_paths),
    ]
    if guaranteed_age > max(retirement_age, current_age):
        argv += ["--guaranteed-start-age", _fmt(guaranteed_age)]
    if flex > 0:
        argv += ["--withdrawal-rate", _fmt(withdrawal_rate)]
    if BEQUEST_WEIGHTS[bequest]:
        argv += ["--bequest-weight", _fmt(BEQUEST_WEIGHTS[bequest])]
    if retirement_max_equity < max_equity:
        argv += ["--retirement-max-equity", _fmt(retirement_max_equity / 100)]
    if borrow_cost is not None:
        argv += ["--borrow-cost", _fmt(borrow_cost)]
    argv += ["--compare-modes"] if mode == COMPARE else ["--mode", mode]
    if dataset != "pooled":
        argv += ["--dataset", dataset]
    if mode in BLOCK_MODES or mode == COMPARE:
        argv += ["--block-years", _fmt(block_years)]
    if plot:
        argv += ["--plot", plot if plot.endswith(".png") else plot + ".png"]
    return argv


def run_interactive():
    """Prompt, run through the flag CLI, then print the command that reproduces the run."""
    from analysis.glide_path.cli import main as cli_main  # lazy: cli imports this module lazily

    print("\n╔══════════════════════════════════════════════════╗")
    print("║   Lifetime Allocation Optimizer — interactive    ║")
    print("╚══════════════════════════════════════════════════╝")
    print("  Press Enter to accept the default shown in (  ).")
    print("  All dollar amounts are in today's real dollars.")
    argv = collect_argv()
    print("\n  Running the optimizer…\n")
    cli_main(argv)
    print("\n  Run this again or modify it with:")
    print(f"  {format_reproduction_command(argv)}")


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if "--demo" in argv:
        demo_mode = "iid-mc"
        for i, arg in enumerate(argv):
            if arg == "--mode" and i + 1 < len(argv):
                demo_mode = argv[i + 1]
            elif arg.startswith("--mode="):
                demo_mode = arg.split("=", 1)[1]
        run_demo(os.path.join("analysis", "artifacts", "glide_path", "demo"), return_mode=demo_mode)
    else:
        run_interactive()


if __name__ == "__main__":
    main()
