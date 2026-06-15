# Lifetime Allocation Optimizer — Methodology and Research

Developer/research note for the Lifetime Allocation Optimizer. Companion to the
[`retirement` SWR methodology](../retirement/swr-methodology.md). It asks: **what equity weight
should you hold at each age — before and after retirement — to maximize lifetime welfare?**

The research baseline (Sections 2a–2e) uses our forward Canadian capital-market assumptions and
plain **iid Monte Carlo**, which is also the **product default** in both the web app and the Python
recommender. **Forward-block pooled** — historical single-country return sequences affine-rescaled to
the forward-CMA marginals, then stationary-block-bootstrapped — is offered in both interfaces as the
**historical-sequencing scenario**: §2f runs the key cases under it, where the constant-$ bond tent
largely disappears and the optimum becomes flat ~100% equity. The default is iid because the §2f
robustness program showed forward-block's flat-100% answer holds only in one corner of the evidence
(full-sample monetary regimes × a long-nominal-bonds-only menu), while iid's interior recommendation
is never the worst-case answer in any era, country, or bond-menu cut — it sits inside the allocation
envelope forward-block sweeps across regimes (the minimax-regret choice; see §7.3) — and it matches
the `/retirement` tool's return model. The two modes bracket the answer; the bracket, not either
endpoint, is the finding.

The web and Python recommender share the baseline household/model defaults: flexibility 0,
γ = 4, β = 0.985, and a 4% flexible withdrawal rate. Their product
surfaces intentionally differ: the web app fixes the glide cadence at 5-year steps, uses
browser-sized path/pass caps, exposes fewer controls, and requires at least $10,000 of guaranteed
income. Python exposes the interval and historical return modes (with world/pooled dataset
choices), and accepts zero guaranteed income for research and CLI sensitivity cases.

This work is a deliberate cross-check on two backtest-based studies:

- **ACO** — Anarkulova, Cederburg, O'Doherty, _Beyond the Status Quo_ ([SSRN 4590406](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4590406)):
  a 38-country block bootstrap concludes the lifetime-utility optimum is **~100% equity, held
  flat** across the whole lifecycle (no bonds, no glide). Its constant-spending optimal profile
  (their Figure 3) is **flat ~100% through accumulation** with a shallow bills/bonds "tent"
  concentrated **right at retirement**, receding within a few years.
