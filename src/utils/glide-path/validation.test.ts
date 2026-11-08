import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./presets";
import { validateGlidePathInput } from "./validation";
import type { GlidePathInput } from "./types";

const base = (o: Partial<GlidePathInput> = {}): GlidePathInput => ({
  ...DEFAULTS,
  ...o,
});

describe("validateGlidePathInput", () => {
  it("uses the shared baseline model defaults", () => {
    expect(DEFAULTS).toMatchObject({
      flexibility: 0,
      withdrawalRate: 4,
      gamma: 4,
      beta: 0.985,
      borrowCost: 2,
    });
  });

  it("accepts the defaults", () => {
    expect(validateGlidePathInput(base())).toEqual({});
  });

  it("flags a retirement age that is not after the start age", () => {
    const errors = validateGlidePathInput(base({ retirementAge: 35 }));
    expect(errors.retirementAge).toMatch(/must be after your start age/i);
  });

  it("flags a planning age that is not after retirement", () => {
    const errors = validateGlidePathInput(base({ planningAge: 65 }));
    expect(errors.planningAge).toMatch(/must be after retirement/i);
  });

  it("flags an out-of-range field", () => {
    const errors = validateGlidePathInput(base({ guaranteedIncome: -1 }));
    expect(errors.guaranteedIncome).toBeTruthy();
  });

  it("rejects fully covered constant-dollar spending", () => {
    const errors = validateGlidePathInput(
      base({ flexibility: 0, targetIncome: 60000, guaranteedIncome: 60000 }),
    );
    expect(errors.targetIncome).toMatch(/must exceed guaranteed income/i);
  });

  it("allows fully covered spending when flexibility is positive", () => {
    expect(
      validateGlidePathInput(
        base({ flexibility: 0.5, targetIncome: 60000, guaranteedIncome: 60000 }),
      ),
    ).toEqual({});
  });

  it("allows fully covered spending with a bequest weight, but not via a bridge", () => {
    const covered = { flexibility: 0, targetIncome: 60000, guaranteedIncome: 60000 };
    // Bridge years are floored at the guaranteed amount, so every allocation still ties.
    expect(
      validateGlidePathInput(base({ ...covered, retirementAge: 60, guaranteedStartAge: 65 }))
        .targetIncome,
    ).toMatch(/must exceed guaranteed income/i);
    expect(validateGlidePathInput(base({ ...covered, bequestWeight: 0.25 }))).toEqual({});
  });

  it("requires guaranteed income to start before the plan ends", () => {
    const errors = validateGlidePathInput(base({ guaranteedStartAge: 95 }));
    expect(errors.guaranteedStartAge).toMatch(/before your plan-until age/i);
  });

  it("limits the bequest weight to the strong preset", () => {
    expect(validateGlidePathInput(base({ bequestWeight: 0.5 }))).toEqual({});
    expect(validateGlidePathInput(base({ bequestWeight: 0.6 })).bequestWeight).toBeTruthy();
  });

  it("limits the glide-step interval to one through ten years", () => {
    expect(validateGlidePathInput(base({ interval: 1 }))).toEqual({});
    expect(validateGlidePathInput(base({ interval: 10 }))).toEqual({});
    expect(validateGlidePathInput(base({ interval: 11 })).interval).toBeTruthy();
    expect(validateGlidePathInput(base({ interval: 2.5 })).interval).toMatch(/whole number/i);
  });
});
