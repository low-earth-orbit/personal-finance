# Lifetime Allocation Optimizer — Methodology

Research note for the Lifetime Allocation Optimizer (`/glide-path`). It asks: **what equity weight should a household hold at each age, before and after retirement, to maximize expected lifetime welfare?**

It is written for readers who know personal finance (asset allocation, safe withdrawal rates, real versus nominal returns) but not necessarily the simulation and statistics behind the tool. Technical terms are defined in [Key terms](#key-terms). The [`retirement` SWR methodology](../retirement/swr-methodology.md) is a companion note that shares the capital-market assumptions and the historical data.

**How the answer is found.** Not by a rule of thumb such as "100 minus your age", but by simulation. A Monte Carlo optimizer tries equity weights age by age and keeps the ones that maximize expected utility of retirement consumption. The results are reported under two return models that span the plausible range:

- **iid** — each year's return is drawn independently from forward-looking assumptions (the app's default);
- **forward-block** — the same forward-looking averages, but with the year-to-year patterns of real historical sequences (the app's "Historical sequences" toggle).

## Contents

- [Summary](#summary)
- [Key terms](#key-terms)
- [1. Model](#1-model)
- [2. Results under iid returns](#2-results-under-iid-returns-the-default)
- [3. Results under historical sequencing](#3-results-under-historical-sequencing-forward-block)
- [4. The bond menu](#4-the-bond-menu)
- [5. Comparison with ACO and ERN](#5-comparison-with-aco-and-ern)
- [6. Caveats](#6-caveats)
- [7. Code and reproduction](#7-code-and-reproduction)
- [Corrections log](#corrections-log)
- [References](#references)

---

## Summary

Default household: age 35, $200k saved, $20k/yr contributions for 30 years, a $60k real retirement target of which $20k is guaranteed income (CPP/OAS/DB), a 30-year retirement, risk aversion γ = 4 and time preference β = 0.985.

1. **The return model decides whether there is a bond tent.** A _bond tent_ is a dip in equity around retirement, rising again afterwards. Under iid returns, constant-dollar spending produces one, with equity bottoming at 30–70%; the best constant weight is **70%** for a 30-year retirement and 90–100% for 40–50 years (§2b). Under forward-block sequencing the tent largely disappears and the optimum is **flat ~100% equity** (§3a).
2. **The spending rule sets the shape within either model.** Constant-dollar spending produces the tent; semi-flexible and flexible spending hold **100% equity throughout** in both models (§2b, §3a).
3. **The glide shape is worth little; the level matters more.** Out of sample, the optimized glide beats the best single constant weight by ≤ ~0.5% of certainty-equivalent (CE) income under iid and by ≈ $0 under forward-block (§2e, §3a).
4. **Funding level drives the iid tent.** The default plan's first-year withdrawal is only ~2.3% of its median retirement balance. A constant-dollar spender this well funded has little use for upside, so the optimizer protects the floor; at a ~3.3% draw the iid tent disappears (§2f).
5. **The flat-100% result is about long nominal bonds.** Forward-block's 100% depends on how long nominal bonds behaved _jointly_ with equities in history: bad decades, a 0.29 stock/bond correlation and a fat left tail. Replace the bond leg with an idealized real asset (uncorrelated with equity, independent years, same mean and volatility) and the optimum falls to ~50%. Persistence alone does not restore 100%: an uncorrelated synthetic leg as persistent as long bonds (VR(10y) ≈ 2.6) still gives 60%. Less generous assumptions about a real fund move the optimum to 55–70% (§4c). The result is also era-dependent: the 1990–2020 history gives 50% with ordinary nominal bonds (§3c).
6. **The regime choice costs little welfare.** Across era and country cuts, holding any constant weight from 70% to 100% costs at most ~2% of CE versus that regime's optimum (§3d).
7. **γ barely matters with constant-dollar spending.** Consumption is then almost always either the full target or the guaranteed floor, so every γ ranks allocations the same way: by the expected (discounted) number of years spent at the floor (§2d).

The app recommends what the selected return model's simulation produces: the optimized glide, or that model's best constant weight when it is within the simplicity thresholds in §1.5.

---

## Key terms

**Returns and simulation**

| Term | Meaning here |
| --- | --- |
| **Real return** | Return after inflation. All amounts in this note are real (today's) dollars. |
| **Geometric (compound) vs arithmetic (average) return** | The geometric return is the rate a balance actually compounds at; the arithmetic return is the simple average of yearly returns. For a volatile asset the arithmetic mean is higher by roughly σ²/2 (the _volatility drag_). Planning assumptions are quoted geometric; a Monte Carlo must draw from the arithmetic mean to reproduce them (§1.3). |
| **Monte Carlo** | Simulating thousands of possible market paths and averaging the outcomes. |
| **iid** | Independent and identically distributed: each year's return is a fresh draw that does not depend on earlier years. |
| **Sequencing** | The order in which good and bad years arrive, such as crashes followed by recoveries, or inflation decades. iid removes it. _Sequence-of-returns risk_ is the retiree's exposure to it: a crash early in retirement does more damage than the same crash later. |
| **Block bootstrap** | A way to simulate from history that keeps sequencing: paths are stitched from runs (blocks) of consecutive historical years, not single years. The _stationary_ version draws random block lengths with a set mean (here 10 years). |
| **Affine rescaling** | Shifting and stretching a historical return series to a target mean and volatility (`a + b·r`). It changes the level but keeps the series' sequencing pattern and correlations. |
| **Forward-block** | This note's historical-sequencing model: JST history affine-rescaled to the forward-looking assumptions, then block-bootstrapped (§1.3). |
| **Variance ratio, VR(q)** | Variance of q-year cumulative returns ÷ (q × variance of one-year returns). It is 1 for iid returns. |
| **Mean reversion (VR < 1)** | Bad years tend to be followed by better ones, so multi-year outcomes are _less_ dispersed than iid would predict. |
| **Persistence (VR > 1)** | Bad years tend to be followed by more bad years, so multi-year outcomes are _more_ dispersed than iid would predict. |
| **AR(1), φ** | A first-order autoregression: each year's deviation from the mean is φ times last year's plus fresh noise. φ > 0 means persistence; its long-run VR is (1+φ)/(1−φ). |

**Spending, welfare and the optimizer**

| Term | Meaning here |
| --- | --- |
| **Glide path** | The equity weight as a function of age. A **constant** weight holds one mix for life; the **best constant weight** is the single mix with the highest CE. |
| **Bond tent** | A glide path that lowers equity into retirement and raises it again afterwards, to protect the early-retirement years against sequence-of-returns risk. |
| **Gap** | The spending target minus guaranteed income: what the portfolio must fund ($60k − $20k = $40k in the default). |
| **Guaranteed floor** | Guaranteed income (CPP/OAS/DB). Consumption falls to it when the portfolio cannot pay. |
| **flex** | Spending flexibility, from 0 (constant real dollars) to 1 (a fixed percentage of the current balance) (§1.2). |
| **SWR, success rate** | Safe withdrawal rate: the highest initial withdrawal, as a share of the starting balance, that a constant-dollar plan sustains with a given success rate (share of paths that never run out). The shortfall rate is 1 − success rate. |
| **CRRA utility, γ** | Constant relative risk aversion: a dollar matters more when consumption is low, and the household dislikes a given _percentage_ gamble equally at any consumption level. γ (gamma) sets how strongly; γ = 4 is the base case, with a plausible range of ~1–10. |
| **β** | Time preference: each later year's utility is weighted by β per year (0.985), so earlier retirement years count slightly more. |
| **Certainty-equivalent (CE) income** | The guaranteed constant annual consumption the household would value the same as the risky plan. It sits below average spending because shortfalls hurt more than surpluses help. It is the headline welfare measure. |
| **Income shortfall** | A simulated path with at least one year where the portfolio could not fund the spending target ("depletion" in the code). **Full-path** shortfall simulates from today, including pre-retirement market luck; **drawdown-only** shortfall starts from the median retirement balance, as `/retirement` does. |
| **Coordinate ascent** | Optimizing one age step at a time while holding the others fixed, then cycling until nothing changes (§1.4). |
| **Common random numbers** | Scoring every candidate allocation on the same simulated paths, so differences between candidates are not sampling noise. |
| **Optimization, selection and evaluation samples** | Three independent sets of simulated paths: the glide is fitted on the first, the best constant weight is picked on the second, and both are scored on the third. Scoring on paths not used for fitting (_out of sample_) means neither can look better by fitting noise. |
| **Regret** | How much CE a choice loses versus the best choice for a given scenario. _Maximum regret_ is the worst such loss across scenarios. |

**Bonds, data and sources**

| Term | Meaning here |
| --- | --- |
| **Duration** | A bond's price sensitivity to a change in yield, in years. A 10-year bond has duration ~7–10 and swings with rates; short bonds (~2–3) barely do. |
| **Carry** | The income a bond earns from its starting yield, before any price change. |
| **Term premium** | The extra expected return long bonds earn over short ones for bearing rate risk. |
| **TIPS / RRB** | Inflation-linked government bonds: US Treasury Inflation-Protected Securities and Canadian Real Return Bonds. Their principal is indexed to CPI. VTIP (US) and XSTH (Canada, CAD-hedged) are short-TIPS ETFs. |
| **Hold-to-maturity ladder** | Individual bonds bought to mature in each year they are needed. Each rung's value at maturity (real for RRBs/TIPS, nominal for GICs) is fixed at purchase, whatever prices do in between. |
| **JST** | The Jordà–Schularick–Taylor Macrohistory database (R6): annual returns for 16 countries with both stock and bond series, 1871–2020. |
| **ACO** | Anarkulova, Cederburg & O'Doherty, whose block-bootstrap study recommends ~100% equity for life (§5). |
| **ERN, CAPE** | Early Retirement Now, a blog series on safe withdrawal rates (§5). CAPE is the cyclically adjusted price/earnings ratio, a valuation signal. |

---

## 1. Model

**In brief.** A household saves, retires and spends. Each year its portfolio is split between one equity asset and one bond asset at the equity weight for that age. The optimizer picks those weights to maximize the expected utility of retirement consumption. All amounts are real (today's) dollars.

### 1.1 Household and phases

- **Accumulation:** the starting balance plus fixed real contributions, made mid-year (a contribution earns half a year's return). Consumption while working does not depend on the allocation, so it drops out of the objective. The accumulation allocation matters only through the wealth it hands to retirement.
- **Retirement:** a fixed planning horizon, with no mortality weighting and no bequest (wealth left at the end has zero utility). Guaranteed income (CPP/OAS/DB) is paid every retirement year, and the portfolio funds the gap between the target and guaranteed income, withdrawn mid-year. A _pre-pension bridge_ (years after retiring but before guaranteed income starts, funded entirely by the portfolio) is out of scope (§1.6).

### 1.2 Spending rule

Each retirement year the portfolio withdrawal targets a blend of a constant-dollar rule and a balance-proportional rule:

```
targetₜ      = (1 − flex)·gap + flex·(withdrawal_rate · start-of-year balanceₜ)
withdrawalₜ  = min(targetₜ, what the portfolio can afford)
consumptionₜ = guaranteed income + withdrawalₜ
```

Here `withdrawal_rate` is the share of the balance a flexible spender draws (`gap` and `flex`: see Key terms).

- **flex = 0 (constant dollar):** withdraw the full gap every year until the portfolio is exhausted, after which consumption drops to guaranteed income. This is the safe-withdrawal-rate setting of `/retirement`.
- **flex = 1 (fully flexible):** spend `withdrawal_rate` (default 4%) of the current balance. Income moves with the market and the portfolio is never mechanically depleted; `target_income` is not used.
- **flex = 0.5 (semi-flexible):** half of each.

An **income shortfall** is a path with at least one year where the withdrawal fell short of the target. At flex = 1 the target is always affordable, so shortfall is ~0 by construction and risk shows up as income variability instead.

### 1.3 Returns

**Capital-market curve.** The default curve ([`presets.ts`](../../src/utils/glide-path/presets.ts) `DEFAULT_ALLOC_CURVE`, from PWL Capital and FP Canada with 2.1% inflation) lists nominal **geometric** returns and volatilities by equity weight. Monte Carlo draws need **arithmetic** means, so each anchor is converted with the exact lognormal relation

```
(1+A)² = [ (1+G)² + √((1+G)⁴ + 4(1+G)²σ²) ] / 2
```

then deflated to real (`(1+A)/(1+π) − 1`, volatility `σ/(1+π)`) and interpolated to any weight. Simulated compound growth then matches each mix's stated rate within ~1bp.

|                | Real geometric | Real arithmetic | Real volatility |
| -------------- | -------------- | --------------- | --------------- |
| 100% equity    | 4.67%          | 5.38%           | 12.3%           |
| 0% equity      | 1.42%          | 1.56%           | 5.3%            |
| Equity premium | 3.25pp         | 3.83pp          |                 |

The curve's interior volatilities imply a constant stock/bond correlation of ≈0.48. Because returns are deflated at a constant 2.1%, iid bonds carry no inflation risk: they behave like an iid real asset. Deterministic median-path balances (such as the "median retirement balance" used for drawdown-only shortfall and the funding ratio) compound the geometric rate.

**Return modes.** All four feed the same cash flows, objective and optimizer. They differ in where the yearly returns come from:

| Mode | Sequencing | Return levels (mean, volatility) | Stock/bond correlation |
| --- | --- | --- | --- |
| `iid-mc` (default) | none (iid normal) | forward curve | implicit in curve vols (≈0.48) |
| `historical-iid` | none (years resampled) | raw history | historical, paired by year |
| `historical-block` | stationary block bootstrap | raw history | historical, paired by year |
| `forward-block` (scenario) | stationary block bootstrap | history affine-rescaled to the forward 0%- and 100%-equity endpoints | historical (≈0.29 pooled) |

- **History:** real stock and long-government-bond returns from JST R6 (16 countries with both series, 1871–2020), deflated by each country's CPI.
- **Datasets:** `pooled` (the default) concatenates each country's own sequence, so a block samples consecutive years of one country. This is the sequence risk a single-country investor actually lived through. `world` averages countries within each year into one diversified series. Pooled runs accept country and year exclusions. A block never runs from one country into another or across a gap in the data; when it reaches the end of a country's run it wraps around to that country's first year.
- **Stationary block bootstrap:** each simulated year continues the current historical run with probability `1 − 1/L`, or restarts at a random year with probability `1/L`. Block lengths are therefore geometric with mean `L` (default 10 years, an annual analogue of ACO's 120 months). Figure 2 in §3 shows one simulated path.
- **Affine rescaling** (forward-block) gives each asset's historical series the forward mean and volatility. Because it only shifts and stretches each series, it leaves the year-to-year pattern (autocorrelation, variance ratio) and the stock/bond correlation unchanged, so any difference from iid comes from sequencing and return shape, not from history's return level. Only the two endpoints (100% stocks, 100% bonds) are matched to the curve; the risk of a mix in between follows from the historical correlation rather than the curve's ≈0.48.
- **Leverage:** above 100% equity the return is `w·stock − (w−1)·real borrowing cost`; a wipeout is ruin.

These historical modes are annual sequencing checks, not an ACO replication (ACO bootstraps a monthly four-asset panel, with mortality-weighted horizons and terminal wealth in the objective).

### 1.4 Objective and optimizer

- **Objective:** maximize expected Σ βᵗ·u(consumptionₜ) over retirement years, with CRRA utility `u(c) = c^(1−γ)/(1−γ)` (log at γ = 1). Base case γ = 4, β = 0.985.
- **CE income** converts that expected utility back into dollars: the constant annual consumption with the same expected discounted utility.
- **Decision variable:** the equity weight for each step of the plan. A step is a run of years held at one weight: 1 year in the §2 sweep and §3a; 5 years in the `research_history` sections (§2f, §3b–§4) and by default in the app (adjustable from 1 to 10). Candidate weights sit on a 5pp grid (10pp in the §2 research sweep).
- **Coordinate ascent:** starting from the best constant weight, the optimizer scans every candidate weight for one step with the others held fixed, keeps the best, and cycles through the steps in alternating directions until nothing moves (at most 10–12 passes in Python, 6 in the web app). No shape (flat, rising, falling) is imposed. The result is a coordinate-wise optimum, not a guaranteed global one.
- **Common random numbers:** all candidates are scored on the same simulated paths, so a comparison between two candidates is not distorted by sampling noise.

Because grids and step lengths differ between sections, a tent depth read from a 10pp, 1-year table (§2) and one from a 5pp, 5-year run (§2f, §3b) can differ by a grid step or two without any change in the underlying result.

### 1.5 Evaluation and the product recommendation

The optimizer uses three independent samples of simulated paths:

- an **optimization sample**, on which the glide is fitted;
- a **selection sample**, on which the best single constant weight is picked (picking it on the scoring paths would let it benefit from fitting their noise);
- an **evaluation sample**, on which both are scored. Every CE and shortfall figure in this note is out of sample in this sense.

**Simplicity rule (web app).** The app recommends the constant weight when it wins on CE outright, or when all three hold: it is within 3% on CE, within 0.5pp on drawdown shortfall, and within 1.5pp on full-path shortfall (`SIMPLICITY_*` in [`recommendation.ts`](../../src/utils/glide-path/recommendation.ts)). CE gaps under ~3% are inside the model's own uncertainty (glide edge ≤ ~0.5%, Monte Carlo noise ~0.3%, era regret ≤ ~2%). A check across 72 input combinations (both return modes, two seeds each) supports the 3% value. The largest glide edge was 1.7%, and the same inputs' edge moved by up to 2.3% between seeds. Any threshold of 2% or more gave the same seed-stable picks; a 1% threshold flipped one case between seeds. The shortfall gates, at several times their Monte Carlo standard error, stop the simpler pick from adding real tail risk. The Python CLI flags the constant weight when its CE beats the glide's by more than 5%. Both always report the raw optimized glide.

### 1.6 Scope limits

- **Guaranteed income is required.** With positive guaranteed income, consumption never approaches zero, so CRRA utility stays finite and the `$1` consumption floor is only a numerical guard. With zero guaranteed income (equivalently, a pre-pension bridge), a depleted year drives consumption to the floor, where CRRA utility plunges toward −∞ and swamps the average: the comparison is decided by a handful of ruined paths. The obvious fixes each break something. Raising the floor invents income the household does not have; scoring only the paths that never run out makes every γ give the same answer. The app therefore requires ≥ $10,000 of guaranteed income. Python accepts zero but reports the comparison as tail-dominated (inconclusive).
- **Undetermined allocation.** With flex = 0 and guaranteed income ≥ the target, the portfolio funds nothing and every allocation ties; both engines reject this input.
- **Final retirement year.** With no bequest, the last year's allocation is either exactly irrelevant (flex = 1) or a weak-gradient horizon effect (flex < 1). It is reported (the `end` column) but excluded from the tent and from slope classification; read it loosely.

---

## 2. Results under iid returns (the default)

**In brief.** With independent yearly returns, rigid spenders get a bond tent, and its depth depends mainly on how well funded the plan is. Flexible spenders hold 100% equity. The tent's shape is worth only about 0.5% of CE income over the best constant weight.

`python3 -m analysis.glide_path.research` runs a per-age glide (1-year steps) on a 10pp grid with 8,000 optimization paths, scored on 60,000 independent paths.

**Reading the glide tables.** Columns are equity %:

- `start`, `acc. avg`, `pre-ret`, `@ret`: equity at the first age, the accumulation average, the year before retirement, and the retirement year;
- `tent (age)`: the lowest equity in the first 15 retirement years (pre-retirement years are not included), and the age where it occurs;
- `end`: final-year equity (a weak horizon effect; read loosely, §1.6);
- `BEFORE` / `AFTER`: the slope of the accumulation and retirement segments (final year omitted);
- `CE income`: certainty-equivalent income for the optimized glide;
- `Shortfall`: the full-path share of paths with an income shortfall.

### 2a. Safe-withdrawal-rate check

Before the welfare results, a check against the familiar SWR framing: retirement only, constant dollar, the highest initial withdrawal rate with 90% success. Columns give that SWR for the best constant weight (in brackets), for 100% equity, and for a retirement glide rising linearly from 60% to 100%. The [SWR note](../retirement/swr-methodology.md) covers SWRs in depth.

| Horizon | Best constant (w\*) | 100% equity | Rising 60→100 |
| ------- | ------------------- | ----------- | ------------- |
| 30y     | **3.91%** (85%)     | 3.89%       | 3.93%         |
| 40y     | **3.31%** (95%)     | 3.31%       | 3.30%         |
| 50y     | **2.97%** (100%)    | 2.97%       | 2.93%         |

The SWR-maximizing weight is 85–100%, and the curve is flat near the top. A rising retirement glide ties the best constant weight, so it earns **no SWR premium under iid**. ERN's rising-glide effect therefore needs valuation signals or mean reversion, which iid excludes.

### 2b. Retirement-horizon sweep (30-year accumulation)

The default household (retiring at 65) with retirements of 30, 40 and 50 years, under each spending rule.

| Spending | Ret. horizon | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE | AFTER | CE income | Shortfall |
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

- **Constant dollar → a tent.** Equity falls through accumulation to a low at or just after retirement (30–70%), then rises. The cost of rigid income shows up as shortfall risk (3–7%, rising with the horizon). Longer retirements keep the tent shallower because they need more growth.
- **Semi-flexible and flexible → 100% throughout.** The cost there is income variability rather than shortfall.
- The CE gap between rows is **not** the value of flexibility; see §2f.

### 2c. Accumulation-horizon sweep (30-year retirement)

The start age stays at 35 and the retirement age moves (55, 65, 75), so the household saves for 20, 30 or 40 years with the same starting balance and contributions.

| Spending | Accum. years | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE | AFTER | CE income | Shortfall |
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

A longer accumulation acts as a funding lever. A 40-year saver is so over-funded for the $40k gap ($60k target − $20k guaranteed) that the constant-dollar optimum averages ~60% equity and dips to 30–40% around retirement (0.4% shortfall), while a 20-year saver stays at 80–100% (15% shortfall). Flexible savers hold 100% regardless.

### 2d. Risk aversion (30y + 30y)

| Spending      | γ   | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE  | AFTER  |
| ------------- | --- | ----- | -------- | ------- | ---- | ---------- | --- | ------- | ------ |
| constant $    | 2   | 100   | 77       | 50      | 60   | 40 (@67)   | 100 | Falling | Rising |
| constant $    | 4   | 100   | 78       | 40      | 50   | 30 (@67)   | 100 | Falling | Rising |
| constant $    | 8   | 100   | 76       | 50      | 60   | 40 (@67)   | 100 | Falling | Rising |
| flexible 100% | 2   | 100   | 100      | 100     | 100  | 100 (@65)  | 100 | Flat    | Flat   |
| flexible 100% | 4   | 100   | 100      | 100     | 100  | 100 (@65)  | 100 | Flat    | Flat   |
| flexible 100% | 8   | 100   | 93       | 80      | 80   | 70 (@66)   | 90  | Falling | Flat   |

**The constant-dollar tent does not depend on γ, for a structural reason.** With consumption capped at the target, ~99% of simulated retirement years sit exactly at the target and ~1% at the guaranteed floor. Expected utility is then ≈ constant − [u(target) − u(floor)] × E[discounted years at the floor]. Every increasing utility function therefore ranks allocations the same way, by expected discounted years at the floor; γ only rescales the CE level. In the recommender the best constant weight is identical for γ = 1, 2, 4 and 8, and each γ's glide scored under another γ differs by ≤ ~$7/yr. The tent bottoms for γ = 2, 4 and 8 (40%, 30%, 40%) are within one grid step of each other, inside the optimizer's noise. γ matters once spending flexes: at semi-flex, γ = 8 moves the best constant weight from 100% to 60%.

### 2e. Is the glide shape worth anything? (out of sample)

Each strategy is scored on the evaluation sample, and `best constant` is selected on a separate selection sample (§1.5). Columns are CE income ($/yr):

- `optimum`: the optimized per-age glide;
- `opt ret / 100% acc`: the optimized retirement glide, but 100% equity throughout accumulation;
- `100% equity`: 100% at every age;
- `best constant (w*)`: the best single weight, shown in brackets;
- `glide vs best constant`: `optimum` minus `best constant`, the value of the glide's shape.

| Spending | Ret. horizon | optimum | opt ret / 100% acc | 100% equity | best constant (w\*) | glide vs best constant |
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

- **Shape:** the glide adds ≤ ~$280/yr (~0.5%) for constant dollar and nothing once spending flexes (the −$32 is noise). This matches Estrada's "glidepath illusion": in his historical tests, lifecycle glide paths do no better than a well-chosen fixed mix.
- **Level:** for a 30-year constant-dollar retirement the optimum beats 100% equity by ~$580/yr (1%); at 40–50 years 100% is within ~$130–340/yr. Forcing 100% equity during accumulation costs ~$520/yr at 30 years and less at longer horizons: only mildly worse for a well-funded, rigid-spending household with no bequest motive.

### 2f. Funding level and the value of flexibility

`research_history --sections funding` (5-year steps).

**Funding level sets the iid tent.** Constant dollar; "gap ÷ balance" is the first-year withdrawal as a share of the median retirement balance.

| savings / contribution | gap ÷ balance | tent | best constant | CE      | full-path shortfall |
| ---------------------- | ------------- | ---- | ------------- | ------- | ------------------- |
| $300k / $30k           | 1.8%          | 40%  | 40%           | $59,915 | 0.2%                |
| $200k / $20k (default) | 2.3%          | 50%  | 70%           | $58,107 | 2.6%                |
| $150k / $15k           | 2.8%          | 70%  | 100%          | $53,205 | 8.0%                |
| $120k / $12k           | 3.3%          | 100% | 100%          | $47,710 | 14.3%               |
| $100k / $10k           | 3.9%          | 100% | 100%          | $43,013 | 22.1%               |

A spender capped at the target gains nothing from wealth beyond what funds it (there is no bequest), but loses heavily from shortfalls. The more over-funded the plan, the more the optimizer protects the floor.

**Compare spending rules at the same spending level.** At a 4% rate the flexible rule's first-year draw is ~$83k (4% of the flexible plan's ~$2.07M median balance at 100% equity), against the constant rule's $40k. Most of the CE gap in §2b is therefore **spending more**, not spending flexibly. (The two balances differ: the constant-dollar plan's tent glide reaches a ~$1.74M median, so its $40k is 2.3% of that balance but 1.93% of the flexible plan's.)

| Rule                      | Withdrawal rate | Year-1 draw | CE      |
| ------------------------- | --------------- | ----------- | ------- |
| constant dollar (default) | —               | $40,000     | $58,107 |
| flexible at 4%            | 4.00%           | $82,902     | $80,799 |
| flexible, matched draw    | 1.93%           | $40,000     | $60,939 |
| semi-flex, matched draw   | 1.93%           | $40,000     | $64,954 |

At a matched first-year draw, flexibility is worth **+$3k to +$7k/yr**. Letting each rule also choose the spending level that maximizes its own CE widens the gap: constant dollar peaks at $60.8k CE (with a ≈ $70k target) and flexible at $85.4k (with a ≈ 6% rate). Flexibility lets the household safely spend down wealth that a rigid plan has to leave unused as a buffer.

---

## 3. Results under historical sequencing (forward-block)

**In brief.** History has patterns iid ignores: stock returns partly recover after crashes, while long nominal bonds suffer bad decades. Keeping both patterns, at the same forward-looking averages, removes the bond tent: the optimum becomes ~100% equity. The welfare (CE) barely changes; what changes is the allocation that achieves it.

### How sequencing differs from iid

Forward-block replays JST single-country sequences, rescaled to the same forward return levels as iid. It keeps two historical patterns that iid removes. The **variance ratio** measures both: VR(q) compares how widely q-year cumulative returns spread with what independent years would give.

- **Equity mean reversion** (VR(10y) ≈ 0.91). A bad stretch tends to be partly followed by recovery, so 10-year outcomes are a little _less_ dispersed than iid predicts. The effect is modest: the 10-year spread is about 0.95× the iid spread (√0.91).
- **Long-bond persistence** (VR(10y) ≈ 2.7). Bad real-return years cluster into bad decades, so 10-year outcomes are much _more_ dispersed than iid predicts: about 1.6× the iid spread. Over the full sample two-thirds of this comes through inflation, and after 1950 about half comes through the interest-rate cycle (§4b).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/variance-ratio-dark.svg">
  <img alt="Two panels of cumulative real return against years held, in units of one-year standard deviation. Left, equities: the ±1 s.d. band (VR(10y) ≈ 0.91) runs just inside the dashed iid ±√years band. Right, long bonds: the band (VR(10y) ≈ 2.66) fans out well beyond the iid band, to about 1.6 times its width at 10 years. Thin grey lines are 40 actual 10-year historical windows." src="img/variance-ratio-light.svg">
</picture>

_Figure 1. The coloured band is ±1 standard deviation of the cumulative real return after each number of years held, in units of the one-year standard deviation. The dashed band is what iid returns give: ±√years. VR < 1 pulls the band inside the iid band (mean reversion); VR > 1 pushes it outside (persistence). Thin lines are 40 random actual 10-year windows from the pooled history._

Why this matters for allocation: in a retirement plan, the bond leg is the part meant to be safe. If its bad years cluster, as in an inflation decade, it fails exactly when it is needed, while equity's partial recoveries make high equity less dangerous than iid suggests.

The block bootstrap carries these patterns because each block is a run of consecutive real years. Blocks average 10 years, so the structure is kept in full over a few years and partly kept, diluted by restarts, over about a decade (a given 10-year window lies inside a single block only ~40% of the time):

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/block-bootstrap-dark.svg">
  <img alt="One simulated 40-year sequence made of four historical blocks: Italy 2007–13, Sweden 1940–48, USA 1966–73 and Finland 1984–99, with the path of $1 of real equity growth underneath and dotted lines at block boundaries." src="img/block-bootstrap-light.svg">
</picture>

_Figure 2. One simulated 40-year path from the stationary block bootstrap. Within a block, years follow in their historical order, for stocks and bonds together; at each boundary the path jumps to a random country and year. The engine applies this to the rescaled series._

### 3a. The tent largely disappears

The product engine (`recommend_glide_path`, forward-block), 1-year steps, 5pp grid, 15,000 paths, γ = 4, 30-year accumulation. Columns as in §2:

| Spending | Ret. horizon | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE | AFTER | CE income | Shortfall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| constant $ | 30y | 100 | 97 | 100 | 75 | 75 (@65) | 100 | Flat | Rising | $57,814 | 2.2% |
| constant $ | 40y | 100 | 99 | 100 | 95 | 95 (@65) | 100 | Flat | Flat | $55,911 | 3.6% |
| constant $ | 50y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $54,188 | 4.8% |
| semi-flex 50% | 30y | 100 | 100 | 100 | 100 | 100 (@65) | 0 | Flat | Flat | $80,960 | 0.4% |
| flexible 100% | 30y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $84,038 | 0.0% |

Out of sample the best constant weight is 100% in every row, and the glide's edge over it is −$15 to $0/yr (noise; not tabulated). Compared with iid, the constant-dollar accumulation path stays at ~100% instead of averaging 78%, and the remaining dip is 75–100% instead of 30–70%. CE barely changes ($57.8k vs $58.1k at 30 years): the sequence model moves the **allocation** that achieves welfare far more than the welfare itself. This reproduces ACO's flat 100% on our own capital-market assumptions.

### 3b. What drives the flip

`research_history --sections matrix blocks channels` (constant dollar, 30y + 30y, 5-year steps; best constant weight per cell):

**Sequencing, not pooling.** The `matrix` section runs both block models on each dataset (pooled single-country sequences vs the world average). Best constant weight, with CE where reported:

| Return model                                            | pooled        | world         |
| ------------------------------------------------------- | ------------- | ------------- |
| forward-block (forward levels, historical sequencing)   | 100% ($57.8k) | 100% ($58.4k) |
| raw historical-block (historical levels and sequencing) | 95% ($45.7k)  | 100%          |

iid-mc does not use history, and gives 70%. Forward-block reaches 100% on either dataset, so pooling does not drive the result. Pooling matters only for raw history, whose single-country sequences carry history's own return levels and country disasters at full size; the forward rescale replaces those levels and shrinks the disasters to forward volatility (they remain in the series; see cell c below).

**Any sequencing is enough.** Best constant weight by mean block length: 1y → 75%, 3y–40y → 100%. A 1-year mean block restarts every year, so it is an iid resample of rescaled history: the same model as cell c below (80% there; the gap is ±5pp selection noise). Only the no-sequencing case restores the interior answer.

**It takes the joint structure.** Forward-block differs from iid in four ingredients at once:

- the stock/bond correlation (0.48 implied by the curve vs 0.29 in history);
- the shape of yearly returns (normal vs history's skew and fat tails);
- equity sequencing (VR(10y) 0.91 vs 1);
- bond sequencing (VR(10y) 2.66 vs 1).

The channel ladder (`--sections channels`) switches them on one at a time. All cells use the same forward mean and volatility for each asset, so only the listed ingredients differ. One caveat applies to cells d and e: to shuffle one asset's years while keeping the other's order, the two assets must come from different historical years, which also removes their correlation (≈0 instead of 0.29). That alone favours bonds (b1 → b2), so read d and e as "one asset's sequencing, uncorrelated" rather than pure single-ingredient changes.

| Cell | Return draws | Stock/bond corr. | Return shape | Equity VR(10y) | Bond VR(10y) | Best constant |
| --- | --- | --- | --- | --- | --- | --- |
| a | iid-mc baseline (the app's default) | 0.48 (curve) | normal | 1 | 1 | 70% |
| b1 | synthetic iid normals, two-asset | 0.48 | normal | 1 | 1 | 70% |
| b2 | synthetic iid normals, two-asset | **0.29** | normal | 1 | 1 | 60% |
| c | rescaled history, single years resampled iid | 0.29 | **historical** | 1 | 1 | 80% |
| d | equity in historical blocks, bond years shuffled | ≈0 | historical | **0.91** | 1 | 50% |
| e | bonds in historical blocks, equity years shuffled | ≈0 | historical | 1 | **2.66** | 70% |
| f | full forward-block (both in the same blocks) | 0.29 | historical | **0.91** | **2.66** | 100% |

Each step isolates one effect (bold marks what changed):

- **a → b1: engine check.** Rebuilding iid from the two endpoint assets at the curve's correlation, instead of interpolating the curve, gives the same 70%. Differences further down are not artifacts of the construction.
- **b1 → b2: correlation only.** Lowering stock/bond correlation from 0.48 to 0.29 makes bonds a better diversifier, and the optimum falls 10pp to 60%.
- **b2 → c: return shape only.** Same correlation, still no sequencing, but each year's returns now have history's shape. Rescaled equity is right-skewed (skew +0.85), while rescaled bonds have a long left tail (skew −1.06, excess kurtosis 11, worst year −8.6 s.d., from hyperinflations). Bonds look worse in the tail, and the optimum rises to 80%.
- **c → d: equity sequencing alone (uncorrelated).** Equity follows its historical order while bond years are drawn at random. The optimum _falls_ to 50%. That is consistent with two effects, not separated here: the lost correlation, and history's short-run equity momentum (VR(2y) ≈ 1.1, the slight bulge at years 1–3 in Figure 1), which raises near-horizon equity risk while the shuffled bonds stay safe.
- **c → e: bond persistence alone (uncorrelated).** Bonds keep their bad decades while equity years are random. The optimum is 70%. Removing the correlation probably costs at least the 10pp it cost in b1 → b2, so persistent bonds on their own may raise equity a little, but they come nowhere near 100%.
- **c → f: both together.** Only when bonds are persistent **and** equity mean-reverts in the same simulated years, with history's correlation, does the optimum reach 100%.

### 3c. Era and country cuts

Each cut restricts the history before rescaling, so the forward return levels stay the same and only the sequencing pattern changes. Columns:

- variance ratios for long bonds, bills (short-term government paper, for comparison) and equity, on arithmetic returns (the basis the engine samples, which the rescale leaves unchanged);
- `bond iid null`: short samples bias VR below 1 even for iid data, so this gives the mean and 5th–95th percentile of bond VR(10y) after shuffling years within each country run;
- `best constant` under forward-block on that cut, and `CE gain vs 100%`: how much that best weight beats 100% equity (— where 100% is best).

| History | bond VR(10y) | bond iid null | bill VR(10y) | equity VR(10y) | best constant | CE gain vs 100% |
| --- | --- | --- | --- | --- | --- | --- |
| full 1871–2020 | 2.66 | 1.00 [0.87, 1.15] | 3.29 | 0.91 | 100% | — |
| post-1950 | 2.21 | 0.94 [0.78, 1.09] | 4.97 | 0.91 | 100% | — |
| ex Germany + Japan | 2.54 | 0.99 [0.85, 1.13] | 3.63 | 0.94 | 100% | — |
| stable six¹ | 1.92 | 0.96 [0.77, 1.19] | 3.23 | 0.73 | 90% | +0.1% |
| 1990–2020 | **0.58** | 0.82 [0.61, 1.08] | 3.85 | 0.69 | **50%** | +0.4% |

¹ USA, UK, Canada, Australia, Switzerland, Sweden.

- **Not a disaster artifact.** Dropping Germany and Japan leaves bond persistence essentially unchanged (2.54 vs 2.66).
- **Era-dependent for bonds.** In 1990–2020 bonds mean-revert (VR 0.58, at about that cut's null 5th percentile of 0.61), the stock/bond correlation falls to ≈0, and the interior tent returns. It is a single 31-year regime, roughly three independent decades, one of five cuts tested, and it ends before the 2021–22 inflation shock. §4b explains why bonds behave differently there.
- **Bills stay persistent in every era** (VR 3.2–5.0): through lagging inflation in the long samples and through the policy-rate cycle in 1990–2020 (§4b). Short duration does not remove either.

### 3d. Welfare regret across regimes (robustness check)

The **regret** of a weight in a regime is that regime's best constant CE minus the weight's CE. The **maximum regret** across regimes is the most a weight could cost if you don't know which regime is true. `research_history --sections regret` (constant dollar, 30y + 30y); cells are regret in $/yr of CE income:

| Regime (forward-block unless noted) | best | 60%   | 70%   | 80% | 90%     | 100% |
| ----------------------------------- | ---- | ----- | ----- | --- | ------- | ---- |
| full 1871–2020                      | 100% | 1,673 | 931   | 479 | 184     | 0    |
| post-1950                           | 100% | 1,504 | 866   | 441 | 169     | 0    |
| ex Germany + Japan                  | 100% | 1,791 | 1,064 | 563 | 227     | 0    |
| stable six                          | 90%  | 433   | 153   | 28  | 0       | 57   |
| 1990–2020                           | 50%  | 14    | 46    | 94  | 163     | 260  |
| iid-mc                              | 70%  | 76    | 0     | 74  | 192     | 388  |
| **max regret**                      |      | 1,791 | 1,064 | 563 | **227** | 388  |

Any weight from 70% to 100% loses at most ~2% of CE in any regime (the largest, $1,064, is ≈ 1.8% of ~$58k); the smallest worst case is ~90% ($227/yr). The iid-optimized glide, scored the same way, has a maximum regret of $975 (not tabulated). This is a research robustness check, not a product rule: the app recommends what the selected model's simulation produces.

---

## 4. The bond menu

**In brief.** Flat 100% equity is a verdict on long nominal bonds, not on equity. Swap them for a real asset without their historical baggage (bad decades, correlation with equity, a fat left tail), and a substantial bond share comes back. How much it comes back, and how much welfare that is worth, depends on assumptions about the real asset that a buyable fund only partly meets (§4c).

### 4a. The experiment

Equity keeps its forward-block sequencing throughout; only the non-equity asset changes (`research_history --sections menu`, constant dollar, 30y + 30y):

| Non-equity asset | best constant | CE at best |
| --- | --- | --- |
| a) long nominal bonds, historical sequencing (forward-block) | 100% | $57.8k |
| b) idealized real asset: same mean/vol as bonds (1.56% / 5.27%), iid, zero equity correlation | **50%** | $59.3k |
| c) idealized short real ladder, 2% vol | 15% | $59.9k |
| d) idealized ladder: 2% vol, mean raised to 2.0% real | 10% | $60.0k |

Cell b keeps the bond leg's mean and volatility but removes, at once, its persistence (all three sources in §4b), its correlation with equity and its fat left tail. It moves the optimum from 100% to 50% and raises CE by ~$1.5k/yr (~2.5%; §4c's re-run on a fresh random stream gives 2.6%). Cells c and d also suppress volatility, which only a hold-to-maturity ladder does.

### 4b. Where long-bond persistence comes from

A real bond return splits exactly into three terms, each deflated by (1 + CPI change):

- **carry**: the prior year's yield (income);
- **price**: the rest of the nominal return, driven by yield changes (the rate cycle);
- **inflation**: the erosion of the nominal claim.

Because the 10-year real sum is the sum of the three terms' 10-year sums, its variance splits into one piece per term: that term's covariance with the total. Divided by 10 × the one-year variance, the three pieces add up exactly to bond VR(10y) (`--sections bond-decomp`). A piece is large when that term both swings a lot over a decade and moves with the total:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/bond-persistence-dark.svg">
  <img alt="Stacked horizontal bars of each term's contribution to the 10-year variance ratio of real long-bond returns, for five history cuts. Full 1871–2020: carry 0.22, price 0.63, inflation 1.81, total 2.66. Post-1950: 0.24, 1.12, 0.85, total 2.21. Ex Germany and Japan: 0.24, 0.78, 1.53, total 2.54. Stable six: 0.27, 0.85, 0.79, total 1.92. 1990–2020: 0.36, 0.27, −0.05, total 0.58. A dashed line marks the iid value of 1." src="img/bond-persistence-light.svg">
</picture>

_Figure 3. Contributions to bond VR(10y) by history cut. The bars add up to each cut's VR; the dashed line is the iid value of 1._

| History | bond VR(10y) | carry | price (rate cycle) | inflation | corr(price, inflation), 10y |
| --- | --- | --- | --- | --- | --- |
| full 1871–2020 | 2.66 | 0.22 (8%) | 0.63 (24%) | 1.81 (68%) | 0.26 |
| post-1950 | 2.21 | 0.24 (11%) | 1.12 (51%) | 0.85 (39%) | 0.49 |
| ex Germany + Japan | 2.54 | 0.24 (10%) | 0.78 (30%) | 1.53 (60%) | 0.33 |
| stable six | 1.92 | 0.27 (14%) | 0.85 (45%) | 0.79 (41%) | 0.34 |
| 1990–2020 | 0.58 | 0.36 | 0.27 | −0.05 | 0.03 |

- **Full sample:** inflation is two-thirds of the persistence.
- **After 1950:** the rate cycle is as large as inflation, but it is partly the same inflation cycle seen through yields: yields rose with inflation until 1981 and fell with it afterwards, so the two terms move together (10-year correlation 0.49).
- **Bills** split the same way, into a rate term (the nominal bill rate, deflated) and an inflation term. Inflation is 75–87% of bill persistence in the full, ex-Germany/Japan and stable-six samples, and the rate term alone has VR(10y) ≈ 8, nearly a random walk. In 1990–2020 the rate term is 124% and inflation −24%: persistence there came from policy rates falling toward zero while inflation held near target. That is a **real-rate cycle**, which inflation linkage does not remove.
- **Limits:** this is variance accounting, not a causal split. The price term is also a noisy proxy for yield moves: JST yields are annual averages, and regressing the price term on yield changes implies a duration of only ~3.4.

**Why long bonds mean-revert in 1990–2020.** Two things changed.

- **Inflation's contribution vanished** (1.81 → −0.05). Inflation itself was still persistent in this era (its own VR(10y) ≈ 2.6, as high as long bonds' full-sample figure), but its swings were small, and yields moved with it, so carry offset most of what it took (their 10-year covariance is negative, roughly the Fisher effect).
- **The rate cycle reversed.** On its own, the price term has VR(10y) ≈ 0.24 in 1990–2020, against ≈ 1.0 in every other cut: yield moves unwound instead of compounding. Rate spikes (1994, 1999, 2013, 2018: global selloffs led by the US) reversed within a few years instead of starting a new inflation regime, and with stock/bond correlation ≈ 0, bonds rallied in equity crises (2000–02, 2008, 2020) and gave part of it back in the recoveries.

Carry does not offset price here: their 10-year covariance is slightly positive, so the familiar duration-matching argument (a yield rise's price loss is earned back through higher income) is not what the data show. The long fall in yields is not the source either. A steady decline adds a roughly constant excess return, which raises the mean rather than creating reversion; if anything, the slow fall in carry, and differences in average return between countries, push the measured VR _up_ (it is computed around the pooled mean). Inflation targeting is therefore the likely **condition** for bond VR < 1, not a demonstrated cause, and 31 years cannot separate it from the falling-rate backdrop.

### 4c. How robust is the short-TIPS result?

Cell b is the closest the menu comes to a short-TIPS ETF (such as XSTH), but it is an idealized asset, not a model of one. It is generous to a real fund in three ways and conservative in one:

- **Correlation.** It has zero correlation with equity. Nominal bonds in the same history have 0.29, and the iid curve implies 0.48. A short linker also falls with equities when real yields jump, as in 2022.
- **Persistence.** It has none (VR = 1). Annual returns of VTIP (the US short-TIPS ETF with the longest history) since 2012 give an AR(1) coefficient φ ≈ 0.13, but on ~13 observations (standard error ≈ 0.27), so φ = 0 and φ ≈ 0.5 are both consistent with the data. A short linker's real return also tracks the real short rate, which is itself persistent: the 1990–2020 real-rate cycle in §4b.
- **Mean.** It keeps the bond leg's 1.56% real arithmetic mean, which includes a term premium a short fund does not earn.
- **Volatility (conservative).** It keeps long bonds' 5.27% volatility; a short fund is calmer.

`--sections tips-stress` changes one assumption at a time (equity keeps forward-block sequencing; gain is versus cell a's $57,829):

| Change to cell b | best constant | CE | gain vs nominal bonds |
| --- | --- | --- | --- |
| none (cell b) | 50% | $59,359 | +$1,530 |
| equity correlation 0.29 | 55% | $58,785 | +$956 |
| equity correlation 0.48 | 60% | $58,379 | +$550 |
| persistence φ = 0.30 | 55% | $59,187 | +$1,358 |
| persistence φ = 0.50 | 60% | $59,062 | +$1,233 |
| persistence φ = 0.80 (near random-walk real rate) | 70% | $58,893 | +$1,064 |
| mean 1.00% real | 55% | $58,818 | +$989 |
| volatility 3.0% | 30% | $59,766 | +$1,937 |
| combined: 1.00% / 3.0% / φ 0.30 / corr 0.29 | 55% | $58,625 | +$796 |
| harsh: 1.00% / 5.27% / φ 0.50 / corr 0.48 | 85% | $57,981 | +$152 |

The "none" row re-draws cell b on a different random stream; its CE differs from §4a's $59,276 by Monte Carlo noise. For scale, φ = 0.5 gives a VR(10y) of ≈ 2.6, as persistent as long nominal bonds, and φ = 0.8 gives ≈ 5.4.

- **The direction is robust.** No single change takes the optimum above 70%, and a plausible combined case lands at 55%. A real short asset brings back a substantial bond share. Even a leg twice as persistent as long bonds (φ = 0.8) stays at 70%, so persistence alone is not what pins forward-block at 100%.
- **The size of the gain is not.** The gain falls from ~$1.5k/yr (2.6% of CE) in the idealized cell to ~$0.8k/yr (1.4%) in the combined case. Correlation and the lower mean (1.00% instead of 1.56%) matter most. Only when most assumptions are unfavourable at once (the harsh row) does the gain shrink to within Monte Carlo noise (~$170/yr) and the optimum return to 85%.
- **Not modelled:** US versus Canadian CPI (XSTH indexes to US CPI), the indexation lag (TIPS principal follows CPI with a ~3-month lag), hedging costs and fees. All of them reduce the hedge's precision for a Canadian spender.
- **Regime-conditional (expected, not tested).** `tips-stress` runs on the full history only. In 1990–2020, nominal bonds already mean-reverted and gave 50% on their own (§3c), so the gain there should be small.

The realistic reading: a short real asset is worth roughly 1–2.5% of CE income over long nominal bonds in inflation-prone histories, and moves the optimum to about 50–70% equity. It is a hedge across regimes, not a free lunch.

### 4d. Reading the menu

- **Persistence axis (a → b).** Inflation linkage removes the inflation term; short duration removes most of the price term. A short-TIPS fund does both, which is why it captures most of cell b's reallocation. It still carries the real-rate cycle, and the measured VTIP persistence moves the best weight only from 50% to 55% (`--sections tips-etf`); §4c gives the wider range.
- **Amplitude axis (b → c).** Suppressing volatility to 2% needs a hold-to-maturity real ladder, where each rung's real value at maturity is locked in at purchase. No fund offers this in Canada. The closest is a do-it-yourself ladder of individual RRBs or US TIPS bought through a broker. It has maturity gaps (Canada has issued no new RRBs since 2022) and, for TIPS, US-CPI and currency basis. Read 15% as an idealized bound.
- **Short nominal is not enough.** JST real bill returns are more persistent than long bonds (VR(10y) 3.29 vs 2.66 pooled; bills ≥ bonds in every cut), because the bill rate (its rate term has VR ≈ 8, nearly a random walk) lags inflation. In the engine, a bill-ladder leg at 0.75% real / 2% vol that keeps its own historical persistence gives a best constant weight of **90%** (tent ~60%), while the same bills made iid give 45% (`--sections bills-block`). That run uses the joint equity-and-bills panel, which keeps only years with both series, so its bills VR(10y) reads 2.97 rather than 3.29.
- **So inflation linkage does most of the work** in inflation-driven history; short duration helps a little. Neither removes a real-rate cycle like 1990–2020's, but in that regime long nominal bonds mean-reverted and the tent returned anyway (§3c).
- **Short beats long only for the tent's job.** For a temporary hedge that protects near-term withdrawals, short duration cuts drawdown depth cheaply. A permanent bond sleeve is different: longer duration earns a term premium and rallies in deflationary crashes, but falls with equities in inflationary ones, as in 2022. None of the nominal options fixes inflation.

### 4e. What a Canadian can buy

| Product | Duration (amplitude) | CPI link (persistence) | Residual risk |
| --- | --- | --- | --- |
| XSTH / ZTIP.F (short US TIPS, CAD-hedged) | short | US CPI | CPI basis vs a CAD liability; real-rate cycle |
| XRB (Canadian real return bonds) | long (~13–15y) | Canadian CPI | real-rate cycle: 2022-style drawdown (≈ −14%) |
| GIC / bill ladder | short, hold to maturity | none | inflation persistence |

No product offers short duration **and** Canadian CPI (Canada stopped issuing RRBs in 2022). For the sequence-hedge role XSTH fits best. Adding some XRB brings in Canadian CPI at the cost of duration, so a blend of the two is a rough stand-in for the missing short Canadian real asset. As with any real asset here, the blend's value is regime-conditional (§4c).

---

## 5. Comparison with ACO and ERN

- **ACO** — Anarkulova, Cederburg & O'Doherty, _Beyond the Status Quo_ ([SSRN 4590406](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4590406)): a 38-country block bootstrap finds ~100% equity held flat over the lifecycle, with a shallow tent at retirement for constant spending.
- **ERN** — [earlyretirementnow.com, Part 20](https://earlyretirementnow.com/2017/09/20/the-ultimate-guide-to-safe-withdrawal-rates-part-20-more-thoughts-on-equity-glidepaths/): a US backtest finds that a rising retirement glide (e.g. 60%→100%) adds ~0.1–0.3pp to the SWR, but only when CAPE > 20.
- **Kitces & Pfau** (2014): simulations in which a rising equity glide path through retirement (starting low and increasing) beats a constant or declining one on success rate, by reducing exposure in the early, sequence-sensitive years.

| Claim | Verdict |
| --- | --- |
| ACO: ~100% equity, flat | **Reproduced** under forward-block, and under iid for flexible spending or a tightly funded plan. For a well-funded rigid spender under iid, a ~70% tent beats 100% by ~1% at a 30-year retirement and by less at longer horizons. |
| ERN / Kitces–Pfau: rising retirement glide | The derisk-then-rise shape emerges under iid with rigid spending and no valuation signal, and largely vanishes under forward-block. ERN's SWR boost does **not** reproduce under iid (§2a): the rising glide only ties the best constant weight. |
| Both: beat a declining (target-date) retirement glide | Direction agreed, magnitude tiny: the glide shape is worth ≤ ~0.5% of CE. |

**Why our iid path differs from ACO's.** ACO stays at ~100% through accumulation, while our iid constant-dollar path falls into the tent. Three differences explain it. Two are levers that each close the gap on their own: restoring historical sequencing (§3) and reducing over-funding (§2f). The third is the objective: ACO also values terminal wealth, which removes the "wasted upside" of a capped spender (§2f). JST and ACO draw on largely the same developed-market history, so reproducing ACO here is a consistency check, not independent confirmation.

---

## 6. Caveats

- **iid has no valuation signal or mean reversion.** It cannot reproduce ERN's CAPE-conditional effect, and it overstates the incentive to derisk if history's recoveries persist. Neither engine models valuation timing.
- **The sequencing evidence is statistically weak.** 150 years × 16 correlated countries amount to a handful of independent 60-year lifecycles, and equity VR(10y) ≈ 0.91 is probably not distinguishable from 1. The block-length result helps (any sequencing with blocks of 3 years or more flips the answer), but read §3 as one end of a range, not a point estimate.
- **The flip is a joint, era-dependent property** with no single parameter to stress. Whether the full-sample or the 1990–2020 structure better describes the next 60 years is a judgment about monetary regimes that the data cannot settle.
- **Survivorship.** JST covers markets that survived with usable data; the recoveries behind §3 partly reflect that.
- **Sequencing is assumed independent of the return level.** Forward-block applies history's dynamics (crash-and-recovery patterns, bad bond decades) to a lower forward equity premium than history earned. If those dynamics were partly a product of history's higher returns, forward-block overstates them.
- **One equity asset, two-asset menu.** There is no domestic/international split. A real short-duration asset is the most valuable missing option, though its value is assumption-sensitive (§4c).
- **The iid curve fixes stock/bond correlation at ≈0.48 and gives bonds no inflation risk or persistence.** The second part is bond-friendly; the first is not, since history's 0.29 makes bonds a better diversifier (§3b, b1 → b2).
- **Fixed horizon, no mortality weighting, no bequest, fixed contributions, no taxes or fees, annual rebalancing, discrete grid.** Read the direction of the shape and its rough magnitude, not basis points.

---

## 7. Code and reproduction

**Python** (`analysis/glide_path/`): module roles, API and run commands are in its [README](../../analysis/glide_path/README.md). Research code can pass `history=` (a custom or cut return series) and `sampler=` (a custom index sampler) to `recommend_glide_path`.

**Web** (`src/utils/glide-path/`): `engine.ts` (the same model, with one simulation kernel for iid and forward-block), `recommendation.ts` (simplicity rule), `jstData.ts` (generated bundle). The web app defaults to 5-year steps (adjustable 1–10), offers iid-mc and forward-block, and requires ≥ $10k of guaranteed income.

Where each result comes from (`research_history` sections are passed as `--sections <name> ...`):

| Note section | Source |
| --- | --- |
| §2a–§2e | `research` |
| §2f | `research_history` `funding` |
| §3a | `recommend_glide_path(..., interval=1, return_mode="forward-block", n_paths=15_000)` |
| §3b | `matrix`, `blocks`, `channels` |
| §3c | `vr` (variance ratios and nulls), `regret` (best constant per cut) |
| §3d | `regret` |
| §4a, §4d | `menu`, `tips-etf`, `bills-block` |
| §4b | `bond-decomp` |
| §4c | `tips-stress` |
| γ checks (§2d) | `gamma` |

```bash
python3 -m analysis.glide_path.research               # §2 tables + figures (~5 min)
python3 -m analysis.glide_path.research_history --sections matrix blocks channels menu \
    tips-etf tips-stress bills-block gamma curves vr bond-decomp regret funding \
    --accum 30 --retire 30 --savings 200000 --contrib 20000 --interval 5 --paths 8000
python3 -m analysis.glide_path.doc_figures             # Figures 1–3 (light + dark SVG)
python3 -m analysis.glide_path.generate_bundle         # regenerate src/utils/glide-path/jstData.ts
```

Historical modes download JST R6 to the gitignored `analysis/.data/` on first use (needs pandas and openpyxl; the figures also need matplotlib).

---

## Corrections log

November 2026 review; all tables above are regenerated.

- **Return basis.** The curve's returns are geometric, but the engines used them as arithmetic means, so every mix compounded ~σ²/2 too low (100% equity at 3.9% real instead of 4.7%), biasing results toward bonds. Both engines now convert. The best constant weight for the default plan rose from 60% to 70%, and flexible spending now holds 100% throughout.
- **Optimizer ties.** `argmax` broke exact ties toward 0% equity, which produced the apparent "terminal derisking" at flex = 1. Ties now keep the incoming weight.
- **World vs pooled.** The research cells labelled "(world)" had run the pooled dataset. Corrected runs show that sequencing, not pooling, drives forward-block to 100%.
- **Variance ratios.** They were computed on log returns, where Germany's 1923 bond year (−99.99999%, log ≈ −20.7) dominated: pooled bond VR(10y) read 1.70 instead of 2.7, and the stable-six and ex-Germany/Japan cuts wrongly looked more persistent.
- **Flexibility value.** The earlier "$13–16k/yr from flexibility" compared a ~4% flexible draw with a ~2% constant draw. At a matched draw it is +$3–7k/yr.
- **Source of bond persistence.** §3 said bad bond decades cluster "mostly through inflation". The new `bond-decomp` split confirms that for the full sample (68%) but not after 1950, where the rate cycle is about half. §3 and §4 now say so, and note that 1990–2020 bill persistence is a real-rate cycle that inflation linkage does not remove.
- **Short-TIPS benefit.** Menu cell b had been labelled the "buyable short-TIPS ETF proxy", with 50% called "the buyable figure". It is an idealized asset with zero equity correlation, no persistence and the long-bond mean. The new `tips-stress` section (§4c) puts the optimum at 55–70% and the gain at ~$0.5–1.4k/yr under less generous single assumptions. A live-fund comparison of VR(2y) figures was removed: it mixed bases (an annual VR(2y) cannot exceed 2) and was not reproducible from the repo.
- **Minimax regret.** iid's interior answer had been called the minimax-regret choice based on allocation distance. Computed welfare regret favours ~90% (§3d), so the claim was withdrawn.
- **Why 1990–2020 bonds mean-revert.** A draft attributed it to duration matching (higher carry earning back a price loss). The decomposition does not support that: carry and price co-move slightly positively in that era. The reversion is inside the price term itself (own VR(10y) ≈ 0.24 vs ≈ 1.0 elsewhere), with inflation's contribution near zero (§4b).
- **What pins forward-block at 100%.** The summary credited it to bond persistence alone. Menu cell b also removes the stock/bond correlation and the bonds' fat left tail, and `tips-stress` shows that a leg as persistent as long bonds, but uncorrelated, still gives 60%. The summary and §4a now say it takes the joint structure.
- **Smaller fixes.** Correlation in the channel test (the iid curve already embeds 0.48); a duplicated bond-menu cell; the TIPS check using un-rescaled equity; the bills test rescaling bills to the bond anchors; best-constant selection on the scoring draw; inconsistent shortfall and slope definitions between scripts.

---

## References

- Anarkulova, Cederburg & O'Doherty (2023) — _Beyond the Status Quo: A Critical Assessment of Lifecycle Investment Advice_ ([SSRN 4590406](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4590406)).
- Early Retirement Now (2017) — [Safe Withdrawal Rate Series, Part 20](https://earlyretirementnow.com/2017/09/20/the-ultimate-guide-to-safe-withdrawal-rates-part-20-more-thoughts-on-equity-glidepaths/) (equity glidepaths).
- Kitces & Pfau (2014) — "Reducing Retirement Risk with a Rising Equity Glide Path", _Journal of Financial Planning_.
- Estrada (2014) — "The Glidepath Illusion: An International Perspective", _Journal of Portfolio Management_.
- Jordà, Knoll, Kuvshinov, Schularick & Taylor (2019) — "The Rate of Return on Everything, 1870–2015", _QJE_ 134(3). The paper's sample ends in 2015; this note uses the JST Macrohistory Database R6, which extends the series to 2020.
- VTIP and XSTH annual returns — fund-provider (Vanguard, BlackRock iShares) published annual total returns.
- Lo & MacKinlay (1988) — "Stock Market Prices Do Not Follow Random Walks: Evidence from a Simple Specification Test", _Review of Financial Studies_ 1(1) (the variance-ratio test).
- Politis & Romano (1994) — "The Stationary Bootstrap", _JASA_ 89(428).
- FP Canada / IQPF — Projection Assumption Guidelines (geometric returns; conversion for Monte Carlo).
- PWL Capital — Financial Planning Assumptions.
- [`retirement` SWR methodology](../retirement/swr-methodology.md) — shared return assumptions and the JST withdrawal-rate cross-check.
