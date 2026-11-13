import type { DEFAULTS, SWR_HORIZONS } from "./presets";

export type SwrInputKey = keyof typeof DEFAULTS;

/**
 * Safe-withdrawal-rate inputs. Typed as numbers, but form fields may transiently hold "" while
 * editing (mirrors the other tools); validation flags those before the engine runs.
 */
export type SwrInput = Record<SwrInputKey, number>;

export type SwrErrors = Partial<Record<SwrInputKey, string>>;

/**
 * How each asset's multi-year behaviour is modelled:
 * independent = VR(10) of 1 for both (iid), historical = JST pooled VRs, custom = the VR inputs.
 */
export type DynamicsMode = "independent" | "historical" | "custom";

export type SwrHorizon = (typeof SWR_HORIZONS)[number];

export interface SwrAllocation {
  /** "60/40" (stocks / bonds). */
  label: string;
  /** Stock weight, 0-1. */
  equity: number;
}

export interface SwrResult {
  horizons: readonly number[];
  allocations: SwrAllocation[];
  /** rates[allocation][horizon]: safe withdrawal rate as a fraction of the starting portfolio. */
  rates: number[][];
  /** AR(1) coefficients implied by the variance ratios. */
  phiStock: number;
  phiBond: number;
  /** Correlation between the two assets' yearly shocks (after adjusting for the AR(1) terms). */
  innovationCorrelation: number;
  /** True when the shock correlation had to be capped at +/-0.99. */
  correlationClamped: boolean;
}

export interface SwrWorkerRequest {
  requestId: number;
  input: SwrInput;
  mode: DynamicsMode;
}

export interface SwrWorkerResponse {
  requestId: number;
  result: SwrResult;
}
