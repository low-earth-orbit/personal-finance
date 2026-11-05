# Lifetime Allocation Optimizer — Methodology and Research

Developer/research note for the Lifetime Allocation Optimizer. Companion to the [`retirement` SWR methodology](../retirement/swr-methodology.md). It asks: **what equity weight should you hold at each age — before and after retirement — to maximize lifetime welfare?**

The research baseline (Sections 2a–2e) uses our forward Canadian capital-market assumptions and plain **iid Monte Carlo**, which is also the **product default** in both the web app and the Python recommender. **Forward-block pooled** — historical single-country return sequences affine-rescaled to the forward-CMA marginals, then stationary-block-bootstrapped — is offered in both interfaces as the **historical-sequencing scenario**: §2f runs the key cases under it, where the constant-$ bond tent largely disappears and the optimum becomes flat ~100% equity. The default is iid because it relies only on the forward marginals — not on decade-scale sequencing patterns that are weakly identified, era-dependent (§2f), and partly a property of long nominal bonds being the only safe asset (§2g) — so it is the conservative "no recovery" case. An earlier version of this note also called iid the _minimax-regret_ choice; that was asserted from allocation distance and **does not survive** computing the welfare regret: across the era cuts the minimax constant weight is ~90%, above iid's 70% (§7.3). The two modes bracket the answer; the bracket, not either endpoint, is the finding.

> **Return-model correction (Nov 2026).** The PWL / FP-Canada allocation curve lists **geometric (compound)** returns — FP Canada's Projection Assumption Guidelines say so explicitly and prescribe a geometric→arithmetic conversion for Monte Carlo, and the curve's interior points match a lognormal geometric construction to 0.5bp. Earlier versions of this engine fed those geometric numbers in as the _arithmetic_ mean of normal draws, so every mix compounded ~σ²/2 below its stated rate (100% equity at 3.9% real instead of 4.7%), understating the equity premium by ~20% and biasing every result toward bonds. Both engines now convert each anchor with the exact lognormal relation before sampling, and every number in this note has been regenerated. The `/retirement` tool shares the same curve and has **not** yet been corrected, so the two tools' return models currently differ (follow-up).

The web and Python recommender share the baseline household/model defaults: flexibility 0, γ = 4, β = 0.985, and a 4% flexible withdrawal rate. Their product surfaces intentionally differ: the web app fixes the glide cadence at 5-year steps, uses browser-sized path/pass caps, exposes fewer controls, and requires at least $10,000 of guaranteed income. Python exposes the interval and historical return modes (with world/pooled dataset choices), and accepts zero guaranteed income for research and CLI sensitivity cases.

This work is a deliberate cross-check on two backtest-based studies:

