#!/usr/bin/env python3
"""Shared JST Macrohistory loading and bootstrap helpers.

Historical glide-path modes use paired real stock and long-bond returns from an
equal-weight world aggregate or a per-country pool. The source workbook is downloaded
on first use and cached under the gitignored ``analysis/.data/`` directory.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
import urllib.request

import numpy as np
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".data")
DATA_FILE = os.path.join(DATA_DIR, "JSTdatasetR6.xlsx")
DATA_URL = "https://www.macrohistory.net/app/download/9834512569/JSTdatasetR6.xlsx"


@dataclass(frozen=True)
class ReturnHistory:
    """Paired annual real stock and bond returns.

    ``segment_ids`` labels each observation with the contiguous run it belongs to.
    A single-country or equal-weight-world series is one contiguous circular series
    (``segment_ids is None``). A pooled multi-country series concatenates several
    countries end to end; ``segment_ids`` then marks each maximal run of consecutive
    calendar years for one country so the block bootstrap never bridges a country
    boundary or a within-country gap.
    """

    years: np.ndarray
    equity: np.ndarray
    fixed_income: np.ndarray
    label: str
    country_count: int
    segment_ids: np.ndarray | None = None

    @property
    def observations(self) -> int:
        return int(len(self.years))

    @property
    def start_year(self) -> int:
        # min/max (not first/last) so pooled series, whose years are not globally
        # monotonic, still report a meaningful calendar span.
        return int(self.years.min())

    @property
    def end_year(self) -> int:
        return int(self.years.max())


def ensure_data(path: str = DATA_FILE) -> str:
    """Return the JST workbook path, downloading the default cache on first use."""
    if os.path.exists(path):
        return path
    if path != DATA_FILE:
        raise FileNotFoundError(path)

    os.makedirs(DATA_DIR, exist_ok=True)
    print(f"Downloading JST dataset -> {DATA_FILE} ...")
    req = urllib.request.Request(DATA_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as response, open(DATA_FILE, "wb") as output:
        output.write(response.read())
    return DATA_FILE


def load_jst_frame(path: str | None = None) -> pd.DataFrame:
    """Load the JST R6 workbook."""
    return pd.read_excel(ensure_data(path or DATA_FILE), sheet_name=0)


def real_stock_fixed_income_returns(sub: pd.DataFrame) -> pd.DataFrame:
    """Convert one country's nominal stock and long-bond returns to real returns."""
    sub = sub.sort_values("year").copy()
    # Calculate annual CPI changes on the calendar series before filtering returns. This
    # preserves the first valid return and avoids treating gaps as one-year inflation.
    sub["inflation"] = sub["cpi"].pct_change(fill_method=None)
    sub["equity"] = (1 + sub["eq_tr"]) / (1 + sub["inflation"]) - 1
    sub["fixed_income"] = (1 + sub["bond_tr"]) / (1 + sub["inflation"]) - 1
    columns = ["year", "equity", "fixed_income"]
    return sub.dropna(subset=["inflation", "equity", "fixed_income"])[columns]


def real_bill_returns(sub: pd.DataFrame) -> pd.DataFrame:
    """Convert one country's short-term bill rate to a real total return.

    Bills carry ~no price risk, so the nominal yield earned over the year *is* the
    nominal total return; ``real = (1 + bill_rate) / (1 + inflation) - 1``. Used to
    profile an *empirical* short-asset alternative to long bonds (see the ``vr``
    section of ``research_history``). These are *nominal* bills — the real return
    still inherits the full inflation-surprise term, which is the point.
    """
    sub = sub.sort_values("year").copy()
    sub["inflation"] = sub["cpi"].pct_change(fill_method=None)
    sub["bills"] = (1 + sub["bill_rate"]) / (1 + sub["inflation"]) - 1
    columns = ["year", "bills"]
    return sub.dropna(subset=["inflation", "bills"])[columns]


BOND_COMPONENTS = ("carry", "price", "inflation")


