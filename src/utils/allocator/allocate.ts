import { incomeAtAge } from "./salaryCurve";
import { taxOwed } from "./tax";
import { RRSP_CONTRIBUTION } from "./taxConstants";
import type { AllocationResult, AllocatorInput } from "./types";

// Fresh RRSP room the saver earns in a given year. We assume they fill it with
// new contributions deducted at that year's top rate, so a deduction carried
// forward to this year stacks *below* it rather than on top — preventing the
// optimizer from double-counting the same high bracket.
function freshRrspRoom(incomeReal: number): number {
  return Math.min(
    RRSP_CONTRIBUTION.earnedIncomeRate * Math.max(0, incomeReal),
    RRSP_CONTRIBUTION.dollarLimit,
  );
}

export const FINAL_ALLOCATION_PRECISION = 1 as const;
const MIN_INITIAL_GRID = 1_000;
const MAX_GRID_INCREMENTS = 1_000;
const IMPROVEMENT_EPSILON = 1e-7;
const MIN_LOCAL_SEARCH_ITERATIONS = 100;
const LOCAL_SEARCH_ITERATIONS_PER_BUCKET = 12;

export interface AllocationPlan {
  tfsa: number;
  rrspContrib: number;
  claimedDeductionByAge: Map<number, number>;
  nonRegDirect: number;
}

interface NonRegLedger {
  balance: number;
  acb: number;
}

interface Evaluation {
  afterTaxValue: number;
  refundTotal: number;
  refundSchedule: AllocationResult["refundSchedule"];
  retirementDeflator: number;
}

type Bucket =
  | { kind: "tfsa" }
  | { kind: "rrsp"; claimAge: number }
  | { kind: "non-reg" };

function allocationGrid(lumpSum: number): number {
  return Math.max(
    MIN_INITIAL_GRID,
    Math.ceil(lumpSum / MAX_GRID_INCREMENTS / MIN_INITIAL_GRID) *
      MIN_INITIAL_GRID,
  );
}

function refinementGrids(initialGrid: number): number[] {
  const grids = [initialGrid];
  let grid = initialGrid;
  while (grid > FINAL_ALLOCATION_PRECISION) {
    grid = Math.max(FINAL_ALLOCATION_PRECISION, Math.floor(grid / 10));
    if (grid !== grids.at(-1)) grids.push(grid);
  }
  return grids;
}

function growNominal(
  balance: number,
  flowNow: number,
  flowMidYear: number,
  rate: number,
): number {
  return (balance + flowNow) * (1 + rate) + flowMidYear * (1 + rate / 2);
}

function growNonRegistered(
  ledger: NonRegLedger,
  flowNowNominal: number,
  flowMidYearNominal: number,
  nominalReturn: number,
  distributionYield: number,
): number {
  const openingBalance = ledger.balance;
  ledger.acb += flowNowNominal + flowMidYearNominal;
  const priceReturn = nominalReturn - distributionYield;
  const distribution =
    (openingBalance + flowNowNominal) * distributionYield +
    flowMidYearNominal * distributionYield * 0.5;
  ledger.balance =
    (openingBalance + flowNowNominal) * (1 + priceReturn) +
    flowMidYearNominal * (1 + priceReturn * 0.5);
  return distribution;
}

function settleDistributionAndDeduction(
  ledger: NonRegLedger,
  distributionNominal: number,
  incomeReal: number,
  claimedReal: number,
  claimIncomeFloor: number,
  inflationFactor: number,
  province: AllocatorInput["province"],
): number {
  const distributionReal = distributionNominal / inflationFactor;
  // The deduction lowers taxable income first; distributions stack on top of the
  // post-deduction income, matching how CRA orders a deduction and ordinary
  // investment income in the same year.
  const taxableBase = Math.max(0, incomeReal - claimedReal);
  const distributionTaxReal = Math.max(
    0,
    taxOwed(province, taxableBase + distributionReal) -
      taxOwed(province, taxableBase),
  );
  const distributionTaxNominal = distributionTaxReal * inflationFactor;
  const reinvested = Math.max(0, distributionNominal - distributionTaxNominal);
  ledger.balance += reinvested;
  ledger.acb += reinvested;
  // The deduction refund is taken against income reduced by claimIncomeFloor
  // (the fresh RRSP room already used in future years), so a carried-forward
  // deduction cannot reclaim a high bracket that fresh contributions occupy.
  const refundReal = Math.max(
    0,
    taxOwed(province, claimIncomeFloor) -
      taxOwed(province, Math.max(0, claimIncomeFloor - claimedReal)),
  );
  return refundReal;
}

