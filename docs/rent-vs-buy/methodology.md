# Rent vs Buy — Methodology

## Key Modeling Assumptions

1. **Cheaper side invests the difference**: while owner total cost > rent the renter invests the surplus; once owning is cheaper (e.g. after the mortgage is paid off) the owner invests rent − owner cost. Contributions land mid-year (half-year return); neither portfolio ever withdraws.
2. **Mortgage**: conventional (≥20% down) or insured (high-ratio) under the rules effective Dec 15, 2024: homes under $1.5M, minimum down 5% of the first $500k + 10% of the rest (`minimumDownPaymentPct`). The insurance premium — 2.80% / 3.10% / 4.00% of the loan for LTV ≤85 / ≤90 / ≤95%, +0.20 points for a 30-year amortization — is added to the mortgage (`calculateOpeningMortgageBalance`). Amortization up to 30 years (insured: first-time buyers or new builds only; the app can't check eligibility). Not modelled: provincial sales tax on the premium (ON/QC/SK — users add it to buyer closing costs) and the lower rates insured mortgages often get.
3. **Compounding**: semi-annual (Canadian convention). Renewal: 5yr terms, rate redrawn at MC.
4. **Tax**: each portfolio splits into a sheltered sleeve (`taxShelteredPct`, default 0, UI label "Tax-sheltered": treated as TFSA-like — no tax on yield or gains) and a taxable sleeve (yield taxed annually, cost basis adjusted; capital gains at sale on `value − book`). Owner net worth = home equity after selling costs + owner portfolio after tax. Principal residence exempt.
5. **Selling costs**: `homePrice × (1 − sellerClosingCostsPct) − mortgageBalance`
6. **Holding period**: `holdingPeriod` (default 12yr) is comparison year. Horizon hardcoded 50yr.
7. **Growth rates**: `rentIncreaseRate` → rent only; `ownerCostGrowthRate` → maintenance/tax/condo baseline; `homePriceGrowthRate` → home value only. Maintenance and condo fees grow an extra deterministic `maintAgingPct` per year on top of `ownerCostGrowthRate` as the building ages. Realized growth has no floors — deflation passes through symmetrically to rent and owner costs.

## Monte Carlo Architecture

Two-layer uncertainty model:

**Layer 1 — long-run mean (drawn once per sim in `drawScenario()`):**

| Sigma                   | Captures                                  |
| ----------------------- | ----------------------------------------- |
| `homePriceGrowthSigma`  | Long-run home price growth mean           |
| `investmentReturnSigma` | Long-run portfolio return mean            |
| `rentIncreaseSigma`     | Long-run rent growth mean                 |
| `ownerCostGrowthSigma`  | Long-run recurring owner cost growth mean |
| `mortgageRateSigma`     | Long-run mortgage rate mean               |
| `dividendYieldSigma`    | Long-run dividend yield mean              |

`maintPct`/`propertyTaxRate` have no sigma — path driven by `ownerCostGrowthRate`. `maintAgingPct` is a deterministic uplift on maintenance and condo fees (no sigma, no inflation beta).

**Layer 2 — annual realized vol (drawn per year in `drawPath()`):**

| Constant        | Notes                        |
| --------------- | ---------------------------- |
| `inflation`     | Hidden common factor σ       |
| `homePriceIdio` | Idiosyncratic real housing σ |
| `investment`    | Equity lognormal σ           |

`INFLATION_BETA` couples home prices, rents, owner costs, mortgage rates through inflation factor.

**Investment returns:** lognormal with the input treated as a **compound (geometric)** annual return `g` (`logMean = log(1+g)`; `R = exp(logMean + σZ) − 1`), so the portfolio compounds at `g` on the median path — consistent with the PWL / FP-Canada figures the default (6.3%, the 80/20 row) comes from. (Before Nov 2026 the input was treated as the arithmetic mean, `logMean = log(1+μ) − σ²/2`, which compounded ~σ²/2 too low.) iid shocks — no AR(1). Long-run-mean uncertainty dominates long-horizon spread.

**Mortgage renewals:** at 5yr multiples, rate redrawn with inflation shock, balance re-amortized over remaining years.

**Renter/owner share same scenario path** — enables fair pairwise comparison. Draws come from a fixed seed (`src/utils/rng.ts`), so identical inputs give identical results and the 60/70% tier boundaries don't flicker between renders.

**Summary outputs:** win % at the sale year, the median of the per-simulation gap (renter − owner; same sign as the majority winner) and when buying leads in most simulations, read relative to the sale year: since which year (if it leads at sale), otherwise the first later year it would, flagging an earlier lead that was lost. The lead can change hands more than once (e.g. buying pulls ahead, then building aging lets renting back in front).

**Break-even inputs** (`findBreakEven`): the monthly rent and the purchase price at which the median renter − owner gap at the sale year is zero (a 50/50 call), each solved by bisection with every other input fixed. Market draws don't depend on rent or price, so one set of paths is reused for every step — the same 10,000 seeded paths as the headline run (full-horizon draws truncated to the sale year), so the solver's gap at the current inputs equals the headline's median gap and the tie never points the wrong way. The worker posts the chart first and the tie (~0.7 s at year 12, ~1.2 s at year 30) as a second message for the same request; the Summary shows the "now" rent/price of that request. The rent search spans $1 to max(10× rent, $10k)/mo; the price search spans $10k to 10× price, capped at the highest price the down-payment % can buy (`maxPriceForDownPayment`, never above $1,499,999 when insured). Either value is omitted when no tie falls in range.

**Tax-sheltered share limits:** `taxShelteredPct` also shelters the starting savings (down payment + closing costs), and the model doesn't enforce TFSA/RRSP room or the FHSA's $40k lifetime cap and closure on purchase — keep the share within the user's real room. An RRSP is approximated as TFSA-like: exact only if the refund is reinvested and the withdrawal tax rate equals the contribution rate. The model doesn't track the gross RRSP balance or withdrawal tax; this slight inaccuracy is accepted to avoid two extra rate inputs.

## Maintenance Aging Calibration

Default `maintAgingPct = 1%/yr` is fit to the cross-sectional age gradient in US housing surveys (best available proxy; no Canadian equivalent found):

- **Maintenance-only ≈ 1.0%/yr**: 2023 AHS via JCHS — pre-1960 homes averaged $6,000 total improvement+repair with a 22% maintenance share ($1,320) vs $4,500 at 16% ($720) for 2010+ homes. $720 → $1,320 over ~63y of age gap ≈ 1.0%/yr.
- **Total improvement+repair ≈ 0.5%/yr** ($4,500 → $6,000): lower bound — includes discretionary remodels that don't age the same way.
- **Repair need ≈ 0.5%/yr**: Philly Fed 2025 — $3,600 avg repair cost (post-2000) vs $5,200 (pre-1940).

The maintenance-only gradient is the direct analog of the modeled bundle, so 1% is the mean estimate, not a buffer. The same uplift applies to condo fees: for apartments, envelope aging (roof, systems, reserve shortfalls) lands in fees and assessments rather than unit maintenance. Known biases: income sorting (poorer owners occupy older homes and spend less) and deferred maintenance push the observed gradient _down_, so true need is likely ≥1%. Excluded on purpose: the new-owner move-in spike (median 1.5% vs 0.6% of value for longtime owners — a tenure effect, not aging) and lumpiness (roof/HVAC years); the model smooths aging, so bands understate capex timing risk.

Sources: JCHS "Many Owners Cannot Afford to Maintain Aging Homes" (Jul 2026, 2023 AHS tabulations); Census "Buying an Older Home? Consider Upkeep Costs" (Oct 2023, 2021 AHS).

## Summary Tier Logic

| Win %  | Title                    | Color       |
| ------ | ------------------------ | ----------- |
| ≥70%   | "{Option} clearly leads" | teal/indigo |
| 60–70% | "{Option} likely leads"  | teal/indigo |
| <60%   | "Too close to call"      | gray        |