def real_bond_components(sub: pd.DataFrame) -> pd.DataFrame:
    """Split one country's real long-bond return into carry, price and inflation terms.

    With nominal total return ``n = carry + price`` and CPI inflation ``i``, the real return
    is exactly ``(1 + n) / (1 + i) - 1 = (carry + price - i) / (1 + i)``, so the three
    columns ``carry / (1 + i)``, ``price / (1 + i)`` and ``-i / (1 + i)`` sum to
    ``fixed_income``. ``carry`` is the prior year's long yield (``bond_rate``; JST records
    annual averages, so this proxies the start-of-year yield) and falls back to the same
    year's yield when the prior year is missing; in the few years with a return but no yield
    at all (Belgium 1913, Germany 1922–23, Finland 1939–47, mostly flat coupon prints) the
    whole nominal return is treated as carry. ``price`` is the remainder of the nominal
    return: duration times the yield change plus roll-down and timing noise — the
    interest-rate-cycle channel. Rows match :func:`real_stock_fixed_income_returns`.
    """
    sub = sub.sort_values("year").copy()
    sub["inflation_rate"] = sub["cpi"].pct_change(fill_method=None)
    prior = sub["bond_rate"].shift(1).where(sub["year"].diff() == 1)
    yield_start = prior.fillna(sub["bond_rate"]).fillna(sub["bond_tr"])
    deflator = 1 + sub["inflation_rate"]
    sub["equity"] = (1 + sub["eq_tr"]) / deflator - 1
    sub["fixed_income"] = (1 + sub["bond_tr"]) / deflator - 1
    sub["carry"] = yield_start / deflator
    sub["price"] = (sub["bond_tr"] - yield_start) / deflator
    sub["inflation"] = -sub["inflation_rate"] / deflator
    rows = sub.dropna(subset=["inflation_rate", "equity", "fixed_income", "carry"])
    return rows[["year", "fixed_income", *BOND_COMPONENTS]]


def _as_history(frame: pd.DataFrame, label: str, country_count: int) -> ReturnHistory:
    frame = frame.sort_values("year").dropna(subset=["equity", "fixed_income"])
    if frame.empty:
        raise ValueError(f"no paired stock/bond returns available for {label}")
    return ReturnHistory(
        years=frame["year"].to_numpy(dtype=int),
        equity=frame["equity"].to_numpy(dtype=float),
        fixed_income=frame["fixed_income"].to_numpy(dtype=float),
        label=label,
        country_count=country_count,
    )


def load_country_returns(country: str, path: str | None = None) -> ReturnHistory:
    """Load paired real stock/bond returns for one JST country."""
    frame = load_jst_frame(path)
    returns = real_stock_fixed_income_returns(frame[frame["country"] == country])
    return _as_history(returns, country, 1)


def load_world_returns(path: str | None = None) -> ReturnHistory:
    """Build equal-weight world real stock/bond returns."""
    frame = load_jst_frame(path)
    country_frames = []
    for country in frame["country"].dropna().unique():
        returns = real_stock_fixed_income_returns(frame[frame["country"] == country]).copy()
        if not returns.empty:
            returns["country"] = country
            country_frames.append(returns)
    if not country_frames:
        raise ValueError("no paired stock/bond returns available in JST dataset")

    panel = pd.concat(country_frames, ignore_index=True)
    world = panel.groupby("year", as_index=False)[["equity", "fixed_income"]].mean()
    label = "JST R6 equal-weight world"
    return _as_history(world, label, len(country_frames))


def _normalize_year_windows(exclude_years) -> list[tuple[int, int]]:
    """Coerce ``exclude_years`` into a list of inclusive ``(lo, hi)`` windows.

    Accepts an iterable mixing scalar years (``1923``) and ``(lo, hi)`` pairs
    (``(1914, 1923)``); a bare scalar drops that single year.
    """
    if not exclude_years:
        return []
    windows = []
    for item in exclude_years:
        if isinstance(item, (tuple, list)):
            lo, hi = int(item[0]), int(item[1])
        else:
            lo = hi = int(item)
        windows.append((min(lo, hi), max(lo, hi)))
    return windows


def _assign_segments(countries: np.ndarray, years: np.ndarray) -> np.ndarray:
    """Label each row with a segment id, breaking on country change or a year gap.

    A segment is a maximal run of consecutive calendar years for one country, so a
    sampled block can never bridge two countries or a discontinuity (a natural data
    gap or an excluded window).
    """
    countries = np.asarray(countries)
    years = np.asarray(years, dtype=int)
    n = len(years)
    segments = np.zeros(n, dtype=int)
    for i in range(1, n):
        breaks = countries[i] != countries[i - 1] or years[i] != years[i - 1] + 1
        segments[i] = segments[i - 1] + (1 if breaks else 0)
    return segments


