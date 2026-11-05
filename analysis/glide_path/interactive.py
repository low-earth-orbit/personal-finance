"""Interactive prompt flow for the glide-path recommender.

  python3 -m analysis.glide_path.interactive            # prompts for your inputs
  python3 -m analysis.glide_path.interactive --demo     # lever sweep (writes figures)
"""

from __future__ import annotations

import os
import shlex
import sys

from analysis.glide_path.markets import BLOCK_MODES as _BLOCK_MODES, DATASETS, PWL_CURVE, RETURN_MODES
from analysis.glide_path.recommender import recommend_glide_path
from analysis.glide_path.report import plot_glide_path, run_demo


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
    curve_mean_basis="geometric",
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
    if curve_mean_basis != "geometric":
        args.extend(["--curve-mean-basis", curve_mean_basis])
    return shlex.join(args)




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
            "iid-mc": "forward-CMA normal Monte Carlo, no sequencing (default)",
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
    print(f"  Curve mean basis: {rec['params'].get('curve_mean_basis', 'geometric')}")
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
    ratio = rec["funding_ratio"]
    ratio_text = f" ({ratio * 100:.1f}% of expected retirement balance)" if ratio is not None else ""
    print(f"    Year-1 draw    : ${rec['initial_target_draw']:>10,.0f}{ratio_text}")
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
        curve_mean_basis=rec["params"].get("curve_mean_basis", "geometric"),
    )
    print("\n  Run this simulation again or modify it with:")
    print(f"  {command}")




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
        _run_interactive()


if __name__ == "__main__":
    main()
