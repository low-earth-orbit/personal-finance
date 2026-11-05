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
  menu    : replace the nominal-bond leg with synthetic real assets (idealized real asset and
            short-TIPS/RRB ladder) — how much of flat-100% is the bond menu?
  tips-etf: the real leg as an AR(1) at a measured short-TIPS-ETF persistence (--tips-phi)
  tips-stress: cell (b) with one assumption changed at a time (correlation, phi, mean, vol)
  bills-block: a real-bill leg that keeps its own historical persistence
  gamma   : risk-aversion sweep across the key modes
  curves  : CE vs constant equity weight (how peaked is "100% equity"?)
  vr      : variance-ratio diagnostic (mean reversion) for world vs pooled
  bond-decomp: bond VR(10) split into carry, rate-cycle (price) and inflation terms by era
  regret  : CE regret of constant weights and the iid recommended glide across historical cuts
  funding : funding-ratio and matched-spending flexibility sweeps

  python3 -m analysis.glide_path.research_history --sections matrix vr
  python3 -m analysis.glide_path.research_history --quick          # faster, lower fidelity
"""

from __future__ import annotations

import argparse

import numpy as np

from analysis.shared import jst_history as J

from .markets import PWL_CURVE, build_alloc, forward_anchors
from .recommender import evaluate_path, recommend_glide_path

# Disasters whose inclusion most stresses the equity case under single-country sequencing.
DISASTER_COUNTRIES = ["Germany", "Japan"]
DISASTER_YEARS = ["1914-1923", "1939-1948"]  # WWI + hyperinflation; WWII + aftermath

# Stable six: long, usable series with no hyperinflation, occupation, or market closure.
STABLE_SIX = ["USA", "UK", "Canada", "Australia", "Switzerland", "Sweden"]


def split_sampler(block_asset):
    """Sampler that block-samples one asset's rows and iid-shuffles the other's.

    Removes cross-asset sequencing (and the contemporaneous correlation) while keeping one leg's
    own sequence structure. Pass as ``recommend_glide_path(..., sampler=...)``."""
    def sample(history, n_years, n_paths, *, mode, block_years, seed):
        blk = J.sample_indices(history.observations, n_years, n_paths, mode="historical-block",
                               block_years=block_years, seed=seed, segment_ids=history.segment_ids)
        iid = J.sample_indices(history.observations, n_years, n_paths, mode="historical-iid",
                               block_years=block_years, seed=seed + 1)
        if block_asset == "equity":
            return history.equity[blk], history.fixed_income[iid]
        return history.equity[iid], history.fixed_income[blk]
    return sample


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
    if "(world)" in label:
        assert rec["params"].get("dataset") == "world", (label, rec["params"].get("dataset"))
    if "(pooled" in label:
        assert rec["params"].get("dataset") == "pooled", (label, rec["params"].get("dataset"))
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
        ("historical-iid (world)", dict(return_mode="historical-iid", dataset="world")),
        ("historical-block (world)", dict(return_mode="historical-block", dataset="world", block_years=args.block_years)),
        ("forward-block (world)", dict(return_mode="forward-block", dataset="world", block_years=args.block_years)),
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
    print("  Rows compare return modes and world/pooled historical datasets under the same household inputs.")
    print("  Interpret the optimized glide, constant-weight comparator, and depletion columns together.")
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
    b1) synth-iid (curve corr): iid bivariate NORMAL at the forward arithmetic anchors with the
                                correlation implied by the curve's 60/40 volatility
    b2) synth-iid (hist corr) : same synthetic marginals with historical pooled correlation
    c) rescaled-hist iid     : forward-rescaled real history sampled iid — correlation +
                               non-normal marginal shapes, still no sequencing
    d) equity-block/bond-iid : block-sample equity only, iid-shuffle bonds — equity sequencing
                               (decade reversion AND short-run momentum) without bond persistence
    e) equity-iid/bond-block : the reverse — bond persistence without equity sequencing
    f) forward-block         : the full joint sequence structure (the scenario mode)

    The one-asset cells (d, e) necessarily drop the cross-correlation. b1/b2 isolate only the
    correlation choice; c adds historical marginal shapes.
    """
    eq_m, eq_v, bd_m, bd_v = forward_anchors(PWL_CURVE, 2.1, True)
    raw = J.load_pooled_country_returns()
    historical_corr = float(np.corrcoef(raw.equity, raw.fixed_income)[0, 1])
    w6040 = 0.60
    _, curve_6040_vol = build_alloc(PWL_CURVE, 2.1, True)(np.array(w6040))
    curve_corr = float(
        (curve_6040_vol**2 - w6040**2 * eq_v**2 - (1 - w6040)**2 * bd_v**2)
        / (2 * w6040 * (1 - w6040) * eq_v * bd_v)
    )
    curve_corr = float(np.clip(curve_corr, -1.0, 1.0))
    rescaled = J.rescale_to_targets(
        raw, equity_mean=eq_m, equity_vol=eq_v,
        fixed_income_mean=bd_m, fixed_income_vol=bd_v,
        label_suffix="forward-CMA rescaled",
    )

    def synthetic_corr(corr, label, seed=7):
        rng = np.random.default_rng(seed)
        n_obs = raw.observations
        z = rng.standard_normal((n_obs, 2))
        z[:, 1] = corr * z[:, 0] + np.sqrt(1.0 - corr**2) * z[:, 1]
        return J.ReturnHistory(
            years=np.arange(n_obs),
            equity=J._affine_to_target(eq_m + eq_v * z[:, 0], eq_m, eq_v),
            fixed_income=J._affine_to_target(bd_m + bd_v * z[:, 1], bd_m, bd_v),
            label=label, country_count=0,
        )

    synth_curve = synthetic_corr(curve_corr, f"synthetic normal (curve corr {curve_corr:.2f})")
    synth_history = synthetic_corr(historical_corr, f"synthetic normal (historical corr {historical_corr:.2f})")

    print("\n" + "=" * 100)
    print(f"CHANNEL FACTORIAL  (curve-implied corr={curve_corr:.3f}; historical pooled corr={historical_corr:.3f})")
    print("  b1/b2 change only correlation at forward arithmetic anchors; c adds marginal shapes;")
    print("  (d, e) does not flip it either — only the full joint sequence structure (f) does.")
    print("=" * 100)

    print(summary_row("a) iid-mc",
                      recommend_glide_path(**base_kwargs(args, return_mode="iid-mc"))))
    for label, history in (("b1) synth-iid (curve corr)", synth_curve),
                           ("b2) synth-iid (historical corr)", synth_history),
                           ("c) rescaled-hist iid", rescaled)):
        print(summary_row(label, recommend_glide_path(
            **base_kwargs(args, return_mode="historical-iid", history=history))))
    fwd = base_kwargs(args, return_mode="forward-block", dataset="pooled",
                      block_years=args.block_years)
    print(summary_row("d) equity-block/bond-iid",
                      recommend_glide_path(**fwd, sampler=split_sampler("equity"))))
    print(summary_row("e) equity-iid/bond-block",
                      recommend_glide_path(**fwd, sampler=split_sampler("fixed_income"))))
    print(summary_row("f) forward-block (joint)", recommend_glide_path(**fwd)))


