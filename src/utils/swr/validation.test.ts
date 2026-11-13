import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./presets";
import { validateSwrInput } from "./validation";

describe("validateSwrInput", () => {
  it("accepts the defaults in every mode", () => {
    expect(validateSwrInput({ ...DEFAULTS }, "independent")).toEqual({});
    expect(validateSwrInput({ ...DEFAULTS }, "custom")).toEqual({});
  });

  it("flags out-of-range and empty fields", () => {
    const errors = validateSwrInput({
      ...DEFAULTS,
      stockVol: 0,
      correlation: 1.2,
      inflationRate: "" as unknown as number,
      successRate: 100,
    });
    expect(errors.stockVol).toBe("Must be between 1 and 40");
    expect(errors.correlation).toBe("Must be between -0.9 and 0.9");
    expect(errors.inflationRate).toBe("Inflation is required.");
    expect(errors.successRate).toBe("Must be between 80 and 99");
  });

  it("validates the VR fields only in custom mode", () => {
    const input = { ...DEFAULTS, stockVr: 5, bondVr: 0.1 };
    expect(validateSwrInput(input, "independent")).toEqual({});
    expect(validateSwrInput(input, "historical")).toEqual({});
    const errors = validateSwrInput(input, "custom");
    expect(errors.stockVr).toBe("Must be between 0.5 and 3");
    expect(errors.bondVr).toBe("Must be between 0.5 and 3");
  });
});
