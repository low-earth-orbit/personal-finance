import { DEFAULTS } from "./presets";
import type { RetirementErrors, RetirementInput, RetirementInputKey } from "./types";

interface Constraint {
  min: number;
  max: number | undefined; // undefined means no upper limit
  step: number;
  label: string;
}

// Labels match the on-screen field labels so validation errors name the field
// the user is looking at.
export const FIELD_CONSTRAINTS: Record<RetirementInputKey, Constraint> = {
  currentAge: { min: 18, max: 70, step: 1, label: "Current age" },
  planningAge: { min: 80, max: 110, step: 5, label: "Planning age" },
  currentSavings: {
    min: 0,
    max: 100_000_000,
    step: 10000,
    label: "Current savings",
  },
  currentIncome: {
    min: 1,
    max: 100_000_000,
    step: 10000,
    label: "Current annual income",
  },
  contributionPct: { min: 0, max: 100, step: 5, label: "Annual savings" },
  targetIncomePct: { min: 1, max: undefined, step: 5, label: "Target income" },
  guaranteedIncomePct: {
    min: 0,
    max: undefined,
    step: 5,
    label: "Pension amount",
  },
  pensionStartAge: { min: 60, max: 70, step: 5, label: "Pension start age" },
  accumReturn: { min: 0, max: 10, step: 0.1, label: "Return while working" },
  retireReturn: { min: 0, max: 10, step: 0.1, label: "Return in retirement" },
  inflationRate: { min: 1, max: 3, step: 0.1, label: "Inflation" },
  targetSuccessRate: {
    min: 80,
    max: 100,
    step: 5,
    label: "Success target",
  },
  spendingFlexibilityPct: {
    min: 0,
    max: 50,
    step: 5,
    label: "Spending flexibility",
  },
};

const KEYS = Object.keys(DEFAULTS) as RetirementInputKey[];

export function validateRetirementInput(input: RetirementInput): RetirementErrors {
  const errors: RetirementErrors = {};

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

  // Cross-field: you must plan to an age beyond today.
  if (!errors.planningAge && !errors.currentAge && input.planningAge <= input.currentAge) {
    errors.planningAge = "Planning age must be greater than your current age.";
  }

  // Cross-field: a pension you set but would never receive (starts after the plan ends).
  if (
    !errors.pensionStartAge &&
    !errors.planningAge &&
    input.guaranteedIncomePct > 0 &&
    input.pensionStartAge > input.planningAge
  ) {
    errors.pensionStartAge = "Pension start age must be before your planning age.";
  }

  return errors;
}
