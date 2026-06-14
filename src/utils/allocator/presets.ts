import { ALLOCATIONS } from "@/utils/allocations";
import type {
  AllocatorInput,
  PortfolioPresetId,
  Province,
  SalaryCurvePreset,
} from "./types";

export const PROVINCES: { value: Province; label: string }[] = [
  { value: "BC", label: "British Columbia" },
  { value: "ON", label: "Ontario" },
  { value: "NB", label: "New Brunswick" },
];

export const SALARY_CURVE_PRESETS: {
  value: SalaryCurvePreset;
  label: string;
  description: string;
}[] = [
  {
    value: "flat",
    label: "Flat",
    description: "Income keeps pace with inflation.",
  },
  {
    value: "modest",
    label: "Modest career growth",
    description:
      "Income grows 1% yearly for 15 years, reaching about 16% above today's level, then stays flat.",
  },
  {
    value: "strong",
    label: "Strong career growth",
    description:
      "Income grows 2% yearly for 15 years, reaching about 35% above today's level, then stays flat.",
  },
  {
    value: "fast",
    label: "Fast career growth",
    description:
      "Income grows 3% yearly for 15 years, reaching about 56% above today's level, then stays flat.",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Choose a real growth rate and years of growth.",
  },
];

export const PORTFOLIO_PRESETS: {
  id: PortfolioPresetId;
  label: string;
  returnPct: number;
}[] = [
  {
    id: "conservative",
    label: "Conservative (40/60)",
    returnPct: ALLOCATIONS["40/60"].returnPct,
  },
  {
    id: "balanced",
    label: "Balanced (60/40)",
    returnPct: ALLOCATIONS["60/40"].returnPct,
  },
  {
    id: "growth",
    label: "Growth (80/20)",
    returnPct: ALLOCATIONS["80/20"].returnPct,
  },
  {
    id: "aggressive",
    label: "Aggressive (100/0)",
    returnPct: ALLOCATIONS["100/0"].returnPct,
  },
];

export const DEFAULTS: AllocatorInput = {
  currentAge: 35,
  retirementAge: 65,
  province: "ON",
  currentIncome: 100_000,
  salaryCurve: "modest",
  salaryGrowthPct: 1,
  salaryGrowthYears: 15,
  lumpSum: 50_000,
  availableRrspRoom: 50_000,
  availableTfsaRoom: 40_000,
  portfolioPresetId: "growth",
  portfolioReturn: ALLOCATIONS["80/20"].returnPct,
  inflationPct: 2.1,
  distributionYieldPct: 2,
  retirementRateMode: "rate",
  retirementWithdrawalRatePct: 30,
  capitalGainsTaxRatePct: 30,
  retirementIncome: 60_000,
};