def run_menu(args):
    """Replace the nominal-bond leg with a synthetic VR=1 real asset (corr 0, iid).

    Equity keeps its forward-block sequencing throughout; only the non-equity asset changes:
      a) forward-block              : rescaled historical long nominal bonds (joint structure)
      b) idealized real asset       : VR=1 at the bond mean/vol, zero equity correlation
      c) idealized short-TIPS ladder   : iid normal, bond mean, 2% vol
      d) idealized ladder @2% real     : c) with a 2.0% real yield

    Cells (c)/(d) are idealized: no real-rate duration risk, no equity correlation, no
    liquidity/issuance constraints (Canada stopped RRB issuance in 2022). The 2% vol in (c) is the
    LADDER property (hold-to-maturity pull-to-par), not a property of being short or real. Read c/d
    as upper bounds. (b) is generous to a real fund on correlation, persistence and mean and
    conservative on volatility; ``tips-stress`` varies each.
    """
    eq_m, eq_v, bd_m, bd_v = forward_anchors(PWL_CURVE, 2.1, True)
    rescaled = J.rescale_to_targets(
        J.load_pooled_country_returns(),
        equity_mean=eq_m, equity_vol=eq_v,
        fixed_income_mean=bd_m, fixed_income_vol=bd_v,
        label_suffix="forward-CMA rescaled",
    )

    def with_synth_bond(mean, vol, seed=11):
        rng = np.random.default_rng(seed)
        synth = J._affine_to_target(
            mean + vol * rng.standard_normal(rescaled.observations), mean, vol
        )
        return J.ReturnHistory(
            years=rescaled.years, equity=rescaled.equity, fixed_income=synth,
            label="synth-bond", country_count=rescaled.country_count,
            segment_ids=rescaled.segment_ids,
        )

    print("\n" + "=" * 100)
    print("BOND-MENU EXPERIMENT  (equity keeps forward-block sequencing; only the safe asset changes)")
    print("  Reads: b) holds bond risk constant and removes only its sequencing+corr — if the optimum")
    print("  drops from 100%, the flat-100% result is about the bond menu, not equity's merit.")
    print("=" * 100)

    print(summary_row("a) nominal bonds (forward-block)", recommend_glide_path(
        **base_kwargs(args, return_mode="forward-block", dataset="pooled",
                      block_years=args.block_years))))
    cells = [
        ("b) idealized real asset (VR=1, 0 corr, bond mean/vol)", bd_m, bd_v),
        ("c) idealized short-TIPS ladder (2% vol)", bd_m, 0.02),
        ("d) idealized ladder @2% real", 0.02, 0.02),
    ]
    for label, mean, vol in cells:
        rec = recommend_glide_path(**base_kwargs(
            args, return_mode="historical-block", dataset="pooled", block_years=args.block_years,
            history=with_synth_bond(mean, vol), sampler=split_sampler("equity")))
        print(summary_row(label, rec))


