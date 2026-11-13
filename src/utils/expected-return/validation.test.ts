import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./presets";
import { isValid, validateExpectedReturnInput } from "./validation";
import type { ExpectedReturnInput } from "./types";

const clone = (): ExpectedReturnInput => structuredClone(DEFAULTS);

describe("validateExpectedReturnInput", () => {
  it("accepts the defaults", () => {
    expect(validateExpectedReturnInput(DEFAULTS)).toEqual({});
    expect(isValid(DEFAULTS)).toBe(true);
  });

  it("flags empty and out-of-range region fields by region", () => {
    const input = clone();
    (input.regions.us as unknown as Record<string, unknown>).cape = "";
    input.regions.emerging.buybackYield = -8;
    const errors = validateExpectedReturnInput(input);
    expect(errors["us.cape"]).toBe("Current CAPE is required.");
    expect(errors["emerging.buybackYield"]).toBe("Must be between -5 and 5");
  });

  it("flags global fields", () => {
    const input = { ...clone(), horizon: 2 };
    expect(validateExpectedReturnInput(input).horizon).toBe("Must be between 5 and 60");
  });

  it("requires region weights to add to 100%", () => {
    const input = clone();
    input.regions.us.weight = 40;
    expect(validateExpectedReturnInput(input).regionWeights).toBe(
      "Region weights add to 95%; they must add to 100%.",
    );
  });

  it("requires view weights to add to 100%", () => {
    const input = { ...clone(), weightHistory: 15 };
    expect(validateExpectedReturnInput(input).viewWeights).toBe(
      "View weights add to 95%; they must add to 100%.",
    );
  });

  it("skips the sum check while a weight is empty", () => {
    const input = clone();
    (input.regions.us as unknown as Record<string, unknown>).weight = "";
    const errors = validateExpectedReturnInput(input);
    expect(errors["us.weight"]).toBeDefined();
    expect(errors.regionWeights).toBeUndefined();
  });
});
