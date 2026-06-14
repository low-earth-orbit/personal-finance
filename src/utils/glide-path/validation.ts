import { MAX_OPT_PATHS } from "./engine";
import { DEFAULTS } from "./presets";
import type {
  GlidePathErrors,
  GlidePathInput,
  GlidePathInputKey,
} from "./types";

interface Constraint {
  min: number;
  max: number;
  step: number;
  label: string;
}

export const FIELD_CONSTRAINTS: Record<GlidePathInputKey, Constraint> = {
  startAge: { min: 18, max: 90, step: 1, label: "Start age" },
  retirementAge: { min: 30, max: 90, step: 1, label: "Retirement age" },
  planningAge: { min: 60, max: 110, step: 1, label: "Plan until age" },
  startSavings: {
    min: 0,
    max: 100_000_000,
    step: 10000,
    label: "Start savings",
  },
  annualContribution: {
    min: 0,
    max: 100_000_000,
    step: 10000,
    label: "Annual contribution",
  },
  targetIncome: {
    min: 1,
    max: 100_000_000,
    step: 10000,
    label: "Target income",
  },
  guaranteedIncome: {
    min: 10000,
    max: 100_000_000,
    step: 10000,
    label: "Guaranteed income",
  },
  flexibility: { min: 0, max: 1, step: 0.05, label: "Spending flexibility" },
  withdrawalRate: { min: 1, max: 10, step: 0.1, label: "Withdrawal rate" },
  gamma: {
    min: 0.5,
    max: 15,
    step: 0.5,
    label: "Retirement spending risk aversion (γ)",
  },
  beta: {
    min: 0.9,
    max: 1,
    step: 0.005,
    label: "Retirement time preference (β)",
  },
  maxEquityPct: { min: 100, max: 200, step: 5, label: "Max equity %" },
  borrowCost: { min: 0, max: 10, step: 0.25, label: "Borrow cost" },
  // Max matches the engine's MAX_OPT_PATHS hard cap
  numPaths: {
    min: 5000,
    max: MAX_OPT_PATHS,
    step: 5000,
    label: "Monte Carlo paths",
  },
  inflation: { min: 0, max: 5, step: 0.1, label: "Inflation" },
};

const KEYS = Object.keys(DEFAULTS) as GlidePathInputKey[];

export function validateGlidePathInput(input: GlidePathInput): GlidePathErrors {
  const errors: GlidePathErrors = {};

  for (const key of KEYS) {
    const value = input[key];
    const { min, max, label } = FIELD_CONSTRAINTS[key];
    if (typeof value !== "number" || Number.isNaN(value)) {
      errors[key] = `${label} is required.`;
      continue;
    }
    const hasMin = min != null;
    const hasMax = max != null;
    if ((hasMin && value < min) || (hasMax && value > max)) {
      if (hasMin && hasMax) {
        errors[key] = `Must be between ${min} and ${max}`;
      } else if (hasMin) {
        errors[key] = `Must be at least ${min}`;
      } else {
        errors[key] = `Must be at most ${max}`;
      }
    }
  }

  // Cross-field: phases must have positive length.
  if (
    !errors.retirementAge &&
    !errors.startAge &&
    input.retirementAge <= input.startAge
  ) {
    errors.retirementAge = "Retirement age must be after your start age.";
  }
  if (
    !errors.planningAge &&
    !errors.retirementAge &&
    input.planningAge <= input.retirementAge
  ) {
    errors.planningAge = "Plan-until age must be after retirement.";
  }

  return errors;
}
