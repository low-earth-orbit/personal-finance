import type { ExpectedReturnInput, RegionId } from "./types";

export const REGION_IDS: readonly RegionId[] = ["canada", "us", "developed", "emerging"];

export const REGION_LABELS: Record<RegionId, string> = {
  canada: "Canada",
  us: "US",
  developed: "International developed",
  emerging: "Emerging markets",
};

/** Date the market-based defaults were taken; shown beside the inputs. */
export const DEFAULTS_AS_OF = "Nov 12, 2026";

/**
 * Defaults for a VEQT-like all-equity mix (about 30/45/18/7 Canada/US/developed/emerging).
 *
 * Market data, Nov 12, 2026:
 * - Dividend yields: trailing 12-month distribution yields of iShares XIC 1.94%, IVV 1.11%,
 *   EFA 3.21% and EEM 1.82%, plus each fund's fee, rounded.
 * - CAPE: US 40.1 (multpl.com). Other regions have no free daily CAPE, so they are estimated from
 *   trailing P/E (XIC 21.7, EFA 19.3, EEM 18.2), with a smaller CAPE-to-P/E gap than the US
 *   (40 vs 28.7) because their earnings grew less over the decade.
 * - Targets: US 25 sits between its 1950+ (20) and 1990+ (26.5) medians; the others are near their
 *   own long-run levels.
 * Growth and buybacks are judgment: long-run real GDP growth, and net issuance in emerging markets.
 */
export const DEFAULTS: ExpectedReturnInput = {
  regions: {
    canada: {
      weight: 30,
      dividendYield: 2,
      buybackYield: 0.5,
      earningsGrowth: 1.5,
      cape: 25,
      targetCape: 20,
    },
    us: {
      weight: 45,
      dividendYield: 1.1,
      buybackYield: 1,
      earningsGrowth: 2,
      cape: 40,
      targetCape: 25,
    },
    developed: {
      weight: 18,
      dividendYield: 3.5,
      buybackYield: 0.5,
      earningsGrowth: 1.2,
      cape: 21,
      targetCape: 20,
    },
    emerging: {
      weight: 7,
      dividendYield: 2.5,
      buybackYield: -1.5,
      earningsGrowth: 3.5,
      cape: 18,
      targetCape: 15,
    },
  },
  horizon: 30,
  /** US log CAPE, 1881–2023: AR(1) rho 0.909 (7 yrs), bias-corrected 0.935 (10 yrs). */
  halfLife: 10,
  /** Global stocks since 1900, real, compound (DMS / JST). */
  historyReturn: 5,
  /** 10-year TIPS (FRED DFII10), Nov 10, 2026: 2.78%. */
  realYield: 2.8,
  /**
   * Damodaran's implied ERP for the S&P 500, Nov 1, 2026 (trailing cash yield with sustainable
   * payout): 4.41% over the 10-year Treasury.
   */
  equityPremium: 4.4,
  /** Equal: simple equal-weight forecast combinations beat their parts out of sample. */
  weightMarket: 20,
  weightValuation: 20,
  weightEarningsYield: 20,
  weightRiskPremium: 20,
  weightHistory: 20,
  mer: 0.2,
  withholding: 0.14,
  inflation: 2.1,
  volatility: 13,
};
