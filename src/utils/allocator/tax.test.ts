import { describe, expect, it } from "vitest";
import { marginalRate, taxOwed } from "./tax";

describe("2025 tax engine", () => {
  it.each([
    ["NB", 75_000, 0.345],
    ["BC", 75_000, 0.282],
    ["ON", 30_000, 0.1955],
    ["ON", 23_000, 0.306],
    ["ON", 37_000, 0.2555],
    ["ON", 48_200, 0.4455],
    ["ON", 72_200, 0.5465],
    ["ON", 100_000, 0.3148],
    ["ON", 200_200, 0.73275],
    ["BC", 210_000, 0.461054],
  ] as const)(
    "matches published combined ordinary-income marginal rate for %s at %i",
    (province, income, expected) => {
      expect(marginalRate(province, income)).toBeCloseTo(expected, 3);
    },
  );

  it("uses the income-tested federal BPA in its phaseout range", () => {
    const rate = marginalRate("NB", 210_000);
    expect(rate).toBeCloseTo(0.488054, 5);
  });

  it("blends rates when a deduction crosses a bracket boundary", () => {
    const refund = taxOwed("ON", 58_000) - taxOwed("ON", 52_000);
    expect(refund).toBeGreaterThan(6_000 * 0.2005);
    expect(refund).toBeLessThan(6_000 * 0.2965);
  });

  it("floors federal and provincial statutory components separately", () => {
    expect(taxOwed("NB", 15_000)).toBeGreaterThan(0);
    expect(taxOwed("NB", 0)).toBe(0);
  });

  it("shows ON health-premium ramp endings are non-monotonic", () => {
    expect(marginalRate("ON", 48_200)).toBeGreaterThan(
      marginalRate("ON", 49_000),
    );
  });

  it("shows ON surtax and ON/BC reduction phaseouts", () => {
    expect(marginalRate("ON", 23_000)).toBeGreaterThan(
      marginalRate("ON", 30_000),
    );
    expect(marginalRate("ON", 120_000)).toBeGreaterThan(0.43);
    expect(marginalRate("BC", 30_000)).toBeGreaterThan(0.23);
  });
});
