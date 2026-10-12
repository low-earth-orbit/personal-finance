import { describe, test, expect, vi, afterEach } from "vitest";
import { DEFAULTS } from "./presets";
import { validateUserInput } from "./validation";
import { runMonteCarlo } from "./monteCarlo";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("maintenance aging", () => {
  test("defaults stay valid with maintAgingPct", () => {
    expect(validateUserInput(DEFAULTS)).toEqual({});
  });

  test("higher aging raises renter net worth, leaves owner equity unchanged", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const sims = 30;
    const base = runMonteCarlo({ ...DEFAULTS, maintAgingPct: 0 }, sims);
    const aged = runMonteCarlo({ ...DEFAULTS, maintAgingPct: 5 }, sims);
    const year = DEFAULTS.holdingPeriod;

    // Owner net worth is home equity only — unaffected by maintenance.
    expect(aged[year - 1].ownerMedian).toBe(base[year - 1].ownerMedian);
    // Higher maintenance raises owner cash outflow, so the renter invests
    // a larger surplus each year.
    expect(aged[year - 1].renterMedian).toBeGreaterThan(base[year - 1].renterMedian);
  });

  test("aging uplift also applies to condo fees", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const sims = 30;
    const base = runMonteCarlo({ ...DEFAULTS, condoFeesPerMonth: 600, maintAgingPct: 0 }, sims);
    const aged = runMonteCarlo({ ...DEFAULTS, condoFeesPerMonth: 600, maintAgingPct: 5 }, sims);
    const year = DEFAULTS.holdingPeriod;

    expect(aged[year - 1].ownerMedian).toBe(base[year - 1].ownerMedian);
    expect(aged[year - 1].renterMedian).toBeGreaterThan(base[year - 1].renterMedian);
  });
});
