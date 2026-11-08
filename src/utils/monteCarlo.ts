import {
  calculateMonthlyMortgageInterestRate,
  calculateMonthlyMortgagePayment,
  calculateOpeningMortgageBalance,
  INSURED_PRICE_CAP,
} from "./math";
import { mulberry32, standardNormal } from "./rng";
import type { BreakEven, MonteCarloYear, UserInput } from "../types";

// Fixed seed: identical inputs give identical results (no jitter between renders), and every
// run consumes the same random stream, so nudging one input moves the answer smoothly.
const SEED = 0x2545f491;

type Normal = () => number;

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
}

const MORTGAGE_TERM_YEARS = 5;
export const SIMULATION_HORIZON_YEARS = 50;

// Annual return volatility derived from the expected return: a higher expected
// return implies more equity exposure, which implies more year-to-year risk.
// Modelled as a exponential function.
export function investmentAnnualVolPct(nominalReturnPct: number): number {
  return 1.92 * Math.exp(0.271 * nominalReturnPct);
}

// Realized year-to-year volatility of each asset class — empirical properties
// of the world, not user beliefs. User-facing sigmas in presets.js capture
// uncertainty about the long-run mean; these capture noise around that mean.
const ANNUAL_VOL = {
  inflation: 1.0, // hidden common factor σ (couples housing/rent/cost/rate)
  homePriceIdio: 6.0, // idiosyncratic real housing σ
};

// Loadings of the hidden inflation factor on observable variables.
// In a high-inflation year, home prices, rents, owner costs, and mortgage
// rates all rise together — this captures that joint risk.
const INFLATION_BETA = {
  homePrice: 0.8,
  rent: 0.8,
  ownerCost: 0.8,
  mortgageRate: 0.5,
};

interface Scenario {
  homePriceGrowthMean: number;
  investmentReturnMean: number;
  rentIncreaseMean: number;
  ownerCostGrowthMean: number;
  mortgageRateMean: number;
  maintenanceMean: number;
  propertyTaxMean: number;
  dividendYieldMean: number;
}

interface AnnualRates {
  homePriceGrowth: number;
  investmentReturn: number;
  rentIncrease: number;
  ownerCostGrowth: number;
  dividendYield: number;
}

interface ScenarioPath {
  annual: AnnualRates[];
  mortgageRates: number[];
}

interface PathYear {
  year: number;
  renterNetWorth: number;
  ownerNetWorth: number;
}

function drawScenario(userInput: UserInput, normalRandom: Normal): Scenario {
  return {
    homePriceGrowthMean:
      userInput.homePriceGrowthRate + normalRandom() * userInput.homePriceGrowthSigma,
    investmentReturnMean:
      userInput.investmentReturnRate + normalRandom() * userInput.investmentReturnSigma,
    rentIncreaseMean: userInput.rentIncreaseRate + normalRandom() * userInput.rentIncreaseSigma,
    ownerCostGrowthMean:
      (userInput.ownerCostGrowthRate ?? 2.5) +
      normalRandom() * (userInput.ownerCostGrowthSigma ?? 0.75),
    mortgageRateMean:
      userInput.annualMortgageInterestRate + normalRandom() * userInput.mortgageRateSigma,
    maintenanceMean: Math.max(0, userInput.maintPct),
    propertyTaxMean: Math.max(0, userInput.propertyTaxRate),
    dividendYieldMean: Math.max(
      0,
      userInput.dividendYield + normalRandom() * userInput.dividendYieldSigma,
    ),
  };
}

