import { afterEach, describe, expect, it } from "vitest";
import { DEFAULTS } from "./presets";
import { loadDynamics, loadInput, saveDynamics, saveInput } from "./storage";

afterEach(() => localStorage.clear());

describe("swr storage", () => {
  it("falls back to the defaults when nothing is saved", () => {
    expect(loadInput()).toEqual(DEFAULTS);
    expect(loadDynamics()).toBe("independent");
  });

  it("round-trips inputs and dynamics", () => {
    const saved = { ...DEFAULTS, stockReturn: 7.5, successRate: 95 };
    saveInput(saved);
    saveDynamics("historical");
    expect(loadInput()).toEqual(saved);
    expect(loadDynamics()).toBe("historical");
  });

  it("keeps only numeric fields and fills the rest from the defaults", () => {
    localStorage.setItem(
      "swr_input",
      JSON.stringify({ stockReturn: 8, bondReturn: "high", unknown: 3 }),
    );
    expect(loadInput()).toEqual({ ...DEFAULTS, stockReturn: 8 });
  });

  it("ignores corrupt data", () => {
    localStorage.setItem("swr_input", "{nope");
    localStorage.setItem("swr_dynamics", "chaotic");
    expect(loadInput()).toEqual(DEFAULTS);
    expect(loadDynamics()).toBe("independent");
  });
});