- **ACO** — Anarkulova, Cederburg, O'Doherty, _Beyond the Status Quo_ ([SSRN 4590406](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4590406)): a 38-country block bootstrap concludes the lifetime-utility optimum is **~100% equity, held flat** across the whole lifecycle (no bonds, no glide). Its constant-spending optimal profile (their Figure 3) is **flat ~100% through accumulation** with a shallow bills/bonds "tent" concentrated **right at retirement**, receding within a few years.
- **ERN** — earlyretirementnow.com [Part 20](https://earlyretirementnow.com/2017/09/20/the-ultimate-guide-to-safe-withdrawal-rates-part-20-more-thoughts-on-equity-glidepaths/): a US Shiller backtest finds a **rising** retirement glide (e.g. 60%→100%) adds ~0.1–0.3pp to the SWR, **but only when CAPE > 20**.

Simulation: [`analysis/glide_path/research.py`](../../analysis/glide_path/research.py) (`python3 -m analysis.glide_path.research`; needs numpy + matplotlib). Figures it writes are in gitignored `analysis/artifacts/glide_path/research/`.

## Contents

1. [Method](#1-method)
2. [Results](#2-results)
3. [Comparison with ACO and ERN](#3-does-this-validate-or-reject-aco-and-ern)
4. [Caveats](#4-caveats--what-the-iid-baseline-cannot-see)
5. [Python recommender](#5-recommender-script)
6. [Reproducing the analysis](#6-reproduce)
7. [Discussion — what we actually take away](#7-discussion--what-we-actually-take-away)

The research sweep and the product default are forward-CMA iid Monte Carlo; forward-block pooled is the historical-sequencing scenario mode. The four supported modes in the Python recommender:

```bash
# Default: forward-CMA normal iid Monte Carlo
python3 analysis/recommend_glide.py                         # iid-mc

# Historical sequences rescaled to forward-CMA marginals, then block-bootstrapped
python3 analysis/recommend_glide.py --mode forward-block --dataset pooled

# Raw paired per-country (pooled) stock/bond years, sampled independently with replacement
python3 analysis/recommend_glide.py --mode historical-iid

# Raw paired per-country (pooled) years in stationary circular blocks; add --dataset world for
# the equal-weight world average
python3 analysis/recommend_glide.py --mode historical-block --block-years 10
```

Historical modes use real paired stock and long-government-bond returns from the JST R6 Macrohistory workbook. `analysis/shared/jst_history.py` downloads it on first use to gitignored `analysis/.data/`, deflates each asset by each country's CPI, and pairs the real returns by year. `--dataset pooled` (default) concatenates each country's own sequence so a block samples consecutive years of a single country; `--dataset world` averages countries within each calendar year into one annually-rebalanced portfolio. Each sampled historical year keeps stock and bond paired. Historical modes require pandas and openpyxl in addition to numpy. A custom `--curve` and `--inflation` apply only to `iid-mc`.

The world series has no negative 20- or 30-year circular stock window, so longer average blocks can make a 100% stock result optimal under this model — a property of bootstrapping the already-diversified world series, not of the (stock/bond) candidate set.

---

## TL;DR

0. **The return model decides whether there's a tent at all.** Under **iid** (no recovery; the product default), constant-$ spending wants a **derisking bond tent** around retirement; the best constant level is **70%** for a 30-year retirement, rising to 90–100% for 40–50 years. Under the **forward-block pooled** scenario — which restores JST's empirical sequence structure (equity decade-scale reversion **jointly with** bond persistence; see §2f's channel factorial) — the tent **largely disappears**: the optimum is **flat ~100% equity**, best-flat is 100% in every cell, and the glide shape is worth **≈ $0** (§2f), reproducing **ACO's flat-100%** on our own CMAs. The §2f robustness cuts show that flat-100% answer is conditional on pre-1990 monetary regimes and on long nominal bonds being the only safe asset. Computed across those cuts, the CE regret of any weight from 70% to 100% stays under ~2% of CE (§7.3).

1. **The spending rule decides the shape (within either model).**
   - **Constant real-dollar withdrawal** → _under iid_ the optimum **derisks into retirement** (a **bond tent**) then drifts up; _under the forward-block scenario_ this collapses to a shallow dip near 100%.
   - **Flexible or semi-flexible withdrawal** (income allowed to move with the market) → optimum is **flat 100% equity** throughout in **both** models — exactly **ACO's** prescription.
2. **The glide _shape_ is worth very little.** Tested out-of-sample, the per-age glide beats the best single **flat** weight by only **~$130–280/yr (≤0.5%)** under iid, and **≈ $0 under forward-block** (and $0 whenever spending is flexible). The _level_ is what matters — and which level is right depends on the return model and horizon: **70–100%** under iid constant-$, **100%** under forward-block.

3. **Why the iid tent and ACO differ — and what closes the gap.** The iid constant-$ tent bottoms at/just after retirement (matching ACO's location) but its accumulation path **falls** rather than staying flat near 100%. Two levers each close that gap. (a) **Sequencing:** iid removes the decade-scale recovery history carries; restore it (forward-block, §2f) and the path goes flat ~100%. (b) **Funding level:** the default household's $40k gap is only ~2.3% of its expected retirement balance, so a capped constant-$ spender has little use for upside and protects the floor instead. Make the plan tighter (gap ≈ 3.3% of the balance) and the iid tent disappears too (§2b, funding sweep). A bequest motive would push the same way.

4. **Both studies are right in their own world.** ACO's flat-100% is optimal _when spending is flexible (or wealth is valued), when the plan is not heavily over-funded, or once realistic mean reversion is in the model_; ERN/Kitces–Pfau's rising retirement glide is the _iid, rigid-spending_ shape — and even there ERN's CAPE-conditional SWR _boost_ does not reproduce under iid.

5. **A CRRA allocation recommendation requires some guaranteed retirement income.** If guaranteed income is zero, even a rare depleted year drives consumption to the numerical floor and makes CE tail-dominated. The web app therefore requires at least $10,000 of guaranteed annual income. Python accepts zero for sensitivity work and can still report depletion and the two candidate paths, but their allocation comparison is tail-dominated.

---

## 1. Method

Real (today's) dollars throughout. The **iid baseline** (§2a–§2e) uses iid normal returns, drawn each year — **no** serial correlation, **no** valuation signal — so anything the optimizer likes there is robust to the absence of mean reversion, by construction. §2f instead uses **forward-block pooled** (the scenario mode), which reintroduces the historical sequencing iid strips out; the two together bracket the answer (no-recovery bound vs realistic mean reversion).

### Python recommender return modes

All four modes feed the same lifecycle cash flows, utility objective, coordinate-ascent optimizer, and independent evaluation-sample comparison:

- **`iid-mc`** maps each allocation to the app's forward-CMA real mean and volatility, then draws independent normal returns. Used by `analysis/glide_path/research.py` for the §2–§3 research sweep, and the default mode of the web app and Python recommender.
- **`historical-iid`** samples raw historical years independently with replacement. Stock and the selected asset returns remain paired within a sampled year, but year-to-year ordering is removed.
- **`historical-block`** uses a stationary circular block bootstrap of paired asset-return years. Each next year continues the current historical sequence with probability `1 − 1/L` or restarts at a random year with probability `1/L`, so block lengths are geometric and average `L` years. The default `L` is 10 years, an annual approximation of the 120-month average used by ACO.
- **`forward-block`** affine-rescales each asset's historical series to the forward-CMA marginals (the same `w=0` and `w=1` real arithmetic mean/vol `iid-mc` uses), then block-bootstraps exactly like `historical-block`. Being affine, the rescale preserves each asset's _arithmetic-return_ autocorrelation, variance ratio, and the stock/bond correlation exactly (log-return statistics would not be preserved — e.g. pooled bond log-VR(10y) moves from 1.70 to 2.77 — which is one reason this note reports variance ratios on arithmetic returns). This isolates _sequencing_ from the historical return/risk level — the missing cell of the marginals × sequencing factorial.

**What each mode actually does** (the distinctions that matter when reading results):

| Mode | Preserves sequencing | Single-country sequence | Stock/bond pair kept | Uses forward PWL marginals |
| --- | :-: | :-: | :-: | :-: |
| `iid-mc` | ✕ (iid) | n/a | implicit via curve vols (ρ≈0.48) | ✓ (full curve) |
| `historical-iid` | ✕ (iid) | pooled only | ✓ | ✕ (raw historical) |
| `historical-block` | ✓ | pooled only | ✓ | ✕ (raw historical) |
| `forward-block` | ✓ | pooled only | ✓ | ✓ (`w=0` & `w=1` anchors) |

Notes: (1) "Single-country sequence" holds only with `--dataset pooled` (the default); the `world` dataset is the equal-weight cross-country average, whose sequence no single investor lived. (2) The stock/bond _contemporaneous_ correlation is preserved in every historical mode because both series are indexed by the same sampled rows; `forward-block` keeps the **historical** correlation while matching forward marginals (intermediate-weight risk therefore comes from that historical covariance, not the curve). (3) `forward-block` matches only the `w=0`/`w=1` anchors, not the curve's interpolated intermediate-weight vols.

**Dataset and exclusions** (historical modes only): `--dataset pooled` (default) concatenates each country's own sequence end to end, with segment ids that keep a block from bridging two countries or a data/exclusion gap, so a block samples consecutive years of a single country. `--dataset world` averages countries within each calendar year into one annually-rebalanced portfolio. `--exclude-countries` / `--exclude-years` (pooled only) drop disaster countries or windows.

For allocations up to 100% equity, each annual portfolio return is `w × stock + (1−w) × bonds`. Above 100% equity, the leveraged return is `w × stock − (w−1) × real borrowing cost`, with no bond position. The `historical-*` modes use raw realized return levels; they do not re-center history to the forward CMAs (only `forward-block` does). They are bootstrap backtests, not overlapping realized lifecycle windows. With the `world` dataset, the block bootstrap resamples an already-diversified annual equal-weight-world series; the default `pooled` dataset instead preserves single-country sequence risk. Either way these are annual sequencing sensitivity checks, not an ACO replication (ACO bootstraps a monthly country-level four-asset panel with 120-month average blocks, mortality-weighted horizons, and terminal wealth in the objective — our annual 10-year blocks carry related but not identical sequencing content).

### Returns — our own assumptions, no history

The app's allocation curve ([`presets.ts`](../../src/utils/glide-path/presets.ts) `DEFAULT_ALLOC_CURVE`, PWL Capital / FP-Canada-based, inflation 2.1%) lists **nominal geometric (compound)** returns and vols. Each anchor is converted to the matching nominal arithmetic mean with the exact lognormal relation `(1+A)² = [(1+G)² + √((1+G)⁴ + 4(1+G)²σ²)] / 2`, then deflated to real (`(1+A)/(1+π) − 1`, vol `σ/(1+π)`), and interpolated so **any** equity weight `w∈[0,1]` maps to a real arithmetic `(mean, vol)`. Endpoints: **100% equity → 4.67% real geometric / 5.38% arithmetic, 12.3% vol**; **0% equity → 1.42% geometric / 1.56% arithmetic, 5.3% vol** ⇒ an equity premium of **3.25pp geometric (3.83pp arithmetic)** (vs the ~5pp the US-tilted history ACO and ERN lean on — see the [`retirement` SWR methodology](../retirement/swr-methodology.md) §2). The curve's interior vols imply a constant stock/bond correlation of ≈0.48. Each year's return is `mean(wₜ) + vol(wₜ)·Z` (arithmetic normal, mid-year cash flow earns half a year, a depleted portfolio absorbs at 0); simulated compound growth then matches the curve's stated geometric rate within ~1bp. Python accepts `curve_mean_basis="arithmetic"` for a custom curve that is already arithmetic. Deterministic "expected" balances compound the **geometric** (median-path) rate of whatever is sampled.

### Household & phases

`START_AGE=35`, `START_SAVINGS=$200k`, income `$100k`, save **20%/yr** during accumulation, target retirement income **60%** of income, of which **$20k** is guaranteed income (CPP/OAS/DB) paid every retirement year — so the portfolio must fund a **$40k** gap. Accumulation consumption is allocation-invariant, so it drops out of the objective; the accumulation glide matters only through the **wealth distribution it hands to retirement**. Retirement is a **fixed planning horizon** (`retire_years`), which makes "horizon" a clean axis (no mortality truncation; no bequest motive — terminal wealth carries no utility).

### Spending rules — the income-variation axis

Each retirement year the withdrawal target blends a constant and a portfolio-proportional rule by a flexibility knob **`FLEX∈[0,1]`**:

```
targetₜ = (1−FLEX)·$40k  +  FLEX·(4%·balanceₜ)
withdrawalₜ = min(targetₜ, affordable)      consumptionₜ = $20k guaranteed + withdrawalₜ
```

- **`FLEX=0` — constant $**: insists on the full $40k every year; income is rigid until the portfolio is exhausted (then drops to the $20k floor). This is the SWR / `/retirement`-tool world.
- **`FLEX=0.5` — semi-flexible**: half the target floats with the portfolio.
- **`FLEX=1` — fully flexible**: spends 4% of the _current_ portfolio, so income rises and falls with the market and the portfolio is never mechanically depleted. This is ACO's world.

### Objective & the per-age optimizer

Maximize expected discounted **CRRA utility** of retirement consumption (γ = 4 base; β = 0.985; bequest weight 0). The control is the **equity weight at every age** (length = accumulation + retirement years). We optimize it by **coordinate ascent**: hold all ages fixed but one, evaluate that age over a 10pp equity grid on a **shared** shock matrix (common random numbers), take the best, and cycle (alternating sweep direction) until the whole vector stops moving. CRN makes each one-dimensional search exact for the drawn markets, and **no parametric shape is imposed** — so flat / tent / monotone shapes all compete on equal footing. Exact ties keep the incoming value (a candidate must beat the current weight by a relative 1e-12), so an allocation that genuinely does not affect the objective is not silently forced to the lowest grid weight. Coordinate ascent converges to a **coordinate-wise** optimum, not a guaranteed global one; the shape-neutral flat init and the alternating sweep direction mitigate but do not eliminate the risk of a local optimum (most plausible under leverage with tail-dominated CE).

### Zero-income states and the CRRA impossible trinity

The model assumes guaranteed income is paid **every** retirement year. With positive guaranteed income, consumption remains positive after portfolio depletion and CRRA's `u(c)` stays finite. The bare `_FLOOR = $1` is then only a numerical guard and does not bind in the §2 scenarios.

A pre-pension bridge, or a plan with **$0 guaranteed income for all of retirement**, breaks that assumption. Once the portfolio depletes, consumption falls to the numerical floor. Because `u(c)→−∞` as `c→0`, with γ≥2 even a handful of `$1` consumption-years can dominate thousands of otherwise successful paths. CE collapses toward the floor and the optimizer can select an implausible allocation merely to avoid those rare cells.

We tested three approaches and found an **impossible trinity**: the model cannot simultaneously provide all three of the following:

1. **No consumption floor or assumed fallback income.**
2. **A γ-responsive welfare objective.**
3. **Possible ruin while still producing one preferred allocation.**

Raw all-path CRRA preserves (1) and (2), but a ruined year has effectively unbounded negative utility, so it cannot produce a useful comparison when (3) occurs. Assigning a finite utility value to a broke year restores a comparison, but that floor effectively fabricates consumption the household does not have. Scoring CRRA only over surviving paths avoids fabricated income, but under target spending every survivor consumes the target by construction. Survivor CE therefore equals the target for every γ; the objective collapses to γ-independent depletion minimization and, in testing, recommended roughly the same 120–135% leveraged allocation from γ=1 through γ=12.

The chosen scope is therefore to preserve clean, all-path, γ-responsive CRRA and not model a pre-pension bridge. That funding-feasibility question belongs to `/retirement`. A user-entered **$0 guaranteed income is economically a permanent bridge** and recreates the same limitation: the product labels the CE values as tail-dominated and presents the allocation comparison as **inconclusive** rather than treating either candidate as a reliable recommendation. Depletion metrics remain meaningful and are still reported.

Two honesty checks accompany every result:

- **Tent vs terminal year.** We report the **tent** = lowest equity within 15y of retirement separately from the **terminal-year** equity. With bequest weight 0 the final year is special: at flexibility 1 the last-year allocation has _exactly zero_ effect on the objective (spending is set from the start-of-year balance and is always affordable), so it is arbitrary — earlier versions showed it as 0% only because `argmax` breaks ties toward the first grid weight; ties now keep the incoming value. At flexibility < 1 the end value is a genuine optimum of a no-bequest horizon (often 100% for constant-$). Either way, read the last step loosely.
- **Undetermined allocations.** With flexibility 0 and guaranteed income ≥ the target, the portfolio funds nothing and every allocation ties; both engines now refuse this input instead of returning 0% equity.
- **Shape value, out of sample (§2e).** We re-score the optimized path on an **independent** shock draw against (a) flat 100%, (b) the best single flat weight, and (c) the optimal retirement glide with accumulation _forced_ to 100%. If the optimized accumulation shape doesn't beat flat-100% out of sample, we don't believe it.
- **Product recommender fallback.** The recommender applies one extra robustness guard: after coordinate ascent, the best constant allocation is chosen on its **own selection draw** (independent of both the optimization draw and the scoring draw — an argmax on the scoring draw would hand the constant comparator a selection advantage over the fixed glide), and then both the glide and that constant are scored on the same independent evaluation draw. The Python CLI flags the constant allocation as the robust choice when its CE beats the glide's by more than 5%. The web UI biases harder toward simplicity: it recommends the constant allocation whenever it wins on CE income outright, or comes within 3% on CE income **and** within 0.5pp on drawdown shortfall **and** within 1.5pp on full-path shortfall (`SIMPLICITY_*` thresholds in `src/components/glide-path/Result.tsx`). The calibration follows §2e/§2f: CE gaps under ~3% are within the model's own uncertainty (measured glide edge ≤ ~0.5%, MC noise ~0.3%, era/mode CE regret ≤ ~2% across 70–100% equity), so CE alone should not overturn the simpler pick; the tighter shortfall gates (2–4× the Monte Carlo standard error of those rates) carry the real veto so the simpler pick cannot add meaningful tail risk. Either way the raw optimized glide stays charted and reported.

---

## 2. Results

> **Two return models, two answers — and the difference _is_ the result.** §2a–§2e below are the **iid** sweep (forward-CMA normal draws, no sequencing — the **product default**): under iid, constant-$ spending produces a **derisking bond tent** and a **70–100%** optimal constant level (70% at a 30-year retirement). §2f re-runs the same scenarios under **forward-block pooled** — the historical-sequencing scenario mode — and the tent **largely disappears**: the optimum is **flat ~100% equity** with best-flat = 100% in every cell. The flip is the headline finding (§2f, §3a): the iid tent is a sequence-risk artifact of assuming **no recovery**, and JST's joint sequence structure restores the conditions that make ACO's flat-100% optimal. §2f's robustness cuts then show that flip is itself conditional (era, country survival, bond menu) — which is why iid is the default and forward-block the scenario. Read §2a–§2e as the default's baseline; read §2f for the scenario and its limits.

### 2a. SWR anchor (validates the engine; tests ERN under iid)

Retirement-only, constant $, 90% success — tests whether a rising glide beats the best flat weight under iid.

| Horizon | Best flat (w\*)  | Flat 100% | Rising 60→100 |
| ------- | ---------------- | --------- | ------------- |
| 30y     | **3.91%** (85%)  | 3.89%     | 3.93%         |
| 40y     | **3.31%** (95%)  | 3.31%     | 3.30%         |
| 50y     | **2.97%** (100%) | 2.97%     | 2.93%         |

With the geometric→arithmetic correction the SWR-maximizing weight is **85–100%** and the SWR curve is nearly flat near the top (flat 100% is within 0.02pp at 30y). The pre-correction engine showed an interior 50–70% optimum and a lower 3.66%/2.61% (30y/50y) — that interior optimum was largely the volatility-drag bias, which penalized equity most. The `/retirement` tool still carries that bias, so its SWR figures no longer match this anchor (follow-up). The rising glide ties the best flat weight within a few hundredths of a point; **it earns no SWR premium under iid**, confirming ERN's effect is a CAPE/mean-reversion phenomenon absent from an iid world. (See `swr_anchor.png`.)

### 2b. Per-age optimal glide — retirement-horizon sweep (iid)

γ = 4, 30y accumulation. All columns are **equity %**. `tent` = lowest equity within 15y of retirement (the retirement-date tent bottom) and the age it hits; `end` = terminal-year equity. BEFORE = accumulation slope; AFTER = whole-retirement slope (final year omitted). Deplete = share of paths with at least one income-shortfall year.

| Spending | Ret. horizon | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE | AFTER | CE income | Deplete |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| constant $ | 30y | 100 | 78 | 40 | 50 | 30 (@67) | 100 | Falling | Rising | $58,089 | 2.6% |
| constant $ | 40y | 100 | 86 | 60 | 70 | 70 (@65) | 100 | Falling | Rising | $55,353 | 5.1% |
| constant $ | 50y | 100 | 91 | 60 | 70 | 70 (@65) | 100 | Falling | Rising | $52,925 | 7.1% |
| semi-flex 50% | 30y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $79,467 | 0.5% |
| semi-flex 50% | 40y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $77,423 | 1.5% |
| semi-flex 50% | 50y | 100 | 100 | 100 | 100 | 90 (@70) | 100 | Flat | Flat | $74,275 | 2.8% |
| flexible 100% | 30y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $81,023 | 0.0% |
| flexible 100% | 40y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $79,584 | 0.0% |
| flexible 100% | 50y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $78,381 | 0.0% |

**Reading it:**

- **Constant $ → derisk into a tent, then drift up.** Equity falls through accumulation to a low **at/just after retirement** (30–70%), then rises. Income is near-rigid; the cost shows up as **depletion risk** (3–7%, rising with horizon). Longer horizons keep the tent shallower (70% vs 30%) because a longer retirement needs more growth.
- **Semi-flex and flexible → flat 100%.** Equity is pinned at the top for the entire working and retired life. Flexible spending cannot mechanically deplete; the cost is borne as income variation.
- **Do not read the CE gap between rows as "the value of flexibility."** At a 4% flexible rate, the flexible rule's first-year draw is ~$83k (4% of the ~$2.07M expected balance) against the constant rule's $40k gap (~2.3% of its balance) — most of the ~$23k CE gap is _spending more_, not _spending flexibly_. Matched to the same $40k initial draw (wr ≈ 1.93%), flexibility is worth **+$2.8k/yr** (flex 1: $60.9k) to **+$6.8k/yr** (semi-flex: $65.0k) over constant-$ ($58.1k); each rule at its own best spending level gives constant-$ $60.8k (target ≈ $70k) vs flexible $85.4k (wr ≈ 6%). Reproduce: `research_history --sections funding`.
- **The constant-$ tent is a funding-level effect as much as a sequencing one.** The default household is generously funded (gap ≈ 2.3% of the expected balance), so a spender capped at the target has little use for upside. Tightening the plan removes the iid tent without any sequencing:

| savings / contrib | gap ÷ expected balance | tent | best constant | CE | full-path shortfall |
| --- | --- | --- | --- | --- | --- |
| $300k / $30k | 1.8% | 40% | 40% | $59,915 | 0.2% |
| $200k / $20k (default) | 2.3% | 50% | 70% | $58,107 | 2.6% |
| $150k / $15k | 2.8% | 70% | 100% | $53,205 | 8.0% |
| $120k / $12k | 3.3% | 100% | 100% | $47,710 | 14.3% |
| $100k / $10k | 3.9% | 100% | 100% | $43,013 | 22.1% |

(5-year steps, recommender; tent is the 5-year-block minimum.)

### 2c. Per-age optimal glide — accumulation-horizon sweep (iid)

γ = 4, 30y retirement. Same columns.

| Spending | Accum. years | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE | AFTER | CE income | Deplete |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| constant $ | 20y | 100 | 96 | 80 | 80 | 80 (@55) | 100 | Falling | Falling | $48,640 | 14.6% |
| constant $ | 30y | 100 | 78 | 40 | 50 | 30 (@67) | 100 | Falling | Rising | $58,089 | 2.6% |
| constant $ | 40y | 40 | 62 | 30 | 40 | 40 (@75) | 100 | Falling | Falling | $59,804 | 0.4% |
| semi-flex 50% | 20y | 100 | 100 | 100 | 100 | 100 (@55) | 100 | Flat | Flat | $59,997 | 3.4% |
| semi-flex 50% | 30y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $79,467 | 0.5% |
| semi-flex 50% | 40y | 100 | 100 | 100 | 100 | 100 (@75) | 20 | Flat | Flat | $103,033 | 0.1% |
| flexible 100% | 20y | 100 | 100 | 100 | 100 | 100 (@55) | 100 | Flat | Flat | $58,619 | 0.0% |
| flexible 100% | 30y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $81,023 | 0.0% |
| flexible 100% | 40y | 100 | 100 | 100 | 100 | 100 (@75) | 100 | Flat | Flat | $110,375 | 0.0% |

Longer accumulation is the funding lever again: a 40-year saver is so over-funded for a $40k gap that the constant-$ optimum holds only 30–60% equity even early on (depletion 0.4%), while a 20-year saver stays near 80–100% (depletion 15%). Flexible savers stay at 100% regardless of accumulation length. (The semi-flex 40y `end = 20` is a weak-gradient final year, not advice.)

### 2d. Risk-aversion sensitivity (iid, 30y + 30y)

| Spending      | γ   | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE  | AFTER  |
| ------------- | --- | ----- | -------- | ------- | ---- | ---------- | --- | ------- | ------ |
| constant $    | 2   | 100   | 77       | 50      | 60   | 40 (@67)   | 100 | Falling | Rising |
| constant $    | 4   | 100   | 78       | 40      | 50   | 30 (@67)   | 100 | Falling | Rising |
| constant $    | 8   | 100   | 76       | 50      | 60   | 40 (@67)   | 100 | Falling | Rising |
| flexible 100% | 2   | 100   | 100      | 100     | 100  | 100 (@65)  | 100 | Flat    | Flat   |
| flexible 100% | 4   | 100   | 100      | 100     | 100  | 100 (@65)  | 100 | Flat    | Flat   |
| flexible 100% | 8   | 100   | 93       | 80      | 80   | 70 (@66)   | 90  | Falling | Flat   |

The **constant-$ tent is invariant across risk aversion**, and the reason is structural, not a coincidence of taste. With consumption capped at the target, ~99% of simulated retirement years sit _exactly_ at the target and ~1% at the guaranteed-income floor (very few in between). Expected utility is then ≈ constant − [u(target) − u(floor)] × E[discounted shortfall years], so **every** increasing utility ranks allocations the same way — by expected shortfall years; γ only rescales the CE level. In the recommender the best constant weight is identical for γ = 1, 2, 4, 8 and each γ's glide scored under another γ differs by ≤ ~$7/yr. γ starts to matter once spending flexes (flexible γ = 8 above pulls off the corner; at semi-flex γ = 8 moves the best constant weight from 100% to 60%). The web app's γ input now says this at flexibility 0.

### 2e. Shape value — is the glide actually worth anything? (iid, out-of-sample)

Re-scored on an **independent** shock draw. CE = certainty-equivalent annual retirement consumption. `opt ret / 100 acc` keeps the optimal retirement glide but forces flat 100% in accumulation; `best flat` is the single constant weight that maximizes CE on a separate **selection** draw, then scored on the same independent draw as the others.

| Spending | Ret. horizon | optimum | opt ret / 100% acc | flat 100% | best flat (w\*) | **glide vs best-flat** |
| --- | --- | --- | --- | --- | --- | --- |
| constant $ | 30y | $58,098 | $57,582 | $57,517 | $57,896 (70%) | **+$202** |
| constant $ | 40y | $55,434 | $55,139 | $55,098 | $55,153 (90%) | **+$281** |
| constant $ | 50y | $53,038 | $52,890 | $52,909 | $52,909 (100%) | **+$129** |
| semi-flex 50% | 30y | $79,388 | $79,388 | $79,388 | $79,388 (100%) | $0 |
| semi-flex 50% | 40y | $77,213 | $77,213 | $77,213 | $77,213 (100%) | $0 |
| semi-flex 50% | 50y | $74,093 | $74,093 | $74,125 | $74,125 (100%) | −$32 |
| flexible 100% | 30y | $80,945 | $80,945 | $80,945 | $80,945 (100%) | $0 |
| flexible 100% | 40y | $79,465 | $79,465 | $79,465 | $79,465 (100%) | $0 |
| flexible 100% | 50y | $78,238 | $78,238 | $78,238 | $78,238 (100%) | $0 |

Two readings, both important:

- **The glide _shape_ is a rounding effect.** Over the best single flat weight it is worth **≤ ~$280/yr (~0.5%)** for constant-$ and nothing once spending flexes. This is Estrada's "glidepath illusion."
- **The _level_ matters less than it did.** For constant-$ at a 30-year retirement the optimum beats **flat 100%** by ~$580/yr (1%); at 40–50 years flat 100% is within ~$130–340/yr of the optimum. Holding 100% equity in accumulation is mildly dominated for a rigid-spending, no-bequest, well-funded retiree — not strongly.

### 2f. The forward-block pooled scenario — the tent largely disappears

Both interfaces offer **forward-block pooled** as the historical-sequencing scenario mode. Re-running the §2b–§2e scenarios under that engine (JST single-country sequences affine-rescaled to the forward CMAs, then stationary-block-bootstrapped; per-age glide; γ = 4) changes the constant-$ answer qualitatively. The decade-scale equity mean reversion forward-block preserves (VR(10y)≈0.91, arithmetic — see §4; blocks averaging 10 years carry autocovariance up to roughly that horizon, attenuated beyond it) lets a high-equity path recover in time, so the iid derisking incentive mostly evaporates.

**Retirement-horizon sweep (acc = 30y).** Compare directly to §2b (recommender, `interval=1`, 15,000 paths).

| Spending | Ret. horizon | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE | AFTER | CE income | Deplete |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| constant $ | 30y | 100 | 97 | 100 | 75 | 75 (@65) | 100 | Flat | Rising | $57,814 | 2.2% |
| constant $ | 40y | 100 | 99 | 100 | 95 | 95 (@65) | 100 | Flat | Flat | $55,911 | 3.6% |
| constant $ | 50y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $54,188 | 4.8% |
| semi-flex 50% | 30y | 100 | 100 | 100 | 100 | 100 (@65) | 0 | Flat | Flat | $80,960 | 0.4% |
| flexible 100% | 30y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $84,038 | 0.0% |

**Shape value, out-of-sample (compare §2e).** The recommender's own independent-evaluation CE for the optimized glide vs the best single constant weight:

| Spending   | Ret. horizon | optimum | best flat (w\*) | **glide vs best-flat** |
| ---------- | ------------ | ------- | --------------- | ---------------------- |
| constant $ | 30y          | $57,814 | $57,829 (100%)  | **−$15**               |
| constant $ | 40y          | $55,911 | $55,922 (100%)  | **−$11**               |
| constant $ | 50y          | $54,188 | $54,188 (100%)  | $0                     |
| semi-flex  | 30y          | $80,960 | $80,960 (100%)  | $0                     |
| flexible   | 30y          | $84,038 | $84,038 (100%)  | $0                     |

Differences of this size (±tens of $/yr on a ~$55k CE) are within Monte Carlo sampling error — read them as "≈ $0", not as the flat weight genuinely beating the glide. (The semi-flex `end = 0` is a weak-gradient final year.)

**What changed from iid:**

- **The constant-$ accumulation path goes flat ~100%**, not falling to a 78% average. Equity at retirement is **75–100%** (iid: 50–70%), and the residual "tent" bottoms at **75–100%** (iid: 30–70%) — a shallow dip, not a bond tent.
- **Best-flat is 100% in every cell** (iid constant-$: 70–100%), and the **glide is worth ≈ $0** over it. The §2e "a 30-year retiree should hold ~70%, not 100%" reading is **specific to iid**; under forward-block, **flat 100% wins** and the glide shape adds nothing measurable.
- **CE income is essentially unchanged** ($57.8k vs iid $58.1k at 30y) — the sequence model barely moves the achievable welfare; it moves the _allocation that achieves it_.

This is ACO's flat-~100% accumulation, reproduced on our own CMAs once historical sequencing is restored (§3a). The cost of the higher equity shows up as **depletion risk** (2–5% for constant-$, rising with horizon), which the recommender still reports. **World vs pooled.** The mode factorial (`research_history --sections matrix`, 30y+30y, 5y steps) — whose "(world)" cells earlier versions silently ran on the pooled dataset — now shows that **sequencing, not pooling, is what moves forward-block to 100%**: forward-block lands at 100% on _both_ the world average (CE $58.4k) and the pooled panel ($57.8k), against iid's 70%. Pooling matters for _raw_ history instead: raw historical-block reaches 100% and the highest CE ($59.7k) on the diversified world series but only 95% and $45.7k on single-country sequences, whose lower realized returns and country-level disasters the forward rescale removes.

**Robustness: block length.** The flip does not hinge on the L = 10 default. Re-running the constant-$ 30y+30y lifecycle (forward-block pooled, 5y steps) across average block lengths:

| Avg block | best flat | acc. avg | tent |
| --------- | --------- | -------- | ---- |
| 1y        | **75%**   | 79       | 70   |
| 3y        | 100%      | 97       | 75   |
| 5y        | 100%      | 97       | 90   |
| 10y       | 100%      | 100      | 85   |
| 20y       | 100%      | 98       | 85   |
| 40y       | 100%      | 100      | 80   |

Best-flat is 100% for every L ≥ 3; only L = 1 — which destroys sequencing and reduces to an iid resample of history — reverts to the interior-weight tent. The transition sits between 1y and 3y blocks.

**Robustness: which channel flips it.** A factorial ladder on the same scenario isolates what forward-block adds over iid (each cell = best flat weight): (a) iid-mc **70%**; (b1) synthetic bivariate normals at the forward anchors with the **curve-implied** stock/bond correlation (ρ≈0.48) **70%** — reproducing (a); (b2) the same with the **historical** pooled correlation (ρ≈0.29) **60%**; (c) the rescaled history's non-normal marginal shapes sampled iid **80%**; (d) block-sampling **equity only** (bonds shuffled) **50%**; (e) block-sampling **bonds only** (equity shuffled) **70%**; (f) the full joint sequence structure (the full forward-block engine) **100%**. No single channel produces the flat-100% answer; it emerges only from the **joint** sequence structure, where bond persistence (VR(10y)≈2.7) makes long bond holdings risky at the same time as equity's decade-scale reversion (VR(10y)≈0.91) makes high equity recoverable. Two corrections to earlier readings of this ladder: the iid curve already embeds ρ≈0.48, so the historical correlation _lowers_ correlation rather than adding it; and correlation is **not** immaterial — moving ρ from 0.48 to 0.29 moves the optimum 10pp. (Equity blocks alone still _deepen_ the tent: history's short-run momentum, VR(2y)≈1.1, raises near-horizon equity risk while iid-shuffled bonds stay safe.) Reproduce both: `python3 -m analysis.glide_path.research_history --sections blocks channels --accum 30 --retire 30 --savings 200000 --contrib 20000 --interval 5 --paths 8000`.

**Robustness: era and country cuts.** Same scenario with the history restricted before rescaling (the forward anchors are unchanged, so only the sequencing pattern differs). Variance ratios are on **arithmetic** returns — the basis the engine samples, and invariant to the forward rescale. (Earlier versions used log returns, where Germany's 1923 bond year at −99.99999% — log ≈ −20.7 — and a handful of other hyperinflation years dominated the variance and pulled the pooled bond VR down to 1.70.) The bond null column is the mean and 5th–95th percentile of VR(10y) under a within-segment permutation: short cuts have a null below 1, so compare against it, not against 1.

| History cut | bond VR(10y) | bond iid-null | bill VR(10y) | equity VR(10y) | best flat | CE at best vs 100% |
| --- | --- | --- | --- | --- | --- | --- |
| full 1871–2020 | 2.66 | 1.00 [0.87, 1.15] | 3.29 | 0.91 | **100%** | — |
| post-1950 | 2.21 | 0.94 [0.78, 1.09] | 4.97 | 0.91 | **100%** | — |
| ex Germany + Japan | 2.54 | 0.99 [0.85, 1.13] | 3.63 | 0.94 | **100%** | — |
| stable six¹ | 1.92 | 0.96 [0.77, 1.19] | 3.23 | 0.73 | 90% | +0.1% |
| 1990–2020 (inflation-targeting era) | **0.58** | 0.82 [0.61, 1.08] | 3.85 | 0.69 | **50%** | +0.4% |

¹ USA, UK, Canada, Australia, Switzerland, Sweden — no hyperinflation, occupation, or market closure.

The joint structure is **not** a Germany/Japan disaster artifact — bond persistence is essentially unchanged when they are dropped (2.54 vs 2.66). It is somewhat _weaker_ in the stable-six cut (1.92, together with the strongest equity reversion), which is where best-flat first comes off 100% (to 90%). (Earlier versions read the stable-six and ex-Germany+Japan cuts as _stronger_; that was the log-return outlier artifact.) It **is era-dependent for bonds**: in the 1990–2020 cut, bond returns flip from persistent to mean-reverting (VR(10y) 0.58, below that cut's iid-null 5th percentile of 0.61 — largely the secular rate decline), the stock/bond correlation drops to ≈0, and the optimizer returns the interior bond tent. **Bills do not flip with bonds** — they stay strongly persistent in _every_ cut (VR(10y) 3.2–5.0) and are _most_ persistent precisely where bonds mean-revert (post-1950 4.97, 1990–2020 3.85). The reason the era that fixed long bonds left bills untouched: bonds' 1990–2020 mean reversion is the one-off duration bull (a falling-rate price tailwind that bills, having no duration, never received), while bills' persistence is the slow-adjusting nominal rate lagging realized inflation — a low-vol disinflation just turns that into a smooth, persistently positive real-carry drift (bill vol falls to 2.4% in that cut). **Short is not safe-from-persistence in any era; only inflation-linked is** (§2g's bond-menu finding, confirmed against the empirical short asset across every era cut). Three caveats on that cut: it is a single 31-year global regime (~16 cross-correlated copies of one sample path); its bond mean reversion is substantially the one-off duration bull; and it ends in 2020 — excluding 2021–22, the one inflation-targeting-era episode that looked exactly like the long-sample joint structure (persistent real bond losses, equity recovery). Every cut's CE-vs-flat-weight curve is shallow near the top: across 70–100% equity the CE regret stays ≤ ~2% in every cut (§7.3), though dropping to 50% costs up to ~5% in the full-sample cuts — the era choice moves the _allocation_ answer far more than the _welfare_ answer.

---

### 2g. The bond menu — is flat-100% about equity, or about the only bond being long-nominal?

> **In one paragraph.** Flat-100% is a verdict on _long nominal bonds_, not on equity. Swap the bond leg for a real, short-duration asset and the optimum drops from 100% to **~50% equity** — the reachable figure, what a short-TIPS ETF (XSTH) delivers. A further drop to ~15% needs an idealized hold-to-maturity _ladder_ no Canadian retail product offers, so read 15% as a lower bound on equity. The driver is **persistence, not amplitude**: nominal bonds' real returns compound bad (inflation) decades (VR(10y)≈2.7), and only _inflation linkage_ — not short duration — removes that. We test this by holding the bond's mean/vol fixed and varying only its persistence and correlation, check it against the empirical bill series and live TIPS-ETF data, and map it to the buyable Canadian menu below. The whole result is regime-conditional: it holds in persistent-inflation regimes and reverses in the 1990–2020 disinflation cut, which is why the real asset is best read as a _hedge across regimes_, not a free lunch.
>
> **Practitioner takeaway** (not advice). Real, short-duration is the high-value add the two-asset product can't express. In Canada: **XSTH** (short US TIPS, CAD-hedged) is the closest buyable proxy — short duration, US-CPI basis risk; **XRB** (Canadian RRB ETF) matches Canadian CPI but is long-duration; a **GIC/bill ladder** fixes drawdown but not inflation persistence. None is the idealized short-domestic-real ladder (Canada stopped issuing RRBs in 2022). Without a real asset, for the sequence-hedge role: GIC ladder > XSB > ZAG, all on the amplitude axis only.

The rest of this section is the evidence behind that summary: (1) the menu experiment; (2) whether a real-world short asset is really VR=1 — the empirical bills check; (3) the persistence-vs-amplitude axes that result implies; (4) the live TIPS-ETF data confirming the buyable proxy; (5) the Canadian product menu; (6) regime conditionality.

**(1) The menu experiment.** The channel factorial says the flip is driven by what history does to the _bond_ leg, which raises the question: is flat-100% about equity's merit, or about the only modeled alternative being long nominal bonds? Replacing the bond leg with a synthetic VR=1 real asset (iid, zero equity correlation) while equity keeps its full forward-block sequencing (30y+30y constant-$, 5y steps):

| Non-equity asset                                                      | best flat | CE at best |
| --------------------------------------------------------------------- | --------- | ---------- |
| a) nominal bonds, joint structure (forward-block)                     | **100%**  | $57.8k     |
| b) **buyable real ETF proxy**: same mean/vol (1.56%/5.27% real), VR=1 | **50%**   | $59.3k     |
| c) idealized short-TIPS _ladder_ (1.56% real, 2% vol)                 | 15%       | $59.9k     |
| d) idealized ladder at 2.0% real, 2% vol                              | 10%       | $60.0k     |

Cell (b) is the decisive one: it holds the bond's mean **and** vol constant and removes its sequencing and its (+0.29) equity correlation — and the optimum collapses from 100% to 50% while CE _rises_ ~$1.4k/yr. **The flat-100% result is a verdict on long nominal bonds, not a celebration of equity.** (Earlier versions listed the buyable proxy as a separate cell (d) that was the identical computation to (b); it is now one row.) The real cells then split a property the doc previously conflated. Cell (b) is a real (VR=1, zero-correlation) leg at the _full_ short-bond vol and lands at 50%; cell (c) keeps the real linkage but additionally suppresses vol to 2%, and only then does the optimum reach 15%. That 2%-vol assumption is the _ladder_ property — hold-to-maturity pull-to-par, where terminal real wealth is locked at purchase and interim price marks don't matter — **not** a property of being short or being inflation-linked. The 100%→50% jump is the **persistence** axis (inflation linkage, plus dropping the equity correlation); the further 50%→15% is the **amplitude** axis (ladder vol suppression). They are separable, and a Canadian retail investor can buy the first but not the second. (Raising the ladder's real yield to 2.0%, cell (d), pushes the idealized optimum further still, to ~10% — the **return** axis — but that stacks an optimistic yield on top of the unreachable ladder vol.)

So the menu verdict is **~50% equity, not 15%**: cell (b)'s 50% is the reachable figure (a real asset at full short-bond vol); cell (c)'s 15% needs the ladder's hold-to-maturity vol suppression, unreachable in retail — the ETF-vs-ladder gap, not RRB discontinuation, is the binding constraint (it applies wherever real bonds trade only as funds). The product's two-asset candidate set cannot express any of this; it is the most consequential menu limitation (§7). The buyable Canadian menu is mapped in step (5). Reproduce: `--sections menu`.

**(2) Is the synthetic VR=1 leg realistic? The empirical short asset says short helps but is not enough.** Cells (b)–(d) assume the alternative asset is mean-reverting (VR=1 or a clean real ladder). That is a property of being _inflation-linked_, not of being _short_. JST carries an actual short asset — rolling short-term government **bills** (`bill_rate`, deflated by CPI) — so the assumption can be checked against history rather than asserted. The empirical short asset is **more** persistent than long bonds, not less:

| Asset (pooled, real)       | vol   | VR(2y) | VR(5y) | VR(10y)  | VR(15y) |
| -------------------------- | ----- | ------ | ------ | -------- | ------- |
| equity                     | 22.3% | 1.08   | 1.02   | 0.91     | 0.87    |
| long government bonds      | 11.8% | 1.33   | 2.01   | **2.66** | 2.90    |
| short government **bills** | 8.1%  | 1.50   | 2.52   | **3.29** | 3.53    |

(Arithmetic-return basis; see the §2f note on why log-return VRs were outlier-dominated.) Bills have ~no _price_ risk, yet their _real_ return carries decade-scale persistence above long bonds' (VR(10y) 3.29 vs 2.66 pooled; 5.04 vs 3.71 world; 3.77 vs 2.23 ex-disasters — bills ≥ bonds in every cut). The mechanism: the **nominal** bill rate is the stickiest series in the dataset (VR(10y)≈8 — a slow-moving policy rate, near a random walk in levels) and does not keep up with clustered inflation, so the **real** bill return bleeds through hot-inflation decades. (Inflation's own VR is not a reliable number here — hyperinflation years dominate it on either basis: ≈2.6 in logs, ≈1.0 in levels.) The nominal rate does not keep up with inflation year-to-year, so real bills bleed in the same decades long bonds do — the slow-bleed mechanism is **unexpected inflation, not duration**. This is the empirical anchor under the menu result, and the engine confirms it directly: swapping the long-bond leg for JST's real bills rescaled to 0.75% real / 2% vol but **keeping their own historical persistence** (`--sections bills-block`) leaves the optimum at **100%** (CE $57.6k), while the same bills made iid (VR=1) give 45%. A real-world _short nominal_ ladder does **not** collapse the optimum the way cell (c) does. It takes short **and inflation-linked** — a property no nominal instrument has — to deliver the VR=1 leg, which is precisely why an idealized short-TIPS/RRB ladder, not a bill ladder, is the asset that flips the answer.

**(3) This is not "short duration is bad" — short fixes a different axis.** A safe asset can fail on two independent dimensions, and VR measures only the second:

- **Amplitude** — how _deep_ a bad spell goes (vol, drawdown size). Set by **duration**. A rate shock marks a long bond down ~15% (long TIPS lost ~12% in 2022); a bill barely moves.
- **Persistence** — whether a bad spell _compounds over a decade or fades_ (VR). Set by **inflation linkage**, not duration. A nominal real return inherits inflation's autocorrelation regardless of maturity.

On amplitude, **short is strictly better** and it is the cheapest real risk to cut: bill vol runs below bond vol in every cut (8.1% vs 11.8% pooled; 2.4% vs 9.4% in 1990–2020), with no 2022-style crash. The bills result does **not** say short bonds are a poor holding — it says short alone leaves the _persistence_ axis open. The cells stack on these two axes:

| Asset             | amplitude (vol / drawdown) | persistence (VR) |
| ----------------- | -------------------------- | ---------------- |
| long nominal      | bad                        | bad              |
| **short nominal** | **good**                   | still bad        |
| short + real      | good                       | good (VR≈1)      |

So short nominal (a plain GIC/bill ladder) is a genuine upgrade over long nominal bonds — shallower and faster-recovering — but a hot-inflation decade still erodes it slowly and one-directionally. Only inflation linkage closes the second axis. One reading caveat: VR>1 flags persistence in _either_ direction, and a _persistently positive_ real carry (e.g. the 2.4%-vol disinflation drift that gives 1990–2020 bills VR(10y)=3.85) scores high without being a danger. The danger is only the persistent _negative_ run — a hot-inflation decade like the 1970s — which is why the full-sample and post-1950 cuts (which contain it) are the ones that matter for sizing a real-asset slice. Reproduce: `--sections vr` on the same `research_history` command (now prints a `bills` row).

**Scope: "short beats long" is a _tent_ finding, not a permanent-allocation one.** The amplitude preference above is conditional on the bond's job here — a _temporary_ sequence-risk hedge protecting the wealth handed to early retirement, held over a short window. For that job short duration wins: you don't need the term premium over a short hold, and a near-term liability can't afford a deep drawdown. It does **not** follow that short beats long (or aggregate) for an investor holding a _permanent_ constant-weight bond sleeve and **not** using the bond to protect a specific near-term draw. That holder faces a different trade and the optimizer here doesn't speak to it (there is no single sequence to protect): over a lifelong hold the term premium compounds (short nominal has run roughly _negative_ real in recent data, intermediate/long positive), and longer duration supplies the equity-crash convexity short bonds lack — long government bonds rally in a _deflationary_ crash (2008, 2020) precisely when equities fall. The catch is that this convexity is itself regime-conditional: in an _inflationary_ selloff (2022) long bonds crash _with_ equities and post equity-sized drawdowns (20y+ Treasuries fell ~−48% peak-to-trough), so the stock/bond correlation that makes them a hedge flips sign with the regime — the same monetary-regime dependence that governs the rest of this note. Rough default for a permanent _nominal_ sleeve: aggregate/intermediate duration is the term-premium-vs-drawdown sweet spot, long only for a deliberate rebalancing-harvest strategy that wants the volatility, short for a near-term liability — and none of the three fixes inflation, which is still the argument for putting part of any permanent sleeve in a real asset.

**(4) Does a real-world TIPS _ETF_ actually deliver VR≈1? Live fund data says yes — mostly.** Cells (b)–(d) treat the inflation-linked leg as clean VR=1. A TIPS _ETF_ is not a ladder: its real return = inflation accretion (VR≈1) **+** real-yield repricing (persistent, and never extinguished by maturity because the fund rolls perpetually). So the VR=1 assumption is, in principle, optimistic for the buyable instrument. We checked it against the actual funds — VTIP and STIP (US short-TIPS ETFs, XSTH's siblings), deflated by US CPI, 2012–2025 — alongside short Treasuries (SHY/VGSH) over the same window, which **includes the 2021–23 inflation shock**:

| Real series (US, 2012–25)   | real μ/yr | VR(2y) |
| --------------------------- | --------- | ------ |
| VTIP (short TIPS ETF)       | −0.45%    | ~1.1   |
| STIP (0–5y TIPS ETF)        | −0.51%    | ~1.6   |
| SHY / VGSH (short Treasury) | −1.3%     | ~4.8   |

Two readings. (1) The repricing leg _is_ real — short-TIPS and short-Treasury real returns correlate ~0.6 (shared real-rate factor), so the ETF is not an independent VR=1 asset. (2) But the accretion leg dominates: TIPS VR(2y)≈1.1–1.6 sits next to the iid null, **far** from short nominal's ~4.8, and TIPS earned **+~0.9pp/yr real** over short Treasuries _through_ the inflation shock. Putting VTIP's measured persistence (annual AR(1) φ≈0.13, i.e. VR(2y)≈1.13) through the optimizer at the menu-cell-(b) marginals with forward-rescaled equity moves the best constant weight only ~5pp (55% vs 50% at φ=0) — not the ~50pp that separates VR=1 from the nominal corner. (Earlier versions of this check accidentally used raw, un-rescaled historical equity.) **The repricing objection is real but second-order: a short-TIPS ETF keeps most of the idealized real asset's tent benefit and does _not_ collapse to short-Treasury behaviour.** (Caveat: φ≈0.13 is 13 annual observations — a wide CI; read "mildly persistent, not 4.8," not a precise point.) Reproduce: `--sections tips-etf` (`--tips-mean`/`--tips-vol`/`--tips-phi`).

**(5) What a Canadian can actually buy — and the constraint that bites.** The real-asset slice is implementable in Canada, but not in its idealized form. The buyable menu, mapped onto the two axes:

| Product (CAD investor) | amplitude (duration) | persistence (CPI link) | residual |
| --- | --- | --- | --- |
| **XSTH / ZTIP.F** (short US TIPS, CAD-hedged) | good (0–5y) | good — but **US** CPI | CPI basis vs CAD liability |
| **XRB** (Canadian RRB ETF) | **bad (~13–15y)** | good — **Canadian** CPI | 2022-style drawdown (XRB ≈ −14%) |
| GIC / bill ladder | good (HTM, no marks) | **none — nominal** | persistence axis open |

The hard constraint: **no product offers short duration _and_ Canadian CPI.** Canada stopped issuing RRBs in 2022 and the outstanding ones are long-dated, so a short _domestic_ real ladder does not exist. XSTH buys amplitude at the cost of US-CPI basis risk; XRB buys CPI-match at the cost of long-duration amplitude (and partial rate-bull/deflation-hedge behaviour like long nominal bonds). For the sequence-hedge role this section is about, **XSTH is the better fit** (amplitude is the cleaner risk to cut, and CAD/US CPI correlate ~0.7–0.8); XRB is the better _pure_ Canadian-CPI hedge for a high-drawdown-tolerance holder; a blend approximates the unavailable short-domestic-real asset.

**(6) Regime-robustness — why this is a hedge, not a free lunch.** The menu result is itself regime-conditional, and the same monetary-regime judgment that governs flat-100% governs the value of TIPS. In the **persistent-inflation** regime (full sample, post-1950, the 1970s) nominal bonds bleed (VR>1) and TIPS earns its keep. In the **disinflation + duration-bull** regime (1990–2020, bond VR(10y)=0.58) nominal bonds already mean-revert and recover, the interior tent returns, and TIPS is largely _redundant_. So the case for the real asset is not "it beats bonds" but "it is the one safe asset adequate in **both** regimes" — it dominates the regime _bet_ a nominal holder is otherwise forced to make. (The 1990–2020 mean reversion is substantially the one-off duration bull — rates 8%→0%, unrepeatable from today — and bills stayed VR>1 even then; see the era table in §2f and the caveats in §4.)

---

## 3. Does this validate or reject ACO and ERN?

| Claim | Verdict (iid default vs forward-block scenario) |
| --- | --- |
| **ACO:** ~100% equity, flat across life | **Validated under the forward-block scenario, and under iid conditional on flexible spending.** With flexible spending, flat ~100% is optimal in both models. With _rigid_ spending: under **iid** it is mildly _not_ optimal at a 30-year retirement (a ~70% derisking tent beats flat 100% by ~$580/yr, 1%) and nearly optimal at 40–50 years (within ~$130–340/yr); under the **forward-block scenario** the tent collapses and **flat ~100% wins** (§2f) — ACO's result reproduced on our smaller 3.25pp (geometric) premium. |
| **ERN / Kitces–Pfau:** rising equity glide in retirement | **An iid, rigid-spending shape — and shown to be sequence-risk, not valuation.** The derisk-then-rise glide emerges under pure iid (no CAPE>20 needed) but **largely vanishes under the forward-block scenario** (§2f), because real mean reversion removes the no-recovery premium that creates it. ERN's specific claim — that the glide _raises the SWR_ — does **not** reproduce even under iid (§2a): it only ties the best flat weight. |
| Both: beat the conventional **declining** (TDF) glide | **Direction agreed, magnitude tiny.** A monotone-declining retirement glide is dominated in every cell — but the glide _shape_ is worth ≤ ~0.5% of CE under iid and **≈ $0 under forward-block** (§2f). The spending rule and the equity _level_ dwarf it. |

### 3a. Reconciling our constant-$ profile with ACO's

ACO's constant-spending optimum stays **flat ~100% through accumulation** and dips only **at retirement**; ours (iid, default household) **falls through accumulation** to a tent at retirement. Same tent _location_, different accumulation _approach_. The gap is not a method artifact — both are non-parametric, per-age optima — it is the assumptions:

1. **Wasted upside vs catastrophic downside (no bequest + capped spending).** A constant-$ retiree with bequest weight 0 gets **zero** marginal utility from wealth above what funds the fixed floor (you can't spend it, you leave nothing), but **huge** negative utility from landing low (depletion). That asymmetry says: don't carry the fat right tail of a 100%-equity accumulation into retirement — derisk so the wealth you hand over is _tight_, not _high-mean_. ACO's utility still values terminal wealth, so the upside isn't wasted and 100% accumulation pays.
2. **Premium + mean reversion.** ACO's realized history carries a higher equity premium and multi-decade mean reversion, so a 100% accumulation almost always recovers in time — cheap insurance to stay aggressive. **Pure iid removes that recovery guarantee**, so the sequence protection of derisking is worth more under iid than in history.

**Both channels are measured, and both are strong.** Restoring the historical sequencing — without touching the bequest motive or the premium — is exactly what the **forward-block pooled** scenario does, and it moves our constant-$ accumulation path from iid's _falling-to-78%-average_ back to **flat ~100%**, matching ACO (§2f). But channel (1) is not secondary: it scales with how over-funded the household is, and under plain iid the tent disappears once the gap is ≳3.3% of the expected retirement balance (§2b funding sweep — best constant 40% at 1.8% funding, 70% at the default 2.3%, 100% from 2.8%). The default household (gap ≈ 2.3% of its balance) is deep in the "wasted upside" regime. So the iid tent is the product of _no recovery_ **and** _a generously funded, capped spender_; removing either one gets you to ACO. A bequest or terminal-wealth motive would act on channel (1) directly. Two qualifiers: the channel factorial (§2f) shows the flip is a **joint** property of the historical process — bond persistence degrading long bond holdings at the same time as equity's decade-scale reversion de-risks high equity; neither alone, nor the stock/bond correlation, nor the fat-tailed marginal shapes, reproduces it. "The missing recovery" is therefore shorthand for that joint structure, not a single equity-side mechanism. And because JST and ACO's panel draw on largely the **same developed-market historical episodes**, reproducing ACO's flat-100% here is _consistency_, not independent confirmation. The honest, forward-block conclusion for constant-$ is therefore **flat ~100% with a shallow dip near retirement** (§2f), with the residual cost borne as depletion risk; the iid "hold a moderate level and derisk" result (§2e) is the no-mean-reversion bound for a well-funded household, useful as a stress case but not the recommendation.

---

## 4. Caveats — what the iid baseline cannot see

The §2a–§2e sweep is iid Monte Carlo; **§2f (the forward-block scenario, offered by both interfaces)** captures historical sequence structure (equity mean reversion, bond persistence, single-country clustering) and is what flips the constant-$ result to flat ~100%. The caveats below apply to the **iid** results (§2a–§2e); the forward-block scenario already addresses the first two — they are listed here to bound the iid baseline, not the product.

- **No valuation signal / no mean reversion (iid only).** The iid sweep cannot reproduce ERN's _CAPE-conditional_ SWR boost, and (as §2f shows) overstates the constant-$ derisking incentive by assuming no recovery. The forward-block engine preserves the decade-scale equity mean reversion from JST history (~VR(10y)≈0.91) and bond persistence (VR(10y)≈2.7) in the bootstrap sequences — up to roughly the 10-year average block length, attenuated beyond it; neither the CAPE-_timing_ signal nor a tradable valuation rule is modeled in either engine.
- **The mean-reversion signal is statistically weak.** VR(10y)≈0.91 is mild, estimated from overlapping windows on cross-country-correlated series with ~150 calendar years of effective data, and we report no confidence interval; it is likely not distinguishable from VR=1 at conventional levels. The **block-length sensitivity** in §2f partly compensates: the flip is a step function of "any sequencing vs none" (flat-100% for every average block length ≥ 3y; interior tent only at 1y), not a knife-edge in the VR point estimate. Read §2f as the realistic-sequencing bracket of an iid↔historical pair, not as a settled point estimate.
- **The flip is a joint-sequencing effect, not a single clean mechanism.** The channel factorial (§2f) shows neither the historical stock/bond correlation, nor the non-normal marginal shapes, nor equity sequencing alone, nor bond persistence alone reproduces flat-100% — equity-only sequencing even _deepens_ the tent via short-run momentum (VR(2y)≈1.1). The result needs bond persistence (VR(10y)≈2.7) degrading bonds at the same time as equity's decade-scale reversion de-risks high equity. That is an empirical property of the joint historical process — coherent, but with no single-parameter knob to stress-test it against. It is also **era-dependent**: the 1990–2020 inflation-targeting cut lacks it entirely (bonds mean-revert, the optimizer returns the tent — §2f era table), though that cut is one 31-year regime that ends just before 2021–22. Whether the long-sample structure or the IT-era structure better describes the next 60 years is a monetary-regime judgment the data cannot settle; the shallow CE curves (CE regret ≤ ~2% across 70–100% equity in every cut; up to ~5% at 50%) keep the welfare cost of guessing wrong small near the top of the range.
- **Survivorship and selection.** JST covers 16 developed markets with long, usable series — markets that survived. The recoveries that drive the §2f result are partly a property of that surviving sample (the standard critique of ACO applies equally here); investors in markets that closed or were expropriated never got their mean reversion.
- **Sequencing is assumed independent of the return level.** The affine rescale shrinks the equity premium to 3.25pp (geometric; 3.83pp arithmetic) while keeping the historical sequence structure, but historical mean reversion arose from valuation cycles at the _historical_ premium. Whether the same recovery dynamics hold at a lower forward premium is an untestable maintained assumption.
- **One equity asset, our curve.** No domestic/international split, so ACO's ⅓/⅔ tilt and its diversification benefit are out of scope — we test only the _stock-vs-bond_ and _flat-vs-glide_ axes, on a 3.25pp (geometric) premium deliberately lower than ACO's US-tilted history.
- **The iid curve embeds one stock/bond correlation and no inflation risk.** The curve's vols imply ρ≈0.48 (historical pooled: 0.29), and deflating by a constant 2.1% makes iid bonds an iid _real_ asset (VR=1). That is the bond-friendliest assumption in this note (§2g); the channel ladder shows the correlation alone moves the iid optimum by ~10pp.
- **Fixed-horizon, no mortality, no bequest.** Cleaner "horizon" axis, but it omits longevity risk and survival-weighting; and bequest weight 0, together with the over-funded default household, is what drives the constant-$ accumulation derisking (§3a). A bequest motive pushes every cell toward higher equity.
- **End-of-horizon year.** With no bequest the final retirement year's allocation is either objective-neutral (flexibility 1 — ties keep the incoming weight) or a weak-gradient no-bequest optimum (flexibility < 1). It is reported as the `end` column and excluded from the `tent`; do not read it as advice.
- **CRRA utility, fixed contributions, no taxes/fees, annual rebalancing, 10pp grid.** Standard simplifications. **Read shape direction and rough magnitude, not basis points** — with CE gains of tenths of a percent, do not over-read a 40% vs 50% retirement-date knot.

---

## 5. Recommender script

The same model is exposed as a one-call recommender — [`analysis/glide_path/recommender.py`](../../analysis/glide_path/recommender.py), `recommend_glide_path(...)` — that **optimizes** (does not look up) the allocation per chosen step (`interval` = 1y, 5y, …) given your horizons, spending flexibility, guaranteed income, risk aversion, and selected return mode (including an arbitrary return/vol curve under `iid-mc`). The default return mode is `iid-mc`; `forward-block` with `dataset=pooled` is the historical-sequencing scenario. It varies equity against bonds. It first finds a coordinate-ascent glide, then scores both that glide and the best single constant allocation on an independent evaluation sample. It always returns the raw optimized glide as the schedule, plus the robust constant comparator (`flat_equity_pct` / `flat_ce_income`) so callers can recommend the flat path when it is materially better. Curve means are treated as nominal **geometric** returns (`curve_mean_basis="geometric"`, the default; pass `"arithmetic"` / `--curve-mean-basis arithmetic` for a custom curve that is already arithmetic). It returns the per-step schedule plus independent-evaluation CE income, income CV (the average within-path coefficient of variation of retirement spending), the spending level the plan implies (`initial_target_draw` = the year-1 portfolio draw, and `funding_ratio` = that draw ÷ the expected retirement balance — read these before comparing spending rules, §2b), and two depletion views: full-path depletion (`depletion`), which includes pre-retirement market luck from today, and drawdown-only depletion (`drawdown_depletion`), which starts from the deterministic (geometric, median-path) expected retirement balance. "Depletion" in both views means an **income shortfall** — at least one retirement year in which the portfolio could not fund the targeted draw — not "balance hit zero" (a year fully covered by guaranteed income has a $0 target and can never count as a shortfall); the web engine and Python recommender share this definition. With flexibility 0 and guaranteed income ≥ the target it raises `ValueError` (the allocation is undetermined). It also returns the **best single constant allocation** — the simpler alternative whose CE the glide path usually beats by only a hair (§2e) — and ships a `plot_glide_path()` helper.

`python3 analysis/recommend_glide.py --demo` sweeps **each lever across all three spending rules** under `iid-mc` (the default; pass `--mode` to sweep under another engine — under forward-block every cell is near-flat 100%) — holding every other input at its default — and writes `glide_<spending>_by_<lever>.png` (spending ∈ {`constant`, `semiflex`, `flexible`}; lever ∈ {`guaranteed`, `gamma`}) plus a `glide_by_spending.png` overview to gitignored `analysis/artifacts/glide_path/demo/`. What each lever does — and how the effect itself depends on the spending rule:

| Lever | Effect on the optimal glide (spending-dependent) |
| --- | --- |
| **Spending** (`flex`) | rigid → retirement tent; semi-flex / flexible → flat 100% (`glide_by_spending.png`). |
| **Guaranteed income** | a bigger guaranteed floor lets the portfolio derisk → **deeper, lower tent**. $0 guaranteed income is a permanent zero-income bridge: CE becomes tail-dominated, so its allocation comparison is inconclusive rather than a valid "go for broke" result (§1). |
| **Risk aversion** (γ) | higher γ → lower equity / deeper tent — but only under **flexible/semi-flex** spending; the **constant-$ allocation is γ-invariant** (consumption is ~two-valued, so every γ ranks allocations by expected shortfall years; γ only rescales CE — §2d). |

The guaranteed-income panel is the concrete, dial-able form of the §3a reconciliation: for constant-$ it moves the path between our "derisk" result and ACO's "flat ~100%."

**Additional dials** (beyond the demo matrix), all exposed on both the interactive prompt flow and the `recommend_glide.py` flag CLI:

- **Guaranteed income amount.** `guaranteed_income` is the real annual dollar amount from CPP, OAS, DB pensions, and other income paid **every** retirement year. A pre-pension bridge is out of scope. A zero amount recreates the same zero-income state and makes the CE allocation comparison inconclusive (see §1).
- **Leverage.** `max_leverage` (1.0 = none; 1.5 = up to 150% equity) lets the optimizer borrow at a **real** `borrow_cost` to hold w>1 in the all-equity portfolio (real return `w·eq − (w−1)·borrow`, vol `w·eq_vol`; a wipeout is treated as ruin). It leverages only where the risk-adjusted gain beats the borrowing drag and survives the independent-evaluation CE guard — typically early accumulation under a low γ ("lifecycle investing"). Recommendations therefore use leverage less often than the raw coordinate-ascent path when the leveraged upside comes with a fragile left tail.
- **Retirement-consumption γ, by design.** Risk aversion is applied to retirement consumption, not directly to accumulation wealth. The user's chosen γ is their preference for _stable retirement spending_ — "how hard should the optimizer avoid low spending in bad market draws?" rather than "how much equity do you want?" — and may differ from their general investment risk appetite today. Higher γ penalizes low retirement-spending outcomes more heavily across simulated market scenarios. It is distinct from spending flexibility, which sets how spending _responds_ to portfolio value. Accumulation wealth carries no direct utility, but γ still pins down the accumulation glide through how that wealth becomes retirement spending; the _declining_ glide also emerges from the contribution stream + horizon (human capital). A separate accumulation γ has almost no leverage, and a γ(age) gradient would double-count the age–risk relationship the optimizer already produces — so neither is offered.
  - _Typical values._ γ = 1 is log utility (aggressive); the literature's plausible band is ~1–10 with **2–5 the realistic center** (the ~30–40 needed to rationalize historical equity premia is the "equity premium puzzle" precisely because it is implausible). The recommender and §2 analysis sweeps use 4 as the base case. γ's effect on the glide is **spending-rule dependent**: under flexible spending a higher γ pulls equity down, but the **constant-$ tent is ~γ-invariant** (§2d) because the rigid floor — not taste — drives that shape.
- **β front-loads retirement spending; it discounts retirement years, not years from today.** The first retirement year has weight 1, and each subsequent retirement year has β times the previous year's weight (`disc[t] = β^t`, length = retirement years; accumulation is undiscounted). A β of 1 weights every retirement year equally; lower β tilts the optimizer toward funding _earlier, more active_ retirement years over later ones. Over 30 years, β of 1, 0.985, and 0.97 give the final year about **100%, 65%, and 41%** of the first year's weight.
  - _Typical values._ The default **0.985** ≈ 1.5%/yr — close to the empirical "retirement spending smile" (real spending drifts down ~1%/yr in mid-retirement, ≈ β 0.99). **0.97** ≈ 3%/yr is a strong early-years tilt; **0.95** ≈ 5%/yr (final-year weight ~23% over 30y) is a _very_ strong front-load and atypical; the floor is 0.90. The model has **no separate survival/mortality weighting**, so part of any β < 1 a household picks legitimately stands in for declining survival probability — the realistic "neutral" point sits a little below 1.0, not exactly at it.

## 6. Reproduce

```bash
python3 -m analysis.glide_path.research             # the analysis (tables + figures), ≈ 5 min
python3 -m analysis.glide_path.recommender          # interactive: prompts for your inputs
python3 analysis/recommend_glide.py --demo          # recommender showcase: 3×2 lever matrix + overview, ≈ 2 min
python3 analysis/recommend_glide.py --help          # scriptable flag CLI for a single custom recommendation

# History/mode research (one or more sections; see the module docstring)
python3 -m analysis.glide_path.research_history --sections matrix blocks channels menu tips-etf bills-block gamma curves vr regret funding \
    --accum 30 --retire 30 --savings 200000 --contrib 20000 --interval 5 --paths 8000

# Regenerate the pre-rescaled JST bundle used by the web app's forward-block engine
python3 -m analysis.glide_path.generate_bundle      # writes src/utils/glide-path/jstData.ts
```

After an interactive run, the recommender prints a copy-pasteable `analysis/recommend_glide.py` command containing the resolved inputs. The flag CLI exposes the interactive optimizer settings, including `--beta` and `--paths`, so that command reruns the same simulation and is easy to modify.

Tweak `analysis/glide_path/research.py`'s CONFIG block: `SPENDING_REGIMES` (FLEX levels), `RETIRE_HORIZONS`, `ACCUM_HORIZONS`, `GAMMA`, `WITHDRAWAL_RATE`, `GRID_STEP`, `OPT_N`/`N_FINAL`/`OPT_PASSES`. Returns/vol come from `ALLOC_ANCHORS` (= the recommender's `PWL_CURVE`, nominal geometric), mirroring [`presets.ts`](../../src/utils/glide-path/presets.ts) `DEFAULT_ALLOC_CURVE` — change them there (and here) together. Runtime ≈ 5 min (the per-age coordinate ascent is the cost).

## 7. Discussion — what we actually take away

Qualitative conclusions the quantitative sections support. Each cites its evidence; none is a new claim.

1. **The welfare surface is flat near the top; the allocation argmax is not.** Across every cut we ran — iid vs forward-block, block lengths 3–40y, era and country restrictions — the best constant weight moves anywhere from 50% to 100% equity, while the CE regret of any weight from 70% to 100% stays ≤ ~2% (§2e, §2f, item 3 below). The model is far more certain about _how little the choice costs_ than about _which choice is best_. This is why the product biases toward the simple constant allocation (§1, simplicity thresholds): the glide's measurable edge is smaller than the model's own uncertainty.
2. **The spending rule, the spending level, and guaranteed income dominate the allocation.** Moving flexibility from 0 to 1 at a 4% flexible rate raises CE by ~$23k/yr (§2b) — but most of that is **spending more** (an ~$83k first-year draw vs the $40k gap). Matched to the same initial draw, flexibility itself is worth ~$3k (fully flexible) to ~$7k (semi-flex) per year; letting each rule pick its own best spending level, flexible beats constant-$ by ~$25k ($85.4k vs $60.8k), because it can safely spend down wealth a rigid plan leaves unused. The funding level (gap ÷ expected balance) also sets the iid tent itself (§2b). Moving the equity level across 70–100% changes CE by ≤ ~$1k. A household debating "70 vs 100% equity" is arguing about the least important dial.
3. **The flat-100% recommendation is, at bottom, a monetary-regime judgment — and the default is a judgment call, not a minimax result.** The joint sequence structure that produces flat-100% (bond persistence + equity decade-scale reversion) is present in 1871–2020, post-1950, and ex-Germany+Japan, weaker in the stable-six cut, and absent-to-inverted in 1990–2020; the data cannot adjudicate which regime the next 60 years resemble (§2f era table, §4). The two engines are best read as scenario brackets — iid: "no recovery, bonds work as a real asset"; forward-block: "history's joint structure persists". Earlier versions defended iid as the **minimax-regret** default because its interior answer sat _inside_ the allocation envelope forward-block sweeps across eras. That argument used allocation distance; computing the actual **CE regret** (best CE in each regime minus CE at the weight; constant-$ 30y+30y, `research_history --sections regret`) does not support it:

   | Regime (forward-block pooled unless noted) | best | 60%   | 70%   | 80% | 90%     | 100% |
   | ------------------------------------------ | ---- | ----- | ----- | --- | ------- | ---- |
   | full 1871–2020                             | 100% | 1,673 | 931   | 479 | 184     | 0    |
   | post-1950                                  | 100% | 1,504 | 866   | 441 | 169     | 0    |
   | ex Germany + Japan                         | 100% | 1,791 | 1,064 | 563 | 227     | 0    |
   | stable six                                 | 90%  | 433   | 153   | 28  | 0       | 57   |
   | 1990–2020 (IT era)                         | 50%  | 14    | 46    | 94  | 163     | 260  |
   | iid-mc                                     | 70%  | 76    | 0     | 74  | 192     | 388  |
   | **max regret** ($/yr)                      |      | 1,791 | 1,064 | 563 | **227** | 388  |

   The minimax-regret constant weight is **~90%** (max regret $227/yr, 0.4% of CE); flat 100% is close behind ($388), and iid's own 70% has the _larger_ worst case ($1,064, 1.8%) because CE falls off faster below the optimum in the full-history cuts than above it in the 1990–2020 cut. The iid-optimized _glide_ scored in each regime has a max regret of $975. All of these are ≤ ~2% of CE, so the "flat welfare surface" point stands — but the honest rationale for an iid default is not minimax regret. It is that iid relies only on the forward marginals rather than on weakly identified, era-dependent sequencing patterns, and serves as the conservative no-recovery case. Whether the product default should instead move toward ~90% constant equity for rigid spenders is an open product decision this note does not settle.

4. **The verdict on bonds is about the menu, not the asset class — now measured, not just suspected.** The bond-menu experiment (§2g) holds the bond's mean and vol constant and removes its historical sequencing and correlation: the optimum collapses from flat-100% to 50% equity and CE _rises_ ~$1.4k/yr. That 50% is the **reachable** figure — it is what a real, short-duration ETF (CAD-hedged short-term US TIPS, e.g. XSTH) delivers, since the jump is driven by inflation linkage (the persistence axis) plus dropping the equity correlation. An _idealized_ short-TIPS/RRB **ladder** takes the optimum further, to ~15% equity, but the extra 50%→15% step comes only from the ladder's hold-to-maturity vol suppression (2% vs short-bond ~5.3%), which no Canadian retail wrapper provides — read 15% as the idealized bound, 50% as the buyable one. A real-world bill ladder that keeps its historical persistence leaves the optimum at 100%. Flat-100% is conditional on the only safe asset being long nominal bonds; a third (real, short-duration) asset is the highest-value extension to the candidate set (§4).
5. **Lifecycle-horizon historical inference runs on priors, not power.** 150 years × 16 correlated countries ≈ a handful of independent 60-year observations. The per-channel factorial (§2f) and the variance-ratio diagnostics are how we discipline the story economically; nothing here passes a formal significance bar, and the doc deliberately reports brackets rather than confidence intervals it cannot honestly compute.

## References

- ACO — Anarkulova, Cederburg, O'Doherty, _Beyond the Status Quo_ (SSRN 4590406).
- ERN — earlyretirementnow.com, SWR Series Part 20 (equity glidepaths).
- Kitces & Pfau (2014) — _Reducing Retirement Risk with a Rising Equity Glide Path_ (the bond tent).
- Estrada (2014) — _The Glidepath Illusion_ (glide shape adds little once the level is set).
- [`retirement` SWR methodology](../retirement/swr-methodology.md) — the CMAs, the iid/AR(1) decision, and the JST historical cross-check this note builds on.