// Year-by-year rate realizations and the mortgage rate path for one scenario.
function drawPath(scenario: Scenario, horizon: number, normalRandom: Normal): ScenarioPath {
  const annual: AnnualRates[] = [];
  const inflationShocks: number[] = [];

  for (let y = 0; y < horizon; y++) {
    const inflShock = normalRandom() * ANNUAL_VOL.inflation;
    inflationShocks.push(inflShock);

    const homePriceGrowth =
      scenario.homePriceGrowthMean +
      INFLATION_BETA.homePrice * inflShock +
      normalRandom() * ANNUAL_VOL.homePriceIdio;

    // Lognormal draw preserves the scenario compound (geometric) mean; the annual
    // shock is iid (drawn fresh each year, no serial correlation).
    const investmentSigma = investmentAnnualVolPct(scenario.investmentReturnMean) / 100;
    const logMean = Math.log(1 + scenario.investmentReturnMean / 100);

    const investmentReturn = (Math.exp(logMean + normalRandom() * investmentSigma) - 1) * 100;

    const rentIncrease = scenario.rentIncreaseMean + INFLATION_BETA.rent * inflShock;
    const ownerCostGrowth = scenario.ownerCostGrowthMean + INFLATION_BETA.ownerCost * inflShock;
    const dividendYield = Math.max(
      0,
      Math.min(scenario.dividendYieldMean, Math.max(scenario.investmentReturnMean, 0)),
    );

    annual.push({
      homePriceGrowth,
      investmentReturn,
      rentIncrease,
      ownerCostGrowth,
      dividendYield,
    });
  }

  // Mortgage rate: at each 5-year renewal, snaps to scenario mean plus that
  // year's inflation pressure. Couples renewal cost to the inflation regime.
  const mortgageRates: number[] = [];
  let currentRate = scenario.mortgageRateMean + INFLATION_BETA.mortgageRate * inflationShocks[0];
  for (let y = 0; y < horizon; y++) {
    if (y > 0 && y % MORTGAGE_TERM_YEARS === 0) {
      currentRate = scenario.mortgageRateMean + INFLATION_BETA.mortgageRate * inflationShocks[y];
    }
    mortgageRates.push(Math.max(0, currentRate));
  }

  return { annual, mortgageRates };
}

/**
 * An investment portfolio split into a tax-sheltered sleeve (TFSA-like: no tax on yield or
 * gains) and a taxable sleeve (yield taxed yearly, gains taxed at sale on value − book).
 * Contributions are split by the sheltered share; there are no withdrawals.
 */
interface Portfolio {
  sheltered: number;
  taxable: number;
  book: number;
}

function newPortfolio(amount: number, shelteredFrac: number): Portfolio {
  const taxable = amount * (1 - shelteredFrac);
  return { sheltered: amount * shelteredFrac, taxable, book: taxable };
}

/** One year of growth plus a mid-year contribution (half-year of return). */
function stepPortfolio(
  p: Portfolio,
  r: number,
  dividendYieldPct: number,
  dividendTaxFrac: number,
  contribution: number,
  shelteredFrac: number,
): void {
  const grossDividends = (p.taxable * dividendYieldPct) / 100;
  const midYear = 1 + r / 2;
  p.sheltered = p.sheltered * (1 + r) + contribution * shelteredFrac * midYear;
  p.taxable =
    p.taxable * (1 + r) -
    grossDividends * dividendTaxFrac +
    contribution * (1 - shelteredFrac) * midYear;
  p.book += contribution * (1 - shelteredFrac) + grossDividends * (1 - dividendTaxFrac);
}

/** Value if sold now, after capital-gains tax on the taxable sleeve. */
function afterTaxValue(p: Portfolio, capGainTaxFrac: number): number {
  const taxableGain = p.taxable - Math.max(p.book, 0);
  return p.sheltered + p.taxable - (taxableGain > 0 ? taxableGain * capGainTaxFrac : 0);
}

