#!/usr/bin/env python3
"""Historical-vs-iid glide-path research harness.

Resolves *why* the sequence-preserving block bootstrap pushes the optimal lifetime allocation
toward all-equity while the iid modes do not, by sweeping the marginals x sequencing factorial
and the world-vs-pooled dataset choice. Unlike the web app, this reports the **raw optimized
glide path** (no simplicity bias); the best single constant allocation and the full CE-vs-constant
curve are printed alongside as comparators so you can judge for yourself how peaked each optimum is.

Sections (choose with --sections; default all):
  matrix  : the factorial — iid-mc / historical-iid / historical-block / forward-block, world & pooled
  blocks  : block-length sweep (sequencing strength) on the pooled dataset
  channels: which ingredient flips the answer — corr, marginal shapes, equity-only or
            bond-only sequencing, vs the full joint sequence structure
  menu    : replace the nominal-bond leg with a synthetic VR=1 real asset (idealized
            short-TIPS/RRB ladder) — how much of flat-100% is the bond menu?
  gamma   : risk-aversion sweep across the key modes
  curves  : CE vs constant equity weight (how peaked is "100% equity"?)
  vr      : variance-ratio diagnostic (mean reversion) for world vs pooled

  python3 -m analysis.glide_path.research_history --sections matrix vr
  python3 -m analysis.glide_path.research_history --quick          # faster, lower fidelity
"""

from __future__ import annotations

import argparse

import numpy as np

from .recommender import recommend_glide_path

# Disasters whose inclusion most stresses the equity case under single-country sequencing.
DISASTER_COUNTRIES = ["Germany", "Japan"]
DISASTER_YEARS = ["1914-1923", "1939-1948"]  # WWI + hyperinflation; WWII + aftermath

# Stable six: long, usable series with no hyperinflation, occupation, or market closure.
STABLE_SIX = ["USA", "UK", "Canada", "Australia", "Switzerland", "Sweden"]


def _parse_windows(tokens):
    windows = []
    for token in tokens:
        if "-" in token[1:]:
            lo, hi = token.split("-", 1)
            windows.append((int(lo), int(hi)))
        else:
            windows.append(int(token))
    return windows


def base_kwargs(args, **overrides):
    """Common recommend_glide_path inputs for the research scenario, plus per-cell overrides."""
    kwargs = dict(
        accum_years=args.accum,
        retire_years=args.retire,
        flexibility=args.flex,
        guaranteed_income=args.guaranteed_income,
        target_income=args.target_income,
        current_savings=args.savings,
        annual_contribution=args.contrib,
        interval=args.interval,
        gamma=args.gamma,
        n_paths=args.paths,
        passes=args.passes,
    )
    kwargs.update(overrides)
    return kwargs


def glide_string(rec):
    """Per-step equity weights of the RAW optimized glide (the headline recommendation)."""
    return "/".join(f"{entry['equity_pct']:.0f}" for entry in rec["schedule"])


def summary_row(label, rec):
    edge = rec["ce_income"] - rec["flat_ce_income"]
    return (
        f"  {label:<34} glide[{glide_string(rec):<29}] "
        f"CE ${rec['ce_income']:>7,.0f}  | best-const {rec['flat_equity_pct']:>3.0f}% "
        f"CE ${rec['flat_ce_income']:>7,.0f}  (edge {edge:+,.0f}/yr)  "
        f"dd-deplete {rec['drawdown_depletion'] * 100:>4.1f}%"
    )


# Factorial x dataset cells. World cannot exclude countries/years (no per-country structure).
def matrix_cells(args):
    cells = [
        ("iid-mc", dict(return_mode="iid-mc")),
        ("historical-iid (world)", dict(return_mode="historical-iid")),
        ("historical-block (world)", dict(return_mode="historical-block", block_years=args.block_years)),
        ("forward-block (world)", dict(return_mode="forward-block", block_years=args.block_years)),
        ("historical-iid (pooled)", dict(return_mode="historical-iid", dataset="pooled")),
        ("historical-block (pooled)",
         dict(return_mode="historical-block", dataset="pooled", block_years=args.block_years)),
        ("forward-block (pooled)",
         dict(return_mode="forward-block", dataset="pooled", block_years=args.block_years)),
        ("forward-block (pooled, ex-disasters)",
         dict(return_mode="forward-block", dataset="pooled", block_years=args.block_years,
              exclude_countries=DISASTER_COUNTRIES, exclude_years=_parse_windows(DISASTER_YEARS))),
    ]
    return cells