def run_gamma_sweep(args):
    print("\n" + "=" * 100)
    print("RISK-AVERSION SWEEP  (does the mode ranking hold across γ?)")
    print("=" * 100)
    modes = [
        ("iid-mc", dict(return_mode="iid-mc")),
        ("historical-block (world)", dict(return_mode="historical-block", dataset="world", block_years=args.block_years)),
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
        ("historical-block (world)", dict(return_mode="historical-block", dataset="world", block_years=args.block_years)),
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


def _history_cuts():
    """Era / country cuts shared by the ``vr`` and ``bond-decomp`` sections (pooled kwargs)."""
    all_countries = [c for c in J.load_jst_frame()["country"].dropna().unique()]
    not_stable = [c for c in all_countries if c not in STABLE_SIX]
    return [
        ("full 1871-2020", {}),
        ("post-1950", {"exclude_years": [(1871, 1949)]}),
        ("ex Germany+Japan", {"exclude_countries": DISASTER_COUNTRIES}),
        ("stable six", {"exclude_countries": not_stable}),
        ("1990-2020 infl-target", {"exclude_years": [(1871, 1989)]}),
    ]


def run_variance_ratios(args):
    from analysis.shared.jst_history import (
        load_pooled_bills,
        load_pooled_country_returns,
        load_world_bills,
        load_world_returns,
        variance_ratio,
    )

    print("\n" + "=" * 100)
    print("VARIANCE RATIO  (arithmetic-return basis; VR<1 = mean reversion)")
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
                f"{variance_ratio(series, q, segments, basis='arithmetic'):>4.2f}" for q in horizons
            )
            vol = f"{series.std() * 100:>5.1f}%"
            print(f"  {name:<22} {asset:<7} {vol}  {vols}")

    # Era / country cuts (pooled basis): does bond mean reversion in any era carry over
    # to the empirical short asset? The 1990–2020 inflation-targeting cut is the test —
    # bonds flip to VR<1 there (the secular rate decline), bills do not.
    cuts = _history_cuts()
    def iid_null(series, segments, reps=300, seed=20260604):
        """Mean and 5th-95th percentile under within-segment permutation."""
        series = np.asarray(series, dtype=float)
        rng = np.random.default_rng(seed)
        values = []
        if segments is None:
            groups = [np.arange(len(series))]
        else:
            segments = np.asarray(segments)
            changes = np.flatnonzero(np.diff(segments) != 0) + 1
            groups = np.split(np.arange(len(series)), changes)
        for _ in range(reps):
            shuffled = series.copy()
            for indices in groups:
                shuffled[indices] = rng.permutation(shuffled[indices])
            values.append(variance_ratio(shuffled, 10, segments, basis="arithmetic"))
        return float(np.mean(values)), tuple(float(x) for x in np.percentile(values, [5, 95]))

    print("\n  Era / country cuts — arithmetic VR(10), plus within-segment iid null (300 permutations)")
    print(f"  {'cut':<24} {'eqVR':>5} {'bondVR':>6} {'billVR':>6} {'eq null':>17} {'bond null':>19} {'billVol':>7} {'n':>5}")
    for cut_i, (cut_name, kw) in enumerate(cuts):
        history = load_pooled_country_returns(**kw)
        bill_series, bill_segments = load_pooled_bills(**kw)
        eq_vr = variance_ratio(history.equity, 10, history.segment_ids, basis="arithmetic")
        bond_vr = variance_ratio(history.fixed_income, 10, history.segment_ids, basis="arithmetic")
        bill_vr = variance_ratio(bill_series, 10, bill_segments, basis="arithmetic")
        eq_null = iid_null(history.equity, history.segment_ids, seed=20260604 + cut_i * 2)
        bond_null = iid_null(history.fixed_income, history.segment_ids, seed=20260605 + cut_i * 2)
        bill_vol = bill_series.std() * 100
        print(f"  {cut_name:<24} {eq_vr:>5.2f} {bond_vr:>6.2f} {bill_vr:>6.2f} "
              f"{eq_null[0]:>5.2f}[{eq_null[1][0]:.2f},{eq_null[1][1]:.2f}] "
              f"{bond_null[0]:>5.2f}[{bond_null[1][0]:.2f},{bond_null[1][1]:.2f}] "
              f"{bill_vol:>6.1f}% {history.observations:>5}")


