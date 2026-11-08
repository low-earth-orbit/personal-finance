import { describe, it, test, expect } from "vitest";
import {
  calculateMortgagePrincipal,
  calculateMonthlyMortgagePayment,
  calculateOpeningMortgageBalance,
  minimumDownPaymentPct,
  mortgageInsurancePremiumRate,
} from "./math";

describe("conventional mortgage calculations", () => {
  test("calculates mortgage principal without CMHC premiums", () => {
    expect(calculateMortgagePrincipal(1000000, 20)).toBe(800000);
    expect(calculateMortgagePrincipal(1000000, 100)).toBe(0);
  });

  test("handles zero-interest mortgage payments", () => {
    expect(calculateMonthlyMortgagePayment(300000, 0, 25)).toBe(1000);
  });

  test("soft-fails to 0 on a non-positive amortization", () => {
    expect(calculateMonthlyMortgagePayment(300000, 5, 0)).toBe(0);
    expect(calculateMonthlyMortgagePayment(300000, 5, -1)).toBe(0);
  });
});

describe("insured mortgages", () => {
  it("computes the minimum down payment by price", () => {
    expect(minimumDownPaymentPct(400_000)).toBeCloseTo(5, 10);
    expect(minimumDownPaymentPct(500_000)).toBeCloseTo(5, 10);
    // 5% of $500k + 10% of $500k = $75k on $1M.
    expect(minimumDownPaymentPct(1_000_000)).toBeCloseTo(7.5, 10);
    expect(minimumDownPaymentPct(1_500_000)).toBe(20);
  });

  it("prices the premium by loan-to-value, with a 30-year surcharge", () => {
    expect(mortgageInsurancePremiumRate(20, 25)).toBe(0);
    expect(mortgageInsurancePremiumRate(15, 25)).toBeCloseTo(0.028, 10);
    expect(mortgageInsurancePremiumRate(10, 25)).toBeCloseTo(0.031, 10);
    expect(mortgageInsurancePremiumRate(5, 25)).toBeCloseTo(0.04, 10);
    expect(mortgageInsurancePremiumRate(5, 30)).toBeCloseTo(0.042, 10);
    expect(mortgageInsurancePremiumRate(25, 30)).toBe(0);
  });

  it("rolls the premium into the opening balance", () => {
    expect(calculateOpeningMortgageBalance(500_000, 5, 25)).toBeCloseTo(475_000 * 1.04, 6);
    expect(calculateOpeningMortgageBalance(1_000_000, 20, 30)).toBe(800_000);
  });
});
