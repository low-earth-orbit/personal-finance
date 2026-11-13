import { describe, expect, it } from "vitest";
import { computeExpectedReturn } from "./engine";
import { DEFAULTS, WEIGHT_PRESETS, matchWeightPreset } from "./presets";

describe("weight presets", () => {
  it("each add to 100% with unique ids", () => {
    for (const preset of WEIGHT_PRESETS) {
      const total = Object.values(preset.weights).reduce((sum, weight) => sum + weight, 0);
      expect(total, preset.id).toBe(100);
    }
    expect(new Set(WEIGHT_PRESETS.map((preset) => preset.id)).size).toBe(WEIGHT_PRESETS.length);
  });

  it("match the default weights to Equal", () => {
    expect(matchWeightPreset(DEFAULTS)?.id).toBe("equal");
  });

  it("match only exact weights", () => {
    const manager = WEIGHT_PRESETS.find((preset) => preset.id === "manager")!;
    expect(matchWeightPreset({ ...DEFAULTS, ...manager.weights })?.id).toBe("manager");
    expect(matchWeightPreset({ ...DEFAULTS, weightHistory: 21 })).toBeUndefined();
    expect(matchWeightPreset({ ...DEFAULTS, weightHistory: "" })).toBeUndefined();
  });

  it("span the documented range with the defaults", () => {
    const rates = Object.fromEntries(
      WEIGHT_PRESETS.map((preset) => [
        preset.id,
        Math.round(computeExpectedReturn({ ...DEFAULTS, ...preset.weights }).realGeometric * 1000) /
          10,
      ]),
    );
    expect(rates).toEqual({ equal: 4.2, planner: 4.8, manager: 3.7 });
  });
});
