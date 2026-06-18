# Retirement SWR — Methodology & Calibration Notes

Developer reference for the **When can I retire?** tool (`/retirement`). Explains how the Monte Carlo engine works, where the return assumptions come from, why the long-horizon safe withdrawal rate (SWR) looks low, and the empirical work behind the `RETURN_AUTOCORRELATION = 0` decision. Read this before "fixing" a SWR that seems too low.

Engine: [`src/utils/retirement/monteCarlo.ts`](../../src/utils/retirement/monteCarlo.ts). Presets: [`src/utils/retirement/presets.ts`](../../src/utils/retirement/presets.ts). Validation prototype: [`analysis/retirement/jst_swr_bootstrap.py`](../../analysis/retirement/jst_swr_bootstrap.py).

## Contents

1. [How the engine works](#1-how-the-engine-works)
2. [Why the long-horizon SWR is low](#2-why-the-long-horizon-swr-is-low-and-correct)
3. [The autocorrelation decision](#3-the-return_autocorrelation-decision)
4. [JST empirical validation — full factorial](#4-empirical-validation--jst-macrohistory-full-factorial)
5. [Return-assumption sensitivity](#5-sensitivity--what-raising-returns-would-do-path-b)
6. [UI technical note](#6-ui--the-technical-note)
7. [Guidance for future changes](#7-guidance-for-future-changes)

---

## TL;DR

- The long-horizon SWR (~2.6% at 50y for 60/40) is **low because the return assumption is modest, not because the risk model is harsh.** This is correct, not a bug.
- Return presets come from **PWL Capital** (corroborated by **FP Canada** planning guidelines). They are mainstream Canadian forward estimates — **not conservative**.
- The US "4% rule" is a **US-exceptionalism artifact** (US real returns ~6%, geo ~5.4%). It does not transfer to Canadian forward CMAs.
- `RETURN_AUTOCORRELATION = 0` (iid) is confirmed correct: the app's parametric output is within ~0.1pp of forward-calibrated historical sequencing (pooled forward-block) across all horizons. The iid assumption is mildly optimistic vs empirical sequencing (not conservative), but the gap is small enough that it does not justify adding a negative AR(1) coefficient.
- **If asked to lift the long-horizon SWR, the lever is the return assumption — not the risk model.** Inflating returns to chase the US floor is not recommended.

---

## 1. How the engine works

A two-phase, real-dollar (inflation-adjusted) Monte Carlo:

- **Accumulation** (`accumulationBalances`): deterministic for the headline answer — grows start savings at the accumulation mean real return plus annual contributions. A separate stochastic accumulation pass (`retirementAgeRange`) simulates saving-path luck to report the 25th–75th percentile range of the earliest feasible retirement age.
- **Drawdown** (`simulate`): stochastic. Starting from the balance at a candidate retirement age, each year draws a real return `r = mean + deviation`, withdraws the income gap (target − guaranteed/pension; the **full** target during a pre-pension bridge), and absorbs at zero if depleted. Withdrawals are mid-year (earn a half-year of return), matching the rent-vs-buy convention.
- **Spending guardrail** (`GUARDRAIL_TRIGGER = 1.2`): when `spendingFlexibilityPct > 0`, spending stays at the full target until a weak sequence lifts the current withdrawal rate 20% above the rate at retirement, then trims to the floor (target less the flexibility %) — a simplified, downside-only, memoryless Guyton–Klinger. At 0% flexibility this reduces exactly to the fixed real withdrawal the SWR tables in this note assume.
- **Feasibility** (`computeRetirement`): the earliest age whose drawdown sim clears the user's target success rate (e.g. 90%).
- **Headline SWR** (`computePlanSWR`): the first retirement year's portfolio draw ÷ the (deterministic) savings at the chosen age — the plan's true initial withdrawal rate. Because the age search steps annually, savings at the chosen age generally overshoot the minimum required wealth slightly, so this rate sits at or below the marginal SWR.
- **Reference SWR** (`safeWithdrawalRate`): pure-portfolio SWR for a given mean/vol/horizon — powers the technical-note table; independent of the user's savings/pension.

Returns are **normal (arithmetic)** around the phase mean; compounding produces the usual volatility drag (geometric ≈ arithmetic − σ²/2). Fixed PRNG seed ⇒ deterministic output. Simulation counts: 1,000 paths for the headline feasibility/bands, 300 sims × 800 paths for the age-range pass, 4,000 for each technical-note table cell (the Python validation in §4 uses 20,000) — at 1,000 paths the success rate carries ~±1pp of Monte Carlo noise at a 90% target.

### Return / volatility presets (real, derived from nominal − inflation)

| Mix                        | Nominal return | Volatility | Real arith. | Real geo. |
| -------------------------- | -------------- | ---------- | ----------- | --------- |
| 100/0                      | 6.87%          | 12.57%     | ~4.7%       | ~3.9%     |
| 80/20                      | 6.29%          | 10.62%     | ~4.1%       | ~3.5%     |
| **60/40 (retire default)** | **5.67%**      | **8.79%**  | **~3.5%**   | **~3.1%** |
| 40/60                      | 5.01%          | 7.17%      | ~2.8%       | ~2.6%     |

Source: **PWL Capital** capital-market assumptions (linked in [`Assumptions.tsx`](../../src/components/retirement/Assumptions.tsx)). Inflation 2.1%. Cross-checked against **FP Canada 2026 Projection Assumption Guidelines**.

---

## 2. Why the long-horizon SWR is "low" (and correct)

SWR @ 90%, 60/40, current engine (φ = 0, iid):

| Horizon | 20y   | 30y   | 40y   | 50y   |
| ------- | ----- | ----- | ----- | ----- |
| SWR     | 5.08% | 3.68% | 2.99% | 2.64% |

This is **entirely a consequence of the ~3.5% real return assumption.** At ~3.5% real, the median retiree barely grows the portfolio while withdrawing, so longer horizons keep biting. The US 4%-rule floor (~3.7% even at 50y) assumes **US real returns of ~6%** (geo 5.4%) — the luckiest equity century on record — which Canadian forward CMAs explicitly do not project.

**For a typical retirement (retire 60–65, plan to 95 ⇒ 30–35y horizon) the SWR is ~3.3–3.7%, which is reasonable.** Sub-2.8% appears only at 45–50y horizons (retiring at 45–50), where caution is appropriate.

---

## 3. The `RETURN_AUTOCORRELATION` decision

`RETURN_AUTOCORRELATION` is the AR(1) coefficient on the annual return deviation.

- **Was −0.2** (mean reversion). Variance ratio (1+φ)/(1−φ) ≈ 0.67 ⇒ ~⅓ less multi-year dispersion ⇒ higher SWR. Had been tuned to land the 30y number near Morningstar.
- **Now 0** (iid). The AR(1) machinery remains (just zeroed) so a separately justified view could be reintroduced by changing one constant.
- **The −0.05 candidate (from equity VR diagnostics)**: the JST variance-ratio analysis (see glide-path methodology) gives equity VR(10y) ≈ 0.91, implying a lag-1 autocorrelation of about −0.05. However, adding ρ = −0.05 barely moves the SWR or optimal allocation in practice, and the bond side has _positive_ persistence (VR > 1) which cannot be handled by the same scalar AR(1). The empirically grounded answer is to use the historical block bootstrap (§4), not to approximate the joint dynamics parametrically.

**Why we keep it at zero:** the full factorial (§4) shows that the app's iid estimate (§H) is within ~0.1pp of forward-calibrated historical sequencing (§G, pooled forward-block) at every horizon — mildly optimistic, not conservative. The gap is small (0.1pp at 30y) and not large enough to justify adding a negative AR(1) coefficient. Historical sequences do carry some negative equity serial correlation (equity VR ≈ 0.91 implies ρ ≈ −0.05), but the bond side has _positive_ persistence, and the net effect on the 60/40 portfolio is close to zero.

---

## 4. Empirical validation — JST Macrohistory full factorial

Prototype: [`analysis/retirement/jst_swr_bootstrap.py`](../../analysis/retirement/jst_swr_bootstrap.py). Auto-downloads **Jordà–Schularick–Taylor R6** (1870–2020, 18 economies in database, 16 with equity+bond series — Canada and Ireland have no return data in R6) to a gitignored `analysis/.data/`. Uses the same segment-aware block infrastructure built for the glide-path research (`analysis/shared/jst_history.py`).

The script tests the **marginals × sequencing × dataset factorial** that mirrors the glide-path research:

|                       | Marginals: historical         | Marginals: forward-CMA    |
| --------------------- | ----------------------------- | ------------------------- |
| **Sequencing: none**  | overlapping windows (§A/B/D)  | iid parametric (§H)       |
| **Sequencing: block** | block bootstrap (§C/E)        | forward-block (§F/G)      |
|                       | world=§B/C &nbsp; pooled=§D/E | world=§F &nbsp; pooled=§G |

Forward-CMA anchors (real): equity 4.67%/12.57%, bonds 1.42%/5.38%.

### Return statistics

| Series                           | Mean  | Vol    | Geo   |
| -------------------------------- | ----- | ------ | ----- |
| USA (149 yrs)                    | 6.19% | 12.10% | 5.47% |
| World eq-wt (150 yrs)            | 5.14% | 9.61%  | 4.69% |
| Pooled single-country (2212 obs) | 5.04% | 15.44% | 3.79% |
| World fwd-rescaled               | 3.37% | 8.57%  | 3.01% |
| Pooled fwd-rescaled              | 3.37% | 8.43%  | 3.02% |
| App ALLOC iid                    | 3.50% | 8.79%  | —     |

### SWR results @ 90%, 60/40, block = 10y

| Horizon | §A USA | §B Wld-OL | §C Wld-Blk | §D Pool-OL | §E Pool-Blk | §F Wld-FwdBlk | §G Pool-FwdBlk | §H App iid |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20y | 5.39% | 4.95% | 5.00% | 3.41% | 3.91% | 4.60% | 4.98% | 5.08% |
| 25y | 4.85% | 4.16% | 4.29% | 2.64% | 3.07% | 3.78% | 4.13% | 4.26% |
| 30y | 4.54% | 3.77% | 3.78% | 2.18% | 2.47% | 3.29% | 3.57% | 3.68% |
| 35y | 4.28% | 3.43% | 3.48% | 1.82% | 2.14% | 2.95% | 3.15% | 3.28% |
| 40y | 4.08% | 3.20% | 3.22% | 1.59% | 1.94% | 2.68% | 2.89% | 2.99% |
| 45y | 3.90% | 2.98% | 3.05% | 1.33% | 1.69% | 2.46% | 2.65% | 2.79% |
| 50y | 3.74% | 2.83% | 2.95% | 1.20% | 1.61% | 2.31% | 2.49% | 2.64% |

### What the factorial teaches

**1. §B vs §C — block bootstrap (10y) now tracks overlapping on world series.** At 30y: 3.77% vs 3.78%. The old study used 8y blocks and found block bootstrap fell below iid. With 10y blocks the block bootstrap captures enough of the within-country mean reversion cycle to reproduce the overlapping floor. The old "block bootstrap destroys the floor" conclusion was block-length dependent; it no longer holds at 10y.

**2. §D — raw pooled overlapping gives catastrophically low SWRs.** At 30y: 2.18% (vs 3.77% world). Within-segment windows include Germany's 1914–1943 sequence, Japan's 1940s, UK's 1970s stagflation — periods where a single-country retiree with 60/40 was wiped out. This is real historical evidence that retirement risk is severe for undiversified single-country investors. It is not directly applicable to a globally diversified Canadian investor, but it sets the lower bound.

**3. §E — pooled block bootstrap also much lower than world.** At 30y: 2.47%. Single-country sequence risk survives block resampling; the disaster structure is not in the precise year ordering but in the clustering of bad years within a country-decade.

**4. §F — world forward-block falls below world overlapping.** At 30y: 3.29% vs 3.77%. Rescaling the world series down to forward-CMA levels (mean 4.69%→3.37% geo) reduces the SWR. The world overlapping floor relied partly on high historical world returns (geo 4.69%); at the app's more modest 3.1% real geo, the floor is lower.

**5. §G vs §H — the key comparison: forward sequencing ≈ iid.** At 30y: 3.57% (§G, pooled fwd-block) vs 3.68% (§H, app iid). App iid is ~0.1pp _above_ pooled fwd-block across all horizons. The forward-calibrated historical sequencing, which preserves real equity and bond serial correlation from single-country sequences, is mildly less favorable than iid. This means `RETURN_AUTOCORRELATION = 0` is slightly optimistic relative to empirical sequencing — real return sequences carry modest negative equity serial correlation that helps the drawdown phase, partially offset by positive bond persistence. The gap (~0.1pp) is small enough that iid remains a reasonable default; it does not justify a non-zero AR(1) coefficient.

**6. §G > §F — pooled forward-block gives higher SWR than world forward-block.** At 30y: 3.57% vs 3.29%. Same forward-CMA marginals; difference is sequencing. The world series has stronger bond persistence (VR up to ~3.8) — sustained inflation epochs that hit the bond leg of the portfolio hard and don't recover within the block horizon. Pooled sequences have weaker bond persistence (VR ~1.7) and stronger within-country equity mean reversion — a more favorable long-run sequence structure for a 60/40 retiree.

**7. §A — US exceptionalism.** At 30y: 4.54%. In the same ballpark as the literature's "4% rule" — though not the same criterion: Bengen's 4% is the _worst-case_ (100% success) constant withdrawal over US history, while §A is a 90%-success overlapping-window figure, so the proximity of the two numbers is partly coincidental. The ~0.8pp premium over the world average is entirely explained by the US's higher historical real returns (geo 5.47% vs 4.69%). Canadian forward CMAs do not project returns at this level.

### Summary interpretation

The empirically honest range for a diversified, forward-looking Canadian retiree (60/40, 90%, 30y) is **3.3–3.6%** (§F–§G), bracketed below by raw pooled history (§E, 2.47%) and above by US history (§A, 4.54%). The app's parametric iid output of **3.68%** sits just above this range (~0.1pp above §G, pooled fwd-block), reflecting the slightly higher PWL ALLOC return assumption (60/40 nominal 5.67% → real 3.50%) vs the linear per-asset blend (3.37%). The discrepancy is small and does not warrant a model change; using iid with the ALLOC parameters is well-justified.

### Caveats on the historical inference

The same caveats established for the glide-path research ([methodology §4](../glide-path/methodology.md#4-caveats--what-the-iid-baseline-cannot-see)) apply to this factorial — it uses the same JST data and bootstrap machinery:

- **Survivorship.** JST covers 16 developed markets that survived with usable series; §B/§C's world floor and the within-country recoveries that lift §G are partly properties of that surviving sample.
- **Tiny effective sample.** Overlapping windows look numerous (~120 per series at 30y) but contain only ~4–5 non-overlapping windows per country, heavily cross-correlated across countries (same wars, same inflation waves). None of the §-column differences come with a confidence interval.
- **Era dependence.** The §G≈§H conclusion ("iid is mildly optimistic vs empirical sequencing") is a full-sample (1871–2020) statement. The glide-path era cuts show the sequence structure inverts in the 1990–2020 inflation-targeting era (bonds flip from persistent to mean-reverting), under which empirical sequencing would sit _above_ iid instead. The two eras bracket iid from both sides — which is itself a decent argument for keeping the parametric iid default.
- **Normal marginals in §H.** The app's engine draws normal returns; the §G comparator carries history's fat tails. The ~0.1pp §G–§H gap already nets this against the sequencing effect, so it is accounted for, not ignored — but the two effects are not separable from this table.

---

## 5. Sensitivity — what raising returns would do (Path B)

SWR @ 90%, 60/40, vol 8.79%, by assumed real return:

| Real return             | 20y   | 30y   | 40y   | 50y   |
| ----------------------- | ----- | ----- | ----- | ----- |
| **3.5% (current, φ=0)** | 5.08% | 3.68% | 2.99% | 2.65% |
| 4.0%                    | 5.33% | 3.93% | 3.27% | 2.94% |
| 4.5%                    | 5.59% | 4.20% | 3.55% | 3.25% |
| 5.0%                    | 5.84% | 4.48% | 3.84% | 3.57% |

To get the **50y SWR to ~3.2%** you need **~4.5% real** — well above the PWL/FP Canada anchor (~3.5% real for 60/40). That means adopting near-US-level return assumptions. **Not recommended.** The honest position: keep the CMAs, accept the long-horizon SWR they imply.

---

## 6. UI — the technical note

[`SwrTechnicalNote.tsx`](../../src/components/retirement/SwrTechnicalNote.tsx) renders a "Why this figure?" link beside the headline SWR (in [`InputForm.tsx`](../../src/components/retirement/InputForm.tsx), Plan-confidence section). The modal explains the two reasons the rate is below the 4% rule and shows a **live** SWR table by allocation (`SWR_TABLE_ALLOCATIONS`) × horizon (`SWR_TABLE_HORIZONS`), computed via `safeWithdrawalRate` at the user's current confidence. That table is a _pure-portfolio_ benchmark (excludes CPP/OAS/pension), so it intentionally differs from the blended headline figure.

---

## 7. Guidance for future changes

- **Don't chase the US 4%/3.7% floor by inflating returns.** It would abandon the Canadian CMA anchor. The low long-horizon SWR is the honest output.
- **Keep `RETURN_AUTOCORRELATION = 0`.** The full factorial (§4) shows the app's iid is ~0.1pp above pooled fwd-block (§G, 3.57% at 30y vs iid 3.68%) — mildly optimistic, not conservative. The gap is small and does not justify adding ρ = −0.05; the bond side has opposite-sign persistence that partially cancels equity mean reversion. The era cuts strengthen the case: full-sample sequencing sits slightly _below_ iid, 1990–2020 sequencing slightly _above_ — iid is bracketed from both sides (§4 caveats). Use the historical bootstrap modes for research, not the parametric engine.
- To revisit the empirical basis, re-run `python3 -m analysis.retirement.jst_swr_bootstrap` (tweak the CONFIG block: allocation, `TARGET`, `BLOCK_YEARS`, `HORIZONS`).

---

## References

- **PWL Capital** — financial-planning return assumptions (market-cap-weighted portfolio).
- **FP Canada / Institute of Financial Planning** — Projection Assumption Guidelines 2025/26.
- **Jordà, Knoll, Kuvshinov, Schularick, Taylor (2019)** — "The Rate of Return on Everything, 1870–2015," _QJE_ 134(3). Data: <https://www.macrohistory.net/database/>.
- **Morningstar** — "What's a Safe Retirement Withdrawal Rate?" (annual; Blanchett et al.).
- **Kitces** — Monte Carlo vs. rolling historical returns / sequence-of-returns risk.
- **Vanguard VCMM** — valuation-conditioned forward returns (an example of intra-sim mean reversion; sophisticated but contested).
