# Expected stock returns — methodology

The `/expected-return` tool estimates a long-run expected return for a global equity portfolio (default: a VEQT-like 30/45/18/7 mix of Canada, US, international developed and emerging markets) from user inputs. It doesn't fetch market data: the defaults were set from market data on Nov 12, 2026 (see [Defaults and data sources](#defaults-and-data-sources)) and should be refreshed before use.

Engine: `src/utils/expected-return/engine.ts` (pure functions, no Monte Carlo).

## Conventions

- Every return is **real** (after inflation), **local currency**, and **geometric** (compound), as a fraction inside the engine and a percent in the inputs.
- Currency is assumed to add no expected return over the long run (purchasing power parity), so local real returns are blended across regions by weight with no FX term.
- Treating yield + growth as a compound return follows common practice (Bogle, Research Affiliates). Reading it as an arithmetic expected return, as a Gordon-growth or Damodaran-style IRR suggests, would lower it by about σ²/2 (around 0.8% at 13% volatility).

## The five views (per region)

**1. Yield + growth.** Building blocks (Grinold–Kroner) with the valuation multiple held constant:

```
yield + growth = dividend yield + net buyback yield + real growth of total earnings
```

Net buyback yield is buybacks minus issuance (negative means dilution). Growth is of **total** earnings, not per share, so buybacks aren't counted twice: per-share growth ≈ total growth + net buyback yield. Damodaran's implied ERP rests on the same yield-plus-growth logic, so it isn't a separate view.

**2. CAPE reversion.** Yield + growth plus a CAPE drag. Log CAPE decays toward log target CAPE like an AR(1) with half-life `L` (persistence ρ = 0.5^(1/L)); the horizon `H` is the years the expected return is averaged over:

```
s        = 1 − 0.5^(H / L)                         // share of the log gap closed by the end of the horizon
CAPE_end = CAPE_now^(1−s) · CAPE_target^s
drag     = (CAPE_end / CAPE_now)^(1/H) − 1
CAPE reversion = yield + growth + drag
```

Most of the move comes early, but its total is averaged over the horizon, so the yearly drag shrinks as `H` grows. A target equal to today's CAPE switches the view off for a region.

**Default half-life: 10 years.** AR(1) on annual (January) US log CAPE from Shiller's data, 1881–2023:

| Estimate                          | ρ                | Half-life |
| --------------------------------- | ---------------- | --------- |
| OLS, 1881–2023                    | 0.909 (SE 0.037) | 7.2 yrs   |
| OLS, 1900–2023                    | 0.914            | 7.7 yrs   |
| Kendall bias-corrected, 1881–2023 | 0.935            | 10.3 yrs  |
| Monthly AR(1), annualized         | 0.949            | 13.3 yrs  |

OLS understates persistence in short, persistent samples, so the corrected estimates are the better guide. Post-1950 and post-1990 subsamples are too short to pin down (corrected half-lives from 4 to 25 years). These estimate reversion toward the _sample mean_ (median CAPE 16.5 since 1881, 20 since 1950, 26.5 since 1990); if the mean itself has shifted up, true reversion toward today's mean is slower.

A 10-year return variance ratio (≈0.91 for equities in the JST pooled data) doesn't pin down the half-life: it mixes how strongly valuations predict returns with how persistent they are. It does say the reversion visible in returns is weak, which argues against putting all the weight on the CAPE reversion view.

**3. Earnings yield.** Shiller's cyclically adjusted earnings yield, scaled for the lag in CAPE's 10-year earnings average:

```
earnings yield = 1.075 / CAPE
```

CAPE's 10-year earnings average sits about five years behind today's earnings, so 1/CAPE is scaled up by five years of 1.5% real growth: 1.015^5 ≈ 1.075. If multiples stay constant and retained earnings are reinvested at the cost of capital, the real return equals the earnings yield. It needs no growth input, so it checks an optimistic growth assumption in yield + growth. AQR's capital market assumptions average a version of this with payout yield + growth. The uplift is fixed rather than tied to the growth inputs, so this view stays independent of them. The view overstates returns where heavy net share issuance dilutes existing holders (emerging markets).

