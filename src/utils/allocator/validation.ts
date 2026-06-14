import type {
  AllocatorErrors,
  AllocatorInput,
  AllocatorInputKey,
} from "./types";

interface Constraint {
  min: number;
  max?: number;
  step: number;
  label: string;
}

export const FIELD_CONSTRAINTS: Partial<Record<AllocatorInputKey, Constraint>> =
  {
    currentAge: { min: 18, max: 70, step: 1, label: "Current age" },
    retirementAge: { min: 19, max: 100, step: 1, label: "Retirement age" },
    currentIncome: {
      min: 0,
      max: 100_000_000,
      step: 1_000,
      label: "Current income",
    },
    salaryGrowthPct: {
      min: 0,
      max: 10,
      step: 0.1,
      label: "Real income growth",
    },
    salaryGrowthYears: {
      min: 0,
      max: 82,
      step: 1,
      label: "Growth period",
    },
    lumpSum: {
      min: 1,
      max: 10_000_000,
      step: 1_000,
      label: "Lump sum",
    },
    availableRrspRoom: {
      min: 0,
      max: 10_000_000,
      step: 1_000,
      label: "Available RRSP room",
    },
    availableTfsaRoom: {
      min: 0,
      max: 10_000_000,
      step: 1_000,
      label: "Available TFSA room",
    },
    portfolioReturn: {
      min: 0,
      max: 12,
      step: 0.1,
      label: "Nominal return",
    },
    inflationPct: { min: 0, max: 6, step: 0.1, label: "Inflation" },
    distributionYieldPct: {
      min: 0,
      max: 8,
      step: 0.1,
      label: "Distribution yield",
    },
    retirementWithdrawalRatePct: {
      min: 0,
      max: 60,
      step: 1,
      label: "Withdrawal tax rate",
    },
    capitalGainsTaxRatePct: {
      min: 0,
      max: 60,
      step: 1,
      label: "Capital gains tax rate",
    },
  };

export function validateAllocatorInput(input: AllocatorInput): AllocatorErrors {
  const errors: AllocatorErrors = {};
  for (const [key, constraint] of Object.entries(FIELD_CONSTRAINTS) as [
    AllocatorInputKey,
    Constraint,
  ][]) {
    if (
      (key === "salaryGrowthPct" || key === "salaryGrowthYears") &&
      input.salaryCurve !== "custom"
    ) {
      continue;
    }
    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors[key] = `${constraint.label} is required.`;
    } else if (
      value < constraint.min ||
      (constraint.max != null && value > constraint.max)
    ) {
      errors[key] =
        constraint.max == null
          ? `Must be at least ${constraint.min}`
          : `Must be between ${constraint.min} and ${constraint.max}`;
    }
  }
  if (!errors.retirementAge && input.retirementAge <= input.currentAge) {
    errors.retirementAge = "Retirement age must be greater than current age.";
  }
  if (
    !errors.distributionYieldPct &&
    !errors.portfolioReturn &&
    input.distributionYieldPct > input.portfolioReturn
  ) {
    errors.distributionYieldPct =
      "Distribution yield cannot exceed nominal return.";
  }
  return errors;
}