def run_matrix(args):
    print("\n" + "=" * 100)
    print(f"FACTORIAL x DATASET  (raw optimized glide; γ={args.gamma:g}, "
          f"{args.accum}y accum + {args.retire}y retire, ${args.savings:,.0f}, "
          f"target ${args.target_income:,.0f}, guaranteed ${args.guaranteed_income:,.0f})")
    print("=" * 100)
    print("  Reads: world block→all-equity is SEQUENCING (forward-block barely moves it); pooling")
    print("  single-country sequences is the biggest lever (it restores the diversified-away risk).")
    for label, overrides in matrix_cells(args):
        rec = recommend_glide_path(**base_kwargs(args, **overrides))
        print(summary_row(label, rec))


def run_block_sweep(args):
    print("\n" + "=" * 100)
    print("BLOCK-LENGTH SWEEP  (pooled; longer blocks preserve more mean reversion → more equity)")
    print("  block=1 should ~collapse to historical-iid; the response curve measures sequencing's worth.")
    print("=" * 100)
    for mode in ("historical-block", "forward-block"):
        print(f"\n  -- {mode} (pooled) --")
        for block_years in (1, 3, 5, 10, 20, 40):
            rec = recommend_glide_path(
                **base_kwargs(args, return_mode=mode, dataset="pooled", block_years=block_years)
            )
            print(summary_row(f"block={block_years:>2}y", rec))


def run_channels(args):
    """Factorial ladder isolating which ingredient of forward-block flips the optimum.

    a) iid-mc                : normal draws, curve-interpolated intermediate vols (baseline)
    b) synth-iid (hist corr) : iid bivariate NORMAL at the forward anchors with the historical
                               stock/bond correlation — the correlation channel alone
    c) rescaled-hist iid     : forward-rescaled real history sampled iid — correlation +
                               non-normal marginal shapes, still no sequencing
    d) equity-block/bond-iid : block-sample equity only, iid-shuffle bonds — equity sequencing
                               (decade reversion AND short-run momentum) without bond persistence
    e) equity-iid/bond-block : the reverse — bond persistence without equity sequencing
    f) forward-block         : the full joint sequence structure (the scenario mode)

    The one-asset cells (d, e) necessarily drop the cross-correlation; cell b shows that
    channel is immaterial on its own.
    """
    from unittest.mock import patch

    from analysis.glide_path import recommender as R
    from analysis.shared import jst_history as J

    eq_m, eq_v, bd_m, bd_v = R._forward_anchors(R.PWL_CURVE, 2.1, True)
    raw = J.load_pooled_country_returns()
    corr = float(np.corrcoef(raw.equity, raw.fixed_income)[0, 1])
    rescaled = J.rescale_to_targets(
        raw, equity_mean=eq_m, equity_vol=eq_v,
        fixed_income_mean=bd_m, fixed_income_vol=bd_v,
        label_suffix="forward-CMA rescaled",
    )

    rng = np.random.default_rng(7)
    n_obs = 50_000
    z = rng.standard_normal((n_obs, 2))
    z[:, 1] = corr * z[:, 0] + np.sqrt(1.0 - corr**2) * z[:, 1]
    synth = J.ReturnHistory(
        years=np.arange(n_obs), equity=eq_m + eq_v * z[:, 0],
        fixed_income=bd_m + bd_v * z[:, 1],
        label=f"synthetic normal (corr {corr:.2f})", country_count=0,
    )

    def split_sampler(block_asset):
        """Block-sample one asset's rows, iid-shuffle the other's."""
        def sample(history, n_years, n_paths, *, mode, block_years, seed):
            blk = J.sample_indices(history.observations, n_years, n_paths,
                                   mode="historical-block", block_years=block_years,
                                   seed=seed, segment_ids=history.segment_ids)
            iid = J.sample_indices(history.observations, n_years, n_paths,
                                   mode="historical-iid", block_years=block_years,
                                   seed=seed + 1)
            if block_asset == "equity":
                return history.equity[blk], history.fixed_income[iid]
            return history.equity[iid], history.fixed_income[blk]
        return sample

    print("\n" + "=" * 100)
    print(f"CHANNEL FACTORIAL  (what flips the optimum to flat ~100%? hist stock/bond corr = {corr:.3f})")
    print("  Reads: corr (b) and marginal shapes (c) barely move the iid answer; one-asset sequencing")
    print("  (d, e) does not flip it either — only the full joint sequence structure (f) does.")
    print("=" * 100)

    print(summary_row("a) iid-mc",
                      recommend_glide_path(**base_kwargs(args, return_mode="iid-mc"))))
    with patch.object(R, "_load_history", return_value=synth):
        print(summary_row("b) synth-iid (hist corr)",
                          recommend_glide_path(**base_kwargs(args, return_mode="historical-iid"))))
    with patch.object(R, "_load_history", return_value=rescaled):
        print(summary_row("c) rescaled-hist iid",
                          recommend_glide_path(**base_kwargs(args, return_mode="historical-iid"))))
    fwd = base_kwargs(args, return_mode="forward-block", dataset="pooled",
                      block_years=args.block_years)
    with patch.object(J, "sample_return_paths", split_sampler("equity")):
        print(summary_row("d) equity-block/bond-iid", recommend_glide_path(**fwd)))
    with patch.object(J, "sample_return_paths", split_sampler("fixed_income")):
        print(summary_row("e) equity-iid/bond-block", recommend_glide_path(**fwd)))
    print(summary_row("f) forward-block (joint)", recommend_glide_path(**fwd)))


