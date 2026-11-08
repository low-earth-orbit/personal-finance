import { describe, test, expect } from "vitest";
import { DEFAULTS } from "./presets";
import { validateUserInput } from "./validation";
import { findBreakEven, runMonteCarlo } from "./monteCarlo";

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

describe("insured mortgages", () => {
  test("the insurance premium lowers the owner's net worth", () => {
    const at20 = runMonteCarlo({ ...DEFAULTS, downPaymentPercentage: 20 }, SIMS)[0];
    const at19 = runMonteCarlo({ ...DEFAULTS, downPaymentPercentage: 19.99 }, SIMS)[0];
    // A 0.01-point smaller down payment adds a 2.8% premium to the loan: the owner is
    // roughly $22k worse off after year 1, far more than the $100 down-payment difference.
    expect(at20.ownerMedian - at19.ownerMedian).toBeGreaterThan(20_000);
  });
});

describe("findBreakEven", () => {
  test("finds the rent and price at which the sale-year call is about 50/50", () => {
    const be = findBreakEven(DEFAULTS);
    expect(be.year).toBe(DEFAULTS.holdingPeriod);
    expect(be.monthlyRent).not.toBeNull();
    expect(be.homePrice).not.toBeNull();
    const atRent = runMonteCarlo({ ...DEFAULTS, monthlyRent: be.monthlyRent! }, 4000)[year - 1];
    const atPrice = runMonteCarlo({ ...DEFAULTS, initialHomePrice: be.homePrice! }, 4000)[year - 1];
    expect(atRent.renterWinPct).toBeGreaterThan(0.45);
    expect(atRent.renterWinPct).toBeLessThan(0.55);
    expect(atPrice.renterWinPct).toBeGreaterThan(0.45);
    expect(atPrice.renterWinPct).toBeLessThan(0.55);
    // Renting leads at the defaults, so a tie needs a higher rent or a lower price.
    expect(be.monthlyRent!).toBeGreaterThan(DEFAULTS.monthlyRent);
    expect(be.homePrice!).toBeLessThan(DEFAULTS.initialHomePrice);
  });

  test("keeps the price search within what the down payment can buy", () => {
    // 5% down caps the price at $500k; renting still wins at that cap with a low rent.
    const be = findBreakEven({
      ...DEFAULTS,
      initialHomePrice: 450_000,
      downPaymentPercentage: 5,
      monthlyRent: 800,
    });
    expect(be.homePrice == null || be.homePrice <= 500_000).toBe(true);
  });
});