def run_bond_decomposition(args):
    """Split pooled real-bond (and bill) persistence into rate and inflation terms.

    real = (carry + price - inflation) / (1 + inflation) exactly, so each term's covariance
    with the 10-year real sum adds up to the bond VR(10) reported by ``vr``.
    """
    print("\n" + "=" * 100)
    print("BOND PERSISTENCE DECOMPOSITION  (arithmetic basis; contributions sum to bond VR)")
    print("  carry     = prior-year long yield            (income)")
    print("  price     = nominal return minus carry       (yield changes: the rate cycle)")
    print("  inflation = -CPI change                      (erosion of the nominal claim)")
    print("  each term deflated by (1 + CPI); attribution by Cov(10y real sum, 10y term sum)")
    print("=" * 100)
    names = J.BOND_COMPONENTS
    head = "  ".join(f"{n:>9}" for n in names)
    print(f"\n  {'cut':<24} {'n':>5} {'bondVR10':>8}  {head}   corr10(price,infl)  infl-only VR10")
    for cut_name, kw in _history_cuts():
        panel, segments = J.load_pooled_bond_components(**kw)
        history = J.load_pooled_country_returns(**kw)
        if not np.allclose(panel["fixed_income"].to_numpy(), history.fixed_income):
            raise AssertionError(f"{cut_name}: component rows diverge from the pooled history")
        total = panel["fixed_income"].to_numpy()
        parts = {n: panel[n].to_numpy() for n in names}
        contrib = J.variance_decomposition(total, parts, 10, segments)
        vr = J.variance_ratio(total, 10, segments)
        cells = "  ".join(f"{contrib[n]:>4.2f} {contrib[n] / vr:>4.0%}" for n in names)

        def sums10(values):
            runs = [r for r in J._split_segments(values, segments) if len(r) >= 10]
            return np.concatenate([np.convolve(r, np.ones(10), "valid") for r in runs])

        corr = np.corrcoef(sums10(parts["price"]), sums10(parts["inflation"]))[0, 1]
        infl_vr = J.variance_ratio(parts["inflation"], 10, segments)
        print(f"  {cut_name:<24} {len(total):>5} {vr:>8.2f}  {cells}   {corr:>17.2f}  {infl_vr:>14.2f}")

    print("\n  Bills: real = (bill rate - CPI) / (1 + CPI); rate-only VR10 is the deflated bill rate alone")
    print(f"  {'cut':<24} {'n':>5} {'billVR10':>8}  {'rate':>9}  {'inflation':>9}   rate-only VR10")
    for cut_name, kw in _history_cuts():
        panel, segments = J.load_pooled_bill_components(**kw)
        total = panel["bills"].to_numpy()
        parts = {n: panel[n].to_numpy() for n in ("rate", "inflation")}
        contrib = J.variance_decomposition(total, parts, 10, segments)
        vr = J.variance_ratio(total, 10, segments)
        cells = "  ".join(f"{contrib[n]:>4.2f} {contrib[n] / vr:>4.0%}" for n in parts)
        rate_vr = J.variance_ratio(parts["rate"], 10, segments)
        print(f"  {cut_name:<24} {len(total):>5} {vr:>8.2f}  {cells}   {rate_vr:>14.2f}")


