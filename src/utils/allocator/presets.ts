import { ALLOCATIONS } from "@/utils/allocations";
import type {
  AllocatorInput,
  PortfolioPresetId,
  Province,
  SalaryCurvePreset,
} from "./types";

export const PROVINCES: { value: Province; label: string }[] = [
  { value: "NB", label: "New Brunswick" },
  { value: "ON", label: "Ontario" },
  { value: "BC", label: "British Columbia" },
];

export const SALARY_CURVE_PRESETS: {
  value: SalaryCurvePreset;
  label: string;
  description: string;
}[] = [
  {
    value: "flat",
    label: "Flat",
    description: "Income stays at its current real-dollar level.",
  },
  {
    value: "steady-climb",
    label: "Steady climb",
    description:
      "Income grows at the entered real growth rate until retirement.",
  },
  {
    value: "early-peak",
    label: "Early peak",
    description: "Income grows for 10 years, then stays flat.",
  },
  {
    value: "aggressive",
    label: "Fast climb",
    description: "Income grows at 1.5x the entered real growth rate.",
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
  salaryCurve: "steady-climb",
  salaryGrowthPct: 2,
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
