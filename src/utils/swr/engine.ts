import { realArithmeticFromNominalGeometric } from "@/utils/returns";
import { fillNormals } from "@/utils/rng";
import { HISTORICAL_VR, SWR_HORIZONS, SWR_PATHS } from "./presets";
import type { DynamicsMode, SwrAllocation, SwrInput, SwrResult } from "./types";

const VR_LAG = 10;
const PHI_LIMIT = 0.95;
const MAX_INNOVATION_CORRELATION = 0.99;
const YEARS = Math.max(...SWR_HORIZONS);
const STOCK_SEED = 20_241_001;
const BOND_SEED = 20_241_002;

/** Variance ratio at lag q of an AR(1) process with coefficient phi (unit-variance stationary). */
export function vrFromPhi(phi: number, q: number = VR_LAG): number {
  let sum = 0;
  for (let k = 1; k < q; k++) sum += (1 - k / q) * phi ** k;
  return 1 + 2 * sum;
}

/** Inverts `vrFromPhi` by bisection on [-0.95, 0.95]; out-of-range ratios clamp to the ends. */
export function phiFromVr(vr: number, q: number = VR_LAG): number {
  let lo = -PHI_LIMIT;
  let hi = PHI_LIMIT;
  if (vr <= vrFromPhi(lo, q)) return lo;
  if (vr >= vrFromPhi(hi, q)) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vrFromPhi(mid, q) < vr) lo = mid;
    else hi = mid;
  }
  const phi = (lo + hi) / 2;
  return Math.abs(phi) < 1e-9 ? 0 : phi;
}

/**
 * Correlation the two assets' yearly shocks need so that the same-year returns correlate at
 * `rho` once each follows its own AR(1). Equal to `rho` when both phis are 0. Capped at +/-0.99.
 */
export function innovationCorrelation(
  rho: number,
  phiStock: number,
  phiBond: number,
): { value: number; clamped: boolean } {
  const raw =
    (rho * (1 - phiStock * phiBond)) / Math.sqrt((1 - phiStock ** 2) * (1 - phiBond ** 2));
  const value = Math.max(-MAX_INNOVATION_CORRELATION, Math.min(MAX_INNOVATION_CORRELATION, raw));
  return { value, clamped: Math.abs(raw) > MAX_INNOVATION_CORRELATION };
}

/** Variance ratios for a dynamics mode. */
export function resolveVr(
  input: Pick<SwrInput, "stockVr" | "bondVr">,
  mode: DynamicsMode,
): { stockVr: number; bondVr: number } {
  if (mode === "historical") return { ...HISTORICAL_VR };
  if (mode === "custom") return { stockVr: input.stockVr, bondVr: input.bondVr };
  return { stockVr: 1, bondVr: 1 };
}

export interface AssetPaths {
  /** Real stock returns, indexed [path * years + t]. */
  stock: Float64Array;
  /** Real bond returns, same layout. */
  bond: Float64Array;
  years: number;
  paths: number;
  phiStock: number;
  phiBond: number;
  innovationCorrelation: number;
  correlationClamped: boolean;
}

/**
 * Draw real stock and bond return paths. Each asset's deviation from its mean follows
 * d_t = phi * d_{t-1} + sqrt(1 - phi^2) * sigma * eps_t, which keeps the one-year volatility at
 * sigma; the first deviation is drawn from the stationary distribution (sigma * eps_0). The same
 * paths feed every allocation (common random numbers).
 */