The Excess CAPE Yield (Shiller) is this yield minus the real bond yield; for a total-return estimate it adds nothing beyond this view.

**4. Bond + premium.** One figure for every region, anchored to today's inflation-linked bond market:

```
bond + premium = US 10-year TIPS yield + equity risk premium
```

The real yield is the **US 10-year TIPS** yield: Damodaran measures his premium against the 10-year US Treasury, and US TIPS ≈ Treasury − breakeven inflation, so US TIPS + premium is his expected return in real terms without a separate US inflation forecast. A nominal yield would count inflation twice, since the tool adds Canadian inflation at the end. Canadian Real Return Bonds stopped being issued in 2022 and trade thinly.

The premium default is 4.0%, the middle of Damodaran's implied ERP variants for the S&P 500 on Nov 1, 2026: 3.79% (trailing cash yield), 4.01% (adjusted risk-free rate) and 4.41% (sustainable payout, his headline figure). The model leans on analyst earnings forecasts (15.5% a year for five years in that update), so it runs high when forecasts are optimistic; the default stays below the headline for that reason. The long-run compound premium of equities over bonds across countries is about 3% (DMS). The history view already carries the long-run record, so this input stays market-implied. This is the view that moves with interest rates, as Vanguard's rate-adjusted fair-value approach does. Damodaran's implied ERP itself is a yield + growth calculation, so it informs the premium input rather than being a separate view.

**5. History.** One long-run real return for every region (default 5%, global equities since 1900 per DMS / JST). The US-only figure (about 6.5%) has survivorship bias.

Views are combined additively; cross terms (e.g. yield × drag) are below 0.05% and ignored.

## Blending

```
region blend    = Σ w_view · view over yield + growth, CAPE reversion, earnings yield, bond + premium, history
                                                                                 (weights sum to 100%)
portfolio view  = Σ region weight · region view                                  (weights sum to 100%)
```

Default view weights: 20% each, equal. Single predictors barely beat the historical mean out of sample (Goyal–Welch 2008; Campbell–Thompson 2008), but a simple equal-weight combination of forecasts does better than its parts and better than optimized weights (Rapach, Strauss and Zhou 2010). The horizon already enters through the CAPE drag, so the weights don't change with it.

Weight presets fill in the five weights. The institutional comparisons are approximate: they say which views a method leans on, not that it is that institution's model. Results are with the Nov 12, 2026 defaults, real and after costs.

| Preset | Yield + growth | CAPE reversion | Earnings yield | Bond + premium | History | Result | Leans like |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Equal (default) | 20 | 20 | 20 | 20 | 20 | 4.2% | Equal-weight forecast combination (Rapach, Strauss and Zhou 2010) |
| Planner-style | 0 | 0 | 20 | 40 | 40 | 4.8% | Canadian planning sources: FP Canada guidelines, CPP/QPP actuaries, PWL Capital (history and bond + premium). Near their own ~4.4–4.7% real |
| Asset-manager-style | 60 | 40 | 0 | 0 | 0 | 3.7% | Building blocks with partial reversion: J.P. Morgan LTCMA, BlackRock, Morningstar |

The two camps sit about half a point either side of Equal, and the 3.7–4.8% spread is larger than most single-input changes: beliefs about CAPE reversion and bond yields drive the answer. A history-tilted preset was left out: forecast-combination research supports equal weights and modest tilts toward the historical mean about equally, and with these inputs it differed from Equal by 0.1%. Single-camp presets (no reversion like AQR, full reversion like GMO) were left out: the evidence favours combining, and custom weights cover them.