def run_menu(args):
    """Replace the nominal-bond leg with a synthetic VR=1 real asset (corr 0, iid).

    Equity keeps its forward-block sequencing throughout; only the non-equity asset changes:
      a) forward-block              : rescaled historical long nominal bonds (joint structure)
      b) synth bond, same marginals : iid normal at the SAME bond mean/vol — isolates the
                                      bond-side sequencing+correlation, holding risk constant
      c) short-TIPS ladder          : iid normal, bond mean, 2% vol (idealized real ladder)
      d) short-TIPS ladder @2% real : c) with a 2.0% real yield
      e) XSTH ETF proxy             : iid normal, bond mean, FULL short-bond vol — a real,
                                      short-duration ETF (CAD-hedged short-term US TIPS) that has
                                      the persistence fix but NOT the ladder's vol suppression.
                                      Numerically identical to (b); the buyable Canadian figure.

    Cells (c)/(d) are idealized: no real-rate duration risk, no equity correlation, no
    liquidity/issuance constraints (Canada stopped RRB issuance in 2022). The 2% vol in (c) is the
    LADDER property (hold-to-maturity pull-to-par), not a property of being short or real — an ETF
    (e) cannot deliver it. Read c/d as upper bounds; (e) is what a Canadian can actually buy.
    """
    from unittest.mock import patch

    from analysis.glide_path import recommender as R
    from analysis.shared import jst_history as J

    eq_m, eq_v, bd_m, bd_v = R._forward_anchors(R.PWL_CURVE, 2.1, True)
    rescaled = J.rescale_to_targets(
        J.load_pooled_country_returns(),
        equity_mean=eq_m, equity_vol=eq_v,
        fixed_income_mean=bd_m, fixed_income_vol=bd_v,
        label_suffix="forward-CMA rescaled",
    )

    def with_synth_bond(mean, vol, seed=11):
        rng = np.random.default_rng(seed)
        synth = mean + vol * rng.standard_normal(rescaled.observations)
        return J.ReturnHistory(
            years=rescaled.years, equity=rescaled.equity, fixed_income=synth,
            label="synth-bond", country_count=rescaled.country_count,
            segment_ids=rescaled.segment_ids,
        )

    def split_sample(history, n_years, n_paths, *, mode, block_years, seed):
        """Equity rows in stationary blocks; bond rows iid (kills persistence and corr)."""
        blk = J.sample_indices(history.observations, n_years, n_paths,
                               mode="historical-block", block_years=block_years,
                               seed=seed, segment_ids=history.segment_ids)
        iid = J.sample_indices(history.observations, n_years, n_paths,
                               mode="historical-iid", block_years=block_years,
                               seed=seed + 1)
        return history.equity[blk], history.fixed_income[iid]

    print("\n" + "=" * 100)
    print("BOND-MENU EXPERIMENT  (equity keeps forward-block sequencing; only the safe asset changes)")
    print("  Reads: b) holds bond risk constant and removes only its sequencing+corr — if the optimum")
    print("  drops from 100%, the flat-100% result is about the bond menu, not equity's merit.")
    print("=" * 100)

    print(summary_row("a) nominal bonds (forward-block)", recommend_glide_path(
        **base_kwargs(args, return_mode="forward-block", dataset="pooled",
                      block_years=args.block_years))))
    cells = [
        ("b) synth bond, same marginals", bd_m, bd_v),
        ("c) short-TIPS ladder (2% vol)", bd_m, 0.02),
        ("d) short-TIPS ladder @2% real", 0.02, 0.02),
        ("e) XSTH ETF proxy (VR=1, full vol)", bd_m, bd_v),
    ]
    for label, mean, vol in cells:
        history = with_synth_bond(mean, vol)
        with patch.object(R, "_load_history", return_value=history), \
             patch.object(J, "sample_return_paths", split_sample):
            rec = recommend_glide_path(
                **base_kwargs(args, return_mode="historical-block", dataset="pooled",
                              block_years=args.block_years))
        print(summary_row(label, rec))


