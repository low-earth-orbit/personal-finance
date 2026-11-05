# Retirement SWR — Methodology

Developer reference for the **When can I retire?** tool (`/retirement`): how the Monte Carlo engine works, where the return assumptions come from, why the long-horizon safe withdrawal rate (SWR) looks low, and the historical evidence behind keeping returns iid (`RETURN_AUTOCORRELATION = 0`). Read this before "fixing" an SWR that seems too low.

Code: engine [`src/utils/retirement/monteCarlo.ts`](../../src/utils/retirement/monteCarlo.ts), presets [`src/utils/retirement/presets.ts`](../../src/utils/retirement/presets.ts), historical validation [`analysis/retirement/jst_swr_bootstrap.py`](../../analysis/retirement/jst_swr_bootstrap.py). The [glide-path methodology](../glide-path/methodology.md) uses the same capital-market assumptions and JST data.

## Contents

- [Summary](#summary)
- [1. Model](#1-model)
- [2. Why the long-horizon SWR is low](#2-why-the-long-horizon-swr-is-low)
- [3. Validation against history](#3-validation-against-history)
- [4. Serial correlation: why returns stay iid](#4-serial-correlation-why-returns-stay-iid)
- [5. Guidance for future changes](#5-guidance-for-future-changes)
- [Corrections log](#corrections-log)
- [References](#references)

---

## Summary

- **The long-horizon SWR is low because the return assumption is modest, not because the risk model is harsh.** A 60/40 portfolio at 90% success sustains 3.86% over 30 years and 2.86% over 50 years.
- **The returns are mainstream, not conservative.** Presets come from PWL Capital, corroborated by FP Canada's Projection Assumption Guidelines: 3.5% real compound for 60/40.
- **The US "4% rule" does not transfer.** It reflects US real returns of ~6% (5.5% compound) — the luckiest equity century on record.
- **History confirms the engine.** Forward-calibrated historical sequencing gives 3.86% at 30 years versus the engine's 3.90%; the gap is ≤ 0.07pp at every horizon.
- **The lever is the return assumption.** Raising the 50-year SWR to the US-style ~3.7% would need ~5% real compound returns — near-US assumptions. Not recommended.

---

## 1. Model

A two-phase Monte Carlo in real (today's) dollars, with a fixed random seed so identical inputs give identical output.

### 1.1 Phases

- **Accumulation** (`accumulationBalances`): deterministic for the headline. Savings grow at the accumulation phase's real **geometric** (compound) return plus annual contributions — the median-path balance. A separate stochastic pass (`retirementAgeRange`) simulates saving-period market luck to report the 25th–75th percentile range of the earliest feasible retirement age.
- **Drawdown** (`simulate`): stochastic. From the balance at a candidate retirement age, each year draws a real return, withdraws the income gap (target − guaranteed income; the **full** target during a pre-pension bridge) mid-year (earning half a year's return), and absorbs at zero if depleted.
- **Spending guardrail** (`GUARDRAIL_TRIGGER = 1.2`): when spending flexibility > 0, spending stays at the target until a weak sequence lifts the current withdrawal rate 20% above the rate at retirement, then drops to the floor (target less the flexibility %). It is a simplified Guyton–Klinger rule: one binary cut, downside only, re-evaluated each year. At 0% flexibility it reduces to the fixed real withdrawal the SWR tables below assume.

### 1.2 Returns

The presets are **nominal geometric** returns with volatilities (PWL Capital, inflation 2.1%, cross-checked against FP Canada's 2026 guidelines). Monte Carlo draws need **arithmetic** means, so each phase's preset is converted with the exact lognormal relation

```
(1+A)² = [ (1+G)² + √((1+G)⁴ + 4(1+G)²σ²) ] / 2
```

then deflated to real (`(1+A)/(1+π) − 1`, volatility `σ/(1+π)`). Each year's return is normal around that mean (`RETURN_AUTOCORRELATION = 0`, §4), so simulated compound growth matches the preset's stated rate.

| Mix | Nominal geometric (input) | Volatility | Real geometric | Real arithmetic (MC mean) |
| --- | --- | --- | --- | --- |
| 100/0 | 6.87% | 12.57% | 4.67% | 5.38% |
| 80/20 | 6.29% | 10.62% | 4.10% | 4.62% |
| **60/40 (retirement default)** | **5.67%** | **8.79%** | **3.50%** | **3.85%** |
| 40/60 | 5.01% | 7.17% | 2.85% | 3.09% |

Custom returns are treated the same way (nominal compound), with volatility from the calibrated `investmentAnnualVolPct` curve. Path counts: 1,000 for the headline feasibility and bands (~±1pp Monte Carlo noise on a 90% success rate), 300 sims × 800 paths for the age-range pass, 4,000 per technical-note table cell.

### 1.3 Outputs

- **Feasibility** (`computeRetirement`): the earliest age whose drawdown simulation meets the user's target success rate (e.g. 90%).
- **Headline SWR** (`computePlanSWR`): the first retirement year's portfolio draw ÷ the deterministic savings at that age — the plan's actual initial withdrawal rate. Because the age search steps a year at a time, savings usually overshoot the minimum slightly, so this sits at or below the marginal SWR.
- **Reference SWR** (`safeWithdrawalRate`): the pure-portfolio SWR for a given return, volatility and horizon, independent of the user's savings and pension. It powers the **technical note** ([`SwrTechnicalNote.tsx`](../../src/components/retirement/SwrTechnicalNote.tsx), the "Why this figure?" link beside the headline): a live table by allocation × horizon at the user's chosen confidence. Because it excludes CPP/OAS/pensions, it intentionally differs from the blended headline figure.

---

## 2. Why the long-horizon SWR is low

SWR at 90% success for 60/40, by assumed real **compound** return (current preset in bold):

| Real compound return | 20y       | 30y       | 40y       | 50y       |
| -------------------- | --------- | --------- | --------- | --------- |
| **3.5% (preset)**    | **5.28%** | **3.86%** | **3.22%** | **2.86%** |
| 4.0%                 | 5.53%     | 4.12%     | 3.50%     | 3.15%     |
| 4.5%                 | 5.79%     | 4.39%     | 3.80%     | 3.46%     |
| 5.0%                 | 6.05%     | 4.68%     | 4.11%     | 3.78%     |

- At 3.5% real, the median retiree barely grows the portfolio while withdrawing, so each extra decade of horizon lowers the sustainable rate.
- A typical retirement (retire at 60–65, plan to 95, a 30–35 year horizon) supports ~3.5–3.9%. Rates below 3% appear only at 45–50 year horizons (retiring at 45–50), where caution is appropriate.
- Each +0.5pp of real return adds ~0.3pp to the 50-year SWR. Matching the US-style ~3.7% floor at 50 years needs ~5% real compound, well above the 3.5% anchor.

---

## 3. Validation against history

[`analysis/retirement/jst_swr_bootstrap.py`](../../analysis/retirement/jst_swr_bootstrap.py) compares the engine with historical return paths from the **Jordà–Schularick–Taylor (JST) R6** database (1870–2020; 16 countries with both stock and bond returns — Canada and Ireland have none in R6). It downloads the data to gitignored `analysis/.data/` and reuses the glide-path bootstrap code (`analysis/shared/jst_history.py`).

### 3.1 Design

Columns cross two factors — which return **levels** (marginals) and which **sequencing** — on two datasets: `world` (countries averaged each year, a diversified series) and `pooled` (each country's own sequence, single-country risk).

|  | Historical levels | Forward levels (rescaled to the presets) |
| --- | --- | --- |
| **No sequencing** | overlapping windows: §A USA, §B world, §D pooled | §H the app's iid engine |
| **Block sequencing** | block bootstrap: §C world, §E pooled | forward-block: §F world, §G pooled |

- **Overlapping windows** run a retirement over every historical start year.
- **Block bootstrap** resamples runs of consecutive years (stationary bootstrap, 10-year mean block length), keeping multi-year patterns.
- **Forward-block** first affine-rescales each asset's history to the presets' real arithmetic anchors (equity 5.38% / 12.31%, bonds 1.56% / 5.27%), so only the sequencing is historical.

Real 60/40 return statistics:

| Series                            | Mean  | Vol    | Compound |
| --------------------------------- | ----- | ------ | -------- |
| USA (149 years)                   | 6.19% | 12.10% | 5.47%    |
| World, equal-weight (150 years)   | 5.14% | 9.61%  | 4.69%    |
| Pooled single-country (2,212 obs) | 5.04% | 15.44% | 3.79%    |
| World, forward-rescaled           | 3.85% | 8.39%  | 3.51%    |
| Pooled, forward-rescaled          | 3.85% | 8.26%  | 3.52%    |
| App preset, iid                   | 3.85% | 8.61%  | 3.50%    |

### 3.2 Results

SWR at 90% success, 60/40, 20,000 paths:

| Horizon | §A USA | §B World | §C World block | §D Pooled | §E Pooled block | §F World fwd-block | §G Pooled fwd-block | §H App iid |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20y | 5.39% | 4.95% | 5.00% | 3.41% | 3.91% | 4.86% | 5.26% | 5.26% |
| 25y | 4.85% | 4.16% | 4.29% | 2.64% | 3.07% | 4.05% | 4.41% | 4.43% |
| 30y | 4.54% | 3.77% | 3.78% | 2.18% | 2.47% | 3.56% | 3.86% | 3.90% |
| 35y | 4.28% | 3.43% | 3.48% | 1.82% | 2.14% | 3.23% | 3.44% | 3.51% |
| 40y | 4.08% | 3.20% | 3.22% | 1.59% | 1.94% | 2.96% | 3.19% | 3.23% |
| 45y | 3.90% | 2.98% | 3.05% | 1.33% | 1.69% | 2.75% | 2.96% | 3.01% |
| 50y | 3.74% | 2.83% | 2.95% | 1.20% | 1.61% | 2.61% | 2.80% | 2.83% |

(§H is the Python replica; the web engine at 4,000 paths gives 3.86% at 30 years.)

### 3.3 Findings (30-year horizon)

1. **The engine matches forward-calibrated history (§G vs §H): 3.86% vs 3.90%.** The app is 0.00–0.07pp above pooled forward-block at every horizon — very slightly optimistic, not conservative.
2. **A diversified, forward-looking Canadian retiree's range is 3.6–3.9%** (§F–§G). It is bracketed below by raw single-country history (§E, 2.47%) and above by US history (§A, 4.54%).
3. **Single-country history is far harsher** (§D 2.18%, §E 2.47%). It includes Germany 1914–1943, Japan in the 1940s and UK 1970s stagflation, when a single-country 60/40 retiree was wiped out. This sets a lower bound but does not describe a globally diversified investor. The damage comes from bad years clustering within a country-decade, so it survives block resampling.
4. **With 10-year blocks, block bootstrap tracks overlapping windows** on the world series (§C 3.78% vs §B 3.77%). An earlier study with 8-year blocks found the bootstrap fell below; that conclusion depended on block length.
5. **Lower forward returns lower the world floor** (§F 3.56% vs §B 3.77%): the historical world figure relied partly on its 4.69% compound return.
6. **Pooled sequencing beats world sequencing at the same levels** (§G 3.86% vs §F 3.56%). The world series has stronger bond persistence (variance ratio VR(10y) ≈ 3.7 vs ≈ 2.7 pooled, arithmetic basis): sustained inflation epochs hit the bond leg and don't recover within a block. Pooled sequences also carry stronger within-country equity mean reversion.
7. **US history is exceptional** (§A 4.54%). It is close to the "4% rule", but that is partly coincidence: Bengen's 4% is the worst case (100% success) over US history, while §A is a 90%-success figure. The ~0.8pp premium over the world average comes from higher US returns (5.47% vs 4.69% compound).

### 3.4 Caveats

These follow from the shared JST data ([glide-path methodology §6](../glide-path/methodology.md#6-caveats)):

- **Survivorship.** JST covers 16 developed markets that survived with usable data; the world floor and the within-country recoveries behind §G partly reflect that.
- **Tiny effective sample.** ~120 overlapping 30-year windows per series contain only 4–5 independent windows per country, heavily correlated across countries (same wars, same inflation waves). No column difference has a confidence interval.
- **Era dependence.** §G ≈ §H is a full-sample (1871–2020) statement. In the 1990–2020 inflation-targeting era bonds mean-revert instead of persisting, so historical sequencing there would sit above iid. The two eras bracket iid from both sides.
- **Normal vs fat-tailed marginals.** The engine draws normal returns while §G carries history's fat tails; the ≤ 0.07pp gap nets this against the sequencing effect, but the two cannot be separated.

---

## 4. Serial correlation: why returns stay iid

`RETURN_AUTOCORRELATION` is the AR(1) coefficient on the annual return deviation.

- **It was −0.2** (mean reversion), which cuts multi-year variance by about a third (variance ratio (1+φ)/(1−φ) ≈ 0.67) and lifts the SWR. It had been tuned to land the 30-year figure near Morningstar's.
- **It is now 0** (iid). The AR(1) machinery remains, so a separately justified view can be reintroduced by changing one constant.
- **Why not a small negative value?** Historical equity VR(10y) ≈ 0.91 implies a lag-1 autocorrelation of about −0.05, but:
  - adding it barely moves the SWR;
  - bonds have the opposite sign (persistent, VR(10y) ≈ 2.7), which a single scalar AR(1) cannot represent;
  - the joint historical dynamics, tested directly in §3, put the engine within 0.07pp of history.

  The block bootstrap is the empirical answer; there is no need to approximate it parametrically.

---

## 5. Guidance for future changes

- **Don't chase the US 4% / 3.7% floor by inflating returns.** It would abandon the Canadian anchor; the low long-horizon SWR is the honest output.
- **Keep `RETURN_AUTOCORRELATION = 0`** (§4). Full-sample sequencing sits slightly below iid and 1990–2020 sequencing slightly above, so iid is bracketed from both sides. Use the historical bootstrap for research, not the parametric engine.
- **Keep presets geometric.** Any new return input should be treated as a nominal compound rate and converted for the Monte Carlo (`src/utils/returns.ts`); deterministic paths compound the geometric rate.
- **Re-run the validation** with `python3 -m analysis.retirement.jst_swr_bootstrap` (CONFIG block: allocation, `TARGET`, `BLOCK_YEARS`, `HORIZONS`).

---

## Corrections log

**November 2026 — return basis.** The PWL / FP-Canada presets are nominal **geometric** returns (FP Canada's guidelines say so and prescribe a conversion for Monte Carlo), but the engine had used them as the **arithmetic** mean of its normal draws. Every simulated mix therefore compounded ~σ²/2 below its stated rate (60/40 at 3.1% real instead of 3.5%). The engine now converts; all figures above are regenerated.

|                                       | Before | After  |
| ------------------------------------- | ------ | ------ |
| Default plan: earliest retirement age | 60     | 59     |
| Default plan: headline SWR            | 4.26%  | 4.50%  |
| 60/40 SWR at 30 years                 | 3.68%  | 3.86%  |
| §G vs §H gap at 30 years              | 0.11pp | 0.04pp |

Two related corrections:

- **Preset labels.** The preset table had labelled the 4.7% / 3.5% figures "real arithmetic"; they are the real geometric rates.
- **The old §G–§H gap.** It was explained as "the PWL 60/40 return (3.50%) vs the linear per-asset blend (3.37%)". That difference was the geometric/arithmetic mix-up itself (the curve's concavity is the 60/40 diversification return), and it disappears once both are on the same basis.

---

## References

- PWL Capital — Financial Planning Assumptions (market-cap-weighted portfolio).
- FP Canada / Institut de planification financière — Projection Assumption Guidelines 2025/26.
- Jordà, Knoll, Kuvshinov, Schularick & Taylor (2019) — "The Rate of Return on Everything, 1870–2015", _QJE_ 134(3). Data: <https://www.macrohistory.net/database/>.
- Morningstar — "What's a Safe Retirement Withdrawal Rate?" (annual; Blanchett et al.).
- Kitces — Monte Carlo vs rolling historical returns and sequence-of-returns risk.
- Vanguard VCMM — valuation-conditioned forward returns (an example of in-simulation mean reversion; sophisticated but contested).