function withdrawalRate(input: AllocatorInput): number {
  if (input.retirementRateMode === "rate") {
    return input.retirementWithdrawalRatePct / 100;
  }
  return input.retirementIncome > 0
    ? taxOwed(input.province, input.retirementIncome) / input.retirementIncome
    : 0;
}

function evaluatePlan(input: AllocatorInput, plan: AllocationPlan): Evaluation {
  const inflation = input.inflationPct / 100;
  const nominalReturn = input.portfolioReturn / 100;
  const distributionYield = input.distributionYieldPct / 100;
  const pendingRefundsNominal = new Map<number, number>();
  const nonReg: NonRegLedger = { balance: 0, acb: 0 };
  let rrsp = 0;
  let tfsa = 0;
  let tfsaRoomNominal = Math.max(0, input.availableTfsaRoom - plan.tfsa);
  let refundTotal = 0;
  const refundSchedule: AllocationResult["refundSchedule"] = [];

  for (let age = input.currentAge; age < input.retirementAge; age++) {
    const years = age - input.currentAge;
    const inflationFactor = (1 + inflation) ** years;
    const incomeReal = incomeAtAge(
      age,
      input.currentAge,
      input.salaryCurve,
      input.currentIncome,
      input.salaryGrowthPct,
    );
    const arrivingRefundNominal = pendingRefundsNominal.get(age) ?? 0;
    const refundToTfsaNominal = Math.min(
      arrivingRefundNominal,
      tfsaRoomNominal,
    );
    const refundToNonRegNominal = arrivingRefundNominal - refundToTfsaNominal;
    tfsaRoomNominal -= refundToTfsaNominal;

    rrsp = growNominal(
      rrsp,
      age === input.currentAge ? plan.rrspContrib : 0,
      0,
      nominalReturn,
    );
    tfsa = growNominal(
      tfsa,
      age === input.currentAge ? plan.tfsa : 0,
      refundToTfsaNominal,
      nominalReturn,
    );
    const distribution = growNonRegistered(
      nonReg,
      age === input.currentAge ? plan.nonRegDirect : 0,
      refundToNonRegNominal,
      nominalReturn,
      distributionYield,
    );

    const claimedNominal = plan.claimedDeductionByAge.get(age) ?? 0;
    const claimedReal = claimedNominal / inflationFactor;
    // Deduct-now (current year) is this lump's actual decision and stacks at the
    // top of current income. A deferred claim stacks below the fresh RRSP room
    // the saver is assumed to fill that future year. That year's room derives
    // from the prior year's earned income (CRA's 18%-of-prior-year rule).
    const priorIncomeReal = incomeAtAge(
      age - 1,
      input.currentAge,
      input.salaryCurve,
      input.currentIncome,
      input.salaryGrowthPct,
    );
    const claimIncomeFloor =
      age === input.currentAge
        ? incomeReal
        : Math.max(0, incomeReal - freshRrspRoom(priorIncomeReal));
    if (claimedReal > 0 || distribution > 0) {
      const refund = settleDistributionAndDeduction(
        nonReg,
        distribution,
        incomeReal,
        claimedReal,
        claimIncomeFloor,
        inflationFactor,
        input.province,
      );
      refundTotal += refund;
      if (refund > 0) {
        const amountNominal = refund * inflationFactor;
        pendingRefundsNominal.set(age + 1, amountNominal);
        refundSchedule.push({
          claimAge: age,
          arrivalAge: age + 1,
          amountNominal,
          amountToday: refund,
        });
      }
    }
  }

  const retirementYears = input.retirementAge - input.currentAge;
  const retirementDeflator = (1 + inflation) ** retirementYears;
  const finalRefundNominal =
    pendingRefundsNominal.get(input.retirementAge) ?? 0;
  const finalRefundToTfsaNominal = Math.min(
    finalRefundNominal,
    tfsaRoomNominal,
  );
  const finalRefundToNonRegNominal =
    finalRefundNominal - finalRefundToTfsaNominal;
  tfsa += finalRefundToTfsaNominal;
  nonReg.balance += finalRefundToNonRegNominal;
  nonReg.acb += finalRefundToNonRegNominal;

  const nonRegBalance = nonReg.balance / retirementDeflator;
  const nonRegAcb = nonReg.acb / retirementDeflator;
  const rrspBalance = rrsp / retirementDeflator;
  const tfsaBalance = tfsa / retirementDeflator;
  const rateAtWithdrawal = withdrawalRate(input);
  const nonRegTax =
    Math.max(0, nonRegBalance - nonRegAcb) *
    0.5 *
    (input.capitalGainsTaxRatePct / 100);
  return {
    afterTaxValue:
      rrspBalance * (1 - rateAtWithdrawal) +
      tfsaBalance +
      nonRegBalance -
      nonRegTax,
    refundTotal,
    refundSchedule,
    retirementDeflator,
  };
}