// Walk one year-by-year wealth path for owner and renter.
function simulatePath(
  userInput: UserInput,
  annual: AnnualRates[],
  mortgageRates: number[],
  scenario: Scenario,
): PathYear[] {
  const horizon = annual.length;
  const capGainTaxFrac = userInput.capitalGainTaxRate / 100;
  const dividendTaxFrac = userInput.dividendTaxRate / 100;
  const netOfSellingFees = 1 - userInput.sellerClosingCostsPct / 100;
  const shelteredFrac = Math.min(Math.max((userInput.taxShelteredPct ?? 0) / 100, 0), 1);

  // Under 20% down, the default-insurance premium is rolled into the mortgage.
  const initialPrincipal = calculateOpeningMortgageBalance(
    userInput.initialHomePrice,
    userInput.downPaymentPercentage,
    userInput.amortization,
  );
  const initialPortfolio =
    (userInput.initialHomePrice *
      (userInput.downPaymentPercentage + userInput.buyerClosingCostsPct)) /
    100;

  let homePrice = userInput.initialHomePrice;
  let mortgageBalance = initialPrincipal;
  // Whoever has the lower housing cost invests the difference: the renter while owning costs
  // more, the owner once it costs less (e.g. after the mortgage is paid off).
  const renterPortfolio = newPortfolio(initialPortfolio, shelteredFrac);
  const ownerPortfolio = newPortfolio(0, shelteredFrac);
  let annualRent = userInput.monthlyRent * 12;
  // Year-0 anchored operating costs. Each grows with realized owner cost growth,
  // independent of rent growth and home price appreciation. Maintenance and
  // condo fees grow an extra deterministic `maintAgingPct` per year as the
  // building ages (envelope aging lands in fees for apartments).
  let annualPropertyTax = (userInput.initialHomePrice * scenario.propertyTaxMean) / 100;
  let annualMaintenance = (userInput.initialHomePrice * scenario.maintenanceMean) / 100;
  const maintAgingFactor = 1 + (userInput.maintAgingPct ?? 0) / 100;
  let monthlyCondoFees = userInput.condoFeesPerMonth ?? 0;
  let remainingYears = userInput.amortization;
  let currentMortgageRate = mortgageRates[0];
  let monthlyPayment = calculateMonthlyMortgagePayment(
    mortgageBalance,
    currentMortgageRate,
    remainingYears,
  );

  const results: PathYear[] = [];

  for (let y = 1; y <= horizon; y++) {
    const yr = annual[y - 1];

    // Re-amortize remaining balance at each renewal boundary.
    if (y > 1 && (y - 1) % MORTGAGE_TERM_YEARS === 0 && mortgageBalance > 0 && remainingYears > 0) {
      currentMortgageRate = mortgageRates[y - 1];
      monthlyPayment = calculateMonthlyMortgagePayment(
        mortgageBalance,
        currentMortgageRate,
        remainingYears,
      );
    }

    let annualMortgagePayment = 0;
    if (mortgageBalance > 0 && remainingYears > 0) {
      const monthlyRate = calculateMonthlyMortgageInterestRate(currentMortgageRate);
      for (let m = 0; m < 12; m++) {
        if (mortgageBalance <= 0) break;
        const interest = mortgageBalance * monthlyRate;
        let principalPay = monthlyPayment - interest;
        if (principalPay > mortgageBalance) principalPay = mortgageBalance;
        mortgageBalance -= principalPay;
        annualMortgagePayment += interest + principalPay;
      }
      remainingYears -= 1;
      if (mortgageBalance < 0.01) mortgageBalance = 0;
    }

    const ownersCashOutflow =
      annualMortgagePayment + annualPropertyTax + annualMaintenance + monthlyCondoFees * 12;
    const surplus = ownersCashOutflow - annualRent;

    const r = yr.investmentReturn / 100;
    const renterSaves = Math.max(surplus, 0);
    const ownerSaves = Math.max(-surplus, 0);
    stepPortfolio(
      renterPortfolio,
      r,
      yr.dividendYield,
      dividendTaxFrac,
      renterSaves,
      shelteredFrac,
    );
    stepPortfolio(ownerPortfolio, r, yr.dividendYield, dividendTaxFrac, ownerSaves, shelteredFrac);

    homePrice = homePrice * (1 + yr.homePriceGrowth / 100);
    const rentGrowth = 1 + yr.rentIncrease / 100;
    const ownerCostGrowth = 1 + yr.ownerCostGrowth / 100;
    annualRent = annualRent * rentGrowth;
    annualPropertyTax = annualPropertyTax * ownerCostGrowth;
    annualMaintenance = annualMaintenance * ownerCostGrowth * maintAgingFactor;
    monthlyCondoFees = monthlyCondoFees * ownerCostGrowth * maintAgingFactor;

    const renterNetWorth = afterTaxValue(renterPortfolio, capGainTaxFrac);
    const ownerNetWorth =
      homePrice * netOfSellingFees -
      mortgageBalance +
      afterTaxValue(ownerPortfolio, capGainTaxFrac);

    results.push({ year: y, renterNetWorth, ownerNetWorth });
  }

  return results;
}