def run_bills_block(args):
    """Block bootstrap with a real **bills** leg carrying its OWN historical persistence.

    Unlike the menu cells (which force the safe asset iid, VR=1), this replaces the long-bond leg
    with JST's empirical real short-bill series — rescaled to the given bills marginals (default
    0.75% real / 2% vol) — and block-bootstraps it jointly with equity. So the bills leg keeps its
    real-world inflation persistence (arithmetic VR(10y) printed below): the honest "real-world GIC/bill ladder" answer,
    vs the menu's idealized VR=1 short asset.
    """
    eq_m, eq_v, _, _ = forward_anchors(PWL_CURVE, 2.1, True)
    bill_m, bill_v = args.bills_mean / 100.0, args.bills_vol / 100.0

    # Joint per-country equity+bills panel: inner-join on year so both legs are present and paired,
    # with shared per-country segment ids (no block bridges countries/gaps).
    frame = J.load_jst_frame()
    eq_parts, bill_parts, seg_country, seg_years = [], [], [], []
    for country in frame["country"].dropna().unique():
        sub = frame[frame["country"] == country]
        eq = J.real_stock_fixed_income_returns(sub)[["year", "equity"]]
        bl = J.real_bill_returns(sub)  # ["year", "bills"]
        merged = eq.merge(bl, on="year", how="inner").sort_values("year")
        if merged.empty:
            continue
        eq_parts.append(merged["equity"].to_numpy(dtype=float))
        bill_parts.append(merged["bills"].to_numpy(dtype=float))
        seg_country.append(np.full(len(merged), country))
        seg_years.append(merged["year"].to_numpy(dtype=int))
    equity = np.concatenate(eq_parts)
    bills = np.concatenate(bill_parts)
    years = np.concatenate(seg_years)
    segment_ids = J._assign_segments(np.concatenate(seg_country), years)

    joint = J.rescale_to_targets(
        J.ReturnHistory(years=years, equity=equity, fixed_income=bills,
                        label="equity+bills joint", country_count=len(eq_parts),
                        segment_ids=segment_ids),
        equity_mean=eq_m, equity_vol=eq_v, fixed_income_mean=bill_m, fixed_income_vol=bill_v,
        label_suffix="forward-CMA rescaled (bills)")

    print("\n" + "=" * 100)
    print("BLOCK BOOTSTRAP with a REAL BILLS leg (bills keep their own historical persistence)")
    print(f"  bills marginals: {args.bills_mean:.2f}% real / {args.bills_vol:.2f}% vol; "
          f"equity keeps full forward-block sequencing. Compare to menu cell (a) nominal bonds.")
    print(f"  bills VR(10y) = {J.variance_ratio(joint.fixed_income, 10, joint.segment_ids):.2f} "
          f"(iid null = 1.0; >1 = persistent inflation bleed)")
    print("=" * 100)
    # `joint` is already rescaled (equity to the forward anchors, bills to the bills marginals),
    # so block-sample it as-is. (Running it as forward-block would rescale the bills leg again,
    # to the BOND anchors — an earlier version of this section did exactly that.)
    rec = recommend_glide_path(**base_kwargs(
        args, return_mode="historical-block", dataset="pooled", block_years=args.block_years,
        history=joint))
    print(summary_row("bills (block, own persistence)", rec))

    rng = np.random.default_rng(11)
    iid_bills = bill_m + bill_v * rng.standard_normal(joint.observations)
    iid_hist = J.ReturnHistory(years=joint.years, equity=joint.equity, fixed_income=iid_bills,
                               label="bills-iid", country_count=joint.country_count,
                               segment_ids=joint.segment_ids)

    rec_iid = recommend_glide_path(**base_kwargs(
        args, return_mode="historical-block", dataset="pooled", block_years=args.block_years,
        history=iid_hist, sampler=split_sampler("equity")))
    print(summary_row("bills (iid, VR=1 — for contrast)", rec_iid))


def run_tips_etf(args):
    """Data-anchored realistic short-TIPS-ETF leg (e.g. XSTH/VTIP), not the idealized VR=1 cell.

    Menu cell (b) assumes the buyable real asset is VR=1. Annual VTIP returns (2012-, deflated by
    US CPI) suggest short-TIPS real returns are only mildly persistent: AR(1) phi ~= 0.13, i.e.
    VR(2y) ~= 1.13. That estimate rests on ~13 annual observations (standard error ~0.27), so it
    cannot rule out phi = 0 or phi ~= 0.5; ``tips-stress`` sweeps phi. For comparison, JST real
    bills have arithmetic VR(2y) ~= 1.50 pooled / 1.74 world (VR(10y) ~= 3.3 pooled). This builds
    the safe leg as an AR(1) at the given phi/marginals (--tips-mean/--tips-vol/--tips-phi),
    block-sampled jointly so it carries that persistence while equity keeps its JST forward-block
    sequencing.
    """
    eq_m, eq_v, bd_m, bd_v = forward_anchors(PWL_CURVE, 2.1, True)
    # Default the TIPS marginals to the forward bond anchors so phi=0 reproduces menu cell (b).
    tips_m = bd_m if args.tips_mean is None else args.tips_mean / 100.0
    tips_v = bd_v if args.tips_vol is None else args.tips_vol / 100.0
    phi = args.tips_phi

    raw_hist = J.load_pooled_country_returns()
    # Match menu cell (b): equity uses the forward-CMA arithmetic mean/vol while retaining
    # pooled historical sequencing. The old version accidentally used raw 6.94% real / 22.3%
    # equity, making this comparison incomparable.
    hist = J.rescale_to_targets(
        raw_hist,
        equity_mean=eq_m,
        equity_vol=eq_v,
        fixed_income_mean=tips_m,
        fixed_income_vol=tips_v,
        label_suffix="forward-CMA equity rescaled",
    )
    n = hist.observations
    seg = hist.segment_ids if hist.segment_ids is not None else np.zeros(n, dtype=int)

    def ar1(seed):
        """AR(1) with the given phi at (tips_m, tips_v) marginals; restart each segment."""
        rng = np.random.default_rng(seed)
        innov_sd = tips_v * np.sqrt(1 - phi * phi)
        out = np.empty(n)
        prev, x = None, 0.0
        for i in range(n):
            if seg[i] != prev:
                x = rng.standard_normal() * tips_v
                prev = seg[i]
            else:
                x = phi * x + rng.standard_normal() * innov_sd
            out[i] = tips_m + x
        return out

    def make_hist(series, label):
        return J.ReturnHistory(years=hist.years, equity=hist.equity, fixed_income=series,
                               label=label, country_count=hist.country_count,
                               segment_ids=hist.segment_ids)

    print("\n" + "=" * 100)
    print("REALISTIC short-TIPS-ETF leg (data-anchored AR(1), not idealized VR=1)")
    print(f"  marginals {tips_m * 100:.2f}% real / {tips_v * 100:.2f}% vol, AR(1) phi={phi:.2f} "
          f"(VTIP-measured); equity keeps JST forward-block sequencing.")
    print("=" * 100)
    for label, ph, seed in [(f"realistic XSTH (phi={phi:.2f}, VR(2y)~{1 + phi:.2f})", phi, 7),
                            ("idealized VR=1 (phi=0, = menu cell b)", 0.0, 7)]:
        series = ar1(seed) if ph == phi else (
            tips_m + tips_v * np.random.default_rng(seed).standard_normal(n))
        # Both legs share the same block indices (the default historical-block sampler).
        rec = recommend_glide_path(**base_kwargs(
            args, return_mode="historical-block", dataset="pooled", block_years=args.block_years,
            history=make_hist(series, label)))
        print(summary_row(label, rec))


