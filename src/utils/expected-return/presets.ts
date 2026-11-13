import type { ViewWeights } from "./engine";
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
 *   EFA 3.21% and EEM 1.82%, with foreign withholding added back for EFA and EEM (÷ 0.85) and
 *   each fund's fee added, rounded. Withholding comes off once, under costs.
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
      dividendYield: 4,
      buybackYield: 0.5,
      earningsGrowth: 1.2,
      cape: 21,
      targetCape: 20,
    },
    emerging: {
      weight: 7,
      dividendYield: 2.8,
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
  /** Below the US 10-year TIPS yield of 2.78% on Nov 10, 2026 (FRED DFII10). */
  realYield: 2,
  /**
   * Middle of Damodaran's implied ERP variants for the S&P 500, Nov 1, 2026: 3.79% (trailing cash
   * yield), 4.01% (adjusted risk-free rate), 4.41% (sustainable payout, his headline figure). The
   * headline leans on analyst growth forecasts, so the default stays below it.
   */
  equityPremium: 4,
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

export type WeightPresetId = "equal" | "planner" | "manager";

export interface WeightPreset {
  id: WeightPresetId;
  label: string;
  /** Shown under the preset buttons while the preset is selected. */
  description: string;
  weights: ViewWeights;
}

const weights = (
  weightMarket: number,
  weightValuation: number,
  weightEarningsYield: number,
  weightRiskPremium: number,
  weightHistory: number,
): ViewWeights => ({
  weightMarket,
  weightValuation,
  weightEarningsYield,
  weightRiskPremium,
  weightHistory,
});

/**
 * View-weight presets; each sums to 100. Descriptions stay generic (no sources or institutions);
 * the methodology doc says which published approaches each one resembles.
 */
export const WEIGHT_PRESETS: readonly WeightPreset[] = [
  {
    id: "equal",
    label: "Equal",
    description:
      "Every view counts the same. A simple average of several forecasts has tended to beat any single one of them.",
    weights: weights(20, 20, 20, 20, 20),
  },
  {
    id: "planner",
    label: "Planner-style",
    description:
      "Anchored in the long-run record and today's bond yields, as long-term financial planning assumptions usually are. Barely reacts to valuations.",
    weights: weights(0, 0, 20, 40, 40),
  },
  {
    id: "manager",
    label: "Asset-manager-style",
    description:
      "Yield + growth with partial CAPE reversion, the building-block approach common in asset managers' 10-year forecasts. Reacts to valuations; ignores bond yields and history.",
    weights: weights(60, 40, 0, 0, 0),
  },
];

/** The preset whose weights match the input exactly, or undefined for custom weights. */
export function matchWeightPreset(
  input: Record<keyof ViewWeights, unknown>,
): WeightPreset | undefined {
  return WEIGHT_PRESETS.find((preset) =>
    (Object.keys(preset.weights) as (keyof ViewWeights)[]).every(
      (key) => input[key] === preset.weights[key],
    ),
  );
}
