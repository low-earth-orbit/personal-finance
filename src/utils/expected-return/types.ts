import type { FieldValue } from "@/types";

export type RegionId = "us" | "canada" | "developed" | "emerging";

/** Per-region inputs, all in percent except the CAPE ratios. */
export interface RegionInput {
  /** Share of the equity portfolio, %. */
  weight: number;
  dividendYield: number;
  /** Buybacks minus new issuance, % of market value. Negative means net dilution. */
  buybackYield: number;
  /** Real growth of total (not per-share) earnings, %/yr. */
  earningsGrowth: number;
  cape: number;
  /** CAPE the market drifts toward when valuations revert. */
  targetCape: number;
}

export type RegionKey = keyof RegionInput;

/** Portfolio-wide inputs, in percent except the horizon and half-life (years). */
export interface GlobalInput {
  /** Years the expected return is averaged over. */
  horizon: number;
  /** Years for half of the gap between log CAPE and log target CAPE to close (AR(1) reversion). */
  halfLife: number;
  /** Long-run real geometric equity return used by the history view, %. */
  historyReturn: number;
  /** Real yield on inflation-linked government bonds (RRBs / TIPS), %. */
  realYield: number;
  /** Expected equity premium over that real yield, %. */
  equityPremium: number;
  weightMarket: number;
  weightValuation: number;
  weightEarningsYield: number;
  weightRiskPremium: number;
  weightHistory: number;
  mer: number;
  /** Foreign withholding tax drag on dividends, %/yr. */
  withholding: number;
  inflation: number;
  /** Nominal annual volatility, used only for the arithmetic conversion. */
  volatility: number;
}

export type GlobalKey = keyof GlobalInput;

/**
 * Expected-return inputs. Typed as numbers, but form fields may transiently hold "" while editing
 * (mirrors the other tools); validation flags those before the engine runs.
 */
export interface ExpectedReturnInput extends GlobalInput {
  regions: Record<RegionId, RegionInput>;
}

/** Error keys: `us.cape`-style for region fields, plain names for global fields, plus the sums. */
export type ErrorKey = `${RegionId}.${RegionKey}` | GlobalKey | "regionWeights" | "viewWeights";

export type ExpectedReturnErrors = Partial<Record<ErrorKey, string>>;

export type OnRegionChange = (region: RegionId, key: RegionKey, value: FieldValue) => void;
export type OnGlobalChange = (key: GlobalKey, value: FieldValue) => void;

/** The five views of one region (or the portfolio), as real geometric fractions. */
export interface ViewReturns {
  market: number;
  valuation: number;
  /** Cyclically adjusted earnings yield, 1/CAPE with a lag adjustment. */
  earningsYield: number;
  /** Real bond yield + equity premium. */
  riskPremium: number;
  history: number;
  /** View-weighted blend. */
  blended: number;
}

export interface RegionResult extends ViewReturns {
  id: RegionId;
  label: string;
  /** Portfolio weight as a fraction. */
  weight: number;
  /** Annualized change in the valuation multiple over the horizon (fraction, usually negative). */
  valuationDrag: number;
  /** CAPE at the end of the horizon, after exponential reversion toward the target. */
  endCape: number;
}

export interface ExpectedReturnResult {
  regions: RegionResult[];
  /** Region-weighted views, before costs. */
  portfolio: ViewReturns;
  /** MER + withholding drag, fraction per year. */
  costs: number;
  /** Headline: blended real geometric return after costs. */
  realGeometric: number;
  nominalGeometric: number;
  nominalArithmetic: number;
  /** Lowest and highest single view after costs (real geometric). */
  range: { low: number; high: number };
}