export function combinedAfterTaxValue(
  input: AllocatorInput,
  plan: AllocationPlan,
): number {
  return evaluatePlan(input, plan).afterTaxValue;
}

function emptyPlan(): AllocationPlan {
  return {
    tfsa: 0,
    rrspContrib: 0,
    claimedDeductionByAge: new Map(),
    nonRegDirect: 0,
  };
}

function clonePlan(plan: AllocationPlan): AllocationPlan {
  return {
    ...plan,
    claimedDeductionByAge: new Map(plan.claimedDeductionByAge),
  };
}

function buckets(input: AllocatorInput): Bucket[] {
  const result: Bucket[] = [{ kind: "tfsa" }];
  for (let age = input.currentAge; age < input.retirementAge; age++) {
    result.push({ kind: "rrsp", claimAge: age });
  }
  result.push({ kind: "non-reg" });
  return result;
}

function bucketAmount(plan: AllocationPlan, bucket: Bucket): number {
  if (bucket.kind === "tfsa") return plan.tfsa;
  if (bucket.kind === "non-reg") return plan.nonRegDirect;
  if (bucket.kind === "rrsp") {
    return plan.claimedDeductionByAge.get(bucket.claimAge) ?? 0;
  }
  return 0;
}

function addToBucket(
  input: AllocatorInput,
  plan: AllocationPlan,
  bucket: Bucket,
  amount: number,
): AllocationPlan | null {
  const next = clonePlan(plan);
  if (bucket.kind === "tfsa") {
    const accepted = Math.min(
      amount,
      Math.max(0, input.availableTfsaRoom - next.tfsa),
    );
    next.tfsa += accepted;
    next.nonRegDirect += amount - accepted;
  } else if (bucket.kind === "non-reg") {
    next.nonRegDirect += amount;
  } else {
    const accepted = Math.min(
      amount,
      Math.max(0, input.availableRrspRoom - next.rrspContrib),
    );
    next.rrspContrib += accepted;
    next.nonRegDirect += amount - accepted;
    next.claimedDeductionByAge.set(
      bucket.claimAge,
      (next.claimedDeductionByAge.get(bucket.claimAge) ?? 0) + accepted,
    );
  }
  return next;
}

function removeFromBucket(
  plan: AllocationPlan,
  bucket: Bucket,
  amount: number,
): AllocationPlan {
  const next = clonePlan(plan);
  if (bucket.kind === "tfsa") {
    next.tfsa -= amount;
  } else if (bucket.kind === "non-reg") {
    next.nonRegDirect -= amount;
  } else {
    next.rrspContrib -= amount;
    const remaining =
      (next.claimedDeductionByAge.get(bucket.claimAge) ?? 0) - amount;
    if (remaining > IMPROVEMENT_EPSILON) {
      next.claimedDeductionByAge.set(bucket.claimAge, remaining);
    } else {
      next.claimedDeductionByAge.delete(bucket.claimAge);
    }
  }
  return next;
}

function bestAddition(
  input: AllocatorInput,
  plan: AllocationPlan,
  amount: number,
): AllocationPlan {
  const currentValue = combinedAfterTaxValue(input, plan);
  let bestPlan: AllocationPlan | null = null;
  let bestDelta = Number.NEGATIVE_INFINITY;
  for (const bucket of buckets(input)) {
    const candidate = addToBucket(input, plan, bucket, amount);
    if (!candidate) continue;
    const delta = combinedAfterTaxValue(input, candidate) - currentValue;
    if (delta > bestDelta + IMPROVEMENT_EPSILON) {
      bestPlan = candidate;
      bestDelta = delta;
    }
  }
  return bestPlan!;
}