- **ERN** — earlyretirementnow.com [Part 20](https://earlyretirementnow.com/2017/09/20/the-ultimate-guide-to-safe-withdrawal-rates-part-20-more-thoughts-on-equity-glidepaths/):
  a US Shiller backtest finds a **rising** retirement glide (e.g. 60%→100%) adds ~0.1–0.3pp to
  the SWR, **but only when CAPE > 20**.

Simulation: [`analysis/glide_path/research.py`](../../analysis/glide_path/research.py)
(`python3 -m analysis.glide_path.research`; needs numpy + matplotlib). Figures it writes are in
gitignored `analysis/artifacts/glide_path/research/`.

## Contents

1. [Method](#1-method)
2. [Results](#2-results)
3. [Comparison with ACO and ERN](#3-does-this-validate-or-reject-aco-and-ern)
4. [Caveats](#4-caveats--what-the-iid-baseline-cannot-see)
5. [Python recommender](#5-recommender-script)
6. [Reproducing the analysis](#6-reproduce)
7. [Discussion — what we actually take away](#7-discussion--what-we-actually-take-away)

The research sweep and the product default are forward-CMA iid Monte Carlo; forward-block pooled
is the historical-sequencing scenario mode. The four supported modes in the Python recommender:

```bash
# Default: forward-CMA normal iid Monte Carlo
python3 analysis/recommend_glide.py                         # iid-mc

# Historical sequences rescaled to forward-CMA marginals, then block-bootstrapped
python3 analysis/recommend_glide.py --mode forward-block --dataset pooled

# Raw paired world stock/bond years, sampled independently with replacement
python3 analysis/recommend_glide.py --mode historical-iid

# Raw paired world stock/bond years, sampled in stationary circular blocks
python3 analysis/recommend_glide.py --mode historical-block --block-years 10
```

Historical modes use real paired stock and long-government-bond returns from the JST R6
Macrohistory workbook. `analysis/shared/jst_history.py` downloads it on first use to gitignored
`analysis/.data/`, deflates each asset by each country's CPI, and pairs the real returns by year.
`--dataset pooled` (default) concatenates each country's own sequence so a block samples
consecutive years of a single country; `--dataset world` averages countries within each
calendar year into one annually-rebalanced portfolio. Each sampled historical year keeps stock and
bond paired. Historical modes require pandas and openpyxl in addition to numpy. A custom `--curve`
and `--inflation` apply only to `iid-mc`.

The world series has no negative 20- or 30-year circular stock window, so longer average blocks can
make a 100% stock result optimal under this model — a property of bootstrapping the
already-diversified world series, not of the (stock/bond) candidate set.

---

## TL;DR

0. **The return model decides whether there's a tent at all.** Under **iid** (no recovery; the
   product default), constant-$ spending wants a **derisking bond tent** and an interior **60–80%**
   level. Under the **forward-block pooled** scenario — which restores JST's empirical sequence
   structure (equity decade-scale reversion **jointly with** bond persistence; see §2f's channel
   factorial) — the tent **largely disappears**: the optimum is **flat ~100% equity**, best-flat is
   100% in every cell, and the glide shape is worth **≈ $0** (§2f), reproducing **ACO's flat-100%**
   on our own CMAs. The §2f robustness cuts show that flat-100% answer is conditional on pre-1990
   monetary regimes and on long nominal bonds being the only safe asset, while the iid interior
   answer is never the worst case in any cut (it stays inside the envelope forward-block sweeps —
   the minimax-regret pick, §7.3) — hence iid as the default and forward-block as the scenario.

1. **The spending rule decides the shape (within either model).**
   - **Constant real-dollar withdrawal** → _under iid_ the optimum **derisks into retirement** (a **bond tent**) then drifts up; _under the forward-block scenario_ this collapses to a shallow dip near 100%.
   - **Flexible withdrawal** (income allowed to move with the market) → optimum is **flat, high equity (~100%)** essentially throughout in **both** models — exactly **ACO's** prescription.
2. **The glide _shape_ is worth very little.** Tested out-of-sample, the per-age glide beats the best single **flat** weight by only **~$300/yr (~0.5%)** under iid, and **≈ $0 under forward-block** (and ≈ $0 whenever spending is flexible). The _level_ is what matters — and which level is right depends on the return model: **60–80%** under iid constant-$, **100%** under forward-block.

3. **Why the iid tent and ACO differ — and why forward-block closes the gap.** The iid constant-$ tent
   bottoms at/just after retirement (matching ACO's location) but its accumulation path **falls** rather
   than staying flat near 100%. That gap is the **missing recovery**: iid removes the decade-scale
   sequencing history carries (our 10-year average blocks restore it up to roughly the block length,
   attenuated beyond), so derisking looks worth it. Restore the recovery (forward-block, §2f)
   or add a bequest motive / higher premium, and our path moves to **ACO's flat-high** result.

4. **Both studies are right in their own world.** ACO's flat-100% is optimal _when spending is flexible (or wealth is valued), or once realistic mean reversion is in the model_; ERN/Kitces–Pfau's rising retirement glide is the _iid, rigid-spending_ shape — and even there ERN's CAPE-conditional SWR _boost_ does not reproduce under iid.

5. **A CRRA allocation recommendation requires some guaranteed retirement income.** If guaranteed
   income is zero, even a rare depleted year drives consumption to the numerical floor and makes CE
   tail-dominated. The web app therefore requires at least $10,000 of guaranteed annual income.
   Python accepts zero for sensitivity work and can still report depletion and the two candidate
   paths, but their allocation comparison is tail-dominated.

---

## 1. Method

Real (today's) dollars throughout. The **iid baseline** (§2a–§2e) uses iid normal returns, drawn each
year — **no** serial correlation, **no** valuation signal — so anything the optimizer likes there is
robust to the absence of mean reversion, by construction. §2f instead uses
**forward-block pooled** (the scenario mode), which reintroduces the historical sequencing iid strips out; the two together
bracket the answer (no-recovery bound vs realistic mean reversion).

### Python recommender return modes

All four modes feed the same lifecycle cash flows, utility objective, coordinate-ascent optimizer,
and independent evaluation-sample comparison:

- **`iid-mc`** maps each allocation to the app's forward-CMA real mean and volatility, then draws
  independent normal returns. Used by `analysis/glide_path/research.py` for the §2–§3 research
  sweep, and the default mode of the web app and Python recommender.
- **`historical-iid`** samples raw historical years independently with replacement. Stock and the
  selected asset returns remain paired within a sampled year, but year-to-year ordering is removed.
- **`historical-block`** uses a stationary circular block bootstrap of paired asset-return years.
  Each next year continues the current historical sequence with probability `1 − 1/L` or restarts
  at a random year with probability `1/L`, so block lengths are geometric and average `L` years.
  The default `L` is 10 years, an annual approximation of the 120-month average used by ACO.
- **`forward-block`** affine-rescales each asset's historical series to the forward-CMA marginals
  (the same `w=0` and `w=1` mean/vol `iid-mc` uses), then block-bootstraps exactly like
  `historical-block`. Being affine, the rescale preserves each asset's _arithmetic-return_
  autocorrelation and the stock/bond correlation exactly; log-return statistics (e.g. the
  variance ratio) shift slightly under the ~2× vol shrink. This isolates _sequencing_ from the
  historical return/risk level — the missing cell of the marginals × sequencing factorial.

**What each mode actually does** (the distinctions that matter when reading results):

| Mode               | Preserves sequencing | Single-country sequence | Stock/bond pair kept | Uses forward PWL marginals |
| ------------------ | :------------------: | :---------------------: | :------------------: | :------------------------: |
| `iid-mc`           |       ✕ (iid)        |           n/a           | n/a (curve, no corr) |       ✓ (full curve)       |
| `historical-iid`   |       ✕ (iid)        |       pooled only       |          ✓           |     ✕ (raw historical)     |
| `historical-block` |          ✓           |       pooled only       |          ✓           |     ✕ (raw historical)     |
| `forward-block`    |          ✓           |       pooled only       |          ✓           | ✓ (`w=0` & `w=1` anchors)  |

Notes: (1) "Single-country sequence" holds only with `--dataset pooled` (the default); the
`world` dataset is the equal-weight cross-country average, whose sequence no single investor lived. (2) The
stock/bond _contemporaneous_ correlation is preserved in every historical mode because both series
are indexed by the same sampled rows; `forward-block` keeps the **historical** correlation while
matching forward marginals (intermediate-weight risk therefore comes from that historical
covariance, not the curve). (3) `forward-block` matches only the `w=0`/`w=1` anchors, not the
curve's interpolated intermediate-weight vols.

**Dataset and exclusions** (historical modes only): `--dataset pooled` (default) concatenates
each country's own sequence end to end, with segment ids that keep a block from bridging two
countries or a data/exclusion gap, so a block samples consecutive years of a single country.
`--dataset world` averages countries within each calendar year into one annually-rebalanced
portfolio.
`--exclude-countries` / `--exclude-years` (pooled only) drop disaster countries or windows.

For allocations up to 100% equity, each annual portfolio return is `w × stock + (1−w) × bonds`.
Above 100% equity, the leveraged return is `w × stock − (w−1) × real borrowing cost`, with no bond
position. The `historical-*` modes use raw
realized return levels; they do not re-center history to the forward CMAs (only `forward-block`
does). They are bootstrap backtests, not overlapping realized lifecycle windows. With the `world`
dataset, the block bootstrap resamples an already-diversified annual equal-weight-world
series; the default `pooled` dataset instead preserves single-country sequence risk. Either way these are
annual sequencing sensitivity checks, not an ACO replication (ACO bootstraps a monthly
country-level four-asset panel with 120-month average blocks, mortality-weighted horizons, and
terminal wealth in the objective — our annual 10-year blocks carry related but not identical
sequencing content).

### Returns — our own assumptions, no history

The app's allocation curve ([`presets.ts`](../../src/utils/glide-path/presets.ts) `DEFAULT_ALLOC_CURVE`, PWL Capital-based, inflation 2.1%) is interpolated so **any** equity weight `w∈[0,1]` maps to a real arithmetic `(mean, vol)`. Endpoints: **100% equity → 4.67% real / 12.6% vol**; **0% equity → 1.42% real / 5.4% vol** ⇒ an equity premium of **~3.3pp** (vs the ~5pp the US-tilted history ACO and ERN lean on — see the [`retirement` SWR methodology](../retirement/swr-methodology.md) §2). Each year's return is `mean(wₜ) + vol(wₜ)·Z`, matching `monteCarlo.ts` (arithmetic normal, mid-year cash flow earns half a year, a depleted portfolio absorbs at 0).

### Household & phases

`START_AGE=35`, `START_SAVINGS=$200k`, income `$100k`, save **20%/yr** during accumulation,
target retirement income **60%** of income, of which **$20k** is guaranteed income (CPP/OAS/DB)
paid every retirement year — so the portfolio must fund a **$40k** gap. Accumulation consumption is
allocation-invariant, so it drops out of the objective; the accumulation glide matters only through
the **wealth distribution it hands to retirement**. Retirement is a **fixed planning horizon**
(`retire_years`), which makes "horizon" a clean axis (no mortality truncation; no bequest motive —
terminal wealth carries no utility).

### Spending rules — the income-variation axis

Each retirement year the withdrawal target blends a constant and a portfolio-proportional rule by
a flexibility knob **`FLEX∈[0,1]`**:

```
targetₜ = (1−FLEX)·$40k  +  FLEX·(4%·balanceₜ)
withdrawalₜ = min(targetₜ, affordable)      consumptionₜ = $20k guaranteed + withdrawalₜ
```

- **`FLEX=0` — constant $**: insists on the full $40k every year; income is rigid until the
  portfolio is exhausted (then drops to the $20k floor). This is the SWR / `/retirement`-tool world.
- **`FLEX=0.5` — semi-flexible**: half the target floats with the portfolio.
- **`FLEX=1` — fully flexible**: spends 4% of the _current_ portfolio, so income rises and falls
  with the market and the portfolio is never mechanically depleted. This is ACO's world.

### Objective & the per-age optimizer

Maximize expected discounted **CRRA utility** of retirement consumption (γ = 4 base; β = 0.985;
bequest weight 0). The control is the **equity weight at every age** (length = accumulation +
retirement years). We optimize it by **coordinate ascent**: hold all ages fixed but one, evaluate
that age over a 10pp equity grid on a **shared** shock matrix (common random numbers), take the
best, and cycle (alternating sweep direction) until the whole vector stops moving. CRN makes each
one-dimensional search exact for the drawn markets, and **no parametric shape is imposed** — so
flat / tent / monotone shapes all compete on equal footing. Coordinate ascent converges to a
**coordinate-wise** optimum, not a guaranteed global one; the shape-neutral flat init and the
alternating sweep direction mitigate but do not eliminate the risk of a local optimum
(most plausible under leverage with tail-dominated CE).

### Zero-income states and the CRRA impossible trinity

The model assumes guaranteed income is paid **every** retirement year. With positive guaranteed
income, consumption remains positive after portfolio depletion and CRRA's `u(c)` stays finite. The
bare `_FLOOR = $1` is then only a numerical guard and does not bind in the §2 scenarios.

A pre-pension bridge, or a plan with **$0 guaranteed income for all of retirement**, breaks that
assumption. Once the portfolio depletes, consumption falls to the numerical floor. Because
`u(c)→−∞` as `c→0`, with γ≥2 even a handful of `$1` consumption-years can dominate thousands of
otherwise successful paths. CE collapses toward the floor and the optimizer can select an
implausible allocation merely to avoid those rare cells.

We tested three approaches and found an **impossible trinity**: the model cannot simultaneously
provide all three of the following:

1. **No consumption floor or assumed fallback income.**
2. **A γ-responsive welfare objective.**
3. **Possible ruin while still producing one preferred allocation.**

Raw all-path CRRA preserves (1) and (2), but a ruined year has effectively unbounded negative
utility, so it cannot produce a useful comparison when (3) occurs. Assigning a finite utility value
to a broke year restores a comparison, but that floor effectively fabricates consumption the
household does not have. Scoring CRRA only over surviving paths avoids fabricated income, but under
target spending every survivor consumes the target by construction. Survivor CE therefore equals
the target for every γ; the objective collapses to γ-independent depletion minimization and, in
testing, recommended roughly the same 120–135% leveraged allocation from γ=1 through γ=12.

The chosen scope is therefore to preserve clean, all-path, γ-responsive CRRA and not model a
pre-pension bridge. That funding-feasibility question belongs to `/retirement`. A user-entered
**$0 guaranteed income is economically a permanent bridge** and recreates the same limitation: the
product labels the CE values as tail-dominated and presents the allocation comparison as
**inconclusive** rather than treating either candidate as a reliable recommendation. Depletion
metrics remain meaningful and are still reported.

Two honesty checks accompany every result:

- **Tent vs terminal artifact.** With bequest weight 0, the optimizer drives equity toward 0 in the
  _final_ retirement years (no future to grow for). That is a planning-horizon artifact, so we
  report the **tent** = lowest equity within 15y of retirement separately from the **terminal-year**
  equity.
- **Shape value, out of sample (§2e).** We re-score the optimized path on an **independent** shock
  draw against (a) flat 100%, (b) the best single flat weight, and (c) the optimal retirement glide
  with accumulation _forced_ to 100%. If the optimized accumulation shape doesn't beat flat-100% out
  of sample, we don't believe it.
- **Product recommender fallback.** The recommender applies one extra robustness guard: after
  coordinate ascent, the best constant allocation is chosen on its **own selection draw**
  (independent of both the optimization draw and the scoring draw — an argmax on the scoring
  draw would hand the constant comparator a selection advantage over the fixed glide), and then
  both the glide and that constant are scored on the same independent evaluation draw. The
  Python CLI flags the constant allocation as the robust choice when its
  CE beats the glide's by more than 5%. The web UI biases harder toward simplicity: it
  recommends the constant allocation whenever it wins on CE income outright, or comes within 3%
  on CE income **and** within 0.5pp on drawdown shortfall **and** within 1.5pp on full-path
  shortfall (`SIMPLICITY_*` thresholds in `src/components/glide-path/Result.tsx`). The
  calibration follows §2e/§2f: CE gaps under ~3% are within the model's own uncertainty
  (measured glide edge ≤ ~0.6%, MC noise ~0.3%, era/mode brackets ~2–3%), so CE alone should
  not overturn the simpler pick; the tighter shortfall gates (2–4× the Monte Carlo standard
  error of those rates) carry the real veto so the simpler pick cannot add meaningful tail
  risk. Either way the raw optimized glide stays charted and reported.

---

## 2. Results

> **Two return models, two answers — and the difference _is_ the result.** §2a–§2e below are the
> **iid** sweep (forward-CMA normal draws, no sequencing — the **product default**): under iid,
> constant-$ spending produces a **derisking bond tent** and an interior **60–80%** optimal level.
> §2f re-runs the same scenarios under **forward-block pooled** — the historical-sequencing
> scenario mode — and the tent **largely disappears**: the optimum is **flat ~100% equity** with
> best-flat = 100% in every cell. The flip is the headline finding (§2f, §3a): the iid tent is a
> sequence-risk artifact of assuming **no recovery**, and JST's joint sequence structure restores
> the conditions that make ACO's flat-100% optimal. §2f's robustness cuts then show that flip is
> itself conditional (era, country survival, bond menu) — which is why iid is the default and
> forward-block the scenario. Read §2a–§2e as the default's baseline; read §2f for the scenario
> and its limits.

### 2a. SWR anchor (validates the engine; tests ERN under iid)

Retirement-only, constant $, 90% success — reproduces the `/retirement` tool and tests whether a
rising glide beats the best flat weight under iid.

| Horizon | Best flat (w\*) | Flat 100% | Rising 60→100 |
| ------- | --------------- | --------- | ------------- |
| 30y     | **3.66%** (50%) | 3.47%     | 3.65%         |
| 40y     | **2.99%** (65%) | 2.87%     | 3.01%         |
| 50y     | **2.61%** (70%) | 2.51%     | 2.63%         |

Matches the methodology doc (30y 3.67%, 50y 2.61%). The SWR-maximizing weight is **interior
(50–70%)**, not 100% — because the SWR is a pure left-tail metric. The rising glide ties the best
flat weight to two decimals; **it earns no SWR premium under iid**, confirming ERN's effect is a
CAPE/mean-reversion phenomenon absent from an iid world. (See `swr_anchor.png`.)

### 2b. Per-age optimal glide — retirement-horizon sweep (iid)

γ = 4, 30y accumulation. All columns are **equity %**. `tent` = lowest equity within 15y of
retirement (the retirement-date tent bottom) and the age it hits; `end` = terminal-year equity (a
no-bequest horizon artifact, not real). BEFORE/AFTER = slope of accumulation / of the retirement
approach into the tent.

| Spending      | Ret. horizon | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE  | AFTER  | CE income | Deplete |
| ------------- | ------------ | ----- | -------- | ------- | ---- | ---------- | --- | ------- | ------ | --------- | ------- |
| constant $    | 30y          | 100   | 68       | 40      | 50   | 40 (@66)   | 100 | Falling | Rising | $55,825   | 6.3%    |
| constant $    | 40y          | 100   | 78       | 50      | 60   | 50 (@69)   | 80  | Falling | Rising | $50,804   | 11.8%   |
| constant $    | 50y          | 100   | 84       | 60      | 70   | 70 (@65)   | 40  | Falling | Rising | $47,101   | 15.9%   |
| semi-flex 50% | 30y          | 100   | 98       | 90      | 90   | 70 (@76)   | 100 | Flat    | Flat   | $69,470   | 1.5%    |
| semi-flex 50% | 40y          | 100   | 94       | 80      | 80   | 70 (@69)   | 100 | Falling | Flat   | $65,340   | 4.0%    |
| semi-flex 50% | 50y          | 100   | 94       | 70      | 80   | 70 (@67)   | 50  | Falling | Flat   | $60,516   | 7.8%    |
| flexible 100% | 30y          | 100   | 99       | 90      | 90   | 80 (@69)   | 0   | Flat    | Flat   | $68,459   | 0.0%    |
| flexible 100% | 40y          | 100   | 99       | 90      | 90   | 90 (@65)   | 0   | Flat    | Flat   | $66,123   | 0.0%    |
| flexible 100% | 50y          | 100   | 99       | 90      | 90   | 90 (@65)   | 0   | Flat    | Flat   | $64,139   | 0.0%    |

**Reading it:**

- **Constant $ → derisk into a tent, then drift up.** Equity falls through accumulation to a low
  **at/just after retirement** (40–70%), then rises. Income is near-rigid; the cost shows up as
  **depletion risk** (6–16%, rising with horizon). Longer horizons keep the tent shallower (70% vs
  40%) because a longer retirement needs more growth.
- **Flexible 100% → flat ~100%.** Equity is pinned near the top for the entire working and
  retired life; depletion is **0%** (proportional spending can't deplete) and the cost is borne as
  income variation. CE income is _higher_ than constant-$ ($64–68k vs $47–56k) — the value of
  letting income move is what unlocks the equity premium. (The `end = 0` column is the no-bequest
  terminal artifact, not a recommendation.)
- **Semi-flex is intermediate**, tipping from flat toward a mild tent as the horizon lengthens.

### 2c. Per-age optimal glide — accumulation-horizon sweep (iid)

γ = 4, 30y retirement. Same columns.

| Spending      | Accum. years | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE  | AFTER  | CE income | Deplete |
| ------------- | ------------ | ----- | -------- | ------- | ---- | ---------- | --- | ------- | ------ | --------- | ------- |
| constant $    | 20y          | 100   | 88       | 80      | 70   | 70 (@55)   | 90  | Falling | Rising | $43,565   | 25.9%   |
| constant $    | 30y          | 100   | 68       | 40      | 50   | 40 (@66)   | 100 | Falling | Rising | $55,825   | 6.3%    |
| constant $    | 40y          | 70    | 55       | 50      | 50   | 30 (@76)   | 60  | Falling | Flat   | $59,407   | 1.1%    |
| semi-flex 50% | 20y          | 100   | 92       | 80      | 70   | 70 (@55)   | 100 | Falling | Rising | $53,812   | 7.3%    |
| semi-flex 50% | 30y          | 100   | 98       | 90      | 90   | 70 (@76)   | 100 | Flat    | Flat   | $69,470   | 1.5%    |
| semi-flex 50% | 40y          | 100   | 98       | 90      | 90   | 80 (@76)   | 40  | Flat    | Flat   | $86,831   | 0.3%    |
| flexible 100% | 20y          | 100   | 100      | 100     | 90   | 90 (@55)   | 0   | Flat    | Flat   | $52,027   | 0.0%    |
| flexible 100% | 30y          | 100   | 99       | 90      | 90   | 80 (@69)   | 0   | Flat    | Flat   | $68,459   | 0.0%    |
| flexible 100% | 40y          | 100   | 96       | 90      | 90   | 80 (@76)   | 0   | Flat    | Flat   | $88,785   | 0.0%    |

Longer accumulation lets a constant-$ saver derisk _earlier and deeper_ (more time for a smaller,
safer pile to still clear the floor → lower depletion: 26% → 1%). Flexible savers stay ~100%
regardless of accumulation length.

### 2d. Risk-aversion sensitivity (iid, 30y + 30y)

| Spending      | γ   | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE  | AFTER  |
| ------------- | --- | ----- | -------- | ------- | ---- | ---------- | --- | ------- | ------ |
| constant $    | 2   | 100   | 68       | 40      | 40   | 40 (@65)   | 100 | Falling | Rising |
| constant $    | 4   | 100   | 68       | 40      | 50   | 40 (@66)   | 100 | Falling | Rising |
| constant $    | 8   | 100   | 69       | 40      | 40   | 40 (@65)   | 100 | Falling | Rising |
| flexible 100% | 2   | 100   | 100      | 100     | 100  | 100 (@65)  | 0   | Flat    | Flat   |
| flexible 100% | 4   | 100   | 99       | 90      | 90   | 80 (@69)   | 0   | Flat    | Flat   |
| flexible 100% | 8   | 100   | 82       | 60      | 60   | 50 (@68)   | 0   | Falling | Flat   |

The **constant-$ tent is invariant across risk aversion** (the sequence-risk dip is structural —
driven by the spending rule, not by taste). For flexible spending, only at γ = 8 does
consumption-volatility aversion pull the saver off the 100% corner.

### 2e. Shape value — is the glide actually worth anything? (iid, out-of-sample)

Re-scored on an **independent** shock draw. CE = certainty-equivalent annual retirement
consumption. `opt ret / 100 acc` keeps the optimal retirement glide but forces flat 100% in
accumulation; `best flat` is the single constant weight that maximizes CE on the same independent
draw.

| Spending      | Ret. horizon | optimum | opt ret / 100% acc | flat 100% | best flat (w\*) | **glide vs best-flat** |
| ------------- | ------------ | ------- | ------------------ | --------- | --------------- | ---------------------- |
| constant $    | 30y          | $55,933 | $54,265            | $53,894   | $55,626 (60%)   | **+$307**              |
| constant $    | 40y          | $50,905 | $49,954            | $49,671   | $50,610 (70%)   | **+$295**              |
| constant $    | 50y          | $47,144 | $46,667            | $46,488   | $46,839 (80%)   | **+$305**              |
| semi-flex 50% | 30y          | $69,360 | $69,318            | $69,258   | $69,258 (100%)  | +$102                  |
| semi-flex 50% | 40y          | $65,273 | $65,044            | $64,791   | $64,941 (90%)   | +$332                  |
| semi-flex 50% | 50y          | $60,514 | $60,234            | $59,981   | $60,192 (90%)   | +$322                  |
| flexible 100% | 30y          | $68,405 | $68,385            | $68,279   | $68,279 (100%)  | +$126                  |
| flexible 100% | 40y          | $66,040 | $66,033            | $65,965   | $65,965 (100%)  | +$75                   |
| flexible 100% | 50y          | $64,039 | $64,042            | $64,019   | $64,019 (100%)  | ≈$0                    |

Two readings, both important:

- **The glide _shape_ is a rounding effect.** Over the best single flat weight it is worth
  **≤ ~$330/yr (~0.5%)**, and essentially nothing once spending is flexible. This is Estrada's
  "glidepath illusion."
- **The _level_ is not.** For constant-$, the optimum beats **flat 100%** by **$656–$2,039/yr**, and
  the optimal-retirement-glide-with-100%-accumulation is _worse_ than a flat 60% — i.e. **holding
  100% equity in accumulation is genuinely dominated** for a rigid-spending, no-bequest retiree. For
  flexible spending the best flat weight _is_ 100%, so there is nothing to gain anywhere.

### 2f. The forward-block pooled scenario — the tent largely disappears

Both interfaces offer **forward-block pooled** as the historical-sequencing scenario mode. Re-running
the §2b–§2e scenarios under that engine (JST single-country sequences affine-rescaled to the forward
CMAs, then stationary-block-bootstrapped; per-age glide; γ = 4) changes the constant-$ answer
qualitatively. The
decade-scale equity mean reversion forward-block preserves (VR(10y)≈0.91 — see §4; blocks averaging
10 years carry autocovariance up to roughly that horizon, attenuated beyond it) lets a high-equity
path recover in time, so the iid derisking incentive mostly evaporates.

**Retirement-horizon sweep (acc = 30y).** Compare directly to §2b.

| Spending      | Ret. horizon | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE | AFTER   | CE income | Deplete |
| ------------- | ------------ | ----- | -------- | ------- | ---- | ---------- | --- | ------ | ------- | --------- | ------- |
| constant $    | 30y          | 100   | 98       | 95      | 85   | 70 (@67)   | 100 | Flat   | Rising  | $54,881   | 5.4%    |
| constant $    | 40y          | 100   | 99       | 100     | 95   | 90 (@69)   | 45  | Flat   | Falling | $51,224   | 9.1%    |
| constant $    | 50y          | 100   | 99       | 100     | 95   | 95 (@65)   | 100 | Flat   | Flat    | $48,364   | 12.1%   |
| semi-flex 50% | 30y          | 100   | 100      | 100     | 100  | 100 (@65)  | 100 | Flat   | Flat    | $70,682   | 1.3%    |
| flexible 100% | 30y          | 100   | 100      | 100     | 100  | 100 (@65)  | 0   | Flat   | Falling | $70,747   | 0.0%    |

**Shape value, out-of-sample (compare §2e).** The recommender's own independent-evaluation CE for the
optimized glide vs the best single constant weight:

| Spending   | Ret. horizon | optimum | best flat (w\*) | **glide vs best-flat** |
| ---------- | ------------ | ------- | --------------- | ---------------------- |
| constant $ | 30y          | $54,881 | $54,878 (100%)  | **+$3**                |
| constant $ | 40y          | $51,224 | $51,288 (100%)  | **−$64**               |
| constant $ | 50y          | $48,364 | $48,388 (100%)  | **−$24**               |
| semi-flex  | 30y          | $70,682 | $70,682 (100%)  | $0                     |
| flexible   | 30y          | $70,747 | $70,747 (100%)  | $0                     |

Differences of this size (±tens of $/yr on a ~$50k CE) are within Monte Carlo sampling error —
read them as "≈ $0", not as the flat weight genuinely beating the glide. (Both tables re-verified
to the dollar under the current engine — including the flat-comparator selection draw and the
income-shortfall depletion definition.)

**What changed from iid:**

- **The constant-$ accumulation path goes flat ~100%**, not falling-to-68. Equity at retirement is
  **85–95%** (iid: 50–70%), and the residual "tent" bottoms at **70–95%** (iid: 40–70%) — a shallow dip,
  not a bond tent.
- **Best-flat is 100% in every cell** (iid constant-$: 60–80%), and the **glide is worth ≈ $0** over it
  (−$64 to +$3). The §2e "level matters — hold 60–80%, not 100%" conclusion is **specific to iid**; under
  forward-block, **flat 100% wins** and the glide shape adds nothing measurable.
- **CE income is essentially unchanged** ($54.9k vs iid $55.8k at 30y) — the sequence model barely moves
  the achievable welfare; it moves the _allocation that achieves it_.

This is ACO's flat-~100% accumulation, reproduced on our own CMAs once historical sequencing is restored
(§3a). The cost of the higher equity now shows up almost entirely as **depletion risk** (5–12% for
constant-$, rising with horizon), which is the honest residual the recommender still reports. The mode
factorial in [`research_history.py`](../../analysis/glide_path/research_history.py) confirms the lever is
**pooled single-country sequencing**, not the marginals: `forward-block (pooled)` lands the same
high-equity optimum as `forward-block (world)`, while the raw-history `historical-block` modes (lower
premium) sit lower.

**Robustness: block length.** The flip does not hinge on the L = 10 default. Re-running the
constant-$ 30y+30y lifecycle (5y steps) across average block lengths:

| Avg block | best flat | acc. avg | tent |
| --------- | --------- | -------- | ---- |
| 1y        | **65%**   | 72       | 55   |
| 5y        | 100%      | 93       | 80   |
| 10y       | 100%      | 99       | 85   |
| 20y       | 100%      | 99       | 85   |
| 40y       | 100%      | 97       | 75   |

Best-flat is 100% for every L ≥ 5; only L = 1 — which destroys sequencing and reduces to an
iid resample of history — reverts to the interior-weight tent. The transition sits between 1y
and 5y blocks.

**Robustness: which channel flips it.** A factorial ladder on the same scenario isolates what
forward-block adds over iid (each cell = best flat weight): iid normal draws **60%**; adding the
historical stock/bond correlation (+0.29) to iid normals **55%**; the rescaled history's
non-normal marginal shapes sampled iid **70%**; block-sampling **equity only** (bonds shuffled)
**50%**; block-sampling **bonds only** (equity shuffled) **65%**; the full joint sequence
structure (the full forward-block engine) **100%**. No single channel — correlation, fat tails, equity
mean reversion alone, or bond persistence alone — produces the flat-100% answer; it emerges
only from the **joint** sequence structure, where bond persistence (VR(10y)≈1.7) makes long
bond holdings risky at the same time as equity's decade-scale reversion (VR(10y)≈0.91) makes
high equity recoverable. (Equity blocks alone actually _deepen_ the tent: history's short-run
momentum, VR(2y)≈1.1, raises near-horizon equity risk while iid-shuffled bonds stay safe.
The one-asset cells necessarily drop the cross-correlation, which the corr-only cell shows is
immaterial.) Reproduce both:
`python3 -m analysis.glide_path.research_history --sections blocks channels --accum 30 --retire 30 --savings 200000 --contrib 20000 --interval 5 --paths 8000`.

**Robustness: era and country cuts.** Same scenario with the history restricted before rescaling
(the forward anchors are unchanged, so only the sequencing pattern differs):

| History cut                         | bond VR(10y) | bill VR(10y) | equity VR(10y) | best flat | CE at best vs 100% |
| ----------------------------------- | ------------ | ------------ | -------------- | --------- | ------------------ |
| full 1871–2020                      | 1.70         | 2.44         | 0.91           | **100%**  | —                  |
| post-1950                           | 2.27         | 4.89         | 0.95           | **100%**  | —                  |
| ex Germany + Japan                  | 2.74         | 3.55         | 1.01           | **100%**  | —                  |
| stable six¹                         | 1.96         | 3.23         | 0.73           | 80%       | +0.5%              |
| 1990–2020 (inflation-targeting era) | **0.50**     | 3.90         | 0.54           | **50%**   | +2.1%              |

¹ USA, UK, Canada, Australia, Switzerland, Sweden — no hyperinflation, occupation, or market closure.

The joint structure is **not** a Germany/Japan disaster artifact — it survives dropping them and is
_stronger_ in the stable-six cut. It **is era-dependent for bonds**: in the 1990–2020 cut, bond returns flip
from persistent to mean-reverting (VR(10y) 0.50, below the iid-null 5th percentile — largely the
secular rate decline), the stock/bond correlation drops to ≈0, and the optimizer returns the
interior bond tent. **Bills do not flip with bonds** — they stay strongly persistent in _every_ cut
(VR(10y) 2.4–4.9), and are _most_ persistent precisely where bonds mean-revert (post-1950 4.89,
1990–2020 3.90). The reason the era that fixed long bonds left bills untouched: bonds' 1990–2020
mean reversion is the one-off duration bull (a falling-rate price tailwind that bills, having no
duration, never received), while bills' persistence is the slow-adjusting nominal rate lagging
realized inflation — a low-vol disinflation just turns that into a smooth, persistently positive
real-carry drift (bill vol falls to 2.4% in that cut). **Short is not safe-from-persistence in any
era; only inflation-linked is** (§2f's bond-menu finding, now confirmed against the empirical short
asset across every era cut). Three caveats on that cut: it is a single 31-year global regime (~16
cross-correlated copies of one sample path); its bond mean reversion is substantially the
one-off duration bull; and it ends in 2020 — excluding 2021–22, the one inflation-targeting-era
episode that looked exactly like the long-sample joint structure (persistent real bond losses,
equity recovery). Note also that every cut's CE-vs-flat-weight curve is shallow: the argmax moves
between 50% and 100%, but the welfare spread across that range stays ≤ ~2% of CE — the era choice
moves the _allocation_ answer far more than the _welfare_ answer.

**Robustness: the bond menu.** The channel factorial says the flip is driven by what history does
to the _bond_ leg, which raises the question: is flat-100% about equity's merit, or about the only
modeled alternative being long nominal bonds? Replacing the bond leg with a synthetic VR=1 real
asset (iid, zero equity correlation — an idealized short-TIPS/RRB ladder) while equity keeps its
full forward-block sequencing:

| Non-equity asset                                       | best flat | CE at best | Deplete |
| ------------------------------------------------------ | --------- | ---------- | ------- |
| a) nominal bonds, joint structure (forward-block)      | **100%**  | $54.9k     | 5.3%    |
| b) synthetic real, same mean/vol (1.42%/5.4%), iid     | 45%       | $57.9k     | 3.5%    |
| c) short-TIPS _ladder_ (1.42% real, 2% vol)            | 20%       | $59.6k     | 1.7%    |
| d) **buyable real ETF proxy** (1.42% real, 5.4%, VR=1) | **45%**   | $57.9k     | 3.5%    |

Cell (b) is the decisive one: it holds the bond's mean **and** vol constant and removes only the
sequencing and correlation — and the optimum collapses from 100% to 45% while CE _rises_ ~$3k/yr.
**The flat-100% result is a verdict on long nominal bonds, not a celebration of equity.** The two
real cells then split a property the doc previously conflated. Cells (b)/(d) are **identical** — a
real (VR=1, zero-correlation) leg at the _full_ short-bond vol — and land at 45%; cell (c) keeps
the real linkage but additionally suppresses vol to 2%, and only then does the optimum reach 20%.
That 2%-vol assumption is the _ladder_ property — hold-to-maturity pull-to-par, where terminal
real wealth is locked at purchase and interim price marks don't matter — **not** a property of being
short or being inflation-linked. The 100%→45% jump is the **persistence** axis (inflation linkage);
the further 45%→20% is the **amplitude** axis (ladder vol suppression). They are separable, and a
Canadian retail investor can buy the first but not the second. (Raising the ladder's real yield from
1.42% to 2.0% pushes the idealized optimum further still, to ~10% / $60.0k — the **return** axis — but
that stacks an optimistic yield on top of the unreachable ladder vol, so it is not tabulated.)

**What's actually buyable in Canada, mapped onto these cells.** There is no retail short-real
_ladder_ product (Canada stopped issuing RRBs in 2022; existing RRBs are long-duration anyway). The
two implementable real-asset routes are:

- A **GIC / bill ladder** — an actual ladder (hold-to-maturity), but _nominal_: it fixes amplitude,
  not persistence (the "short nominal" row of the amplitude-vs-persistence table below — VR still
  bad). It does **not** move the optimum off the nominal-bond answer on the persistence axis.
- A **short-term, CAD-hedged US-TIPS ETF** (e.g. XSTH / ZTIP.F) — real and short-duration, but a
  perpetual marked-to-market _fund_, not a ladder: it carries short-bond price vol, not the ladder's
  2%. This is cell (d): it delivers the persistence fix (→45%) but **not** the ladder's amplitude
  suppression (so not 20%). Residual idealizations even at (d): it tracks _US_ CPI, not Canadian
  (basis risk on the exact axis it's bought for), and the model pins its real yield at 1.42%.

So the implementable verdict is **~45% equity, not 20%**: cell (c)'s 20% requires a hold-to-maturity
real ladder that no Canadian retail wrapper provides, and the ETF-vs-ladder gap — not RRB
discontinuation — is the binding constraint (it applies wherever real bonds trade only as funds).
Read (c) as the idealized upper bound; read (d) as the reachable figure. The product's two-asset
candidate set cannot express any of this; it is the most consequential menu limitation (§7).
Reproduce: `--sections menu` on the same `research_history` command as above (doc cell (d) prints as
the `XSTH ETF proxy` row; the 2.0%-real sensitivity as `short-TIPS ladder @2% real`).

**Is the synthetic VR=1 leg realistic? The empirical short asset says short helps but is not
enough.** Cells (b)–(d) assume the alternative asset is mean-reverting (VR=1 or a clean
real ladder). That is a property of being _inflation-linked_, not of being _short_. JST carries
an actual short asset — rolling short-term government **bills** (`bill_rate`, deflated by CPI) —
so the assumption can be checked against history rather than asserted. The empirical short asset
is **more** persistent than long bonds, not less:

| Asset (pooled, real)       | vol   | VR(2y) | VR(5y) | VR(10y)  | VR(15y) |
| -------------------------- | ----- | ------ | ------ | -------- | ------- |
| equity                     | 22.3% | 1.08   | 1.00   | 0.91     | 0.86    |
| long government bonds      | 11.8% | 1.22   | 1.47   | **1.70** | 1.83    |
| short government **bills** | 8.1%  | 1.26   | 1.94   | **2.44** | 2.61    |

Bills have ~no _price_ risk, yet their _real_ return carries decade-scale persistence at or above
long bonds' (VR(10y) 2.44 vs 1.70 pooled; 4.96 vs 3.77 world; 3.75 vs 2.30 ex-disasters — bills
≥ bonds in every cut). A decomposition (pooled) says why: the **nominal** bill rate is the
stickiest series in the dataset (VR(10y)≈8 — a slow-moving policy rate, near a random walk in
levels), **inflation** itself is persistent (VR(10y)≈2.6 — hot decades cluster), and the **real**
bill return (VR(10y)≈2.4) tracks _inflation's_ profile almost exactly. The nominal rate does not
keep up with inflation year-to-year, so real bills bleed in the same decades long bonds do — the
slow-bleed mechanism is **unexpected inflation, not duration**. This is the empirical anchor under
the menu result: replacing long bonds with a real-world _short nominal_ ladder would **not**
collapse the optimum the way cell (c) does. It takes short **and inflation-linked** — a property
no nominal instrument has — to deliver the VR=1 leg, which is precisely why an idealized
short-TIPS/RRB ladder, not a bill ladder, is the asset that flips the answer.

**This is not "short duration is bad" — short fixes a different axis.** A safe asset can fail on
two independent dimensions, and VR measures only the second:

- **Amplitude** — how _deep_ a bad spell goes (vol, drawdown size). Set by **duration**. A rate
  shock marks a long bond down ~15% (long TIPS lost ~12% in 2022); a bill barely moves.
- **Persistence** — whether a bad spell _compounds over a decade or fades_ (VR). Set by
  **inflation linkage**, not duration. A nominal real return inherits inflation's autocorrelation
  regardless of maturity.

On amplitude, **short is strictly better** and it is the cheapest real risk to cut: bill vol runs
below bond vol in every cut (8.1% vs 11.8% pooled; 2.4% vs 9.4% in 1990–2020), with no 2022-style
crash. The bills result does **not** say short bonds are a poor holding — it says short alone
leaves the _persistence_ axis open. The cells stack on these two axes:

| Asset             | amplitude (vol / drawdown) | persistence (VR) |
| ----------------- | -------------------------- | ---------------- |
| long nominal      | bad                        | bad              |
| **short nominal** | **good**                   | still bad        |
| short + real      | good                       | good (VR≈1)      |

So short nominal (a plain GIC/bill ladder) is a genuine upgrade over long nominal bonds — shallower
and faster-recovering — but a hot-inflation decade still erodes it slowly and one-directionally.
Only inflation linkage closes the second axis. One reading caveat: VR>1 flags persistence in
_either_ direction, and a _persistently positive_ real carry (e.g. the 2.4%-vol disinflation drift
that gives 1990–2020 bills VR(10y)=3.90) scores high without being a danger. The danger is only the
persistent _negative_ run — a hot-inflation decade like the 1970s — which is why the full-sample
and post-1950 cuts (which contain it) are the ones that matter for sizing a real-asset slice.
Reproduce: `--sections vr` on the same `research_history` command (now prints a `bills` row).

---

## 3. Does this validate or reject ACO and ERN?

| Claim                                                    | Verdict (iid default vs forward-block scenario)                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ACO:** ~100% equity, flat across life                  | **Validated under the forward-block scenario, and under iid conditional on flexible spending.** With flexible spending, flat ~100% is optimal in both models. With _rigid_ spending: under **iid** it is _not_ optimal (a ~60–80% derisking tent beats flat 100% by $650–$2,000/yr), but under the **forward-block scenario** the tent collapses and **flat ~100% wins** (§2f) — ACO's result reproduced on our smaller ~3.3pp premium.       |
| **ERN / Kitces–Pfau:** rising equity glide in retirement | **An iid, rigid-spending shape — and shown to be sequence-risk, not valuation.** The derisk-then-rise glide emerges under pure iid (no CAPE>20 needed) but **largely vanishes under the forward-block scenario** (§2f), because real mean reversion removes the no-recovery premium that creates it. ERN's specific claim — that the glide _raises the SWR_ — does **not** reproduce even under iid (§2a): it only ties the best flat weight. |
| Both: beat the conventional **declining** (TDF) glide    | **Direction agreed, magnitude tiny.** A monotone-declining retirement glide is dominated in every cell — but the glide _shape_ is worth ≤ ~0.5% of CE under iid and **≈ $0 under forward-block** (§2f). The spending rule and the equity _level_ dwarf it.                                                                                                                                                                                    |

### 3a. Reconciling our constant-$ profile with ACO's

ACO's constant-spending optimum stays **flat ~100% through accumulation** and dips only **at
retirement**; ours **falls through accumulation** to a tent at retirement. Same tent _location_,
different accumulation _approach_. The gap is not a method artifact — both are non-parametric,
per-age optima — it is the assumptions:

1. **Wasted upside vs catastrophic downside (no bequest + capped spending).** A constant-$ retiree
   with bequest weight 0 gets **zero** marginal utility from wealth above what funds the fixed floor
   (you can't spend it, you leave nothing), but **huge** negative utility from landing low
   (depletion). That asymmetry says: don't carry the fat right tail of a 100%-equity accumulation
   into retirement — derisk so the wealth you hand over is _tight_, not _high-mean_. ACO's utility
   still values terminal wealth, so the upside isn't wasted and 100% accumulation pays.
2. **Premium + mean reversion.** ACO's realized history carries a higher equity premium and
   multi-decade mean reversion, so a 100% accumulation almost always recovers in time — cheap
   insurance to stay aggressive. **Pure iid removes that recovery guarantee**, so the sequence
   protection of derisking is worth more under iid than in history.

**§2f resolves this empirically, not just in theory.** Restoring the historical sequencing —
without touching the bequest motive or the premium — is exactly what the **forward-block
pooled** scenario does, and it moves our constant-$ accumulation path from iid's _falling-to-68_ back to
**flat ~100%**, matching ACO. So of the two assumptions above, **(2) the missing sequencing is the
operative one**: the iid tent is mostly a no-sequencing artifact, and the forward-block scenario
behaves like ACO. The bequest channel (1) remains a secondary lever — adding a terminal-wealth motive
would push even the iid path up. Two qualifiers: the channel factorial (§2f) shows the flip is a
**joint** property of the historical process — bond persistence degrading long bond holdings at the
same time as equity's decade-scale reversion de-risks high equity; neither alone, nor the stock/bond
correlation, nor the fat-tailed marginal shapes, reproduces it. "The missing recovery" is therefore
shorthand for that joint structure, not a single equity-side mechanism.
And because JST and ACO's panel draw on largely the **same developed-market historical
episodes**, reproducing ACO's flat-100% here is _consistency_, not independent confirmation. The
honest, forward-block conclusion for constant-$ is therefore
**flat ~100% with a shallow dip near retirement** (§2f), with the residual cost borne as depletion
risk; the iid "hold a moderate level and derisk" result (§2e) is the no-mean-reversion bound, useful as
a stress case but not the recommendation.

---

## 4. Caveats — what the iid baseline cannot see

The §2a–§2e sweep is iid Monte Carlo; **§2f (the forward-block scenario, offered by both
interfaces)** captures historical sequence structure (equity mean reversion, bond
persistence, single-country clustering) and is what flips the constant-$ result to flat ~100%. The
caveats below apply to the **iid** results (§2a–§2e); the forward-block scenario already addresses the
first two — they are listed here to bound the iid baseline, not the product.

- **No valuation signal / no mean reversion (iid only).** The iid sweep cannot reproduce ERN's
  _CAPE-conditional_ SWR boost, and (as §2f shows) overstates the constant-$ derisking incentive by
  assuming no recovery. The forward-block engine preserves the decade-scale equity mean
  reversion from JST history (~VR(10y)≈0.91) and bond persistence (VR>1) in the bootstrap sequences —
  up to roughly the 10-year average block length, attenuated beyond it; neither the
  CAPE-_timing_ signal nor a tradable valuation rule is modeled in either engine.
- **The mean-reversion signal is statistically weak.** VR(10y)≈0.91 is mild, estimated from
  overlapping windows on cross-country-correlated series with ~150 calendar years of effective
  data, and we report no confidence interval; it is likely not distinguishable from VR=1 at
  conventional levels. The **block-length sensitivity** in §2f partly compensates: the flip is a
  step function of "any sequencing vs none" (flat-100% for every average block length ≥ 5y;
  interior tent only at 1y), not a knife-edge in the VR point estimate. Read §2f as the
  realistic-sequencing bracket of an iid↔historical pair, not as a settled point estimate.
- **The flip is a joint-sequencing effect, not a single clean mechanism.** The channel factorial
  (§2f) shows neither the historical stock/bond correlation, nor the non-normal marginal shapes,
  nor equity sequencing alone, nor bond persistence alone reproduces flat-100% — equity-only
  sequencing even _deepens_ the tent via short-run momentum (VR(2y)≈1.1). The result needs bond
  persistence (VR(10y)≈1.7) degrading bonds at the same time as equity's decade-scale reversion
  de-risks high equity. That is an empirical property of the joint historical process — coherent,
  but with no single-parameter knob to stress-test it against. It is also **era-dependent**: the
  1990–2020 inflation-targeting cut lacks it entirely (bonds mean-revert, the optimizer returns
  the tent — §2f era table), though that cut is one 31-year regime that ends just before 2021–22.
  Whether the long-sample structure or the IT-era structure better describes the next 60 years is
  a monetary-regime judgment the data cannot settle; the shallow CE curves (≤ ~2% across
  50–100% equity) keep the welfare cost of guessing wrong small.
- **Survivorship and selection.** JST covers 16 developed markets with long, usable series — markets
  that survived. The recoveries that drive the §2f result are partly a property of that surviving
  sample (the standard critique of ACO applies equally here); investors in markets that closed or
  were expropriated never got their mean reversion.
- **Sequencing is assumed independent of the return level.** The affine rescale shrinks the equity
  premium to ~3.3pp while keeping the historical sequence structure, but historical mean reversion
  arose from valuation cycles at the _historical_ premium. Whether the same recovery dynamics hold
  at a lower forward premium is an untestable maintained assumption.
- **One equity asset, our curve.** No domestic/international split, so ACO's ⅓/⅔ tilt and its
  diversification benefit are out of scope — we test only the _stock-vs-bond_ and _flat-vs-glide_
  axes, on a ~3.3pp premium deliberately lower than ACO's US-tilted history.
- **Fixed-horizon, no mortality, no bequest.** Cleaner "horizon" axis, but it omits longevity risk
  and survival-weighting; and bequest weight 0 is what drives the constant-$ accumulation derisking
  (§3a). A bequest motive pushes every cell toward higher equity.
- **End-of-horizon artifact.** With no bequest the optimizer collapses equity toward 0 in the final
  retirement years — reported as the `end` column and excluded from the `tent`. It is a property of
  a fixed terminal date, not real.
- **CRRA utility, fixed contributions, no taxes/fees, annual rebalancing, 10pp grid.** Standard
  simplifications. **Read shape direction and rough magnitude, not basis points** — with CE gains of
  tenths of a percent, do not over-read a 40% vs 50% retirement-date knot.

---

## 5. Recommender script

The same model is exposed as a one-call recommender —
[`analysis/glide_path/recommender.py`](../../analysis/glide_path/recommender.py),
`recommend_glide_path(...)` — that **optimizes** (does not look up) the allocation per chosen step
(`interval` = 1y, 5y, …) given your horizons, spending flexibility, guaranteed income, risk
aversion, and selected return mode (including an arbitrary return/vol curve under `iid-mc`). The
default return mode is `iid-mc`; `forward-block` with `dataset=pooled` is the
historical-sequencing scenario. It varies equity against bonds. It
first finds a coordinate-ascent glide, then scores both that glide and the best single constant
allocation on an independent evaluation sample. It always returns the raw optimized glide as the
schedule, plus the robust constant comparator (`flat_equity_pct` / `flat_ce_income`) so callers
can recommend the flat path when it is materially better. It returns the per-step schedule plus
independent-evaluation CE income, income CV, and two depletion views: full-path depletion
(`depletion`), which includes pre-retirement market luck from today, and drawdown-only depletion
(`drawdown_depletion`), which starts from the deterministic expected retirement balance and matches
the `/retirement` headline semantics. "Depletion" in both views means an **income shortfall** — at
least one retirement year in which the portfolio could not fund the targeted draw — not "balance
hit zero" (a year fully covered by guaranteed income has a $0 target and can never count as a
shortfall); the web engine and Python recommender share this definition. It also returns the **best single constant allocation** — the
simpler alternative whose CE the glide path usually beats by only a hair (§2e) — and ships a
`plot_glide_path()` helper.

`python3 analysis/recommend_glide.py --demo` sweeps **each lever across all three spending
rules** under `iid-mc` (the default; pass `--mode` to sweep under another engine —
under forward-block every cell is near-flat 100%) — holding every other input at its default — and writes
`glide_<spending>_by_<lever>.png` (spending ∈ {`constant`, `semiflex`, `flexible`}; lever ∈
{`guaranteed`, `gamma`}) plus a `glide_by_spending.png` overview to
gitignored `analysis/artifacts/glide_path/demo/`. What each lever does — and how the
effect itself depends on the spending rule:

| Lever                 | Effect on the optimal glide (spending-dependent)                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spending** (`flex`) | rigid → deep retirement tent; flexible → flat ~100% (`glide_by_spending.png`).                                                                                                                                                                                |
| **Guaranteed income** | a bigger guaranteed floor lets the portfolio derisk → **deeper, lower tent**. $0 guaranteed income is a permanent zero-income bridge: CE becomes tail-dominated, so its allocation comparison is inconclusive rather than a valid "go for broke" result (§1). |
| **Risk aversion** (γ) | higher γ → lower equity / deeper tent — but mostly under **flexible/semi-flex** spending; the **constant-$ shape is ~γ-invariant** (its tent is driven by the rigid floor, not by taste).                                                                     |

The guaranteed-income panel is the concrete, dial-able form of the §3a reconciliation: for
constant-$ it moves the path between our "derisk" result and ACO's "flat ~100%."

**Additional dials** (beyond the demo matrix), all exposed on both the interactive prompt flow and
the `recommend_glide.py` flag CLI:

- **Guaranteed income amount.** `guaranteed_income` is the real annual dollar amount from CPP, OAS,
  DB pensions, and other income paid **every** retirement year. A pre-pension bridge is out of
  scope. A zero amount recreates the same zero-income state and makes the CE allocation comparison
  inconclusive (see §1).
- **Leverage.** `max_leverage` (1.0 = none; 1.5 = up to 150% equity) lets the optimizer borrow at a
  **real** `borrow_cost` to hold w>1 in the all-equity portfolio (real return `w·eq − (w−1)·borrow`,
  vol `w·eq_vol`; a wipeout is treated as ruin). It leverages only where the risk-adjusted gain beats
  the borrowing drag and survives the independent-evaluation CE guard — typically early accumulation
  under a low γ ("lifecycle investing"). Recommendations therefore use leverage less often than the
  raw coordinate-ascent path when the leveraged upside comes with a fragile left tail.
- **Retirement-consumption γ, by design.** Risk aversion is applied to retirement consumption, not
  directly to accumulation wealth. The user's chosen γ is their preference for _stable retirement
  spending_ — "how hard should the optimizer avoid low spending in bad market draws?" rather than
  "how much equity do you want?" — and may differ from their general investment risk appetite today.
  Higher γ penalizes low retirement-spending outcomes more heavily across simulated market scenarios.
  It is distinct from spending flexibility, which sets how spending _responds_ to portfolio value.
  Accumulation wealth carries no direct utility, but γ still pins down the accumulation glide through
  how that wealth becomes retirement spending; the _declining_ glide also emerges from the
  contribution stream + horizon (human capital). A separate accumulation γ has almost no leverage,
  and a γ(age) gradient would double-count the age–risk relationship the optimizer already produces —
  so neither is offered.
  - _Typical values._ γ = 1 is log utility (aggressive); the literature's plausible band is ~1–10
    with **2–5 the realistic center** (the ~30–40 needed to rationalize historical equity premia is
    the "equity premium puzzle" precisely because it is implausible). The recommender and §2
    analysis sweeps use 4 as the base case. γ's effect on the glide is **spending-rule
    dependent**: under flexible spending a higher γ pulls equity down, but the **constant-$ tent is
    ~γ-invariant** (§2d) because the rigid floor — not taste — drives that shape.
- **β front-loads retirement spending; it discounts retirement years, not years from today.** The
  first retirement year has weight 1, and each subsequent retirement year has β times the previous
  year's weight (`disc[t] = β^t`, length = retirement years; accumulation is undiscounted). A β of 1
  weights every retirement year equally; lower β tilts the optimizer toward funding _earlier, more
  active_ retirement years over later ones. Over 30 years, β of 1, 0.985, and 0.97 give the final
  year about **100%, 65%, and 41%** of the first year's weight.
  - _Typical values._ The default **0.985** ≈ 1.5%/yr — close to the empirical "retirement spending
    smile" (real spending drifts down ~1%/yr in mid-retirement, ≈ β 0.99). **0.97** ≈ 3%/yr is a
    strong early-years tilt; **0.95** ≈ 5%/yr (final-year weight ~23% over 30y) is a _very_ strong
    front-load and atypical; the floor is 0.90. The model has **no separate survival/mortality
    weighting**, so part of any β < 1 a household picks legitimately stands in for declining survival
    probability — the realistic "neutral" point sits a little below 1.0, not exactly at it.

## 6. Reproduce

```bash
python3 -m analysis.glide_path.research             # the analysis (tables + figures), ≈ 5 min
python3 -m analysis.glide_path.recommender          # interactive: prompts for your inputs
python3 analysis/recommend_glide.py --demo          # recommender showcase: 3×2 lever matrix + overview, ≈ 2 min
python3 analysis/recommend_glide.py --help          # scriptable flag CLI for a single custom recommendation

# Regenerate the pre-rescaled JST bundle used by the web app's forward-block engine
python3 -m analysis.glide_path.generate_bundle      # writes src/utils/glide-path/jstData.ts
```

After an interactive run, the recommender prints a copy-pasteable `analysis/recommend_glide.py`
command containing the resolved inputs. The flag CLI exposes the interactive optimizer settings,
including `--beta` and `--paths`, so that command reruns the same simulation and is easy to modify.

Tweak `analysis/glide_path/research.py`'s CONFIG block: `SPENDING_REGIMES` (FLEX levels), `RETIRE_HORIZONS`,
`ACCUM_HORIZONS`, `GAMMA`, `WITHDRAWAL_RATE`, `GRID_STEP`, `OPT_N`/`N_FINAL`/`OPT_PASSES`.
Returns/vol come straight from the `ALLOC_ANCHORS` mirror of
[`presets.ts`](../../src/utils/glide-path/presets.ts) `DEFAULT_ALLOC_CURVE` — change them there (and here) together. Runtime
≈ 5 min (the per-age coordinate ascent is the cost).

## 7. Discussion — what we actually take away

Qualitative conclusions the quantitative sections support. Each cites its evidence; none is a
new claim.

1. **The welfare surface is flat; the allocation argmax is not.** Across every cut we ran —
   iid vs forward-block, block lengths 5–40y, era and country restrictions — the best constant
   weight moves anywhere from 50% to 100% equity, while the CE spread across that whole range
   stays ≤ ~2–3% (§2e, §2f). The model is far more certain about _how little the choice costs_
   than about _which choice is best_. This is why the product biases toward the simple constant
   allocation (§1, simplicity thresholds): the glide's measurable edge is smaller than the
   model's own uncertainty.
2. **The spending rule and guaranteed income dominate the allocation.** Moving flexibility from
   0 to 1 changes CE by ~$13–16k/yr in every engine (§2b, §2f); moving the equity level across
   its plausible range changes it by ≤ ~$2k. A household debating "60 vs 100% equity" is
   arguing about the third-most-important dial.
3. **The flat-100% recommendation is, at bottom, a monetary-regime judgment.** The joint
   sequence structure that produces it (bond persistence + equity decade-scale reversion) is
   present in 1871–2020 and in the stable-country cut, absent-to-inverted in 1990–2020, and the
   data cannot adjudicate which regime the next 60 years resemble (§2f era table, §4). The two
   engines are best read as scenario brackets — iid: "no recovery, bonds work"; forward-block:
   "history's joint structure persists" — not as a settled point estimate plus a stress case.
   This is why the product defaults to iid, and the choice is **minimax-regret**, not
   "near-optimal everywhere." iid lands interior _by construction_: with no path memory, equity
   weight trades only mean against variance, so the γ-penalty pulls the optimum off the corner to
   ~60–80% regardless of which era you slice (iid reads the forward CMA marginals, not the
   sequencing). forward-block hits the **corner** _by construction_ too — historical sequencing
   makes equity mean-revert over a decade (its long-horizon variance falls below its annual vol)
   while bonds persist, so the optimizer sees equity as horizon-safe and goes to 100%. Across the
   era cuts, forward-block's best constant weight sweeps the whole [50%, 100%] envelope while iid's
   ~60–80% sits permanently _inside_ it (recap of the §2f era table, `best flat` column):

   | History cut         | forward-block best flat |
   | ------------------- | ----------------------- |
   | full 1871–2020      | 100%                    |
   | post-1950           | 100%                    |
   | ex Germany + Japan  | 100%                    |
   | stable six          | 80%                     |
   | 1990–2020 (IT era)  | 50%                     |

   So iid is never the worst-case answer in any regime — it minimizes the largest possible
   allocation error when the regime is unknown — whereas forward-block is optimal in its corner cut
   and most wrong (100% vs 50%) in the inflation-targeting cut. Combined with the flat welfare
   surface (CE spread ≤2–3%), "always near the middle of the envelope" is exactly the low-regret
   property a default should have; the corner answer is a scenario, and scenarios make better
   toggles than defaults.
4. **The verdict on bonds is about the menu, not the asset class — now measured, not just
   suspected.** The bond-menu experiment (§2f) holds the bond's mean and vol constant and removes
   only its historical sequencing and correlation: the optimum collapses from flat-100% to 45%
   equity and CE _rises_ ~$3k/yr. That 45% is the **reachable** figure — it is what a real,
   short-duration ETF (CAD-hedged short-term US TIPS, e.g. XSTH) delivers, since the 100%→45% jump
   is driven entirely by inflation linkage (the persistence axis). An _idealized_ short-TIPS/RRB
   **ladder** takes the optimum further, to ~20% equity / +~9% CE, but the extra 45%→20% step comes
   only from the ladder's hold-to-maturity vol suppression (2% vs short-bond ~5.4%), which no
   Canadian retail wrapper provides — read 20% as the idealized upper bound, 45% as the buyable one.
   Flat-100% is conditional on the only safe asset being long nominal bonds; a third (real,
   short-duration) asset is the highest-value extension to the candidate set (§4).
5. **Lifecycle-horizon historical inference runs on priors, not power.** 150 years × 16
   correlated countries ≈ a handful of independent 60-year observations. The per-channel
   factorial (§2f) and the variance-ratio diagnostics are how we discipline the story
   economically; nothing here passes a formal significance bar, and the doc deliberately
   reports brackets rather than confidence intervals it cannot honestly compute.

## References

- ACO — Anarkulova, Cederburg, O'Doherty, _Beyond the Status Quo_ (SSRN 4590406).
- ERN — earlyretirementnow.com, SWR Series Part 20 (equity glidepaths).
- Kitces & Pfau (2014) — _Reducing Retirement Risk with a Rising Equity Glide Path_ (the bond tent).
- Estrada (2014) — _The Glidepath Illusion_ (glide shape adds little once the level is set).
- [`retirement` SWR methodology](../retirement/swr-methodology.md) — the CMAs, the iid/AR(1)
  decision, and the JST historical cross-check this note builds on.