def _segment_bounds(
    segment_ids: np.ndarray | None, observations: int
) -> tuple[np.ndarray, np.ndarray]:
    """Per-observation segment start index and length.

    With ``segment_ids is None`` the whole series is one segment, so the block
    sampler's circular continuation reduces to ``(idx + 1) % observations`` —
    bit-for-bit the pre-segment behavior.
    """
    if segment_ids is None:
        return (
            np.zeros(observations, dtype=int),
            np.full(observations, observations, dtype=int),
        )
    segment_ids = np.asarray(segment_ids)
    n = len(segment_ids)
    change = np.flatnonzero(np.diff(segment_ids) != 0) + 1
    starts = np.concatenate(([0], change))
    ends = np.concatenate((change, [n]))
    seg_start = np.empty(n, dtype=int)
    seg_len = np.empty(n, dtype=int)
    for start, end in zip(starts, ends):
        seg_start[start:end] = start
        seg_len[start:end] = end - start
    return seg_start, seg_len


def _split_segments(values: np.ndarray, segment_ids: np.ndarray | None) -> list[np.ndarray]:
    """Split a per-observation array into its contiguous segment runs."""
    values = np.asarray(values)
    if segment_ids is None:
        return [values]
    segment_ids = np.asarray(segment_ids)
    change = np.flatnonzero(np.diff(segment_ids) != 0) + 1
    return np.split(values, change)


def load_pooled_country_returns(
    path: str | None = None,
    *,
    countries: list[str] | None = None,
    exclude_countries: list[str] | None = None,
    exclude_years=None,
) -> ReturnHistory:
    """Concatenate per-country real return series end to end (not cross-sectionally).

    Unlike :func:`load_world_returns`, which averages countries within each calendar
    year into one annually-rebalanced world portfolio, this pools each country's own
    sequence: a block then samples consecutive years of a *single* country, matching
    the sequence risk a real single-country investor lived through. ``segment_ids``
    keeps blocks from bridging countries or gaps.

    ``countries`` restricts to a whitelist; ``exclude_countries`` drops a blacklist;
    ``exclude_years`` drops inclusive ``(lo, hi)`` windows (or scalar years) from every
    country before segmentation, so a removed window splits the country in two.
    """
    frame = load_jst_frame(path)
    available = [c for c in frame["country"].dropna().unique()]
    selected = available
    if countries is not None:
        wanted = set(countries)
        selected = [c for c in available if c in wanted]
    if exclude_countries:
        dropped = set(exclude_countries)
        selected = [c for c in selected if c not in dropped]
    if not selected:
        raise ValueError("no countries selected for pooled history")

    windows = _normalize_year_windows(exclude_years)
    country_frames = []
    for country in selected:
        returns = real_stock_fixed_income_returns(frame[frame["country"] == country]).copy()
        if windows:
            years = returns["year"].to_numpy()
            drop = np.zeros(len(returns), dtype=bool)
            for lo, hi in windows:
                drop |= (years >= lo) & (years <= hi)
            returns = returns[~drop]
        if returns.empty:
            continue
        returns["country"] = country
        country_frames.append(returns)
    if not country_frames:
        raise ValueError("no paired stock/bond returns available for the pooled selection")

    # Concatenate in country order, each already year-sorted, WITHOUT a global year
    # sort (that would interleave countries and destroy the per-country sequences).
    panel = pd.concat(country_frames, ignore_index=True)
    segment_ids = _assign_segments(
        panel["country"].to_numpy(), panel["year"].to_numpy(dtype=int)
    )
    label = f"JST R6 pooled ({len(country_frames)} countries)"
    return ReturnHistory(
        years=panel["year"].to_numpy(dtype=int),
        equity=panel["equity"].to_numpy(dtype=float),
        fixed_income=panel["fixed_income"].to_numpy(dtype=float),
        label=label,
        country_count=len(country_frames),
        segment_ids=segment_ids,
    )


