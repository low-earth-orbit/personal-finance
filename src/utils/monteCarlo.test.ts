import { describe, test, expect } from "vitest";
import { DEFAULTS } from "./presets";
import { validateUserInput } from "./validation";
import { findBreakEven, maxPriceForDownPayment, runMonteCarlo } from "./monteCarlo";

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

describe("market draws", () => {
  test("the first mortgage term uses the entered rate; uncertainty starts at renewal", () => {
    const certain = runMonteCarlo({ ...DEFAULTS, mortgageRateSigma: 0 }, SIMS);
    const uncertain = runMonteCarlo({ ...DEFAULTS, mortgageRateSigma: 3 }, SIMS);
    for (let y = 0; y < 5; y++) expect(uncertain[y]).toEqual(certain[y]);
    expect(uncertain[9].ownerP25).not.toBe(certain[9].ownerP25);
  });

  test("the median home compounds at the entered growth rate", () => {
    // All cash, no costs, no rent: owner net worth is the home value alone.
    const input = {
      ...DEFAULTS,
      downPaymentPercentage: 100,
      monthlyRent: 0,
      propertyTaxRate: 0,
      maintPct: 0,
      sellerClosingCostsPct: 0,
      homePriceGrowthRate: 3,
      homePriceGrowthSigma: 0,
    };
    const last = runMonteCarlo(input, 4000)[29];
    const expected = input.initialHomePrice * 1.03 ** 30;
    // An arithmetic-mean reading would sit ~5% lower (σ²/2 a year for 30 years).
    expect(Math.abs(last.ownerMedian / expected - 1)).toBeLessThan(0.025);
  });

  test("uncertainty about the long-run return doesn't move the median portfolio", () => {
    const sure = runMonteCarlo({ ...DEFAULTS, investmentReturnSigma: 0 }, 4000)[29];
    const unsure = runMonteCarlo({ ...DEFAULTS, investmentReturnSigma: 2 }, 4000)[29];
    expect(Math.abs(unsure.renterMedian / sure.renterMedian - 1)).toBeLessThan(0.06);
    expect(unsure.renterP75 - unsure.renterP25).toBeGreaterThan(sure.renterP75 - sure.renterP25);
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
  const BE_SIMS = 2000;

  test("finds the rent and price at which the sale-year call is 50/50 on the same paths", () => {
    const be = findBreakEven(DEFAULTS, BE_SIMS);
    expect(be).toMatchObject({ year: DEFAULTS.holdingPeriod, currentRent: 3500 });
    // Same seed and paths as runMonteCarlo, so the tie holds there to within the $10 / $1,000
    // search tolerance.
    const atRent = runMonteCarlo({ ...DEFAULTS, monthlyRent: be.monthlyRent! }, BE_SIMS);
    const atPrice = runMonteCarlo({ ...DEFAULTS, initialHomePrice: be.homePrice! }, BE_SIMS);
    expect(Math.abs(atRent[year - 1].renterWinPct - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(atPrice[year - 1].renterWinPct - 0.5)).toBeLessThan(0.01);
    // Renting leads at the defaults, so a tie needs a higher rent or a lower price.
    expect(be.monthlyRent!).toBeGreaterThan(DEFAULTS.monthlyRent);
    expect(be.homePrice!).toBeLessThan(DEFAULTS.initialHomePrice);
  });

  test("never points the wrong way near a tie", () => {
    for (const monthlyRent of [4400, 4440, 4460, 4480, 4520]) {
      const input = { ...DEFAULTS, monthlyRent };
      const gap = runMonteCarlo(input, BE_SIMS)[year - 1].medianGap;
      const be = findBreakEven(input, BE_SIMS);
      if (be.monthlyRent == null || gap === 0) continue;
      // Renting ahead → buying needs more rent to tie; buying ahead → less.
      expect(be.monthlyRent > monthlyRent - 10).toBe(gap > 0);
    }
  });

  test("caps the price search at what the down payment can buy", () => {
    expect(maxPriceForDownPayment(5)).toBe(500_000);
    expect(maxPriceForDownPayment(8)).toBeCloseTo(1_250_000, 6);
    // Above 8.33% the formula passes $1.5M, where 20% down is required.
    expect(maxPriceForDownPayment(9)).toBe(1_499_999);
    expect(maxPriceForDownPayment(15)).toBe(1_499_999);
    expect(maxPriceForDownPayment(20)).toBe(Infinity);
    // The uncapped tie here is ~$1.7M, beyond what 9% down can buy.
    const be = findBreakEven({ ...DEFAULTS, downPaymentPercentage: 9, monthlyRent: 8000 }, BE_SIMS);
    expect(be.homePrice == null || be.homePrice < 1_500_000).toBe(true);
  });
});