def run_tips_stress(args):
    """Stress the short-TIPS cell: which of its generous assumptions carries the 100% -> ~50% drop?

    Menu cell (b) gives the real asset three favourable properties at once: zero equity
    correlation, no persistence (VR=1) and the long-bond forward mean, while keeping the long-bond
    volatility (an unfavourable choice for a short fund). Each row changes one of them, then the
    last row combines the unfavourable settings. The leg is a standardized AR(1) mixed with the
    (rescaled) equity series to hit the target correlation, then affine-mapped to the exact target
    mean/vol, and block-sampled jointly with equity so the correlation and persistence survive.
    """
    eq_m, eq_v, bd_m, bd_v = forward_anchors(PWL_CURVE, 2.1, True)
    hist = J.rescale_to_targets(
        J.load_pooled_country_returns(),
        equity_mean=eq_m, equity_vol=eq_v,
        fixed_income_mean=bd_m, fixed_income_vol=bd_v,
        label_suffix="forward-CMA rescaled",
    )
    n = hist.observations
    seg = hist.segment_ids if hist.segment_ids is not None else np.zeros(n, dtype=int)
    z_eq = (hist.equity - hist.equity.mean()) / hist.equity.std()

    def leg(mean, vol, phi, corr, seed=7):
        rng = np.random.default_rng(seed)
        ar = np.empty(n)
        prev, x = None, 0.0
        for i in range(n):
            if seg[i] != prev:
                x, prev = rng.standard_normal(), seg[i]
            else:
                x = phi * x + rng.standard_normal() * np.sqrt(1 - phi * phi)
            ar[i] = x
        mixed = corr * z_eq + np.sqrt(1 - corr * corr) * ar
        return J._affine_to_target(mixed, mean, vol)

    pct = lambda x: x * 100.0  # noqa: E731
    rows = [
        ("b) menu cell: corr 0, phi 0, bond mean/vol", bd_m, bd_v, 0.0, 0.0),
        ("corr 0.29 (nominal bonds' historical)", bd_m, bd_v, 0.0, 0.29),
        ("corr 0.48 (iid curve-implied)", bd_m, bd_v, 0.0, 0.48),
        ("phi 0.30", bd_m, bd_v, 0.30, 0.0),
        ("phi 0.50", bd_m, bd_v, 0.50, 0.0),
        ("mean 1.00% real (no term premium)", 0.010, bd_v, 0.0, 0.0),
        ("vol 3.0% (short-fund amplitude)", bd_m, 0.030, 0.0, 0.0),
        ("phi 0.80 (real-rate cycle, near random-walk real yield)", bd_m, bd_v, 0.80, 0.0),
        ("combined: 1.00% / 3.0% / phi 0.30 / corr 0.29", 0.010, 0.030, 0.30, 0.29),
        ("harsh: 1.00% / 5.27% / phi 0.50 / corr 0.48", 0.010, bd_v, 0.50, 0.48),
    ]
    print("\n" + "=" * 100)
    print("SHORT-TIPS STRESS  (equity keeps forward-block sequencing; real leg varied one knob at a time)")
    print(f"  base leg: {pct(bd_m):.2f}% real / {pct(bd_v):.2f}% vol, iid, zero equity correlation")
    print("=" * 100)
    for label, mean, vol, phi, corr in rows:
        series = leg(mean, vol, phi, corr)
        realized_corr = float(np.corrcoef(hist.equity, series)[0, 1])
        vr2 = J.variance_ratio(series, 2, hist.segment_ids)
        history = J.ReturnHistory(years=hist.years, equity=hist.equity, fixed_income=series,
                                  label=label, country_count=hist.country_count,
                                  segment_ids=hist.segment_ids)
        rec = recommend_glide_path(**base_kwargs(
            args, return_mode="historical-block", dataset="pooled", block_years=args.block_years,
            history=history))
        print(summary_row(f"{label} [corr {realized_corr:.2f}, VR2 {vr2:.2f}]", rec))