def load_world_bills(path: str | None = None) -> tuple[np.ndarray, None]:
    """Equal-weight world real bill returns and ``None`` segment ids (one series).

    Mirrors :func:`load_world_returns` for the empirical short-asset diagnostic: each
    calendar year's real bill return is averaged across countries. Returns
    ``(real_bills, segment_ids)`` so it plugs directly into :func:`variance_ratio`.
    """
    frame = load_jst_frame(path)
    country_frames = []
    for country in frame["country"].dropna().unique():
        bills = real_bill_returns(frame[frame["country"] == country])
        if not bills.empty:
            country_frames.append(bills)
    if not country_frames:
        raise ValueError("no real bill returns available in JST dataset")
    panel = pd.concat(country_frames, ignore_index=True)
    world = panel.groupby("year", as_index=False)["bills"].mean()
    return world["bills"].to_numpy(dtype=float), None


def load_pooled_bills(
    path: str | None = None,
    *,
    exclude_countries: list[str] | None = None,
    exclude_years=None,
) -> tuple[np.ndarray, np.ndarray]:
    """Pooled per-country real bill returns and matching ``segment_ids``.

    Mirrors :func:`load_pooled_country_returns`'s country/year selection and
    segmentation so the bill variance ratios are computed on the same observation set
    and segment boundaries as the bond series. Returns ``(real_bills, segment_ids)``.
    """
    frame = load_jst_frame(path)
    available = [c for c in frame["country"].dropna().unique()]
    selected = available
    if exclude_countries:
        dropped = set(exclude_countries)
        selected = [c for c in selected if c not in dropped]
    windows = _normalize_year_windows(exclude_years)
    country_frames = []
    for country in selected:
        bills = real_bill_returns(frame[frame["country"] == country]).copy()
        if windows:
            years = bills["year"].to_numpy()
            drop = np.zeros(len(bills), dtype=bool)
            for lo, hi in windows:
                drop |= (years >= lo) & (years <= hi)
            bills = bills[~drop]
        if bills.empty:
            continue
        bills["country"] = country
        country_frames.append(bills)
    if not country_frames:
        raise ValueError("no real bill returns available for the pooled selection")
    panel = pd.concat(country_frames, ignore_index=True)
    segment_ids = _assign_segments(
        panel["country"].to_numpy(), panel["year"].to_numpy(dtype=int)
    )
    return panel["bills"].to_numpy(dtype=float), segment_ids


def real_bill_components(sub: pd.DataFrame) -> pd.DataFrame:
    """Split one country's real bill return into ``rate`` and ``inflation`` terms.

    ``real = (bill_rate - i) / (1 + i)``, so ``rate = bill_rate / (1 + i)`` and
    ``inflation = -i / (1 + i)`` sum to ``bills``. Rows match :func:`real_bill_returns`.
    """
    sub = sub.sort_values("year").copy()
    sub["inflation_rate"] = sub["cpi"].pct_change(fill_method=None)
    deflator = 1 + sub["inflation_rate"]
    sub["bills"] = (1 + sub["bill_rate"]) / deflator - 1
    sub["rate"] = sub["bill_rate"] / deflator
    sub["inflation"] = -sub["inflation_rate"] / deflator
    return sub.dropna(subset=["inflation_rate", "bills"])[["year", "bills", "rate", "inflation"]]


def _pool_country_frames(builder, path, exclude_countries, exclude_years):
    """Apply a per-country ``builder`` with the pooled loaders' selection and segmentation."""
    frame = load_jst_frame(path)
    selected = [c for c in frame["country"].dropna().unique()]
    if exclude_countries:
        dropped = set(exclude_countries)
        selected = [c for c in selected if c not in dropped]
    windows = _normalize_year_windows(exclude_years)
    country_frames = []
    for country in selected:
        parts = builder(frame[frame["country"] == country]).copy()
        if windows:
            years = parts["year"].to_numpy()
            drop = np.zeros(len(parts), dtype=bool)
            for lo, hi in windows:
                drop |= (years >= lo) & (years <= hi)
            parts = parts[~drop]
        if parts.empty:
            continue
        parts["country"] = country
        country_frames.append(parts)
    if not country_frames:
        raise ValueError("no rows available for the pooled selection")
    panel = pd.concat(country_frames, ignore_index=True)
    segment_ids = _assign_segments(
        panel["country"].to_numpy(), panel["year"].to_numpy(dtype=int)
    )
    return panel, segment_ids


