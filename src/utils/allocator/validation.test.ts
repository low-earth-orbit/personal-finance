import { describe, expect, it } from "vitest";

import { DEFAULTS } from "./presets";
import { validateAllocatorInput } from "./validation";

describe("allocator validation", () => {
  it("requires finite RRSP and TFSA room values", () => {
    const errors = validateAllocatorInput({
      ...DEFAULTS,
      availableRrspRoom: Number.NaN,
      availableTfsaRoom: Number.NaN,
    });

    expect(errors.availableRrspRoom).toBe("Available RRSP room is required.");
    expect(errors.availableTfsaRoom).toBe("Available TFSA room is required.");
  });

  it("requires a lump sum within the supported range", () => {
    expect(
      validateAllocatorInput({ ...DEFAULTS, lumpSum: Number.NaN }).lumpSum,
    ).toBe("Lump sum is required.");
    expect(
      validateAllocatorInput({ ...DEFAULTS, lumpSum: 10_000_001 }).lumpSum,
    ).toBe("Must be between 1 and 10000000");
  });

  it("validates cross-field and tax-rate assumptions", () => {
    const errors = validateAllocatorInput({
      ...DEFAULTS,
      retirementAge: DEFAULTS.currentAge,
      distributionYieldPct: DEFAULTS.portfolioReturn + 1,
      capitalGainsTaxRatePct: 61,
    });

    expect(errors.retirementAge).toMatch(/greater than current age/);
    expect(errors.distributionYieldPct).toMatch(/cannot exceed nominal return/);
    expect(errors.capitalGainsTaxRatePct).toBe("Must be between 0 and 60");
  });

  it("validates only the selected retirement tax-rate input", () => {
    expect(
      validateAllocatorInput({
        ...DEFAULTS,
        retirementRateMode: "income",
        retirementWithdrawalRatePct: Number.NaN,
        retirementIncome: 60_000,
      }).retirementWithdrawalRatePct,
    ).toBeUndefined();
    expect(
      validateAllocatorInput({
        ...DEFAULTS,
        retirementRateMode: "income",
        retirementIncome: Number.NaN,
      }).retirementIncome,
    ).toBe("Expected retirement income is required.");
  });
});
