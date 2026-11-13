import { geometricToArithmetic } from "@/utils/returns";
import { REGION_IDS, REGION_LABELS } from "./presets";
import type {
  ExpectedReturnInput,
  ExpectedReturnResult,
  RegionInput,
  RegionResult,
  ViewReturns,
} from "./types";

/**
 * Expected equity return from user inputs. Every return here is a real, local-currency, geometric
 * (compound) rate as a fraction. Currency is assumed to add nothing in the long run, so local real
 * returns can be blended across regions directly.
 */

const pct = (value: number) => value / 100;

export type ViewKey = Exclude<keyof ViewReturns, "blended">;

/** The five views, in display order, with the input that weights each one. */
export const VIEWS: readonly { key: ViewKey; weight: keyof ViewWeights }[] = [
  { key: "market", weight: "weightMarket" },
  { key: "valuation", weight: "weightValuation" },
  { key: "earningsYield", weight: "weightEarningsYield" },
  { key: "riskPremium", weight: "weightRiskPremium" },
  { key: "history", weight: "weightHistory" },
];

export type ViewWeights = Pick<
  ExpectedReturnInput,
  "weightMarket" | "weightValuation" | "weightEarningsYield" | "weightRiskPremium" | "weightHistory"
>;

/**
 * CAPE divides price by 10-year average earnings, which lag current earnings by about five years of
 * growth. Scaling 1/CAPE up by ~7.5% (about 5 years at 1.5% real growth) is a common adjustment.
 */
export const EARNINGS_LAG_UPLIFT = 1.075;

/**
 * Yield + growth view (`market`): building blocks with the valuation multiple held constant.
 * Cash yield (dividends + net buybacks) plus real growth of total earnings.
 */
export function marketConsistent(
  region: Pick<RegionInput, "dividendYield" | "buybackYield" | "earningsGrowth">,
): number {
  return pct(region.dividendYield) + pct(region.buybackYield) + pct(region.earningsGrowth);
}

/**
 * Earnings-yield view: with stable multiples and retained earnings reinvested at the cost of
 * capital, the real return equals the earnings yield. Needs no growth assumption.
 */
export function earningsYield(cape: number): number {
  return EARNINGS_LAG_UPLIFT / cape;
}

/** Bond-anchored view: real yield on inflation-linked government bonds plus an equity premium. */
export function riskPremium(input: Pick<ExpectedReturnInput, "realYield" | "equityPremium">) {
  return pct(input.realYield) + pct(input.equityPremium);
}

/**
 * Share of the log-CAPE gap closed after `years` when it decays with the given half-life (an AR(1)
 * with persistence rho = 0.5^(1/halfLife)).
 */
export function gapClosed(halfLife: number, years: number): number {
  return 1 - 0.5 ** (years / halfLife);
}

/** Expected CAPE at the end of the horizon: log CAPE decays toward log target. */
export function endCape(
  cape: number,
  targetCape: number,
  halfLife: number,
  horizon: number,
): number {
  const share = gapClosed(halfLife, horizon);
  return cape ** (1 - share) * targetCape ** share;
}

/**
 * Annualized change in the multiple over the horizon. Negative when the market is above its target.
 * Most of the move comes early (exponential decay), but its total is averaged over the horizon.
 */
export function valuationDrag(
  cape: number,
  targetCape: number,
  halfLife: number,
  horizon: number,
): number {
  return (endCape(cape, targetCape, halfLife, horizon) / cape) ** (1 / horizon) - 1;
}

/** Weighted mean; weights need not sum to 1. Returns 0 when all weights are 0. */
function weightedMean(pairs: [value: number, weight: number][]): number {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  if (total === 0) return 0;
  return pairs.reduce((sum, [value, weight]) => sum + value * weight, 0) / total;
}

export function blendViews(views: Omit<ViewReturns, "blended">, weights: ViewWeights): number {
  return weightedMean(VIEWS.map(({ key, weight }) => [views[key], weights[weight]]));
}

/** All five views for one region. CAPE reversion (`valuation`) adds the drag to yield + growth (`market`). */
export function regionViews(
  region: RegionInput,
  input: Pick<
    ExpectedReturnInput,
    "horizon" | "halfLife" | "historyReturn" | "realYield" | "equityPremium"
  > &
    ViewWeights,
): Omit<RegionResult, "id" | "label" | "weight"> {
  const reversion = [region.cape, region.targetCape, input.halfLife, input.horizon] as const;
  const market = marketConsistent(region);
  const drag = valuationDrag(...reversion);
  const views = {
    market,
    valuation: market + drag,
    earningsYield: earningsYield(region.cape),
    riskPremium: riskPremium(input),
    history: pct(input.historyReturn),
  };
  return {
    ...views,
    blended: blendViews(views, input),
    valuationDrag: drag,
    endCape: endCape(...reversion),
  };
}

/** Assumes `input` has passed `validateExpectedReturnInput`. */
export function computeExpectedReturn(input: ExpectedReturnInput): ExpectedReturnResult {
  const regions: RegionResult[] = REGION_IDS.map((id) => ({
    id,
    label: REGION_LABELS[id],
    weight: pct(input.regions[id].weight),
    ...regionViews(input.regions[id], input),
  }));

  const byWeight = (key: keyof ViewReturns) =>
    weightedMean(regions.map((region) => [region[key], region.weight]));
  const portfolio: ViewReturns = {
    market: byWeight("market"),
    valuation: byWeight("valuation"),
    earningsYield: byWeight("earningsYield"),
    riskPremium: byWeight("riskPremium"),
    history: byWeight("history"),
    blended: byWeight("blended"),
  };

  const costs = pct(input.mer) + pct(input.withholding);
  const realGeometric = portfolio.blended - costs;
  const nominalGeometric = (1 + realGeometric) * (1 + pct(input.inflation)) - 1;
  const viewsAfterCosts = VIEWS.map(({ key }) => portfolio[key] - costs);

  return {
    regions,
    portfolio,
    costs,
    realGeometric,
    nominalGeometric,
    nominalArithmetic: geometricToArithmetic(nominalGeometric, pct(input.volatility)),
    range: { low: Math.min(...viewsAfterCosts), high: Math.max(...viewsAfterCosts) },
  };
}