def load_pooled_bond_components(
    path: str | None = None,
    *,
    exclude_countries: list[str] | None = None,
    exclude_years=None,
) -> tuple[pd.DataFrame, np.ndarray]:
    """Pooled per-country :func:`real_bond_components` and matching ``segment_ids``.

    Uses the same selection, row set and segmentation as :func:`load_pooled_country_returns`,
    so ``fixed_income`` equals that history's bond series and the component columns sum to it.
    """
    return _pool_country_frames(real_bond_components, path, exclude_countries, exclude_years)


def load_pooled_bill_components(
    path: str | None = None,
    *,
    exclude_countries: list[str] | None = None,
    exclude_years=None,
) -> tuple[pd.DataFrame, np.ndarray]:
    """Pooled per-country :func:`real_bill_components`; rows match :func:`load_pooled_bills`."""
    return _pool_country_frames(real_bill_components, path, exclude_countries, exclude_years)


def variance_decomposition(
    total: np.ndarray,
    components: dict[str, np.ndarray],
    horizon: int,
    segment_ids: np.ndarray | None = None,
) -> dict[str, float]:
    """Each component's additive contribution to ``VR(horizon)`` of ``total``.

    For ``total = sum(components)``, the ``horizon``-sum variance splits exactly as
    ``Var(S_total) = sum_k Cov(S_total, S_k)``; dividing by ``horizon * Var(total)`` gives
    contributions that sum to :func:`variance_ratio` (arithmetic basis). Covariance
    attribution assigns shared variance through each component's co-movement with the
    total, so it is a variance accounting, not a causal split.
    """
    total = np.asarray(total, dtype=float)

    def window_sums(values):
        sums = []
        for segment in _split_segments(np.asarray(values, dtype=float), segment_ids):
            if len(segment) >= horizon:
                prefix = np.concatenate(([0.0], np.cumsum(segment)))
                sums.append(prefix[horizon:] - prefix[:-horizon])
        return np.concatenate(sums) if sums else np.array([])

    total_sums = window_sums(total)
    scale = horizon * total.var()
    if total_sums.size == 0 or scale == 0:
        return {name: float("nan") for name in components}
    centered = total_sums - total_sums.mean()
    out = {}
    for name, values in components.items():
        part = window_sums(values)
        out[name] = float(np.mean(centered * (part - part.mean())) / scale)
    return out


def _affine_to_target(values: np.ndarray, target_mean: float, target_vol: float) -> np.ndarray:
    """Affine-map a series to a target arithmetic mean and population vol.

    ``r' = target_mean + (target_vol / sd) * (r - mean)``. Being affine, this leaves
    each asset's own autocorrelation (mean-reversion structure) and the cross-asset
    contemporaneous correlation invariant while hitting the target marginal moments.
    """
    values = np.asarray(values, dtype=float)
    sd = values.std()  # population (ddof=0), matching variance_ratio's convention
    if sd == 0:
        return np.full_like(values, float(target_mean))
    return float(target_mean) + (float(target_vol) / sd) * (values - values.mean())


def rescale_to_targets(
    history: ReturnHistory,
    *,
    equity_mean: float,
    equity_vol: float,
    fixed_income_mean: float,
    fixed_income_vol: float,
    label_suffix: str = "rescaled",
) -> ReturnHistory:
    """Rescale each asset's marginal moments to forward targets, keeping the sequence.

    Isolates sequence structure from the historical return/risk level: the returned
    series has the supplied (real, decimal) means/vols but preserves the original year
    ordering, autocorrelation, cross-correlation, and ``segment_ids``. Use it to
    block-bootstrap forward-calibrated marginals — the missing cell of the
    marginals x sequencing factorial.
    """
    label = f"{history.label} ({label_suffix})"
    equity = _affine_to_target(history.equity, equity_mean, equity_vol)
    fixed_income = _affine_to_target(history.fixed_income, fixed_income_mean, fixed_income_vol)
    # An arithmetic return at or below -100% is not a valid total return; the simulation
    # engines assume r > -1 (e.g. mid-year affordability divides by 1 + r/2). The current
    # JST series rescaled to the app's CMAs stays well clear, but a future target/vol
    # combination could push a disaster year past the boundary — fail loudly here.
    for name, values in (("equity", equity), ("fixed_income", fixed_income)):
        worst = float(values.min())
        if worst <= -1.0:
            raise ValueError(
                f"rescaled {name} series contains a return of {worst:.2%} <= -100%; "
                "the requested target mean/vol over-stretch the historical left tail"
            )
    return ReturnHistory(
        years=history.years,
        equity=equity,
        fixed_income=fixed_income,
        label=label,
        country_count=history.country_count,
        segment_ids=history.segment_ids,
    )


