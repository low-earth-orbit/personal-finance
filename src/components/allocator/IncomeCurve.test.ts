import { describe, expect, it } from "vitest";
import { DEFAULTS } from "@/utils/allocator/presets";
import { buildIncomeCurveData } from "./IncomeCurve";

describe("buildIncomeCurveData", () => {
  it("includes current age through the retirement boundary", () => {
    const data = buildIncomeCurveData({
      ...DEFAULTS,
      currentAge: 40,
      retirementAge: 43,
      salaryCurve: "flat",
    });

    expect(data.map((point) => point.age)).toEqual([40, 41, 42]);
    expect(data.every((point) => point.income === DEFAULTS.currentIncome)).toBe(
      true,
    );
  });

  it("shows the early-peak plateau after ten years", () => {
    const data = buildIncomeCurveData({
      ...DEFAULTS,
      currentAge: 30,
      retirementAge: 45,
      salaryCurve: "early-peak",
    });

    expect(data.at(-1)?.income).toBe(data[10].income);
  });
});