function improveByExchange(
  input: AllocatorInput,
  initialPlan: AllocationPlan,
  grid: number,
): AllocationPlan {
  const allBuckets = buckets(input);
  const maxIterations = Math.max(
    MIN_LOCAL_SEARCH_ITERATIONS,
    allBuckets.length * LOCAL_SEARCH_ITERATIONS_PER_BUCKET,
  );
  let plan = initialPlan;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const currentValue = combinedAfterTaxValue(input, plan);
    let bestPlan: AllocationPlan | null = null;
    let bestValue = currentValue;
    for (const source of allBuckets) {
      if (bucketAmount(plan, source) + IMPROVEMENT_EPSILON < grid) {
        continue;
      }
      const withoutSource = removeFromBucket(plan, source, grid);
      for (const destination of allBuckets) {
        if (destination === source) continue;
        const candidate = addToBucket(input, withoutSource, destination, grid);
        if (!candidate) continue;
        const value = combinedAfterTaxValue(input, candidate);
        if (value > bestValue + IMPROVEMENT_EPSILON) {
          bestPlan = candidate;
          bestValue = value;
        }
      }
    }
    if (!bestPlan) break;
    plan = bestPlan;
  }
  return plan;
}

export function allocateLumpSum(
  input: AllocatorInput,
  lumpSum: number,
): AllocationResult {
  const safeLumpSum = Math.max(0, lumpSum);
  const initialGrid = allocationGrid(safeLumpSum);
  const fullIncrements = Math.floor(safeLumpSum / initialGrid);
  const remainder = safeLumpSum - fullIncrements * initialGrid;
  let plan = emptyPlan();

  for (let i = 0; i < fullIncrements; i++) {
    plan = bestAddition(input, plan, initialGrid);
  }
  if (remainder > IMPROVEMENT_EPSILON) {
    plan = bestAddition(input, plan, remainder);
  }
  for (const grid of refinementGrids(initialGrid)) {
    plan = improveByExchange(input, plan, grid);
  }
  const allDeductNow = clonePlan(plan);
  allDeductNow.claimedDeductionByAge.clear();
  if (plan.rrspContrib > 0) {
    allDeductNow.claimedDeductionByAge.set(input.currentAge, plan.rrspContrib);
  }
  const deferredValue = combinedAfterTaxValue(input, plan);
  const allNowValue = combinedAfterTaxValue(input, allDeductNow);
  if (allNowValue > deferredValue + IMPROVEMENT_EPSILON) {
    plan = allDeductNow;
  }
  const evaluation = evaluatePlan(input, plan);
  const rrspDeductNow = plan.claimedDeductionByAge.get(input.currentAge) ?? 0;
  const rrspCarryForward = [...plan.claimedDeductionByAge.entries()]
    .filter(([age, amount]) => age > input.currentAge && amount > 0)
    .sort(([a], [b]) => a - b)
    .map(([age, amount]) => ({ age, amount }));
  const allDeductNowForComparison = clonePlan(plan);
  allDeductNowForComparison.claimedDeductionByAge.clear();
  if (plan.rrspContrib > 0) {
    allDeductNowForComparison.claimedDeductionByAge.set(
      input.currentAge,
      plan.rrspContrib,
    );
  }
  const carryForwardBenefit =
    rrspCarryForward.length > 0
      ? evaluation.afterTaxValue -
        combinedAfterTaxValue(input, allDeductNowForComparison)
      : 0;
  const deflator = evaluation.retirementDeflator;
  // refundTotal is the sum of refunds in today's dollars; express the aggregate
  // at a single retirement vintage rather than summing different-year nominals.
  const refundTotalNominal = evaluation.refundTotal * deflator;
  return {
    tfsa: plan.tfsa,
    rrspDeductNow,
    rrspCarryForward,
    nonReg: plan.nonRegDirect,
    projectedAfterTaxTotal: evaluation.afterTaxValue,
    projectedAfterTaxTotalNominal: evaluation.afterTaxValue * deflator,
    refundTotal: evaluation.refundTotal,
    refundTotalNominal,
    refundSchedule: evaluation.refundSchedule,
    carryForwardBenefit,
    carryForwardBenefitNominal: carryForwardBenefit * deflator,
    precision: FINAL_ALLOCATION_PRECISION,
  };
}
