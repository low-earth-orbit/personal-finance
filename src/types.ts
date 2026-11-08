import type { DEFAULTS, INPUT_UNCERTAINTIES } from "./utils/presets";

/** Every user-editable assumption key (base values + uncertainty sigmas). */
export type UserInputKey = keyof typeof DEFAULTS;

/** The uncertainty (sigma) keys only. */
export type SigmaKey = keyof typeof INPUT_UNCERTAINTIES;

/** The canonical, fully-populated set of user assumptions. */
export type UserInput = Record<UserInputKey, number>;

/**
 * Value flowing out of a form control. Inputs may be transiently empty
 * (`""`) while the user clears them; `Main` coerces to a number on change.
 */
export type FieldValue = number | string;

export type FieldErrors = Partial<Record<UserInputKey, string>>;

export interface FieldConstraint {
  min?: number;
  max?: number;
  step?: number;
  allowNegative?: boolean;
}

export interface Preset {
  id: string;
  label: string;
  values: UserInput;
  custom?: boolean;
}

/** Per-year percentile bands returned by the Monte Carlo simulation. */
export interface MonteCarloYear {
  year: number;
  renterP25: number;
  renterMedian: number;
  renterP75: number;
  ownerP25: number;
  ownerMedian: number;
  ownerP75: number;
  /** Median over simulations of renter − owner net worth (positive = renting ahead). */
  medianGap: number;
  renterWinPct: number;
}

/** Message sent to the Monte Carlo Web Worker. */
export interface MonteCarloRequest {
  userInput: UserInput;
  numSimulations: number;
  requestId: number;
}

/** Inputs at which renting and buying tie at the sale year (see `findBreakEven`). */
export interface BreakEven {
  year: number;
  /** The rent and price of the request this was solved for (not the live inputs). */
  currentRent: number;
  currentPrice: number;
  monthlyRent: number | null;
  homePrice: number | null;
}

/**
 * Messages returned from the Monte Carlo Web Worker: the simulation first, then the slower
 * break-even solve for the same request.
 */
export type MonteCarloResponse =
  | { requestId: number; result: MonteCarloYear[] }
  | { requestId: number; breakEven: BreakEven };
