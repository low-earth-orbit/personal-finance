import {
  calculateMonthlyMortgageInterestRate,
  calculateMonthlyMortgagePayment,
  calculateMortgagePrincipal,
} from "./math";
import type { MonteCarloYear, UserInput } from "../types";

function normalRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

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

function drawScenario(userInput: UserInput): Scenario {
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
function drawPath(scenario: Scenario, horizon: number): ScenarioPath {
  const annual: AnnualRates[] = [];
  const inflationShocks: number[] = [];

  for (let y = 0; y < horizon; y++) {
    const inflShock = normalRandom() * ANNUAL_VOL.inflation;
    inflationShocks.push(inflShock);

    const homePriceGrowth =
      scenario.homePriceGrowthMean +
      INFLATION_BETA.homePrice * inflShock +
      normalRandom() * ANNUAL_VOL.homePriceIdio;

    // Lognormal draw preserves the scenario arithmetic mean; the annual shock is
    // iid (drawn fresh each year, no serial correlation).
    const muArith = scenario.investmentReturnMean / 100;
    const investmentSigma = investmentAnnualVolPct(scenario.investmentReturnMean) / 100;
    const logMean = Math.log(1 + muArith) - 0.5 * investmentSigma * investmentSigma;

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

  const initialPrincipal = calculateMortgagePrincipal(
    userInput.initialHomePrice,
    userInput.downPaymentPercentage,
  );
  const initialPortfolio =
    (userInput.initialHomePrice *
      (userInput.downPaymentPercentage + userInput.buyerClosingCostsPct)) /
    100;

  let homePrice = userInput.initialHomePrice;
  let mortgageBalance = initialPrincipal;
  let portfolioValue = initialPortfolio;
  let bookValue = initialPortfolio;
  let annualRent = userInput.monthlyRent * 12;
  // Year-0 anchored operating costs. Each grows with realized owner cost growth,
  // independent of rent growth and home price appreciation.
  let annualPropertyTax = (userInput.initialHomePrice * scenario.propertyTaxMean) / 100;
  let annualMaintenance = (userInput.initialHomePrice * scenario.maintenanceMean) / 100;
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
    const grossDividends = (portfolioValue * yr.dividendYield) / 100;
    const afterTaxDividends = grossDividends * (1 - dividendTaxFrac);

    portfolioValue =
      portfolioValue * (1 + r) - grossDividends * dividendTaxFrac + surplus * (1 + r / 2);
    bookValue += surplus + afterTaxDividends;

    homePrice = homePrice * (1 + yr.homePriceGrowth / 100);
    const rentGrowth = 1 + yr.rentIncrease / 100;
    const ownerCostGrowth = Math.max(0, 1 + yr.ownerCostGrowth / 100);
    annualRent = annualRent * rentGrowth;
    annualPropertyTax = annualPropertyTax * ownerCostGrowth;
    annualMaintenance = annualMaintenance * ownerCostGrowth;
    monthlyCondoFees = monthlyCondoFees * ownerCostGrowth;

    const taxableGain = portfolioValue - Math.max(bookValue, 0);
    const renterNetWorth =
      taxableGain > 0 ? portfolioValue - taxableGain * capGainTaxFrac : portfolioValue;
    const ownerNetWorth = homePrice * netOfSellingFees - mortgageBalance;

    results.push({ year: y, renterNetWorth, ownerNetWorth });
  }

  return results;
}

export function runMonteCarlo(userInput: UserInput, numSimulations: number): MonteCarloYear[] {
  const horizon = SIMULATION_HORIZON_YEARS;
  const renterByYear: number[][] = Array.from({ length: horizon }, () => []);
  const ownerByYear: number[][] = Array.from({ length: horizon }, () => []);
  const renterWinsByYear: number[] = Array.from({ length: horizon }, () => 0);

  for (let sim = 0; sim < numSimulations; sim++) {
    const scenario = drawScenario(userInput);
    const { annual, mortgageRates } = drawPath(scenario, horizon);
    const path = simulatePath(userInput, annual, mortgageRates, scenario);
    for (let y = 0; y < horizon; y++) {
      renterByYear[y].push(path[y].renterNetWorth);
      ownerByYear[y].push(path[y].ownerNetWorth);
      if (path[y].renterNetWorth > path[y].ownerNetWorth) {
        renterWinsByYear[y]++;
      }
    }
  }

  return renterByYear.map((renterVals, i) => {
    const ownerVals = ownerByYear[i];
    renterVals.sort((a, b) => a - b);
    ownerVals.sort((a, b) => a - b);
    return {
      year: i + 1,
      renterP25: percentile(renterVals, 0.25),
      renterMedian: percentile(renterVals, 0.5),
      renterP75: percentile(renterVals, 0.75),
      ownerP25: percentile(ownerVals, 0.25),
      ownerMedian: percentile(ownerVals, 0.5),
      ownerP75: percentile(ownerVals, 0.75),
      renterWinPct: renterWinsByYear[i] / numSimulations,
    };
  });
}
