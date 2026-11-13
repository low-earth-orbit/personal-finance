import { REGION_IDS } from "./presets";
import type { ExpectedReturnErrors, ExpectedReturnInput, GlobalKey, RegionKey } from "./types";

interface Constraint {
  min: number;
  max: number;
  step: number;
  label: string;
}

// Labels match the on-screen field labels so validation errors name the field the user sees.
export const REGION_CONSTRAINTS: Record<RegionKey, Constraint> = {
  weight: { min: 0, max: 100, step: 1, label: "Portfolio weight" },
  dividendYield: { min: 0, max: 10, step: 0.1, label: "Dividend yield" },
  buybackYield: { min: -5, max: 5, step: 0.1, label: "Net buyback yield" },
  earningsGrowth: { min: -2, max: 6, step: 0.1, label: "Real earnings growth" },
  cape: { min: 5, max: 80, step: 0.5, label: "Current CAPE" },
  targetCape: { min: 5, max: 80, step: 0.5, label: "Target CAPE" },
};

export const GLOBAL_CONSTRAINTS: Record<GlobalKey, Constraint> = {
  horizon: { min: 5, max: 60, step: 1, label: "Horizon" },
  halfLife: { min: 1, max: 100, step: 1, label: "CAPE half-life" },
  historyReturn: { min: 0, max: 10, step: 0.1, label: "Long-run real return" },
  realYield: { min: -2, max: 6, step: 0.1, label: "Real bond yield" },
  equityPremium: { min: 0, max: 10, step: 0.1, label: "Equity risk premium" },
  weightMarket: { min: 0, max: 100, step: 5, label: "Yield + growth weight" },
  weightValuation: { min: 0, max: 100, step: 5, label: "CAPE reversion weight" },
  weightEarningsYield: { min: 0, max: 100, step: 5, label: "Earnings-yield weight" },
  weightRiskPremium: { min: 0, max: 100, step: 5, label: "Bond + premium weight" },
  weightHistory: { min: 0, max: 100, step: 5, label: "History weight" },
  mer: { min: 0, max: 3, step: 0.01, label: "Fund MER" },
  withholding: { min: 0, max: 1, step: 0.01, label: "Foreign withholding tax drag" },
  inflation: { min: 0, max: 10, step: 0.1, label: "Inflation" },
  volatility: { min: 5, max: 40, step: 0.5, label: "Volatility" },
};

const REGION_KEYS = Object.keys(REGION_CONSTRAINTS) as RegionKey[];
const GLOBAL_KEYS = Object.keys(GLOBAL_CONSTRAINTS) as GlobalKey[];
const SUM_TOLERANCE = 0.01;

function fieldError(value: unknown, { min, max, label }: Constraint): string | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return `${label} is required.`;
  if (value < min || value > max) return `Must be between ${min} and ${max}`;
  return undefined;
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && !Number.isNaN(value);

const formatSum = (sum: number) => `${Math.round(sum * 100) / 100}%`;

export function validateExpectedReturnInput(input: ExpectedReturnInput): ExpectedReturnErrors {
  const errors: ExpectedReturnErrors = {};

  for (const id of REGION_IDS) {
    for (const key of REGION_KEYS) {
      const error = fieldError(input.regions[id][key], REGION_CONSTRAINTS[key]);
      if (error) errors[`${id}.${key}`] = error;
    }
  }
  for (const key of GLOBAL_KEYS) {
    const error = fieldError(input[key], GLOBAL_CONSTRAINTS[key]);
    if (error) errors[key] = error;
  }

  const regionWeights = REGION_IDS.map((id) => input.regions[id].weight);
  if (regionWeights.every(isNumber)) {
    const sum = regionWeights.reduce((total, weight) => total + weight, 0);
    if (Math.abs(sum - 100) > SUM_TOLERANCE) {
      errors.regionWeights = `Region weights add to ${formatSum(sum)}; they must add to 100%.`;
    }
  }

  const viewWeights = [
    input.weightMarket,
    input.weightValuation,
    input.weightEarningsYield,
    input.weightRiskPremium,
    input.weightHistory,
  ];
  if (viewWeights.every(isNumber)) {
    const sum = viewWeights.reduce((total, weight) => total + weight, 0);
    if (Math.abs(sum - 100) > SUM_TOLERANCE) {
      errors.viewWeights = `View weights add to ${formatSum(sum)}; they must add to 100%.`;
    }
  }

  return errors;
}

export function isValid(input: ExpectedReturnInput): boolean {
  return Object.keys(validateExpectedReturnInput(input)).length === 0;
}
