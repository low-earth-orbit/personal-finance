#!/usr/bin/env python3
"""Regenerate the methodology-note figures from the JST data.

Writes a light and a dark SVG of each figure to ``docs/glide-path/img/`` (the notes pick the
variant with a ``<picture>`` element that follows the reader's colour scheme):

  variance-ratio-*.svg      : what VR < 1 (equity) and VR > 1 (long bonds) do to the spread of
                              multi-year returns, with actual 10-year windows overlaid
  bond-persistence-*.svg    : bond VR(10y) split into carry, price (rate cycle) and inflation terms
  block-bootstrap-*.svg     : one simulated 40-year sequence assembled by the stationary block
                              bootstrap, block by block

Every number in the figures is computed here, on the arithmetic-return basis the engines use
(the same functions as ``research_history --sections vr bond-decomp``).

  python3 -m analysis.glide_path.doc_figures
"""

from __future__ import annotations

import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib.patches import FancyBboxPatch  # noqa: E402

from analysis.shared import jst_history as J  # noqa: E402

from .research_history import _history_cuts  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "glide-path", "img")

# Reference categorical palette, slots 1-3 (validated all-pairs in both modes), plus surfaces/ink.
THEMES = {
    "light": dict(surface="#fcfcfb", ink="#0b0b0b", ink2="#52514e", muted="#8a8984",
                  grid="#e4e3df", s1="#2a78d6", s2="#eb6834", s3="#1baf7a"),
    "dark": dict(surface="#1a1a19", ink="#f0efec", ink2="#c3c2b7", muted="#8f8e86",
                 grid="#33332f", s1="#3987e5", s2="#d95926", s3="#199e70"),
}
FONT = ["Lato", "Helvetica Neue", "Arial", "DejaVu Sans"]


def _style(theme):
    t = THEMES[theme]
    plt.rcParams.update({
        "svg.fonttype": "none", "svg.hashsalt": "jst-doc-figures",
        "font.family": "sans-serif", "font.sans-serif": FONT, "font.size": 11,
        "figure.facecolor": t["surface"], "axes.facecolor": t["surface"],
        "savefig.facecolor": t["surface"], "text.color": t["ink"],
        "axes.edgecolor": t["grid"], "axes.labelcolor": t["ink2"],
        "xtick.color": t["ink2"], "ytick.color": t["ink2"],
        "axes.grid": True, "grid.color": t["grid"], "grid.linewidth": 0.8,
        "axes.spines.top": False, "axes.spines.right": False,
        "axes.titlesize": 12, "axes.titleweight": "bold", "axes.titlelocation": "left",
    })
    return t


def _save(fig, name, theme):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{name}-{theme}.svg")
    fig.savefig(path, format="svg", metadata={"Date": None, "Creator": None})
    plt.close(fig)
    return path


def _standardized_windows(series, segments, horizon, count, seed):
    """Cumulative sums of standardized returns over random within-segment windows."""
    z = (series - series.mean()) / series.std()
    runs = [r for r in J._split_segments(z, segments) if len(r) > horizon]
    starts = [(i, s) for i, r in enumerate(runs) for s in range(len(r) - horizon + 1)]
    rng = np.random.default_rng(seed)
    picks = rng.choice(len(starts), size=count, replace=False)
    paths = []
    for p in picks:
        i, s = starts[p]
        paths.append(np.concatenate([[0.0], np.cumsum(runs[i][s:s + horizon])]))
    return paths


