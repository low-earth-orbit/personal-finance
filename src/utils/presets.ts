import type { Preset, UserInput, UserInputKey } from "../types";

export const INPUT_UNCERTAINTIES = {
  homePriceGrowthSigma: 2.0,
  investmentReturnSigma: 2.0,
  rentIncreaseSigma: 1,
  ownerCostGrowthSigma: 1,
  mortgageRateSigma: 1.5,
  dividendYieldSigma: 0.3,
};

export const DEFAULTS = {
  monthlyRent: 3500,
  initialHomePrice: 1000000,
  rentIncreaseRate: 2,
  ownerCostGrowthRate: 2.5,
  homePriceGrowthRate: 3,
  buyerClosingCostsPct: 2,
  sellerClosingCostsPct: 5.5,
  propertyTaxRate: 1,
  maintPct: 1.5,
  condoFeesPerMonth: 0,
  downPaymentPercentage: 20,
  annualMortgageInterestRate: 4.5,
  amortization: 25,
  holdingPeriod: 12,
  investmentReturnRate: 6.3,
  dividendYield: 2.4,
  dividendTaxRate: 22.5,
  capitalGainTaxRate: 15.6,
  ...INPUT_UNCERTAINTIES,
};

export const PRESETS: Preset[] = [
  { id: "defaults", label: "Base Case", values: DEFAULTS },
  {
    id: "bay-street",
    label: "Bay Street",
    values: {
      ...DEFAULTS,
      monthlyRent: 2700,
      initialHomePrice: 798000,
      maintPct: 0.5,
      condoFeesPerMonth: 600,
      propertyTaxRate: 0.49,
      buyerClosingCostsPct: 2.5,
      sellerClosingCostsPct: 6,
    },
  },
  {
    id: "vancouver",
    label: "Vancouver",
    values: {
      ...DEFAULTS,
      monthlyRent: 4500,
      initialHomePrice: 1299900,
      maintPct: 0.8,
      condoFeesPerMonth: 656,
      propertyTaxRate: 0.3,
      buyerClosingCostsPct: 1.5,
      sellerClosingCostsPct: 3,
    },
  },
  {
    id: "calgary",
    label: "Calgary",
    values: {
      ...DEFAULTS,
      monthlyRent: 2800,
      initialHomePrice: 714800,
      maintPct: 1.5,
      propertyTaxRate: 0.6,
      buyerClosingCostsPct: 0.8,
      sellerClosingCostsPct: 4.5,
    },
  },
  {
    id: "fred",
    label: "Fredericton",
    values: {
      ...DEFAULTS,
      monthlyRent: 1800,
      initialHomePrice: 320000,
      maintPct: 0.8,
      condoFeesPerMonth: 420,
      propertyTaxRate: 1.3,
      buyerClosingCostsPct: 1.8,
      sellerClosingCostsPct: 6,
    },
  },
];

export function getActivePreset(
  userInput: UserInput,
  allPresets: Preset[],
): Preset | null {
  return (
    allPresets.find((p) =>
      (Object.keys(p.values) as UserInputKey[]).every(
        (k) => p.values[k] === userInput[k],
      ),
    ) ?? null
  );
}
