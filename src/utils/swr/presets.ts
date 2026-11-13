import { SUCCESS_RATE_PRESETS } from "@/utils/retirement/presets";
import type { DynamicsMode } from "./types";

export { SUCCESS_RATE_PRESETS };

/** Horizons (years) shown as table columns. */
export const SWR_HORIZONS = [20, 25, 30, 35, 40, 45, 50] as const;

/** Simulated paths per table (shared by every allocation). */
export const SWR_PATHS = 10_000;

/**
 * Default numeric inputs. Returns and volatilities are nominal geometric (compound) percentages
 * (PWL Capital-based, the same assumptions as the other tools). The 0.48 correlation is the one
 * implied by the PWL allocation table in `src/utils/allocations.ts`.
 */
export const DEFAULTS = {
  stockReturn: 6.87,
  stockVol: 12.57,
  bondReturn: 3.55,
  bondVol: 5.38,
  correlation: 0.48,
  inflationRate: 2.1,
  /** Target % of simulated markets the withdrawal must survive. */
  successRate: 90,
  /** 10-year variance ratios used when the dynamics mode is "custom". 1 = independent. */
  stockVr: 1,
  bondVr: 1,
} as const;

export const DEFAULT_DYNAMICS: DynamicsMode = "independent";

/**
 * VR(10) estimated from the JST pooled history (16 countries, 1871-2020): equities mean-revert
 * slightly, bonds are persistent.
 */
export const HISTORICAL_VR = { stockVr: 0.91, bondVr: 2.66 } as const;
