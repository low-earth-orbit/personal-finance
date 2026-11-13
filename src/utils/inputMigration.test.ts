import { describe, expect, it } from "vitest";
import { migrateInput } from "./inputMigration";
import { DEFAULTS, PRESETS } from "./presets";

/** The base case as saved before insurance was split out and aging folded into one rate. */
const OLD_DEFAULTS = (() => {
  const { insurancePct, ...rest } = DEFAULTS;
  return {
    ...rest,
    maintPct: rest.maintPct + insurancePct,
    maintAgingPct: 1,
    ownerCostGrowthRate: 2.5,
  };
})();

describe("migrateInput", () => {
  it("turns the old base case into the new one", () => {
    expect({ ...DEFAULTS, ...migrateInput(OLD_DEFAULTS) }).toEqual(DEFAULTS);
  });

  it("matches every built-in preset saved in the old format", () => {
    for (const preset of PRESETS) {
      const { insurancePct, ...rest } = preset.values;
      const old = {
        ...rest,
        maintPct: Math.round((rest.maintPct + insurancePct) * 100) / 100,
        maintAgingPct: 1,
        ownerCostGrowthRate: 2.5,
      };
      expect({ ...DEFAULTS, ...migrateInput(old) }).toEqual(preset.values);
    }
  });

  it("splits less insurance out of a condo (fees cover the building)", () => {
    expect(migrateInput({ maintPct: 0.8, condoFeesPerMonth: 400 })).toEqual({
      maintPct: 0.7,
      insurancePct: 0.1,
      condoFeesPerMonth: 400,
    });
    // Never more insurance than the old combined figure.
    expect(migrateInput({ maintPct: 0.05 })).toEqual({ maintPct: 0, insurancePct: 0.05 });
  });

  it("adds half of a custom aging rate to owner cost growth and drops the old key", () => {
    const next = migrateInput({ ownerCostGrowthRate: 2, maintAgingPct: 3, insurancePct: 0.2 });
    expect(next).toEqual({ ownerCostGrowthRate: 3.5, insurancePct: 0.2 });
    expect("maintAgingPct" in next).toBe(false);
  });

  it("leaves current inputs unchanged", () => {
    expect(migrateInput(DEFAULTS)).toEqual(DEFAULTS);
  });
});