def run_gamma_sweep(args):
    print("\n" + "=" * 100)
    print("RISK-AVERSION SWEEP  (does the mode ranking hold across γ?)")
    print("=" * 100)
    modes = [
        ("iid-mc", dict(return_mode="iid-mc")),
        ("historical-block (world)", dict(return_mode="historical-block", block_years=args.block_years)),
        ("historical-block (pooled)",
         dict(return_mode="historical-block", dataset="pooled", block_years=args.block_years)),
        ("forward-block (pooled)",
         dict(return_mode="forward-block", dataset="pooled", block_years=args.block_years)),
    ]
    for gamma in (2.0, 4.0, 8.0):
        print(f"\n  -- γ = {gamma:g} --")
        for label, overrides in modes:
            rec = recommend_glide_path(**base_kwargs(args, gamma=gamma, **overrides))
            print(summary_row(label, rec))


def run_flat_curves(args):
    print("\n" + "=" * 100)
    print("CE vs CONSTANT EQUITY WEIGHT  (how peaked is the optimum? near-flat → simplicity bias OK)")
    print("=" * 100)
    cells = [
        ("iid-mc", dict(return_mode="iid-mc")),
        ("historical-block (world)", dict(return_mode="historical-block", block_years=args.block_years)),
        ("historical-block (pooled)",
         dict(return_mode="historical-block", dataset="pooled", block_years=args.block_years)),
        ("forward-block (pooled)",
         dict(return_mode="forward-block", dataset="pooled", block_years=args.block_years)),
    ]
    weights_shown = [0, 20, 40, 50, 60, 70, 80, 90, 100]
    header = "  ".join(f"{w:>5}%" for w in weights_shown)
    print(f"\n  {'mode':<28} {header}   (CE $000/yr; * = argmax)")
    for label, overrides in cells:
        rec = recommend_glide_path(**base_kwargs(args, return_flat_curve=True, **overrides))
        by_weight = {round(p["equity_pct"]): p["ce_income"] for p in rec["flat_curve"]}
        best = max(by_weight, key=lambda k: by_weight[k])
        cells_out = []
        for w in weights_shown:
            ce = by_weight.get(w)
            if ce is None:
                cells_out.append(f"{'—':>6}")
            else:
                mark = "*" if w == best else " "
                cells_out.append(f"{ce / 1000:>5.1f}{mark}")
        print(f"  {label:<28} {'  '.join(cells_out)}")


