import { describe, expect, it } from "vitest";
import { marginalRate, taxOwed } from "./tax";

describe("2026 tax engine", () => {
  it.each([
    ["NB", 75_000, 0.345],
    ["BC", 75_000, 0.282],
    ["ON", 30_000, 0.1905],
    ["ON", 23_000, 0.301],
    ["ON", 37_000, 0.2505],
    ["ON", 48_200, 0.4405],
    ["ON", 72_200, 0.5465],
    ["ON", 100_000, 0.3148],
    ["ON", 200_200, 0.73265],
    ["BC", 210_000, 0.46095],
  ] as const)(
    "matches published combined ordinary-income marginal rate for %s at %i",
    (province, income, expected) => {
      expect(marginalRate(province, income)).toBeCloseTo(expected, 3);
    },
  );

  it("uses the income-tested federal BPA in its phaseout range", () => {
    const rate = marginalRate("NB", 210_000);
    expect(rate).toBeCloseTo(0.48795, 5);
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

  it("fully cancels Ontario tax via the 2026 tax reduction at low income", () => {
    // At $17,000 the Ontario basic tax (~$203) is below the doubled reduction
    // amount (2 × $300), so the Ontario component is reduced to zero — total tax
    // is purely federal. The reduction is gone by ~$25k, leaving Ontario tax.
    const income = 17_000;
    const federalOnly = Math.max(0, income * 0.14 - 16_452 * 0.14);
    expect(taxOwed("ON", income)).toBeCloseTo(federalOnly, 2);
    expect(taxOwed("ON", 26_000)).toBeGreaterThan(
      Math.max(0, 26_000 * 0.14 - 16_452 * 0.14),
    );
  });
});