def variance_ratio(
    returns: np.ndarray,
    horizon: int,
    segment_ids: np.ndarray | None = None,
    basis: str = "arithmetic",
) -> float:
    """Lo-MacKinlay-style variance ratio on arithmetic or log returns; <1 = mean reversion.

    ``VR(q) = Var(sum of q consecutive returns) / (q * Var(one-year return))`` using
    overlapping windows. The default arithmetic basis is affine-rescale invariant and matches
    the engine's return representation; ``basis="log"`` preserves the older log-return
    diagnostic. ``q``-sums are formed only within a segment, so the statistic never straddles a
    country boundary or a gap. Returns ``nan`` when no segment is long enough or one-year
    variance is zero. This is the simple (non-bias-corrected) ratio, intended as a diagnostic,
    not a formal test.
    """
    if horizon < 1:
        raise ValueError("horizon must be >= 1")
    if basis not in ("arithmetic", "log"):
        raise ValueError("basis must be 'arithmetic' or 'log'")
    values = np.asarray(returns, dtype=float)
    if basis == "log":
        values = np.log1p(values)
    var_one = values.var()
    if var_one == 0:
        return float("nan")
    block_sums = []
    for segment in _split_segments(values, segment_ids):
        if len(segment) >= horizon:
            prefix = np.concatenate(([0.0], np.cumsum(segment)))
            block_sums.append(prefix[horizon:] - prefix[:-horizon])
    if not block_sums:
        return float("nan")
    pooled = np.concatenate(block_sums)
    return float(pooled.var() / (horizon * var_one))


def sample_indices(
    observations: int,
    n_years: int,
    n_paths: int,
    *,
    mode: str,
    block_years: int,
    seed: int,
    segment_ids: np.ndarray | None = None,
) -> np.ndarray:
    """Sample historical row indices as iid years or stationary circular blocks.

    When ``segment_ids`` is given, a block's circular continuation wraps within its
    own segment instead of around the whole series, so consecutive years always come
    from the same country run. Restarts still land uniformly across all observations.
    """
    if observations < 1:
        raise ValueError("historical return series must contain at least one observation")
    if n_years < 1 or n_paths < 1:
        raise ValueError("n_years and n_paths must be >= 1")
    if block_years < 1:
        raise ValueError("block_years must be >= 1")
    if segment_ids is not None and len(segment_ids) != observations:
        raise ValueError("segment_ids length must equal observations")

    rng = np.random.default_rng(seed)
    if mode == "historical-iid":
        return rng.integers(0, observations, size=(n_years, n_paths))
    if mode != "historical-block":
        raise ValueError(f"unsupported historical mode: {mode}")

    # Politis-Romano stationary bootstrap: continue the current circular block
    # with probability 1 - 1/L, otherwise restart at a random observation. This
    # makes block lengths geometric with expected length L. Continuation is circular
    # within the current segment (the whole series when unsegmented).
    seg_start, seg_len = _segment_bounds(segment_ids, observations)
    indices = np.empty((n_years, n_paths), dtype=int)
    indices[0] = rng.integers(0, observations, size=n_paths)
    restart_probability = 1.0 / block_years
    for year in range(1, n_years):
        starts = rng.integers(0, observations, size=n_paths)
        restarts = rng.random(n_paths) < restart_probability
        previous = indices[year - 1]
        starts_of = seg_start[previous]
        continuations = starts_of + ((previous - starts_of + 1) % seg_len[previous])
        indices[year] = np.where(restarts, starts, continuations)
    return indices


def sample_return_paths(
    history: ReturnHistory,
    n_years: int,
    n_paths: int,
    *,
    mode: str,
    block_years: int,
    seed: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Return paired stock/bond bootstrap paths with shape ``(years, paths)``."""
    indices = sample_indices(
        history.observations,
        n_years,
        n_paths,
        mode=mode,
        block_years=block_years,
        seed=seed,
        segment_ids=history.segment_ids,
    )
    return history.equity[indices], history.fixed_income[indices]