With these defaults the blend counts roughly 0.20 × 87.5% ≈ 18% of each CAPE gap closing over 30 years through the CAPE reversion view. The earnings-yield view also reflects valuations (a high CAPE means a low yield) without assuming reversion, so the blend sits between no reversion (AQR's base case, Damodaran) and the partial normalization in JPMorgan's and Research Affiliates' building blocks, and well short of GMO's full reversion.

## Costs and conversions

```
real (headline) = portfolio blend − (MER + foreign withholding drag)
nominal geometric = (1 + real)(1 + inflation) − 1
nominal arithmetic = geometricToArithmetic(nominal geometric, volatility)   // src/utils/returns.ts
range = [min, max] of the five portfolio views, after costs
```

Defaults: MER 0.20%, withholding 0.14%, inflation 2.1%, volatility 13%. Foreign withholding tax is lost in a TFSA or RRSP; in a non-registered account the fund reports it on the T3 as foreign tax paid and most of it is recoverable through the foreign tax credit, so the drag there is close to 0. Withholding one level further down (a fund holding a US-listed ETF) is lost in every account.

Volatility is used only for the arithmetic conversion. The other tools on the site take nominal geometric returns.

## Defaults and data sources

Market-based defaults were taken on Nov 12, 2026. Refresh the first group before relying on the result.

| Input | Default | Source |
| --- | --- | --- |
| Dividend yield | CA 2.0, US 1.1, Dev 4.0, EM 2.8% | Trailing 12-month distribution yields of iShares XIC 1.94%, IVV 1.11%, EFA 3.21%, EEM 1.82%; foreign withholding added back for EFA and EEM (÷ 0.85), plus each fund's fee. Withholding comes off once, under costs |
| Current CAPE | CA 25, US 40, Dev 21, EM 18 | US: multpl.com (40.1). Others: no free daily CAPE; estimated from trailing P/E (XIC 21.7, EFA 19.3, EEM 18.2) with a smaller CAPE-to-P/E gap than the US (40 vs 28.7). Research Affiliates' Asset Allocation Interactive shows CAPE by market |
| Real bond yield | 2.0% | Set below the US 10-year TIPS yield of 2.78% on Nov 10, 2026 (FRED DFII10) |
| Equity risk premium | 4.0% | Middle of Damodaran's implied ERP variants, Nov 1, 2026: 3.79–4.41% (pages.stern.nyu.edu/~adamodar, monthly) |
| Target CAPE | CA 20, US 25, Dev 20, EM 15 | Judgment: US 25 sits between its 1950+ (20) and 1990+ (26.5) medians (Shiller data); others near their own long-run levels |
| Real earnings growth | CA 1.5, US 2.0, Dev 1.2, EM 3.5% | Judgment: long-run real GDP growth (IMF World Economic Outlook) |
| Net buyback yield | CA 0.5, US 1.0, Dev 0.5, EM −1.5% | Judgment: S&P 500 buybacks (S&P Dow Jones Indices) less ~1% issuance; net issuance in emerging markets |
| Region weights | 30 / 45 / 18 / 7 | VEQT's approximate split (Vanguard Canada fact sheet) |
| Half-life | 10 years | Shiller US CAPE, 1881–2023 (above) |
| Long-run real return | 5% | Global stocks since 1900 (UBS Global Investment Returns Yearbook; JST) |
| MER, withholding | 0.20%, 0.14% | VEQT, in a TFSA or RRSP |
| Inflation | 2.1% | FP Canada Projection Assumption Guidelines; Bank of Canada target is 2% |
| Volatility | 13% | Unhedged global stocks in Canadian dollars, roughly 12–14% |

With these defaults: 4.2% real after costs (views 3.2–5.7%), 6.4% nominal compound, 7.2% nominal arithmetic. The bond + premium view (6.0% before costs) is the highest: it doesn't see today's high CAPE. The CAPE reversion and earnings-yield views for the US (2.7%) sit at the other end.

## Left out

- **Black–Litterman equilibrium returns:** useful for relative regional returns, but adds machinery for four user-set regions.
- **Published capital market assumptions** (FP Canada, PWL, Vanguard, Research Affiliates): they blend these same views, so they're a cross-check in the notes, not an input.
- **Parameter uncertainty:** the range across views is shown; the ±1.5% standard error of the historical mean isn't simulated.
