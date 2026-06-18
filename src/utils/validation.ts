import type { FieldConstraint, FieldErrors, UserInput, UserInputKey } from "../types";

export const FIELD_CONSTRAINTS: Record<UserInputKey, FieldConstraint> = {
  monthlyRent: { min: 1, max: undefined, step: 100 },
  rentIncreaseRate: {
    min: -5,
    max: 10,
    step: 0.5,
    allowNegative: true,
  },
  ownerCostGrowthRate: {
    min: -5,
    max: 10,
    step: 0.5,
    allowNegative: true,
  },
  initialHomePrice: { min: 10000, max: undefined, step: 10000 },
  homePriceGrowthRate: {
    min: -5,
    max: 10,
    step: 0.5,
    allowNegative: true,
  },
  buyerClosingCostsPct: { min: 0, max: 10, step: 0.25 },
  sellerClosingCostsPct: { min: 0, max: 10, step: 0.25 },
  propertyTaxRate: { min: 0, max: 10, step: 0.1 },
  maintPct: { min: 0, max: 10, step: 0.1 },
  condoFeesPerMonth: { min: 0, max: undefined, step: 50 },
  downPaymentPercentage: { min: 20, max: 100, step: 5 },
  annualMortgageInterestRate: { min: -10, max: 20, step: 0.25 },
  amortization: { min: 5, max: 25, step: 5 },
  holdingPeriod: { min: 1, max: 50, step: 1 },
  investmentReturnRate: {
    min: 0,
    max: 10,
    step: 0.5,
    allowNegative: true,
  },
  dividendYield: { min: 0, max: 10, step: 0.5 },
  dividendTaxRate: { min: 0, max: 50, step: 1 },
  capitalGainTaxRate: { min: 0, max: 50, step: 1 },
  homePriceGrowthSigma: { min: 0, max: 10, step: 0.25 },
  investmentReturnSigma: { min: 0, max: 10, step: 0.25 },
  rentIncreaseSigma: { min: 0, max: 5, step: 0.25 },
  ownerCostGrowthSigma: { min: 0, max: 5, step: 0.25 },
  mortgageRateSigma: { min: 0, max: 5, step: 0.25 },
  dividendYieldSigma: { min: 0, max: 5, step: 0.1 },
};

function isEmpty(value: unknown): boolean {
  return (
    value === "" ||
    value === null ||
    value === undefined ||
    (typeof value === "number" && Number.isNaN(value))
  );
}

export function validateUserInput(input: UserInput): FieldErrors {
  const errors: FieldErrors = {};
  const mortgageDisabled = input.downPaymentPercentage === 100;

  for (const [field, { min, max }] of Object.entries(FIELD_CONSTRAINTS) as [
    UserInputKey,
    FieldConstraint,
  ][]) {
    if (mortgageDisabled && (field === "annualMortgageInterestRate" || field === "amortization")) {
      continue;
    }

    const value = input[field];

    if (isEmpty(value)) {
      errors[field] = "Required";
      continue;
    }

    const hasMin = min != null;
    const hasMax = max != null;
    if ((hasMin && value < min) || (hasMax && value > max)) {
      if (hasMin && hasMax) {
        errors[field] = `Must be between ${min} and ${max}`;
      } else if (hasMin) {
        errors[field] = `Must be at least ${min}`;
      } else {
        errors[field] = `Must be at most ${max}`;
      }
    }
  }

  if (
    !errors.dividendYield &&
    !isEmpty(input.dividendYield) &&
    !isEmpty(input.investmentReturnRate) &&
    input.investmentReturnRate >= 0 &&
    input.dividendYield > input.investmentReturnRate
  ) {
    errors.dividendYield = "Cannot exceed total portfolio return";
  }

  return errors;
}
