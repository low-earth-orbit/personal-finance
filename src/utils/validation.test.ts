import { describe, test, expect } from "vitest";
import { DEFAULTS } from "./presets";
import { validateUserInput } from "./validation";

describe("mortgage validation", () => {
  test("accepts the default conventional mortgage assumptions", () => {
    expect(validateUserInput(DEFAULTS)).toEqual({});
  });

  test("caps the expected investment return at 10%", () => {
    expect(validateUserInput({ ...DEFAULTS, investmentReturnRate: 10 }).investmentReturnRate).toBe(
      undefined,
    );
    expect(
      validateUserInput({ ...DEFAULTS, investmentReturnRate: 10.5 }).investmentReturnRate,
    ).toBeTruthy();
  });

  test("allows insured mortgages down to the price-based minimum", () => {
    // $1M: 5% of $500k + 10% of $500k = 7.5%.
    expect(validateUserInput({ ...DEFAULTS, downPaymentPercentage: 7.5 })).toEqual({});
    expect(validateUserInput({ ...DEFAULTS, downPaymentPercentage: 7 }).downPaymentPercentage).toBe(
      "Minimum is 7.5% at this price",
    );
    expect(
      validateUserInput({ ...DEFAULTS, initialHomePrice: 450_000, downPaymentPercentage: 5 }),
    ).toEqual({});
  });

  test("requires 20% down from $1.5M, and never less than 5%", () => {
    expect(
      validateUserInput({ ...DEFAULTS, initialHomePrice: 1_500_000, downPaymentPercentage: 15 })
        .downPaymentPercentage,
    ).toBe("Minimum is 20% at this price");
    expect(validateUserInput({ ...DEFAULTS, downPaymentPercentage: 4 }).downPaymentPercentage).toBe(
      "Must be between 5 and 100",
    );
  });

  test("allows a 30-year amortization but no longer", () => {
    expect(validateUserInput({ ...DEFAULTS, amortization: 30 })).toEqual({});
    expect(validateUserInput({ ...DEFAULTS, amortization: 35 }).amortization).toBe(
      "Must be between 5 and 30",
    );
  });
});
