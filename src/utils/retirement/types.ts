import type { DEFAULTS } from "./presets";

export type RetirementInputKey = keyof typeof DEFAULTS;

/**
 * Retirement planner inputs. Typed as numbers, but form fields may transiently
 * hold "" while editing (mirrors the rent-vs-buy convention); validation
 * flags those before the engine runs.
 */
export type RetirementInput = Record<RetirementInputKey, number>;

export type RetirementErrors = Partial<Record<RetirementInputKey, string>>;

export interface ProjectionPoint {
  age: number;
  /** Portfolio balance in today's (real) dollars at the start of this age. */
  balance: number;
}

/** Annual income breakdown (real $/yr) - independent of retirement age. */
export interface IncomeBreakdown {
  /** Target gross retirement income. */
  targetGrossIncome: number;
  /** Guaranteed gross income from CPP/OAS/DB pensions. */
  guaranteedIncome: number;
  /** Gross (taxable) amount the portfolio must withdraw each year. */
  portfolioWithdrawal: number;
}

/** A per-age percentile band of the simulated portfolio (today's dollars). */
export interface RetirementBand {
  age: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface RetirementResult {
  /** Earliest age whose simulated plan meets the target success rate. */
  earliestRetirementAge: number | null;
  yearsUntilRetirement: number | null;
  /** Portfolio balance (real $) at the recommended retirement age. */
  portfolioAtRetirement: number | null;
  /** Share of simulations (0–1) whose portfolio lasts to `planningAge`. */
  successRate: number | null;
  /** Share of simulations (0–1) that trim spending in weak markets at least once. */
  cutRate: number | null;
  /** Deterministic accumulation balances, currentAge..retirementAge. */
  accumulationPath: ProjectionPoint[] | null;
  /** Monte Carlo percentile bands for the retirement phase, retirementAge..planningAge. */
  retirementBands: RetirementBand[] | null;
  /**
   * 25th–75th percentile of the earliest feasible retirement age across
   * stochastic accumulation paths — the "50% likely" range. Null if infeasible.
   */
  retirementAgeRange: { p25: number; p50: number; p75: number } | null;

  // Income breakdown (real $/yr), always populated — even for an infeasible plan.
  /** Target gross retirement income. */
  targetGrossIncome: number;
  /** Guaranteed gross income from CPP/OAS/DB pensions. */
  guaranteedIncome: number;
  /** Gross (taxable) amount the portfolio must withdraw each year. */
  portfolioWithdrawal: number;
}

/** Message sent to the retirement Web Worker. */
export interface RetirementWorkerRequest {
  requestId: number;
  input: RetirementInput;
}

/** Message returned from the retirement Web Worker. */
export interface RetirementWorkerResponse {
  requestId: number;
  result: RetirementResult;
  /** Year-1 withdrawal rate (fraction); null when no feasible plan. */
  planSWR: number | null;
}
