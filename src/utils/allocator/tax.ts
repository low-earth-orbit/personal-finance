import {
  BC_TAX_REDUCTION,
  FEDERAL_BPA,
  FEDERAL_BRACKETS,
  ON_SURTAX,
  ON_TAX_REDUCTION,
  PROVINCIAL_TAX,
  type TaxBracket,
} from "./taxConstants";
import type { Province } from "./types";

export const MARGINAL_RATE_DELTA = 100;

function bracketTax(income: number, brackets: readonly TaxBracket[]): number {
  const taxable = Math.max(0, income);
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const current = brackets[i];
    const next = brackets[i + 1];
    const amount = Math.max(
      0,
      Math.min(taxable, next?.threshold ?? taxable) - current.threshold,
    );
    tax += amount * current.rate;
  }
  return tax;
}

function federalBpa(income: number): number {
  if (income <= FEDERAL_BPA.phaseoutStart) return FEDERAL_BPA.max;
  if (income >= FEDERAL_BPA.phaseoutEnd) return FEDERAL_BPA.min;
  const share =
    (income - FEDERAL_BPA.phaseoutStart) /
    (FEDERAL_BPA.phaseoutEnd - FEDERAL_BPA.phaseoutStart);
  return FEDERAL_BPA.max - share * (FEDERAL_BPA.max - FEDERAL_BPA.min);
}

function onHealthPremium(income: number): number {
  if (income <= 20_000) return 0;
  if (income <= 25_000) return Math.min(300, (income - 20_000) * 0.06);
  if (income <= 36_000) return 300;
  if (income <= 38_500) return Math.min(450, 300 + (income - 36_000) * 0.06);
  if (income <= 48_000) return 450;
  if (income <= 48_600) return Math.min(600, 450 + (income - 48_000) * 0.25);
  if (income <= 72_000) return 600;
  if (income <= 72_600) return Math.min(750, 600 + (income - 72_000) * 0.25);
  if (income <= 200_000) return 750;
  if (income <= 200_600) return Math.min(900, 750 + (income - 200_000) * 0.25);
  return 900;
}

function onReduction(income: number): number {
  return Math.max(
    0,
    ON_TAX_REDUCTION.max -
      Math.max(0, income - ON_TAX_REDUCTION.phaseoutStart) *
        ON_TAX_REDUCTION.phaseoutRate,
  );
}

function bcReduction(income: number): number {
  return Math.max(
    0,
    BC_TAX_REDUCTION.max -
      Math.max(0, income - BC_TAX_REDUCTION.phaseoutStart) *
        BC_TAX_REDUCTION.phaseoutRate,
  );
}

export function taxOwed(province: Province, income: number): number {
  const taxableIncome = Math.max(0, income);
  const federal = Math.max(
    0,
    bracketTax(taxableIncome, FEDERAL_BRACKETS) -
      federalBpa(taxableIncome) * FEDERAL_BPA.creditRate,
  );

  const constants = PROVINCIAL_TAX[province];
  const basic =
    bracketTax(taxableIncome, constants.brackets) -
    constants.bpa * constants.brackets[0].rate;

  let provincial: number;
  if (province === "ON") {
    const surtaxBase = Math.max(0, basic);
    const surtax = ON_SURTAX.reduce(
      (sum, tier) =>
        sum + Math.max(0, surtaxBase - tier.overBasicTax) * tier.rate,
      0,
    );
    provincial =
      Math.max(0, basic + surtax - onReduction(taxableIncome)) +
      onHealthPremium(taxableIncome);
  } else if (province === "BC") {
    provincial = Math.max(0, basic - bcReduction(taxableIncome));
  } else {
    provincial = Math.max(0, basic);
  }

  return federal + provincial;
}

export function marginalRate(province: Province, income: number): number {
  return (
    (taxOwed(province, income + MARGINAL_RATE_DELTA) -
      taxOwed(province, income)) /
    MARGINAL_RATE_DELTA
  );
}
