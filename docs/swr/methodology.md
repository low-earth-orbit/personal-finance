# Safe withdrawal rate table — Methodology

Research note for the **Safe withdrawal rates** tool (`/swr`). It shows the safe withdrawal rate (SWR) for eleven stock/bond mixes (100/0 to 0/100) over seven horizons (20 to 50 years), from capital-market assumptions the user sets. Code: engine [`src/utils/swr/engine.ts`](../../src/utils/swr/engine.ts), defaults [`src/utils/swr/presets.ts`](../../src/utils/swr/presets.ts). For the definition of SWR and the evidence for the default return assumptions, see the [retirement SWR methodology](../retirement/swr-methodology.md).

## 1. Model

- **Assets.** Stocks and bonds are simulated separately. Nominal geometric returns and volatilities are converted to real arithmetic means and volatilities with `realArithmeticFromNominalGeometric` (`src/utils/returns.ts`), the same conversion as the other tools.
- **Portfolio.** Rebalanced every year: `r = w·rS + (1−w)·rB`.
- **Withdrawal.** The SWR `w` is the **first-year withdrawal as a fraction of the starting portfolio**; each later year the dollar amount rises with inflation, so it is constant in real terms. This is the Bengen / Trinity-study "4% rule" convention. The model works in real dollars, so the recursion is mid-year as in the retirement engine: `B' = B(1+r) − w(1+r/2)`. There is no spending adjustment for market performance (no guardrails).
- **Paths.** 10,000 paths of 50 years, drawn once with the seeded RNG (`src/utils/rng.ts`) and shared by every allocation (common random numbers). Rows therefore move smoothly, and identical inputs give an identical table.

## 2. Exact SWR without a search

Divide the balance recursion by the cumulative growth `G_t = Π(1+r)`:

`B_H = G_H · (1 − w·S_H)`, with `S_H = Σ_{t=0}^{H−1} (1 + r_t/2) / G_{t+1}`.

`S_H` only grows with `H`, so a path lasts `H` years exactly when `w < 1/S_H`. The SWR at success rate `p` is the `(1−p)` quantile of `1/S_H` across paths. One pass per allocation records every horizon. A path whose portfolio return reaches −100% has maximum rate 0 from then on. A test checks one cell against a brute-force bisection on `w` over the same paths.

## 3. Return dynamics: VR(10) → AR(1)

Independent mode draws each year's return without memory. The other modes give each asset's deviation from its mean an AR(1) form:

`d_t = φ·d_{t−1} + √(1−φ²)·σ·ε_t`

The `√(1−φ²)` factor keeps the one-year volatility at `σ`. The first deviation is drawn from the stationary distribution (`σ·ε_0`).

- **VR to φ.** `VR(q) = 1 + 2Σ_{k=1}^{q−1}(1−k/q)φ^k` with `q = 10`. `phiFromVr` inverts it by bisection on [−0.95, 0.95]. VR = 1 gives φ = 0, exactly iid. VR below 1 is mean reversion (φ < 0); above 1 is persistence (φ > 0).
- **Historical preset.** VR(10) of 0.91 for stocks and 2.66 for bonds, estimated from the JST pooled data (see the retirement methodology). That gives φ ≈ −0.052 for stocks and φ ≈ 0.51 for bonds.
- **Correlation.** The user's ρ is the correlation of same-year returns. With AR(1) terms the yearly shocks need correlation `ρ_ε = ρ(1−φSφB) / √((1−φS²)(1−φB²))`. The first year, drawn from the stationary distribution, uses ρ itself. `ρ_ε` is capped at ±0.99; the result carries a `correlationClamped` flag and the page shows a notice.

## 4. Calibration against the retirement tool

The default inputs (stocks 6.87% / 12.57%, bonds 3.55% / 5.38%, ρ = 0.48, inflation 2.1%, 90% success) come from PWL Capital's assumptions. The 0.48 correlation is the one implied by the PWL allocation table in `src/utils/allocations.ts` (0.48–0.50 across every mix). With independent years the table reproduces the retirement methodology: 60/40 gives about 3.9% over 30 years and 2.8% over 50.

Historical dynamics lower the 60/40 30-year rate to about 3.7% and the 0/100 30-year rate from 3.3% to 2.8%: bond persistence dominates.

## 5. Caveat: AR(1) versus the block bootstrap

The historical block-bootstrap check in the retirement methodology gives 3.86% for 60/40 over 30 years. The AR(1) version of the same VRs gives a lower figure, because a one-year memory can't reproduce the joint multi-year stock and bond dynamics of history (or the shape of bond drawdowns such as the 1940s–1980). Read the Historical setting as a stress test on bond-heavy rows, not as a forecast.
