# Rent vs Buy — Methodology

## Key Modeling Assumptions

1. **Renter invests surplus**: owner total cost − rent, added mid-year (half-year return)
2. **Mortgage**: conventional only, ≥20% down, ≤25yr amortization. No CMHC/high-ratio/30yr.
3. **Compounding**: semi-annual (Canadian convention). Renewal: 5yr terms, rate redrawn at MC.
4. **Tax**: dividends taxed annually (cost basis adjusted); capital gains at sale on `portfolioValue − bookValue`; principal residence exempt
5. **Selling costs**: `homePrice × (1 − sellerClosingCostsPct) − mortgageBalance`
6. **Holding period**: `holdingPeriod` (default 12yr) is comparison year. Horizon hardcoded 50yr.
7. **Growth rates**: `rentIncreaseRate` → rent only; `ownerCostGrowthRate` → maintenance/tax/condo; `homePriceGrowthRate` → home value only

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

`maintPct`/`propertyTaxRate` have no sigma — path driven by `ownerCostGrowthRate`.

**Layer 2 — annual realized vol (drawn per year in `drawPath()`):**

| Constant        | Notes                        |
| --------------- | ---------------------------- |
| `inflation`     | Hidden common factor σ       |
| `homePriceIdio` | Idiosyncratic real housing σ |
| `investment`    | Equity lognormal σ           |

`INFLATION_BETA` couples home prices, rents, owner costs, mortgage rates through inflation factor.

**Investment returns:** lognormal with the input treated as a **compound (geometric)** annual return `g` (`logMean = log(1+g)`; `R = exp(logMean + σZ) − 1`), so the portfolio compounds at `g` on the median path — consistent with the PWL / FP-Canada figures the default (6.3%, the 80/20 row) comes from. (Before Nov 2026 the input was treated as the arithmetic mean, `logMean = log(1+μ) − σ²/2`, which compounded ~σ²/2 too low.) iid shocks — no AR(1). Long-run-mean uncertainty dominates long-horizon spread.

**Mortgage renewals:** at 5yr multiples, rate redrawn with inflation shock, balance re-amortized over remaining years.

**Renter/owner share same scenario path** — enables fair pairwise comparison.

## Summary Tier Logic

| Win %  | Title                    | Color       |
| ------ | ------------------------ | ----------- |
| ≥70%   | "{Option} clearly leads" | teal/indigo |
| 60–70% | "{Option} likely leads"  | teal/indigo |
| <60%   | "Too close to call"      | gray        |
