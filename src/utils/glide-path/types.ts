import type { DEFAULTS } from "./presets";

export type GlidePathInputKey = keyof typeof DEFAULTS;

/**
 * Glide-path recommender inputs. Typed as numbers; form fields may transiently
 * hold "" while editing (mirrors the other tools), which validation flags before
 * the engine runs.
 */
export type GlidePathInput = Record<GlidePathInputKey, number>;

export type GlidePathErrors = Partial<Record<GlidePathInputKey, string>>;

export type Phase = "accum" | "retire";

/** One block of the recommended schedule (equity is flat within an interval block). */
export interface ScheduleBlock {
  step: number;
  yearStart: number;
  yearEnd: number;
  ageStart: number;
  phase: Phase;
  equityPct: number;
}

/** 'Rising' | 'Flat' | 'Falling' slope of a phase (or 'n/a' when too short). */
export type SlopeDir = "Rising" | "Flat" | "Falling" | "n/a";

export interface GlidePathResult {
  /** Per-interval schedule of recommended equity weights. */
  schedule: ScheduleBlock[];
  /** Expanded per-year equity weights (fractions; >1 = leveraged). */
  equityByYear: number[];
  accumDir: SlopeDir;
  retireDir: SlopeDir;
  /**
   * Lowest equity within 15 years either side of retirement (the "tent" bottom), as a %. The
   * final retirement step is left out, as it is for `retireDir`.
   */
  tentPct: number | null;
  /** Age of the tent bottom. */
  tentAge: number | null;
  // ── out-of-sample outcome stats ───────────────────────────
  /** Certainty-equivalent retirement income ($/yr). */
  ceIncome: number;
  /** The best single constant equity weight (%) — the behaviorally simpler alternative. */
  flatEquityPct: number;
  /** CE income of holding `flatEquityPct` equity at all ages ($/yr). */
  flatCeIncome: number;
  /** CE including the bequest term (= ceIncome when bequestWeight is 0); null if unbounded. */
  welfareCe: number | null;
  /** Welfare CE of the best constant allocation. */
  flatWelfareCe: number | null;
  /** Median balance left at the end of the plan (real $). */
  medianBequest: number;
  /** Median balance left at the end of the plan for the best constant allocation. */
  flatMedianBequest: number;
  /**
   * No bequest weight and every constant allocation already delivers the target (CE within
   * 0.5%, < 0.5% shortfall): the allocation does not change income. The reported weights are
   * then the middle of a tie, not an optimum.
   */
  overFunded: boolean;
  /** Full-path fraction depleted before the planning age, including pre-retirement market luck. */
  depletion: number;
  /** Drawdown-only depletion from the deterministic expected balance at retirement. */
  drawdownDepletion: number;
  /** Deterministic expected balance at retirement under the optimized glide path. */
  expectedRetirementBalance: number;
  /** First-year portfolio draw implied by the spending rule. */
  initialTargetDraw: number;
  /** Initial portfolio draw as a fraction of the expected retirement balance, or null if nonpositive. */
  fundingRatio: number | null;
  /** Deterministic expected balance at retirement under the best constant allocation. */
  flatExpectedRetirementBalance: number;
  /** First-year portfolio draw for the best constant allocation. */
  flatInitialTargetDraw: number;
  /** `flatInitialTargetDraw` as a fraction of `flatExpectedRetirementBalance`, or null. */
  flatFundingRatio: number | null;
  /** Full-path depletion for the best constant allocation. */
  flatDepletion: number;
  /** Drawdown-only depletion for the best constant allocation. */
  flatDrawdownDepletion: number;
  /** Mean coefficient-of-variation of retirement income (spending steadiness). */
  incomeCv: number;
  /** Echo of the resolved inputs / derived values used by the run. */
  params: ResolvedParams;
}

/** Resolved/derived values echoed back for display. */
export interface ResolvedParams {
  accumYears: number;
  retireYears: number;
  guaranteed: number;
  /** Years between retirement and the first guaranteed-income payment. */
  guaranteedDelay: number;
  bequestWeight: number;
  maxLeverage: number;
  retirementMaxLeverage: number;
  borrowCost: number;
  gamma: number;
  interval: number;
  returnMode: GlidePathReturnMode;
}

/** Return mode for the glide-path simulation engine. */
export type GlidePathReturnMode = "forward-block" | "iid-mc";

/** Message sent to the glide-path Web Worker. */
export interface GlidePathRequest {
  input: GlidePathInput;
  requestId: number;
  /** Re-roll nonce: 0 = canonical draw; >0 reseeds the Monte Carlo to a new reproducible draw. */
  seed?: number;
  /** Simulation engine. Defaults to "iid-mc" when omitted. */
  returnMode?: GlidePathReturnMode;
}

/** Message returned from the glide-path Web Worker. */
export interface GlidePathResponse {
  requestId: number;
  input: GlidePathInput;
  result: GlidePathResult;
}