export function generateAssetPaths(
  input: SwrInput,
  mode: DynamicsMode,
  paths: number = SWR_PATHS,
  years: number = YEARS,
): AssetPaths {
  const stock = realArithmeticFromNominalGeometric(
    input.stockReturn,
    input.stockVol,
    input.inflationRate,
  );
  const bond = realArithmeticFromNominalGeometric(
    input.bondReturn,
    input.bondVol,
    input.inflationRate,
  );
  const { stockVr, bondVr } = resolveVr(input, mode);
  const phiStock = phiFromVr(stockVr);
  const phiBond = phiFromVr(bondVr);
  const rho = input.correlation;
  const { value: rhoEps, clamped } = innovationCorrelation(rho, phiStock, phiBond);

  const n = paths * years;
  const zStock = fillNormals(STOCK_SEED, n);
  const zBond = fillNormals(BOND_SEED, n);
  const rStock = new Float64Array(n);
  const rBond = new Float64Array(n);
  const kStock = Math.sqrt(1 - phiStock ** 2) * stock.vol;
  const kBond = Math.sqrt(1 - phiBond ** 2) * bond.vol;
  const orthStationary = Math.sqrt(1 - rho ** 2);
  const orthInnovation = Math.sqrt(1 - rhoEps ** 2);

  for (let p = 0; p < paths; p++) {
    const base = p * years;
    // Stationary first year: the same-year correlation is rho itself.
    const e0s = zStock[base];
    const e0b = rho * e0s + orthStationary * zBond[base];
    let dStock = stock.vol * e0s;
    let dBond = bond.vol * e0b;
    rStock[base] = stock.mean + dStock;
    rBond[base] = bond.mean + dBond;
    for (let t = 1; t < years; t++) {
      const es = zStock[base + t];
      const eb = rhoEps * es + orthInnovation * zBond[base + t];
      dStock = phiStock * dStock + kStock * es;
      dBond = phiBond * dBond + kBond * eb;
      rStock[base + t] = stock.mean + dStock;
      rBond[base + t] = bond.mean + dBond;
    }
  }

  return {
    stock: rStock,
    bond: rBond,
    years,
    paths,
    phiStock,
    phiBond,
    innovationCorrelation: rhoEps,
    correlationClamped: clamped,
  };
}

/** Stock weights 100/0 ... 0/100 in steps of 10. */
export const SWR_ALLOCATIONS: SwrAllocation[] = Array.from({ length: 11 }, (_, i) => ({
  label: `${100 - i * 10}/${i * 10}`,
  equity: (10 - i) / 10,
}));

/**
 * Safe withdrawal rate for every allocation x horizon.
 *
 * Withdrawals come mid-year: B' = B(1 + r) - w(1 + r/2). Dividing by the cumulative growth G
 * gives B_H = G_H (1 - w S_H) with S_H = sum_t (1 + r_t/2) / G_{t+1}, so a path lasts H years
 * exactly when w < 1/S_H. The SWR is therefore the (1 - success) quantile of 1/S_H across paths,
 * with no search over w. A path whose portfolio return reaches -100% can fund nothing afterwards
 * (maximum rate 0).
 */
export function swrFromPaths(
  assets: AssetPaths,
  successRate: number,
  horizons: readonly number[] = SWR_HORIZONS,
  allocations: SwrAllocation[] = SWR_ALLOCATIONS,
): number[][] {
  const { stock, bond, years, paths } = assets;
  const horizonAt = new Map<number, number>(horizons.map((h, i) => [h, i]));
  const quantileIndex = Math.min(paths - 1, Math.max(0, Math.floor((1 - successRate) * paths)));
  const maxRates = horizons.map(() => new Float64Array(paths));

  return allocations.map(({ equity }) => {
    for (let p = 0; p < paths; p++) {
      const base = p * years;
      let growth = 1;
      let s = 0;
      let dead = false;
      for (let t = 0; t < years; t++) {
        let rate = 0;
        if (!dead) {
          const r = equity * stock[base + t] + (1 - equity) * bond[base + t];
          if (1 + r <= 0) {
            dead = true;
          } else {
            growth *= 1 + r;
            s += (1 + r / 2) / growth;
            rate = 1 / s;
          }
        }
        const h = horizonAt.get(t + 1);
        if (h !== undefined) maxRates[h][p] = rate;
      }
    }
    return maxRates.map((values) => {
      const sorted = Float64Array.from(values).sort();
      return sorted[quantileIndex];
    });
  });
}

/** The full table for the current inputs; deterministic for identical inputs. */
export function computeSwrTable(
  input: SwrInput,
  mode: DynamicsMode,
  options: { paths?: number } = {},
): SwrResult {
  const assets = generateAssetPaths(input, mode, options.paths ?? SWR_PATHS);
  return {
    horizons: SWR_HORIZONS,
    allocations: SWR_ALLOCATIONS,
    rates: swrFromPaths(assets, input.successRate / 100),
    phiStock: assets.phiStock,
    phiBond: assets.phiBond,
    innovationCorrelation: assets.innovationCorrelation,
    correlationClamped: assets.correlationClamped,
  };
}
