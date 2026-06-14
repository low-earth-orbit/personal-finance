export type Province = "NB" | "ON" | "BC";
export type SalaryCurvePreset =
  | "flat"
  | "steady-climb"
  | "early-peak"
  | "aggressive";
export type RetirementRateMode = "rate" | "income";
export type PortfolioPresetId =
  | "conservative"
  | "balanced"
  | "growth"
  | "aggressive"
  | "custom";

export interface AllocatorInput {
  currentAge: number;
  retirementAge: number;
  province: Province;
  currentIncome: number;
  salaryCurve: SalaryCurvePreset;
  salaryGrowthPct: number;
  lumpSum: number;
  availableRrspRoom: number;
  availableTfsaRoom: number;
  portfolioPresetId: PortfolioPresetId;
  portfolioReturn: number;
  inflationPct: number;
  distributionYieldPct: number;
  retirementRateMode: RetirementRateMode;
  retirementWithdrawalRatePct: number;
  capitalGainsTaxRatePct: number;
  retirementIncome: number;
}

export type AllocatorInputKey = keyof AllocatorInput;
export type AllocatorErrors = Partial<Record<AllocatorInputKey, string>>;

export interface AllocationResult {
  tfsa: number;
  rrspDeductNow: number;
  rrspCarryForward: { age: number; amount: number }[];
  nonReg: number;
  projectedAfterTaxTotal: number;
  refundTotal: number;
  refundSchedule: {
    claimAge: number;
    arrivalAge: number;
    amountNominal: number;
    amountToday: number;
  }[];
  carryForwardBenefit: number;
  precision: number;
}

export interface AllocationRequest {
  input: AllocatorInput;
  requestId: number;
}

export interface AllocationResponse {
  result: AllocationResult;
  requestId: number;
}