def variance_ratio_figure(theme):
    t = _style(theme)
    hist = J.load_pooled_country_returns()
    horizon = 10
    q = np.arange(0, horizon + 1)
    assets = [
        ("equity", hist.equity, t["s1"], "VR < 1: mean reversion (equities)"),
        ("long bonds", hist.fixed_income, t["s2"], "VR > 1: persistence (long bonds)"),
    ]
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.6), sharey=True)
    for ax, (name, series, color, title) in zip(axes, assets):
        vr = np.array([1.0] + [J.variance_ratio(series, k, hist.segment_ids) for k in q[1:]])
        band = np.sqrt(q * vr)
        iid = np.sqrt(q)
        for path in _standardized_windows(series, hist.segment_ids, horizon, 40, seed=5):
            ax.plot(q, path, color=t["muted"], lw=0.7, alpha=0.35, zorder=1)
        ax.fill_between(q, -band, band, color=color, alpha=0.22, lw=0, zorder=2)
        ax.plot(q, band, color=color, lw=2, zorder=3)
        ax.plot(q, -band, color=color, lw=2, zorder=3)
        ax.plot(q, iid, color=t["ink2"], lw=1.4, ls=(0, (4, 3)), zorder=4)
        ax.plot(q, -iid, color=t["ink2"], lw=1.4, ls=(0, (4, 3)), zorder=4)
        ratio = band[-1] / iid[-1]
        ax.set_title(f"{title}, VR(10y) ≈ {vr[-1]:.2f}", color=t["ink"])
        ax.annotate(f"±1 s.d. of the cumulative\nreal return ({name})", xy=(horizon, band[-1]),
                    xytext=(-6, 8), textcoords="offset points", ha="right", va="bottom",
                    color=t["ink"], fontsize=10)
        ax.annotate("iid (VR = 1): ±√years", xy=(horizon, -iid[-1]), xytext=(-6, -6),
                    textcoords="offset points", ha="right", va="top", color=t["ink2"],
                    fontsize=10)
        ax.text(0.03, 0.04, f"10-year spread = {ratio:.2f}× the iid spread (√VR)",
                transform=ax.transAxes, color=t["ink2"], fontsize=10)
        ax.set_xlim(0, horizon)
        ax.set_xticks(range(0, horizon + 1, 2))
        ax.set_xlabel("years held")
    axes[0].set_ylabel("cumulative real return, in one-year s.d.")
    axes[0].set_ylim(-6.6, 6.6)
    fig.text(0.01, 0.005, "JST R6 pooled, 16 countries, 1871–2020; thin lines: 40 random actual "
             "10-year windows, demeaned and standardized.", color=t["ink2"], fontsize=9)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    return _save(fig, "variance-ratio", theme)