export function runMonteCarlo(userInput: UserInput, numSimulations: number): MonteCarloYear[] {
  const horizon = SIMULATION_HORIZON_YEARS;
  const renterByYear: number[][] = Array.from({ length: horizon }, () => []);
  const ownerByYear: number[][] = Array.from({ length: horizon }, () => []);
  const gapByYear: number[][] = Array.from({ length: horizon }, () => []);
  const renterWinsByYear: number[] = Array.from({ length: horizon }, () => 0);
  const rand = mulberry32(SEED);
  const normalRandom = () => standardNormal(rand);

  for (let sim = 0; sim < numSimulations; sim++) {
    const scenario = drawScenario(userInput, normalRandom);
    const { annual, mortgageRates } = drawPath(scenario, horizon, normalRandom);
    const path = simulatePath(userInput, annual, mortgageRates, scenario);
    for (let y = 0; y < horizon; y++) {
      renterByYear[y].push(path[y].renterNetWorth);
      ownerByYear[y].push(path[y].ownerNetWorth);
      gapByYear[y].push(path[y].renterNetWorth - path[y].ownerNetWorth);
      if (path[y].renterNetWorth > path[y].ownerNetWorth) {
        renterWinsByYear[y]++;
      }
    }
  }

  return renterByYear.map((renterVals, i) => {
    const ownerVals = ownerByYear[i];
    const gaps = gapByYear[i];
    renterVals.sort((a, b) => a - b);
    ownerVals.sort((a, b) => a - b);
    gaps.sort((a, b) => a - b);
    return {
      year: i + 1,
      renterP25: percentile(renterVals, 0.25),
      renterMedian: percentile(renterVals, 0.5),
      renterP75: percentile(renterVals, 0.75),
      ownerP25: percentile(ownerVals, 0.25),
      ownerMedian: percentile(ownerVals, 0.5),
      ownerP75: percentile(ownerVals, 0.75),
      medianGap: percentile(gaps, 0.5),
      renterWinPct: renterWinsByYear[i] / numSimulations,
    };
  });
}

export function maxPriceForDownPayment(downPct: number): number {
  if (downPct >= 20) return Infinity;
  if (downPct >= 10) return INSURED_PRICE_CAP - 1;
  // Solves 5% × 500k + 10% × (P − 500k) = d × P; above 8.33% that passes the $1.5M cap.
  if (downPct > 5) return Math.min(25_000 / (0.1 - downPct / 100), INSURED_PRICE_CAP - 1);
  return 500_000;
}

/**
 * Solve for the monthly rent and the purchase price at which the median renter − owner gap at
 * the sale year is zero. The market draws don't depend on rent or price, so one set of seeded
 * paths is reused for every bisection step. They are the same paths as
 * `runMonteCarlo(userInput, numSims)` (same seed, full-horizon draws, truncated to the sale
 * year), so the solver's gap at the current inputs equals the headline's median gap and the
 * tie can't point the wrong way.
 */
export function findBreakEven(userInput: UserInput, numSims: number): BreakEven {
  const year = Math.min(Math.max(1, Math.round(userInput.holdingPeriod)), SIMULATION_HORIZON_YEARS);
  const rand = mulberry32(SEED);
  const normalRandom = () => standardNormal(rand);
  const draws = Array.from({ length: numSims }, () => {
    const scenario = drawScenario(userInput, normalRandom);
    const { annual, mortgageRates } = drawPath(scenario, SIMULATION_HORIZON_YEARS, normalRandom);
    return { scenario, annual: annual.slice(0, year), mortgageRates: mortgageRates.slice(0, year) };
  });
  const gaps = new Array<number>(numSims);
  const medianGap = (input: UserInput): number => {
    for (let i = 0; i < numSims; i++) {
      const d = draws[i];
      const last = simulatePath(input, d.annual, d.mortgageRates, d.scenario)[year - 1];
      gaps[i] = last.renterNetWorth - last.ownerNetWorth;
    }
    gaps.sort((a, b) => a - b);
    return percentile(gaps, 0.5);
  };

  const solve = (key: "monthlyRent" | "initialHomePrice", lo: number, hi: number, tol: number) => {
    if (!(hi > lo)) return null;
    const at = (x: number) => medianGap({ ...userInput, [key]: x });
    let fLo = at(lo);
    const fHi = at(hi);
    if (fLo === 0) return lo;
    if (Math.sign(fLo) === Math.sign(fHi)) return null;
    while (hi - lo > tol) {
      const mid = (lo + hi) / 2;
      const fMid = at(mid);
      if (Math.sign(fMid) === Math.sign(fLo)) {
        lo = mid;
        fLo = fMid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  };

  const rent = userInput.monthlyRent;
  const price = userInput.initialHomePrice;
  const monthlyRent = solve("monthlyRent", 1, Math.max(rent * 10, 10_000), 10);
  const homePrice = solve(
    "initialHomePrice",
    10_000,
    Math.min(price * 10, maxPriceForDownPayment(userInput.downPaymentPercentage)),
    1000,
  );
  return {
    year,
    currentRent: rent,
    currentPrice: price,
    monthlyRent: monthlyRent == null ? null : Math.round(monthlyRent / 10) * 10,
    homePrice: homePrice == null ? null : Math.round(homePrice / 1000) * 1000,
  };
}
