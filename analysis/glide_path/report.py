"""Text summaries, plots, and the lever-sweep demo for glide-path recommendations."""

from __future__ import annotations

import os

from analysis.glide_path.markets import PWL_CURVE


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




# ── demo (sweep mode) ─────────────────────────────────────────────────────────
def run_demo(out_dir, return_mode="iid-mc"):
    """Sweep key levers across three spending rules and write plots.

    Defaults to `iid-mc` (the recommender's default): the lever sweeps are meant to show
    how the tent moves, and under forward-block every cell is near-flat ~100% equity.
    Pass another mode to sweep under it."""
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
        from analysis.glide_path.recommender import recommend_glide_path

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