def bond_persistence_figure(theme):
    t = _style(theme)
    colors = {"carry": t["s1"], "price": t["s2"], "inflation": t["s3"]}
    labels = {"carry": "carry (starting yield)", "price": "price (rate cycle)",
              "inflation": "inflation"}
    rows = []
    for cut_name, kw in _history_cuts():
        panel, segments = J.load_pooled_bond_components(**kw)
        total = panel["fixed_income"].to_numpy()
        parts = {n: panel[n].to_numpy() for n in J.BOND_COMPONENTS}
        rows.append((cut_name.replace(" infl-target", ""),
                     J.variance_ratio(total, 10, segments),
                     J.variance_decomposition(total, parts, 10, segments)))
    fig, ax = plt.subplots(figsize=(10, 4.4))
    gap = 0.012  # surface gap between stacked segments, in data units
    for y, (name, vr, contrib) in enumerate(rows):
        pos, neg = 0.0, 0.0
        for comp in J.BOND_COMPONENTS:
            value = contrib[comp]
            left = pos if value >= 0 else neg + value
            width = abs(value)
            ax.barh(y, max(width - gap, 0.0), left=left + (gap / 2 if value >= 0 else 0),
                    height=0.56, color=colors[comp], lw=0, zorder=3)
            if width >= 0.18:
                ax.text(left + width / 2, y, f"{value:.2f}", ha="center", va="center",
                        color="#ffffff", fontsize=9.5, fontweight="bold", zorder=4)
            if value >= 0:
                pos += value
            else:
                neg += value
        label_x = max(pos, 1.0) + 0.05
        ax.text(label_x, y, f"VR(10y) = {vr:.2f}", va="center", color=t["ink"], fontsize=10)
    ax.axvline(1.0, color=t["ink2"], lw=1.2, ls=(0, (4, 3)), zorder=2)
    ax.text(1.02, len(rows) - 0.32, "iid = 1", color=t["ink2"], fontsize=10, va="center")
    ax.axvline(0.0, color=t["ink2"], lw=0.8, zorder=2)
    ax.set_yticks(range(len(rows)), [r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlim(-0.15, 3.3)
    ax.set_ylim(len(rows) - 0.1, -0.6)
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("contribution to the 10-year variance ratio of real long-bond returns")
    ax.set_title("Where long-bond persistence comes from", color=t["ink"])
    handles = [plt.Rectangle((0, 0), 1, 1, color=colors[c]) for c in J.BOND_COMPONENTS]
    ax.legend(handles, [labels[c] for c in J.BOND_COMPONENTS], loc="lower right", frameon=False,
              ncol=3, bbox_to_anchor=(1.0, 1.0), fontsize=10, labelcolor=t["ink"])
    fig.text(0.01, 0.01, "JST R6 pooled. Each term's covariance with the 10-year real sum; the "
             "three add up to the VR. Variance accounting, not a causal split.",
             color=t["ink2"], fontsize=9)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    return _save(fig, "bond-persistence", theme)


def _pooled_countries():
    """Country label for each row of the default pooled history (same order as the loader)."""
    frame = J.load_jst_frame()
    labels = []
    for country in frame["country"].dropna().unique():
        rows = J.real_stock_fixed_income_returns(frame[frame["country"] == country])
        labels.extend([country] * len(rows))
    return np.array(labels)


def block_bootstrap_figure(theme):
    t = _style(theme)
    hist = J.load_pooled_country_returns()
    countries = _pooled_countries()
    if len(countries) != hist.observations:
        raise AssertionError("country labels do not line up with the pooled history")
    n_years = 40
    idx = J.sample_indices(hist.observations, n_years, 1, mode="historical-block",
                           block_years=10, seed=12, segment_ids=hist.segment_ids)[:, 0]
    # Split the sampled path into blocks: a new block starts wherever the next row is not the
    # historical successor of the previous one.
    blocks, start = [], 0
    for k in range(1, n_years + 1):
        if k == n_years or not (hist.segment_ids[idx[k]] == hist.segment_ids[idx[k - 1]]
                                and hist.years[idx[k]] == hist.years[idx[k - 1]] + 1):
            blocks.append((start, k))
            start = k
    fig, (ax, ax2) = plt.subplots(2, 1, figsize=(10, 4.4), sharex=True,
                                  gridspec_kw={"height_ratios": [1, 1.6]})
    ax.set_ylim(0, 1)
    ax.axis("off")
    for b, (lo, hi) in enumerate(blocks):
        color = t["s1"] if b % 2 == 0 else t["s3"]
        ax.add_patch(FancyBboxPatch((lo + 0.08, 0.18), hi - lo - 0.16, 0.64,
                                    boxstyle="round,pad=0,rounding_size=0.25",
                                    color=color, lw=0))
        first, last = hist.years[idx[lo]], hist.years[idx[hi - 1]]
        span = f"{first}" if first == last else f"{first}–{str(last)[-2:]}"
        text = f"{countries[idx[lo]]}\n{span}" if hi - lo >= 4 else countries[idx[lo]]
        ax.text((lo + hi) / 2, 0.5, text, ha="center", va="center", color="#ffffff",
                fontsize=9 if hi - lo >= 4 else 7.5, fontweight="bold")
    ax.set_title(f"One simulated 40-year sequence: {len(blocks)} historical blocks "
                 "(mean length 10 years)", color=t["ink"])
    wealth = np.concatenate([[1.0], np.cumprod(1 + hist.equity[idx])])
    ax2.plot(np.arange(0, n_years + 1), wealth, color=t["s1"], lw=2)
    ax2.set_yscale("log")
    ticks = [v for v in (0.25, 0.5, 1, 2, 4, 8, 16, 32) if wealth.min() / 1.5 <= v <= wealth.max() * 1.5]
    ax2.set_yticks(ticks, [f"${v:g}" for v in ticks])
    ax2.minorticks_off()
    ax2.set_ylabel("real equity growth of $1")
    ax2.set_xlabel("simulated year")
    ax2.set_xlim(0, n_years)
    for lo, _ in blocks[1:]:
        ax2.axvline(lo, color=t["ink2"], lw=0.8, ls=(0, (2, 3)))
    fig.text(0.01, 0.01, "Raw JST R6 pooled real equity returns (the engine also rescales them to "
             "the forward assumptions). Dotted lines: block boundaries.", color=t["ink2"],
             fontsize=9)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    return _save(fig, "block-bootstrap", theme)


def main():
    pd.set_option("mode.copy_on_write", True)
    for theme in THEMES:
        for build in (variance_ratio_figure, bond_persistence_figure, block_bootstrap_figure):
            print(build(theme))


if __name__ == "__main__":
    main()