def _regret_regimes(args):
    return [
        ("full 1871-2020", dict(return_mode="forward-block", dataset="pooled")),
        ("post-1950", dict(return_mode="forward-block", dataset="pooled",
                            exclude_years=[(1871, 1949)])),
        ("ex Germany+Japan", dict(return_mode="forward-block", dataset="pooled",
                                   exclude_countries=DISASTER_COUNTRIES)),
        ("stable six", dict(return_mode="forward-block", dataset="pooled",
                            exclude_countries=None)),
        ("1990-2020", dict(return_mode="forward-block", dataset="pooled",
                            exclude_years=[(1871, 1989)])),
        ("iid-mc", dict(return_mode="iid-mc", dataset="pooled")),
    ]


def run_regret(args):
    """Compare constant-weight CE regret across historical cuts and the iid regime."""
    from analysis.shared.jst_history import load_jst_frame

    all_countries = [c for c in load_jst_frame()["country"].dropna().unique()]
    not_stable = [c for c in all_countries if c not in STABLE_SIX]
    regimes = _regret_regimes(args)
    regimes[3] = ("stable six", dict(return_mode="forward-block", dataset="pooled",
                                      exclude_countries=not_stable))
    weights = [40, 50, 60, 70, 80, 90, 100]
    recs = {}
    for label, overrides in regimes:
        recs[label] = recommend_glide_path(
            **base_kwargs(args, flexibility=0.0, return_flat_curve=True, **overrides)
        )

    print("\n" + "=" * 100)
    print("CE REGRET — constant-$ lifecycle, forward-block pooled cuts + iid-mc")
    print("  regret = regime best constant CE minus CE at the listed constant weight; lower is better")
    print("=" * 100)
    print(f"  {'regime':<22} " + " ".join(f"{w:>7}%" for w in weights) + "   best")
    regrets = {}
    for label, _ in regimes:
        by_weight = {round(p["equity_pct"]): p["ce_income"] for p in recs[label]["flat_curve"]}
        best_weight, best_ce = max(by_weight.items(), key=lambda item: item[1])
        regrets[label] = {w: best_ce - by_weight[w] for w in weights}
        cells = " ".join(f"{regrets[label][w]:>6.0f}" for w in weights)
        print(f"  {label:<22} {cells}   {best_weight:>3.0f}% (${best_ce:,.0f})")

    forward_labels = [label for label, overrides in regimes if overrides["return_mode"] == "forward-block"]
    for title, labels in (("max forward-block cut", forward_labels), ("max all six regimes", list(recs))):
        maxima = {w: max(regrets[label][w] for label in labels) for w in weights}
        minimax = min(maxima, key=maxima.get)
        print(f"\n  {title}: " + " ".join(
            f"{w:>3}%{('*' if w == minimax else '')} {maxima[w]:>5.0f}" for w in weights
        ) + f"  (* minimax={minimax}%)")

    iid_path = np.asarray(recs["iid-mc"]["equity_by_year"], dtype=float)
    print("\n  iid-mc recommended glide scored in each regime (regime best constant CE - path CE)")
    print(f"  {'regime':<22} {'path CE':>10} {'regret':>10}")
    for label, overrides in regimes:
        eval_kwargs = base_kwargs(
            args,
            flexibility=0.0,
            n_paths=max(args.paths, 40_000),
            **overrides,
        )
        score = evaluate_path(iid_path, **eval_kwargs)
        best_ce = max(p["ce_income"] for p in recs[label]["flat_curve"])
        print(f"  {label:<22} ${score['ce_income']:>9,.0f} ${best_ce - score['ce_income']:>9,.0f}")


def _funding_kwargs(args, **overrides):
    """Funding section's default 30y+30y household scenario."""
    defaults = dict(
        accum_years=30,
        retire_years=30,
        current_savings=200_000.0,
        annual_contribution=20_000.0,
        guaranteed_income=20_000.0,
        target_income=60_000.0,
        return_mode="iid-mc",
        dataset="pooled",
    )
    defaults.update(overrides)
    return base_kwargs(args, **defaults)


