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

  it("starts guaranteed income at the saved retirement age for older saved inputs", () => {
    const { guaranteedStartAge: _omit, ...legacy } = { ...DEFAULTS, retirementAge: 58 };
    void _omit;
    window.localStorage.setItem("glide_input", JSON.stringify(legacy));

    const input = loadInput();
    expect(input.guaranteedStartAge).toBe(58);
    expect(input.bequestWeight).toBe(0);
  });

  it("loads a saved glide-step interval", () => {
    window.localStorage.setItem("glide_input", JSON.stringify({ ...DEFAULTS, interval: 10 }));

    expect(loadInput().interval).toBe(10);
  });
});
