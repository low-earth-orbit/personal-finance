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

  it.each([
    ["modest", 1],
    ["strong", 2],
    ["fast", 3],
  ] as const)(
    "shows the %s preset plateau after fifteen years",
    (curve, rate) => {
      const data = buildIncomeCurveData({
        ...DEFAULTS,
        currentAge: 30,
        retirementAge: 55,
        salaryCurve: curve,
      });

      expect(data[15].income).toBeCloseTo(100_000 * (1 + rate / 100) ** 15);
      expect(data.at(-1)?.income).toBe(data[15].income);
    },
  );

  it("uses the custom growth rate and period", () => {
    const data = buildIncomeCurveData({
      ...DEFAULTS,
      currentAge: 30,
      retirementAge: 55,
      salaryCurve: "custom",
      salaryGrowthPct: 2,
      salaryGrowthYears: 10,
    });

    expect(data[10].income).toBeCloseTo(100_000 * 1.02 ** 10);
    expect(data.at(-1)?.income).toBe(data[10].income);
  });
});
