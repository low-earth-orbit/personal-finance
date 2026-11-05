# Lifetime Allocation Optimizer — Methodology

Research note for the Lifetime Allocation Optimizer (`/glide-path`). It asks: **what equity weight should a household hold at each age — before and after retirement — to maximize expected lifetime welfare?** Companion to the [`retirement` SWR methodology](../retirement/swr-methodology.md), which shares the capital-market assumptions.

The answer is found by simulation, not by rule of thumb: a Monte Carlo coordinate-ascent optimizer chooses the equity weight per age (or per 5-year step) that maximizes expected CRRA utility of retirement consumption. Results are reported under two return models that bracket the evidence — **iid** forward-looking returns (the product default) and **forward-block** historical sequencing (the scenario toggle).

## Contents

- [Summary](#summary)
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

Default household: age 35, $200k saved, $20k/yr contributions for 30 years, $60k real retirement target of which $20k is guaranteed income, 30-year retirement, γ = 4, β = 0.985.

1. **The return model decides whether there is a bond tent.** Under iid returns, constant-dollar spending derisks into a tent around retirement (equity bottoming at 30–70%); the best constant weight is **70%** for a 30-year retirement and 90–100% for 40–50 years. Under forward-block sequencing the tent largely disappears and the optimum is **flat ~100% equity** (§3).
2. **The spending rule sets the shape within either model.** Constant-dollar spending produces the tent; semi-flexible and flexible spending hold **100% equity throughout** in both models.
3. **The glide shape is worth little; the level matters more.** Out of sample, the optimized glide beats the best single constant weight by ≤ ~0.5% of certainty-equivalent (CE) income under iid and ≈ $0 under forward-block (§2e, §3).
4. **Funding level drives the iid tent.** The default plan draws only ~2.3% of its expected retirement balance. A capped constant-dollar spender that is this well funded has little use for upside, so it protects the floor; at a ~3.3% draw the iid tent disappears (§2f).
5. **The flat-100% result is about long nominal bonds.** Forward-block's 100% depends on bonds' historical persistence through inflation decades. Replace the bond leg with a real (inflation-linked) asset at the same mean and volatility and the optimum falls to ~50% (§4). The result is also era-dependent: the 1990–2020 history gives 50% (§3c).
6. **The regime choice costs little welfare.** Across era and country cuts, holding any constant weight from 70% to 100% costs at most ~2% of CE versus that regime's optimum (§3d).
7. **γ barely matters with constant-dollar spending.** Consumption is then almost always either the full target or the guaranteed floor, so every γ ranks allocations by expected shortfall years (§2d).

The app recommends what the selected return model's simulation produces: the optimized glide, or that model's best constant weight when it is within the simplicity thresholds in §1.5.

---

## 1. Model

All amounts are real (today's) dollars.

### 1.1 Household and phases

- **Accumulation:** start balance plus fixed real contributions, mid-year (a contribution earns half a year's return). Working-years consumption does not depend on the allocation, so it drops out of the objective; the accumulation allocation matters only through the wealth it hands to retirement.
- **Retirement:** a fixed planning horizon (no mortality weighting, no bequest — terminal wealth has zero utility). Guaranteed income (CPP/OAS/DB) is paid every retirement year; the portfolio funds the gap between the target and guaranteed income. A pre-pension bridge is out of scope (§1.6).

### 1.2 Spending rule

Each retirement year the portfolio withdrawal targets a blend of a constant and a balance-proportional rule:

```
targetₜ     = (1 − flex)·gap + flex·(withdrawal_rate · start-of-year balanceₜ)
withdrawalₜ = min(targetₜ, what the portfolio can afford)
consumptionₜ = guaranteed income + withdrawalₜ
```

- **flex = 0 (constant dollar):** the full gap every year until the portfolio is exhausted, then consumption drops to guaranteed income. This is the safe-withdrawal-rate setting of `/retirement`.
- **flex = 1 (fully flexible):** spend `withdrawal_rate` (default 4%) of the current balance. Income moves with the market and the portfolio is never mechanically depleted; `target_income` is not used.
- **flex = 0.5:** half of each.

An **income shortfall** ("depletion" in the code) is a path with at least one year where the withdrawal fell short of the target. At flex = 1 the target is always affordable, so shortfall is ~0 by construction and risk shows up as income variability instead.

### 1.3 Returns

**Capital-market curve.** The default curve ([`presets.ts`](../../src/utils/glide-path/presets.ts) `DEFAULT_ALLOC_CURVE`, PWL Capital / FP Canada, inflation 2.1%) lists nominal **geometric (compound)** returns and volatilities by equity weight. Monte Carlo draws need **arithmetic** means, so each anchor is converted with the exact lognormal relation

```
(1+A)² = [ (1+G)² + √((1+G)⁴ + 4(1+G)²σ²) ] / 2
```

then deflated to real (`(1+A)/(1+π) − 1`, volatility `σ/(1+π)`) and interpolated to any weight. Simulated compound growth then matches each mix's stated rate within ~1bp.

|                | Real geometric | Real arithmetic | Real volatility |
| -------------- | -------------- | --------------- | --------------- |
| 100% equity    | 4.67%          | 5.38%           | 12.3%           |
| 0% equity      | 1.42%          | 1.56%           | 5.3%            |
| Equity premium | 3.25pp         | 3.83pp          |                 |

The curve's interior volatilities imply a constant stock/bond correlation of ≈0.48. Deflating at a constant 2.1% means iid bonds carry no inflation risk — effectively an iid real asset. Deterministic "expected" balances compound the geometric (median-path) rate.

**Return modes.** All four feed the same cash flows, objective and optimizer:

| Mode | Sequencing | Marginals | Stock/bond correlation |
| --- | --- | --- | --- |
| `iid-mc` (default) | none (iid normal) | forward curve | implicit in curve vols (≈0.48) |
| `historical-iid` | none (years resampled) | raw history | historical, paired by year |
| `historical-block` | stationary block bootstrap | raw history | historical, paired by year |
| `forward-block` (scenario) | stationary block bootstrap | history affine-rescaled to the forward `w=0` / `w=1` anchors | historical (≈0.29 pooled) |

- **History:** real stock and long-government-bond returns from the JST R6 Macrohistory database (16 countries with both series, 1871–2020), deflated by each country's CPI.
- **Datasets:** `pooled` (default) concatenates each country's own sequence, so a block samples consecutive years of one country (single-country sequence risk). `world` averages countries within each year into one diversified series. Pooled runs accept country/year exclusions; segment ids keep a block from bridging countries or gaps.
- **Stationary block bootstrap:** each year continues the current historical run with probability `1 − 1/L` or restarts at a random year with probability `1/L`, so block lengths are geometric with mean `L` (default 10 years, an annual analogue of ACO's 120 months).
- **Affine rescaling** (forward-block) maps each asset's series to the target mean and volatility. This preserves each asset's arithmetic-return autocorrelation and variance ratio and the stock/bond correlation, so it isolates sequencing from the historical return level. It matches only the two endpoints; intermediate-weight risk comes from the historical covariance rather than the curve.
- **Leverage:** above 100% equity the return is `w·stock − (w−1)·real borrowing cost`; a wipeout is ruin.

These historical modes are annual sequencing checks, not an ACO replication (ACO bootstraps a monthly four-asset panel with mortality-weighted horizons and terminal wealth in the objective).

### 1.4 Objective and optimizer

- **Objective:** maximize expected Σ βᵗ·u(consumptionₜ) over retirement years, with CRRA utility `u(c) = c^(1−γ)/(1−γ)` (log at γ = 1). Base case γ = 4 (plausible range ~1–10), β = 0.985.
- **Certainty-equivalent (CE) income:** the constant annual retirement consumption with the same expected discounted utility. It is the headline welfare measure; it sits below average spending because shortfalls hurt more than surpluses help.
- **Coordinate ascent:** the control is the equity weight per step (1-year steps in the research sweep, 5-year steps in the app). Starting from the best constant weight, the optimizer scans all candidate weights (5pp grid; 10pp in the research sweep) for one step with the others fixed, keeps the best, and cycles in alternating directions until nothing moves. All candidates are scored on the same simulated paths (**common random numbers**), so each comparison is free of sampling noise between candidates. No shape is imposed. A step only changes if a candidate beats the current weight by a relative 1e-12, so exact ties keep the incoming weight. The result is a coordinate-wise optimum, not a guaranteed global one.

### 1.5 Evaluation and the product recommendation

- The glide is optimized on one sample and scored on an **independent evaluation sample**.
- The best single **constant** weight is chosen on a third, separate **selection sample**, then scored on the evaluation sample. Selecting it on the evaluation sample would give it an unfair argmax advantage.
- Two shortfall views are reported: **full-path** (simulated from today, including pre-retirement market luck) and **drawdown-only** (from the median retirement balance, matching `/retirement`).
- **Simplicity rule (web app).** The app recommends the constant weight when it wins on CE outright, or when it is within 3% on CE **and** within 0.5pp on drawdown shortfall **and** within 1.5pp on full-path shortfall (`SIMPLICITY_*` in [`recommendation.ts`](../../src/utils/glide-path/recommendation.ts)). CE gaps under ~3% are inside the model's own uncertainty (glide edge ≤ ~0.5%, Monte Carlo noise ~0.3%, era regret ≤ ~2%); the shortfall gates, at 2–4× their Monte Carlo standard error, stop the simpler pick from adding real tail risk. The Python CLI flags the constant weight when its CE beats the glide's by more than 5%. Both always report the raw optimized glide.

### 1.6 Scope limits

- **Guaranteed income is required.** With positive guaranteed income, consumption never approaches zero, so CRRA utility stays finite and the `$1` consumption floor is only a numerical guard. With zero guaranteed income (equivalently, a pre-pension bridge), a depleted year drives consumption to the floor and `u(c) → −∞` dominates the average. We found no way to keep all three of: (1) no assumed fallback income, (2) a γ-responsive objective, and (3) possible ruin with a single preferred allocation. Flooring utility fabricates income; scoring only surviving paths makes every γ give the same answer. The app therefore requires ≥ $10,000 of guaranteed income. Python accepts zero but reports the comparison as tail-dominated (inconclusive).
- **Undetermined allocation.** With flex = 0 and guaranteed income ≥ the target, the portfolio funds nothing and every allocation ties; both engines reject this input.
- **Final retirement year.** With no bequest, the last year's allocation is either exactly irrelevant (flex = 1) or a weak-gradient horizon effect (flex < 1). It is reported (`end` column) but excluded from the tent and from slope classification; read it loosely.

---

## 2. Results under iid returns (the default)

`python3 -m analysis.glide_path.research` — per-age glide (1-year steps), 10pp grid, 8,000 optimization paths, scored on 60,000 independent paths. Columns are equity %. `tent` = lowest equity within 15 years of retirement and the age it occurs; `end` = final-year equity. BEFORE = accumulation slope; AFTER = retirement slope (final year omitted). Deplete = share of paths with an income shortfall.

### 2a. SWR anchor

Retirement-only, constant dollar, 90% success.

| Horizon | Best constant (w\*) | 100% equity | Rising 60→100 |
| ------- | ------------------- | ----------- | ------------- |
| 30y     | **3.91%** (85%)     | 3.89%       | 3.93%         |
| 40y     | **3.31%** (95%)     | 3.31%       | 3.30%         |
| 50y     | **2.97%** (100%)    | 2.97%       | 2.93%         |

The SWR-maximizing weight is 85–100% and the curve is flat near the top. A rising retirement glide ties the best constant weight: it earns **no SWR premium under iid**, so ERN's effect needs valuation or mean reversion, which iid excludes.

### 2b. Retirement-horizon sweep (30-year accumulation)

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

- **Constant dollar → a tent.** Equity falls through accumulation to a low at or just after retirement (30–70%), then rises. The cost of rigid income shows up as shortfall risk (3–7%, rising with horizon). Longer retirements keep the tent shallower because they need more growth.
- **Semi-flexible and flexible → 100% throughout.** The cost is income variability rather than shortfall.
- The CE gap between rows is **not** the value of flexibility — see §2f.

### 2c. Accumulation-horizon sweep (30-year retirement)

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

Longer accumulation acts as a funding lever: a 40-year saver is so over-funded for a $40k gap that the constant-dollar optimum holds only 30–60% equity (0.4% shortfall), while a 20-year saver stays at 80–100% (15% shortfall). Flexible savers hold 100% regardless.

### 2d. Risk aversion (30y + 30y)

| Spending      | γ   | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE  | AFTER  |
| ------------- | --- | ----- | -------- | ------- | ---- | ---------- | --- | ------- | ------ |
| constant $    | 2   | 100   | 77       | 50      | 60   | 40 (@67)   | 100 | Falling | Rising |
| constant $    | 4   | 100   | 78       | 40      | 50   | 30 (@67)   | 100 | Falling | Rising |
| constant $    | 8   | 100   | 76       | 50      | 60   | 40 (@67)   | 100 | Falling | Rising |
| flexible 100% | 2   | 100   | 100      | 100     | 100  | 100 (@65)  | 100 | Flat    | Flat   |
| flexible 100% | 4   | 100   | 100      | 100     | 100  | 100 (@65)  | 100 | Flat    | Flat   |
| flexible 100% | 8   | 100   | 93       | 80      | 80   | 70 (@66)   | 90  | Falling | Flat   |

**The constant-dollar tent is invariant to γ, and the reason is structural.** With consumption capped at the target, ~99% of simulated retirement years sit exactly at the target and ~1% at the guaranteed floor. Expected utility is then ≈ constant − [u(target) − u(floor)] × E[discounted shortfall years], so every increasing utility function ranks allocations the same way, by expected shortfall years; γ only rescales the CE level. In the recommender the best constant weight is identical for γ = 1, 2, 4 and 8, and each γ's glide scored under another γ differs by ≤ ~$7/yr. γ matters once spending flexes: at semi-flex, γ = 8 moves the best constant weight from 100% to 60%.

### 2e. Is the glide shape worth anything? (out of sample)

Each strategy is scored on an independent draw; `best constant` is selected on a separate draw. `opt ret / 100% acc` keeps the optimal retirement glide but forces 100% equity in accumulation.

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

- **Shape:** the glide adds ≤ ~$280/yr (~0.5%) for constant dollar and nothing once spending flexes — Estrada's "glidepath illusion".
- **Level:** for a 30-year constant-dollar retirement the optimum beats 100% equity by ~$580/yr (1%); at 40–50 years 100% is within ~$130–340/yr. Holding 100% in accumulation is only mildly dominated for a well-funded, rigid-spending, no-bequest household.

### 2f. Funding level and the value of flexibility

`research_history --sections funding` (5-year steps).

**Funding level sets the iid tent** (constant dollar; the gap as a share of the median retirement balance):

| savings / contribution | gap ÷ balance | tent | best constant | CE      | full-path shortfall |
| ---------------------- | ------------- | ---- | ------------- | ------- | ------------------- |
| $300k / $30k           | 1.8%          | 40%  | 40%           | $59,915 | 0.2%                |
| $200k / $20k (default) | 2.3%          | 50%  | 70%           | $58,107 | 2.6%                |
| $150k / $15k           | 2.8%          | 70%  | 100%          | $53,205 | 8.0%                |
| $120k / $12k           | 3.3%          | 100% | 100%          | $47,710 | 14.3%               |
| $100k / $10k           | 3.9%          | 100% | 100%          | $43,013 | 22.1%               |

A spender capped at the target gains nothing from wealth above what funds it (no bequest), but loses heavily from shortfalls. The more over-funded the plan, the more the optimizer protects the floor.

**Compare spending rules at the same spending level.** At a 4% rate the flexible rule's first-year draw is ~$83k (4% of a ~$2.07M balance) versus the constant rule's $40k, so most of the CE gap in §2b is **spending more**, not spending flexibly:

| Rule                      | Withdrawal rate | Year-1 draw | CE      |
| ------------------------- | --------------- | ----------- | ------- |
| constant dollar (default) | —               | $40,000     | $58,107 |
| flexible at 4%            | 4.00%           | $82,902     | $80,799 |
| flexible, matched draw    | 1.93%           | $40,000     | $60,939 |
| semi-flex, matched draw   | 1.93%           | $40,000     | $64,954 |

At a matched first-year draw, flexibility is worth **+$3k to +$7k/yr**. Letting each rule pick its own best spending level gives constant dollar $60.8k (target ≈ $70k) versus flexible $85.4k (≈ 6% rate): flexibility lets the household safely spend down wealth that a rigid plan leaves unused.

---

## 3. Results under historical sequencing (forward-block)

Forward-block pooled replays JST single-country sequences rescaled to the same forward marginals. It keeps two historical patterns iid removes: **equity mean reversion** over about a decade (variance ratio VR(10y) ≈ 0.91, where VR < 1 means multi-year variance grows more slowly than one-year variance) and **bond persistence** (VR(10y) ≈ 2.7 — bad real-return decades cluster, mostly through inflation). Blocks averaging 10 years carry this structure up to roughly that horizon.

### 3a. The tent largely disappears

Recommender, 1-year steps, 15,000 paths, γ = 4, 30-year accumulation:

| Spending | Ret. horizon | start | acc. avg | pre-ret | @ret | tent (age) | end | BEFORE | AFTER | CE income | Deplete |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| constant $ | 30y | 100 | 97 | 100 | 75 | 75 (@65) | 100 | Flat | Rising | $57,814 | 2.2% |
| constant $ | 40y | 100 | 99 | 100 | 95 | 95 (@65) | 100 | Flat | Flat | $55,911 | 3.6% |
| constant $ | 50y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $54,188 | 4.8% |
| semi-flex 50% | 30y | 100 | 100 | 100 | 100 | 100 (@65) | 0 | Flat | Flat | $80,960 | 0.4% |
| flexible 100% | 30y | 100 | 100 | 100 | 100 | 100 (@65) | 100 | Flat | Flat | $84,038 | 0.0% |

Out of sample the best constant weight is 100% in every row, and the glide's edge over it is −$15 to $0/yr (noise). Compared with iid, the constant-dollar accumulation path stays at ~100% instead of averaging 78%, and the residual dip is 75–100% instead of 30–70%. CE barely changes ($57.8k vs $58.1k at 30 years): the sequence model moves the **allocation** that achieves welfare far more than the welfare itself. This reproduces ACO's flat-100% on our own capital-market assumptions.

### 3b. What drives the flip

`research_history --sections matrix blocks channels` (constant dollar, 30y + 30y, 5-year steps; best constant weight per cell):

- **Sequencing, not pooling.** Forward-block reaches 100% on both the pooled panel (CE $57.8k) and the world average ($58.4k), against iid's 70%. Pooling matters for raw history instead: raw historical-block gives 100% on the diversified world series but 95% (and far lower CE, $45.7k) on single-country sequences, which carry country-level disasters that the forward rescale removes.
- **Any sequencing is enough.** Best constant weight by mean block length: 1y → 75%, 3y–40y → 100%. Only one-year blocks, which reduce to an iid resample, restore the interior answer.
- **It takes the joint structure.** Each cell changes one ingredient:

| Cell | Change from iid                                                  | Best constant |
| ---- | ---------------------------------------------------------------- | ------------- |
| a    | iid-mc baseline                                                  | 70%           |
| b1   | synthetic normals, curve-implied correlation (0.48)              | 70%           |
| b2   | synthetic normals, historical correlation (0.29)                 | 60%           |
| c    | rescaled history, years resampled iid (fat tails, no sequencing) | 80%           |
| d    | equity block-sampled, bonds shuffled                             | 50%           |
| e    | bonds block-sampled, equity shuffled                             | 70%           |
| f    | full forward-block (joint sequencing)                            | 100%          |

No single channel produces 100%. It needs bond persistence making long bonds risky **at the same time** as equity reversion making high equity recoverable. Equity sequencing alone deepens the tent, because history's short-run momentum (VR(2y) ≈ 1.1) raises near-horizon equity risk while shuffled bonds stay safe. Correlation is not immaterial: lowering it from 0.48 to 0.29 moves the iid answer by 10pp.

### 3c. Era and country cuts

The history is restricted before rescaling, so only the sequencing pattern changes. Variance ratios are on arithmetic returns (the basis the engine samples, invariant to the rescale); the iid-null column is the mean and 5th–95th percentile of VR(10y) under within-segment shuffling, because short samples bias VR below 1.

| History | bond VR(10y) | bond iid null | bill VR(10y) | equity VR(10y) | best constant | CE gain vs 100% |
| --- | --- | --- | --- | --- | --- | --- |
| full 1871–2020 | 2.66 | 1.00 [0.87, 1.15] | 3.29 | 0.91 | 100% | — |
| post-1950 | 2.21 | 0.94 [0.78, 1.09] | 4.97 | 0.91 | 100% | — |
| ex Germany + Japan | 2.54 | 0.99 [0.85, 1.13] | 3.63 | 0.94 | 100% | — |
| stable six¹ | 1.92 | 0.96 [0.77, 1.19] | 3.23 | 0.73 | 90% | +0.1% |
| 1990–2020 | **0.58** | 0.82 [0.61, 1.08] | 3.85 | 0.69 | **50%** | +0.4% |

¹ USA, UK, Canada, Australia, Switzerland, Sweden.

- **Not a disaster artifact:** dropping Germany and Japan leaves bond persistence essentially unchanged (2.54 vs 2.66).
- **Era-dependent for bonds:** in 1990–2020 bonds mean-revert (VR 0.58, below that cut's null 5th percentile), the stock/bond correlation falls to ≈0, and the interior tent returns. That cut is one 31-year regime dominated by a one-off fall in interest rates, and it ends before the 2021–22 inflation shock.
- **Bills stay persistent in every era** (VR 3.2–5.0): their nominal rate lags realized inflation. Short duration does not remove persistence; only inflation linkage does (§4).

### 3d. Welfare regret across regimes (robustness check)

**Regret** of a weight in a regime = that regime's best constant CE minus the weight's CE ($/yr). The **maximum regret** across regimes is the most a weight could cost if you don't know which regime is true. `research_history --sections regret` (constant dollar, 30y + 30y):

| Regime (forward-block unless noted) | best | 60%   | 70%   | 80% | 90%     | 100% |
| ----------------------------------- | ---- | ----- | ----- | --- | ------- | ---- |
| full 1871–2020                      | 100% | 1,673 | 931   | 479 | 184     | 0    |
| post-1950                           | 100% | 1,504 | 866   | 441 | 169     | 0    |
| ex Germany + Japan                  | 100% | 1,791 | 1,064 | 563 | 227     | 0    |
| stable six                          | 90%  | 433   | 153   | 28  | 0       | 57   |
| 1990–2020                           | 50%  | 14    | 46    | 94  | 163     | 260  |
| iid-mc                              | 70%  | 76    | 0     | 74  | 192     | 388  |
| **max regret**                      |      | 1,791 | 1,064 | 563 | **227** | 388  |

Any weight from 70% to 100% loses at most ~2% of CE in any regime; the smallest worst case is ~90% ($227/yr). The iid-optimized glide has a maximum regret of $975. This is a research robustness check, not a product rule: the app recommends what the selected model's simulation produces.

---

## 4. The bond menu

**Flat-100% is a verdict on long nominal bonds, not on equity.** Equity keeps its forward-block sequencing; only the non-equity asset changes (`research_history --sections menu`, constant dollar, 30y + 30y):

| Non-equity asset | best constant | CE at best |
| --- | --- | --- |
| a) long nominal bonds, historical sequencing (forward-block) | 100% | $57.8k |
| b) real asset, same mean/vol (1.56% / 5.27%), iid, zero correlation — **short-TIPS ETF proxy** | **50%** | $59.3k |
| c) idealized short real ladder, 2% vol | 15% | $59.9k |
| d) idealized ladder at 2.0% real | 10% | $60.0k |

- **Persistence axis (a → b):** removing the bond leg's persistence and correlation, at unchanged mean and volatility, moves the optimum from 100% to 50% and raises CE by ~$1.4k/yr. This is what inflation linkage buys, and a short-TIPS ETF delivers most of it: putting VTIP's measured mild persistence (AR(1) φ ≈ 0.13) through the optimizer moves the best weight only from 50% to 55% (`--sections tips-etf`).
- **Amplitude axis (b → c):** suppressing volatility to 2% needs a hold-to-maturity ladder (terminal real value locked in at purchase), which no Canadian retail product offers. Read 15% as an idealized bound; 50% is the buyable figure.
- **Short nominal is not enough.** JST's real bill returns are more persistent than bonds (VR(10y) 3.29 vs 2.66 pooled; bills ≥ bonds in every cut) because the nominal rate (VR ≈ 8, nearly a random walk) lags inflation. In the engine, a bill-ladder leg at 0.75% real / 2% vol that keeps its own historical persistence gives a best constant weight of **90%** (tent ~60%); the same bills made iid give 45% (`--sections bills-block`). Short duration helps a little; inflation linkage does most of the work.
- **Short beats long only for the tent's job.** For a temporary hedge protecting near-term withdrawals, short duration cuts drawdown depth cheaply. For a permanent bond sleeve, longer duration earns a term premium and rallies in deflationary crashes (but crashes with equities in inflationary ones, as in 2022); none of the nominal options fixes inflation.

**What a Canadian can buy:**

| Product | Duration (amplitude) | CPI link (persistence) | Residual risk |
| --- | --- | --- | --- |
| XSTH / ZTIP.F (short US TIPS, CAD-hedged) | short | US CPI | CPI basis vs a CAD liability |
| XRB (Canadian real return bonds) | long (~13–15y) | Canadian CPI | 2022-style drawdown (≈ −14%) |
| GIC / bill ladder | short, hold to maturity | none | inflation persistence |

No product offers short duration **and** Canadian CPI (Canada stopped issuing RRBs in 2022). For the sequence-hedge role XSTH fits best; a blend with XRB approximates the missing short domestic real asset. The value is regime-conditional: TIPS earn their keep in persistent-inflation regimes and are largely redundant in disinflationary ones like 1990–2020, which makes a real asset a hedge across regimes rather than a free lunch. (Live-fund check, US 2012–25 including the 2021–23 shock: VTIP VR(2y) ≈ 1.1 and STIP ≈ 1.6 versus ≈ 4.8 for short Treasuries, with TIPS earning ~0.9pp/yr more real return.)

---

## 5. Comparison with ACO and ERN

- **ACO** — Anarkulova, Cederburg & O'Doherty, _Beyond the Status Quo_ ([SSRN 4590406](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4590406)): a 38-country block bootstrap finds ~100% equity held flat over the lifecycle, with a shallow tent at retirement for constant spending.
- **ERN** — [earlyretirementnow.com, Part 20](https://earlyretirementnow.com/2017/09/20/the-ultimate-guide-to-safe-withdrawal-rates-part-20-more-thoughts-on-equity-glidepaths/): a US backtest finds a rising retirement glide (e.g. 60%→100%) adds ~0.1–0.3pp to the SWR, but only when CAPE > 20.

| Claim | Verdict |
| --- | --- |
| ACO: ~100% equity, flat | **Reproduced** under forward-block, and under iid for flexible spending or a tightly funded plan. For a well-funded rigid spender under iid, a ~70% tent beats 100% by ~1% at a 30-year retirement and by less at longer horizons. |
| ERN / Kitces–Pfau: rising retirement glide | The derisk-then-rise shape emerges under iid with rigid spending and no valuation signal, and largely vanishes under forward-block. ERN's SWR boost does **not** reproduce under iid (§2a): the rising glide only ties the best constant weight. |
| Both: beat a declining (target-date) retirement glide | Direction agreed, magnitude tiny: the glide shape is worth ≤ ~0.5% of CE. |

**Why our iid path differs from ACO's.** ACO stays at ~100% through accumulation; our iid constant-dollar path falls into the tent. Two levers each close the gap: restoring historical sequencing (§3) and reducing over-funding (§2f). ACO also values terminal wealth, which removes the "wasted upside" of a capped spender. Because JST and ACO draw on largely the same developed-market history, reproducing ACO here is consistency, not independent confirmation.

---

## 6. Caveats

- **iid has no valuation signal or mean reversion.** It cannot reproduce ERN's CAPE-conditional effect and overstates the derisking incentive if history's recoveries persist. Neither engine models valuation timing.
- **Sequencing evidence is statistically weak.** 150 years × 16 correlated countries amount to a handful of independent 60-year lifecycles; equity VR(10y) ≈ 0.91 is probably not distinguishable from 1. The block-length result helps (any sequencing ≥ 3-year blocks flips the answer), but read §3 as a bracket, not a point estimate.
- **The flip is a joint, era-dependent property** with no single parameter to stress. Whether the full-sample or the 1990–2020 structure better describes the next 60 years is a monetary-regime judgment the data cannot settle.
- **Survivorship.** JST covers markets that survived with usable data; the recoveries behind §3 partly reflect that.
- **Sequencing is assumed independent of the return level.** Forward-block keeps historical dynamics at a lower forward premium.
- **One equity asset, two-asset menu.** No domestic/international split; a real short-duration asset is the most valuable missing option (§4).
- **The iid curve fixes stock/bond correlation at ≈0.48 and gives bonds no inflation risk** — the most bond-friendly assumption here.
- **Fixed horizon, no mortality weighting, no bequest, fixed contributions, no taxes or fees, annual rebalancing, discrete grid.** Read shape direction and rough magnitude, not basis points.

---

## 7. Code and reproduction

**Python** (`analysis/glide_path/`, see its [README](../../analysis/glide_path/README.md)):

| Module | Role |
| --- | --- |
| `markets.py` | capital-market curve, geometric→arithmetic conversion, iid and historical return models |
| `simulate.py` | lifecycle cash flows, CRRA utility, outcome statistics |
| `recommender.py` | `recommend_glide_path` / `evaluate_path` and the coordinate-ascent optimizer |
| `report.py`, `interactive.py`, `cli.py` | summaries and plots, prompt flow, flag CLI |
| `research.py`, `research_history.py` | §2 iid sweep; §3–§4 history, menu, regret and funding sections |
| `generate_bundle.py` | writes the web app's rescaled JST bundle |

`recommend_glide_path(...)` returns the per-step schedule; CE income, income CV and both shortfall views for the glide and the best constant weight; the year-1 draw and funding ratio; and, optionally, the CE of every constant weight. Curve means are treated as nominal geometric unless `curve_mean_basis="arithmetic"`. Research code can pass `history=` (a custom or cut return series) and `sampler=` (a custom index sampler).

**Web** (`src/utils/glide-path/`): `engine.ts` (same model, one simulation kernel, iid and forward-block), `recommendation.ts` (simplicity rule), `jstData.ts` (generated bundle). The web app fixes 5-year steps and requires ≥ $10k guaranteed income.

```bash
python3 -m analysis.glide_path.research               # §2 tables + figures (~5 min)
python3 -m analysis.glide_path.research_history --sections matrix blocks channels menu \
    tips-etf bills-block gamma curves vr regret funding \
    --accum 30 --retire 30 --savings 200000 --contrib 20000 --interval 5 --paths 8000
python3 analysis/recommend_glide.py --help             # one recommendation from flags
python3 -m analysis.glide_path.recommender             # interactive prompts (--demo for the sweep)
python3 -m analysis.glide_path.generate_bundle         # regenerate src/utils/glide-path/jstData.ts
```

The §3a table comes from `recommend_glide_path(..., interval=1, return_mode="forward-block", n_paths=15_000)`. Historical modes download JST R6 to the gitignored `analysis/.data/` on first use (needs pandas and openpyxl).

---

## Corrections log

November 2026 review; all tables above are regenerated.

- **Return basis.** The curve's returns are geometric, but the engines used them as arithmetic means, so every mix compounded ~σ²/2 too low (100% equity at 3.9% real instead of 4.7%), biasing results toward bonds. Both engines now convert. The best constant weight for the default plan rose from 60% to 70%, and flexible spending now holds 100% throughout.
- **Optimizer ties.** `argmax` broke exact ties toward 0% equity, which produced the apparent "terminal derisking" at flex = 1. Ties now keep the incoming weight.
- **World vs pooled.** The research cells labelled "(world)" had run the pooled dataset. Corrected runs show sequencing, not pooling, drives forward-block to 100%.
- **Variance ratios.** They were computed on log returns, where Germany's 1923 bond year (−99.99999%, log ≈ −20.7) dominated: pooled bond VR(10y) read 1.70 instead of 2.7, and the stable-six and ex-Germany/Japan cuts wrongly looked more persistent.
- **Flexibility value.** The earlier "$13–16k/yr from flexibility" compared a ~4% flexible draw with a ~2% constant draw. At a matched draw it is +$3–7k/yr.
- **Minimax regret.** iid's interior answer had been called the minimax-regret choice based on allocation distance. Computed welfare regret favours ~90% (§3d), so the claim was withdrawn.
- **Smaller fixes.** Correlation in the channel test (the iid curve already embeds 0.48); a duplicated bond-menu cell; the TIPS check using un-rescaled equity; the bills test rescaling bills to the bond anchors; best-constant selection on the scoring draw; inconsistent shortfall and slope definitions between scripts.

---

## References

- Anarkulova, Cederburg & O'Doherty — _Beyond the Status Quo: A Critical Assessment of Lifecycle Investment Advice_ (SSRN 4590406).
- Early Retirement Now — Safe Withdrawal Rate Series, Part 20 (equity glidepaths).
- Kitces & Pfau (2014) — _Reducing Retirement Risk with a Rising Equity Glide Path_.
- Estrada (2014) — _The Glidepath Illusion_.
- Jordà, Knoll, Kuvshinov, Schularick & Taylor (2019) — "The Rate of Return on Everything, 1870–2015", _QJE_ 134(3); JST Macrohistory Database R6.
- FP Canada / IQPF — Projection Assumption Guidelines (geometric returns; conversion for Monte Carlo).
- PWL Capital — Financial Planning Assumptions.
- [`retirement` SWR methodology](../retirement/swr-methodology.md) — shared return assumptions and the JST withdrawal-rate cross-check.
