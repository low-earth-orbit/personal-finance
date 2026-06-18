import { afterEach, describe, expect, it } from "vitest";
import { DEFAULTS } from "./presets";
import { loadInput, saveInput } from "./storage";

afterEach(() => {
  window.localStorage.clear();
});

describe("glide-path storage", () => {
  it("round-trips the current guaranteed-income input", () => {
    const input = { ...DEFAULTS, guaranteedIncome: 24000 };

    saveInput(input);

    expect(loadInput()).toEqual(input);
  });

  it("migrates the legacy pension percentage to a guaranteed-income amount", () => {
    window.localStorage.setItem(
      "glide_input",
      JSON.stringify({
        ...DEFAULTS,
        guaranteedIncome: undefined,
        pensionPct: 25,
        preRetirementIncome: 120000,
      }),
    );

    const input = loadInput();

    expect(input.guaranteedIncome).toBe(30000);
    expect(input).not.toHaveProperty("pensionPct");
    expect(input).not.toHaveProperty("preRetirementIncome");
  });

  it("drops a legacy web interval instead of silently changing the engine cadence", () => {
    window.localStorage.setItem("glide_input", JSON.stringify({ ...DEFAULTS, interval: 10 }));

    expect(loadInput()).not.toHaveProperty("interval");
  });
});