def run_funding(args):
    """Funding-ratio and matched-spending comparisons under iid-mc."""
    pairs = [(300_000, 30_000), (200_000, 20_000), (150_000, 15_000),
             (120_000, 12_000), (100_000, 10_000)]
    print("\n" + "=" * 100)
    print("FUNDING AND SPENDING FLEXIBILITY (iid-mc; default 30y accumulation + 30y retirement household)")
    print("=" * 100)
    print("\n  Funding-ratio sweep (flex=0)")
    print(f"  {'savings':>9} {'contrib':>9} {'funding':>8} {'tent':>7} {'best const':>11} {'CE':>10} {'full depl':>10}")
    for savings, contrib in pairs:
        rec = recommend_glide_path(**_funding_kwargs(
            args, flexibility=0.0, current_savings=savings, annual_contribution=contrib
        ))
        print(f"  ${savings:>8,.0f} ${contrib:>8,.0f} {rec['funding_ratio'] * 100:>7.1f}% "
              f"{rec['tent_pct']:>6.1f}% {rec['flat_equity_pct']:>10.1f}% ${rec['ce_income']:>9,.0f} "
              f"{rec['depletion'] * 100:>9.1f}%")

    constant = recommend_glide_path(**_funding_kwargs(args, flexibility=0.0, withdrawal_rate=0.04))
    flex4 = recommend_glide_path(**_funding_kwargs(args, flexibility=1.0, withdrawal_rate=0.04))
    gap = constant["initial_target_draw"]
    matched_wr = 0.04
    matched = None
    for _ in range(2):
        matched = recommend_glide_path(**_funding_kwargs(
            args, flexibility=1.0, withdrawal_rate=matched_wr
        ))
        matched_wr = gap / matched["expected_retirement_balance"]
    matched = recommend_glide_path(**_funding_kwargs(
        args, flexibility=1.0, withdrawal_rate=matched_wr
    ))
    semi = recommend_glide_path(**_funding_kwargs(
        args, flexibility=0.5, withdrawal_rate=matched_wr
    ))
    print("\n  Matched-spending flexibility")
    print(f"  {'rule':<32} {'wr':>7} {'initial draw':>14} {'CE':>10} {'full depl':>10}")
    for label, rec, wr in (
        ("constant-$ default", constant, 0.04),
        ("flex=1 at 4%", flex4, 0.04),
        ("flex=1 matched to constant gap", matched, matched_wr),
        ("semi-flex=0.5 at matched wr", semi, matched_wr),
    ):
        print(f"  {label:<32} {wr * 100:>6.2f}% ${rec['initial_target_draw']:>13,.0f} "
              f"${rec['ce_income']:>9,.0f} {rec['depletion'] * 100:>9.1f}%")

    constant_sweep = []
    for target in (50_000, 55_000, 60_000, 62_500, 65_000, 70_000):
        rec = recommend_glide_path(**_funding_kwargs(args, flexibility=0.0, target_income=target))
        constant_sweep.append((rec["ce_income"], target, rec))
    flex_sweep = []
    for wr_pct in (2, 3, 4, 5, 5.5, 6, 7):
        rec = recommend_glide_path(**_funding_kwargs(args, flexibility=1.0, withdrawal_rate=wr_pct / 100))
        flex_sweep.append((rec["ce_income"], wr_pct, rec))
    best_constant = max(constant_sweep, key=lambda item: item[0])
    best_flex = max(flex_sweep, key=lambda item: item[0])
    print("\n  Each rule at its own best spending level")
    print(f"  constant-$ target sweep: best target ${best_constant[1]:,.0f}, CE ${best_constant[0]:,.0f}")
    print(f"  flex=1 withdrawal sweep: best wr {best_flex[1]:g}%, CE ${best_flex[0]:,.0f}")


SECTIONS = {
    "matrix": run_matrix,
    "blocks": run_block_sweep,
    "channels": run_channels,
    "menu": run_menu,
    "bills-block": run_bills_block,
    "tips-etf": run_tips_etf,
    "gamma": run_gamma_sweep,
    "curves": run_flat_curves,
    "vr": run_variance_ratios,
    "bond-decomp": run_bond_decomposition,
    "regret": run_regret,
    "funding": run_funding,
    "tips-stress": run_tips_stress,
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
    ap.add_argument("--bills-mean", type=float, default=0.75,
                    help="bills-block: real bill mean return %% (default 0.75)")
    ap.add_argument("--bills-vol", type=float, default=2.0,
                    help="bills-block: real bill vol %% (default 2.0)")
    ap.add_argument("--tips-mean", type=float, default=None,
                    help="tips-etf: real arithmetic mean %% (default: forward bond anchor, = menu cell b)")
    ap.add_argument("--tips-vol", type=float, default=None,
                    help="tips-etf: real vol %% (default: forward bond anchor, = menu cell b)")
    ap.add_argument("--tips-phi", type=float, default=0.13,
                    help="tips-etf: annual AR(1) phi (default 0.13, VTIP-measured)")
    ap.add_argument("--paths", type=int, default=6_000)
    ap.add_argument("--passes", type=int, default=10)
    ap.add_argument("--quick", action="store_true",
                    help="lower fidelity (fewer paths/passes, 10y steps) for a fast look")
    args = ap.parse_args(argv)

    if args.quick:
        args.paths = min(args.paths, 1_500)
        args.passes = min(args.passes, 4)
        args.interval = max(args.interval, 10)

    for name in args.sections:
        SECTIONS[name](args)
    print()


if __name__ == "__main__":
    main()
