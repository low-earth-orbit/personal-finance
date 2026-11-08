import { describe, test, expect } from "vitest";
import { DEFAULTS } from "./presets";
import { validateUserInput } from "./validation";
import { runMonteCarlo } from "./monteCarlo";

const SIMS = 300;
const year = DEFAULTS.holdingPeriod;

describe("maintenance aging", () => {
  test("defaults stay valid with maintAgingPct", () => {
    expect(validateUserInput(DEFAULTS)).toEqual({});
  });

  test("higher aging raises renter net worth, leaves owner equity unchanged", () => {
    const base = runMonteCarlo({ ...DEFAULTS, maintAgingPct: 0 }, SIMS);
    const aged = runMonteCarlo({ ...DEFAULTS, maintAgingPct: 5 }, SIMS);

    // Owning costs more than renting through the holding period, so the owner invests
    // nothing and owner net worth is home equity only — unaffected by maintenance.
    expect(aged[year - 1].ownerMedian).toBe(base[year - 1].ownerMedian);
    // Higher maintenance raises owner cash outflow, so the renter invests a larger surplus.
    expect(aged[year - 1].renterMedian).toBeGreaterThan(base[year - 1].renterMedian);
  });

  test("aging uplift also applies to condo fees", () => {
    const base = runMonteCarlo({ ...DEFAULTS, condoFeesPerMonth: 600, maintAgingPct: 0 }, SIMS);
    const aged = runMonteCarlo({ ...DEFAULTS, condoFeesPerMonth: 600, maintAgingPct: 5 }, SIMS);

    expect(aged[year - 1].ownerMedian).toBe(base[year - 1].ownerMedian);
    expect(aged[year - 1].renterMedian).toBeGreaterThan(base[year - 1].renterMedian);
  });
});

describe("runMonteCarlo", () => {
  test("is deterministic: identical inputs give identical results", () => {
    expect(runMonteCarlo(DEFAULTS, SIMS)).toEqual(runMonteCarlo(DEFAULTS, SIMS));
  });

  test("median gap has the same sign as the majority winner, either way", () => {
    const renterAhead = runMonteCarlo(DEFAULTS, SIMS)[year - 1];
    expect(renterAhead.renterWinPct).toBeGreaterThan(0.5);
    expect(renterAhead.medianGap).toBeGreaterThan(0);
    // High rent: buying wins at the sale year.
    const buyerAhead = runMonteCarlo({ ...DEFAULTS, monthlyRent: 7000 }, SIMS)[year - 1];
    expect(buyerAhead.renterWinPct).toBeLessThan(0.5);
    expect(buyerAhead.medianGap).toBeLessThan(0);
  });

  test("a tax-sheltered share lifts the renter's after-tax wealth", () => {
    const taxed = runMonteCarlo({ ...DEFAULTS, taxShelteredPct: 0 }, SIMS);
    const sheltered = runMonteCarlo({ ...DEFAULTS, taxShelteredPct: 100 }, SIMS);
    expect(sheltered[year - 1].renterMedian).toBeGreaterThan(taxed[year - 1].renterMedian);
    // Fully sheltered with zero tax rates is the same as fully taxable at zero rates.
    const noTax = { ...DEFAULTS, dividendTaxRate: 0, capitalGainTaxRate: 0 };
    expect(
      runMonteCarlo({ ...noTax, taxShelteredPct: 100 }, SIMS)[year - 1].renterMedian,
    ).toBeCloseTo(runMonteCarlo({ ...noTax, taxShelteredPct: 0 }, SIMS)[year - 1].renterMedian, 6);
  });

  test("the owner invests the difference once owning is cheaper", () => {
    // All cash: no mortgage, so owner costs (tax + maintenance) sit far below rent.
    const allCash = { ...DEFAULTS, downPaymentPercentage: 100, monthlyRent: 5000 };
    const withSavings = runMonteCarlo(allCash, SIMS);
    const noRent = runMonteCarlo({ ...allCash, monthlyRent: 1 }, SIMS);
    // Rent above owner costs: the owner banks the difference on top of home equity.
    expect(withSavings[year - 1].ownerMedian).toBeGreaterThan(noRent[year - 1].ownerMedian);
  });
});