def run_variance_ratios(args):
    from analysis.shared.jst_history import (
        load_pooled_bills,
        load_pooled_country_returns,
        load_world_bills,
        load_world_returns,
        variance_ratio,
    )

    print("\n" + "=" * 100)
    print("VARIANCE RATIO  (VR<1 = mean reversion; the mechanism behind block→equity)")
    print("  bills = empirical short asset: real return on rolling gov bills (nominal,")
    print("          bill_rate deflated by CPI) — the menu's synthetic VR=1 leg made real")
    print("=" * 100)
    horizons = [1, 2, 5, 10, 15]
    disaster_windows = _parse_windows(DISASTER_YEARS)
    datasets = [
        ("world", load_world_returns(), load_world_bills()),
        ("pooled", load_pooled_country_returns(), load_pooled_bills()),
        ("pooled ex-disasters",
         load_pooled_country_returns(
             exclude_countries=DISASTER_COUNTRIES, exclude_years=disaster_windows),
         load_pooled_bills(
             exclude_countries=DISASTER_COUNTRIES, exclude_years=disaster_windows)),
    ]
    head = "  ".join(f"q={q:>2}" for q in horizons)
    print(f"\n  {'dataset':<22} {'asset':<7} eq.vol  {head}")
    for name, history, bills in datasets:
        bill_series, bill_segments = bills
        rows = (
            ("equity", history.equity, history.segment_ids),
            ("bonds", history.fixed_income, history.segment_ids),
            ("bills", bill_series, bill_segments),
        )
        for asset, series, segments in rows:
            vols = "  ".join(
                f"{variance_ratio(series, q, segments):>4.2f}" for q in horizons
            )
            vol = f"{series.std() * 100:>5.1f}%"
            print(f"  {name:<22} {asset:<7} {vol}  {vols}")

    # Era / country cuts (pooled basis): does bond mean reversion in any era carry over
    # to the empirical short asset? The 1990–2020 inflation-targeting cut is the test —
    # bonds flip to VR<1 there (the secular rate decline), bills do not.
    from analysis.shared.jst_history import load_jst_frame

    all_countries = [c for c in load_jst_frame()["country"].dropna().unique()]
    not_stable = [c for c in all_countries if c not in STABLE_SIX]
    cuts = [
        ("full 1871-2020", {}),
        ("post-1950", {"exclude_years": [(1871, 1949)]}),
        ("ex Germany+Japan", {"exclude_countries": DISASTER_COUNTRIES}),
        ("stable six", {"exclude_countries": not_stable}),
        ("1990-2020 infl-target", {"exclude_years": [(1871, 1989)]}),
    ]
    print("\n  Era / country cuts — VR(10y), pooled basis (bond reversion vs bill persistence)")
    print(f"  {'cut':<24} {'eqVR':>5} {'bondVR':>6} {'billVR':>6}   {'billVol':>7}  {'n':>5}")
    for cut_name, kw in cuts:
        history = load_pooled_country_returns(**kw)
        bill_series, bill_segments = load_pooled_bills(**kw)
        eq_vr = variance_ratio(history.equity, 10, history.segment_ids)
        bond_vr = variance_ratio(history.fixed_income, 10, history.segment_ids)
        bill_vr = variance_ratio(bill_series, 10, bill_segments)
        bill_vol = bill_series.std() * 100
        print(f"  {cut_name:<24} {eq_vr:>5.2f} {bond_vr:>6.2f} {bill_vr:>6.2f}   "
              f"{bill_vol:>6.1f}%  {history.observations:>5}")


SECTIONS = {
    "matrix": run_matrix,
    "blocks": run_block_sweep,
    "channels": run_channels,
    "menu": run_menu,
    "gamma": run_gamma_sweep,
    "curves": run_flat_curves,
    "vr": run_variance_ratios,
}


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Historical-vs-iid glide-path research sweeps (reports the raw optimized glide).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("--sections", nargs="*", choices=list(SECTIONS), default=list(SECTIONS),
                    help="which sections to run")
    # Funded constant-withdrawal decumulation by default (the paper's setting).
    ap.add_argument("--accum", type=int, default=0)
    ap.add_argument("--retire", type=int, default=30)
    ap.add_argument("--flex", type=float, default=0.0)
    ap.add_argument("--savings", type=float, default=1_000_000.0)
    ap.add_argument("--contrib", type=float, default=0.0)
    ap.add_argument("--guaranteed-income", type=float, default=20_000.0)
    ap.add_argument("--target-income", type=float, default=60_000.0)
    ap.add_argument("--gamma", type=float, default=4.0)
    ap.add_argument("--interval", type=int, default=5)
    ap.add_argument("--block-years", type=int, default=10)
    ap.add_argument("--paths", type=int, default=6_000)
    ap.add_argument("--passes", type=int, default=10)
    ap.add_argument("--quick", action="store_true",
                    help="lower fidelity (fewer paths/passes, 10y steps) for a fast look")
    args = ap.parse_args(argv)

    if args.quick:
        args.paths = min(args.paths, 3_000)
        args.passes = min(args.passes, 6)
        args.interval = max(args.interval, 10)

    for name in args.sections:
        SECTIONS[name](args)
    print()


if __name__ == "__main__":
    main()
