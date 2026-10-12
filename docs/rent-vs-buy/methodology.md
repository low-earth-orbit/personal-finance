# Rent vs Buy — Methodology

## Key Modeling Assumptions

1. **Renter invests surplus**: owner total cost − rent, added mid-year (half-year return)
2. **Mortgage**: conventional only, ≥20% down, ≤25yr amortization. No CMHC/high-ratio/30yr.
3. **Compounding**: semi-annual (Canadian convention). Renewal: 5yr terms, rate redrawn at MC.
4. **Tax**: dividends taxed annually (cost basis adjusted); capital gains at sale on `portfolioValue − bookValue`; principal residence exempt
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

**Investment returns:** lognormal (`logMean = log(1+μ) − σ²/2`; `R = exp(logMean + σZ) − 1`). iid shocks — no AR(1). Long-run-mean uncertainty dominates long-horizon spread.

**Mortgage renewals:** at 5yr multiples, rate redrawn with inflation shock, balance re-amortized over remaining years.

**Renter/owner share same scenario path** — enables fair pairwise comparison.

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
