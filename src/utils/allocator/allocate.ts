import { incomeAtAge } from "./salaryCurve";
import { taxOwed } from "./tax";
import type { AllocationResult, AllocatorInput } from "./types";

export const ALLOCATION_GRID = 1_000 as const;
const IMPROVEMENT_EPSILON = 1e-7;
const MAX_LOCAL_SEARCH_ITERATIONS = 100;

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
}

type Bucket =
  | { kind: "tfsa" }
  | { kind: "rrsp-deduct-now" }
  | { kind: "rrsp-carry-forward" }
  | { kind: "non-reg" };

function realReturn(nominalPct: number, inflationPct: number): number {
  return (1 + nominalPct / 100) / (1 + inflationPct / 100) - 1;
}

function growReal(balance: number, flow: number, rate: number): number {
  return balance * (1 + rate) + flow * (1 + rate / 2);
}

function growNonRegistered(
  ledger: NonRegLedger,
  flowNominal: number,
  incomeReal: number,
  inflationFactor: number,
  nominalReturn: number,
  distributionYield: number,
  province: AllocatorInput["province"],
): void {
  ledger.balance += flowNominal;
  ledger.acb += flowNominal;
  const distribution = ledger.balance * distributionYield;
  const distributionReal = distribution / inflationFactor;
  const distributionTax =
    (taxOwed(province, incomeReal + distributionReal) -
      taxOwed(province, incomeReal)) *
    inflationFactor;
  const reinvested = Math.max(0, distribution - distributionTax);
  ledger.acb += reinvested;
  ledger.balance =
    ledger.balance * (1 + nominalReturn - distributionYield) + reinvested;
}

function withdrawalRate(input: AllocatorInput): number {
  return input.retirementRateMode === "income" && input.retirementIncome > 0
    ? taxOwed(input.province, input.retirementIncome) / input.retirementIncome
    : input.retirementWithdrawalRatePct / 100;
}

function evaluatePlan(input: AllocatorInput, plan: AllocationPlan): Evaluation {
  const inflation = input.inflationPct / 100;
  const nominalReturn = input.portfolioReturn / 100;
  const distributionYield = input.distributionYieldPct / 100;
  const rate = realReturn(input.portfolioReturn, input.inflationPct);
  const pendingRefunds = new Map<number, number>();
  const nonReg: NonRegLedger = { balance: 0, acb: 0 };
  let rrsp = 0;
  let tfsa = 0;
  let tfsaRoom = Math.max(0, input.availableTfsaRoom - plan.tfsa);
  let refundTotal = 0;

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
    const arrivingRefund = pendingRefunds.get(age) ?? 0;
    const refundToTfsa = Math.min(arrivingRefund, tfsaRoom);
    const refundToNonReg = arrivingRefund - refundToTfsa;
    tfsaRoom -= refundToTfsa;

    rrsp = growReal(
      rrsp,
      age === input.currentAge ? plan.rrspContrib : 0,
      rate,
    );
    tfsa = growReal(
      tfsa,
      (age === input.currentAge ? plan.tfsa : 0) + refundToTfsa,
      rate,
    );
    growNonRegistered(
      nonReg,
      ((age === input.currentAge ? plan.nonRegDirect : 0) + refundToNonReg) *
        inflationFactor,
      incomeReal,
      inflationFactor,
      nominalReturn,
      distributionYield,
      input.province,
    );

    const claimed = plan.claimedDeductionByAge.get(age) ?? 0;
    if (claimed > 0) {
      const refund =
        taxOwed(input.province, incomeReal) -
        taxOwed(input.province, Math.max(0, incomeReal - claimed));
      refundTotal += refund;
      pendingRefunds.set(age + 1, refund);
    }
  }

  const retirementYears = input.retirementAge - input.currentAge;
  const retirementDeflator = (1 + inflation) ** retirementYears;
  const finalRefund = pendingRefunds.get(input.retirementAge) ?? 0;
  const finalRefundToTfsa = Math.min(finalRefund, tfsaRoom);
  const finalRefundToNonReg = finalRefund - finalRefundToTfsa;
  tfsa += finalRefundToTfsa;
  nonReg.balance += finalRefundToNonReg * retirementDeflator;
  nonReg.acb += finalRefundToNonReg * retirementDeflator;

  const nonRegBalance = nonReg.balance / retirementDeflator;
  const nonRegAcb = nonReg.acb / retirementDeflator;
  const rateAtWithdrawal = withdrawalRate(input);
  const nonRegTax =
    Math.max(0, nonRegBalance - nonRegAcb) * 0.5 * rateAtWithdrawal;
  return {
    afterTaxValue:
      rrsp * (1 - rateAtWithdrawal) + tfsa + nonRegBalance - nonRegTax,
    refundTotal,
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

function buckets(): Bucket[] {
  return [
    { kind: "tfsa" },
    { kind: "rrsp-deduct-now" },
    { kind: "rrsp-carry-forward" },
    { kind: "non-reg" },
  ];
}

function carryForwardEntry(
  input: AllocatorInput,
  plan: AllocationPlan,
): [number, number] | null {
  return (
    [...plan.claimedDeductionByAge.entries()].find(
      ([age, amount]) => age > input.currentAge && amount > IMPROVEMENT_EPSILON,
    ) ?? null
  );
}

function optimizeCarryForwardAge(
  input: AllocatorInput,
  plan: AllocationPlan,
): AllocationPlan {
  const carryAmount = [...plan.claimedDeductionByAge.entries()]
    .filter(([age]) => age > input.currentAge)
    .reduce((sum, [, amount]) => sum + amount, 0);
  const base = clonePlan(plan);
  for (const age of base.claimedDeductionByAge.keys()) {
    if (age > input.currentAge) base.claimedDeductionByAge.delete(age);
  }
  if (carryAmount <= IMPROVEMENT_EPSILON) return base;

  let bestPlan: AllocationPlan | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let age = input.currentAge + 1; age < input.retirementAge; age++) {
    const candidate = clonePlan(base);
    candidate.claimedDeductionByAge.set(age, carryAmount);
    const value = combinedAfterTaxValue(input, candidate);
    if (value > bestValue + IMPROVEMENT_EPSILON) {
      bestPlan = candidate;
      bestValue = value;
    }
  }
  return bestPlan ?? base;
}

function bucketAmount(
  input: AllocatorInput,
  plan: AllocationPlan,
  bucket: Bucket,
): number {
  if (bucket.kind === "tfsa") return plan.tfsa;
  if (bucket.kind === "non-reg") return plan.nonRegDirect;
  if (bucket.kind === "rrsp-deduct-now") {
    return plan.claimedDeductionByAge.get(input.currentAge) ?? 0;
  }
  return carryForwardEntry(input, plan)?.[1] ?? 0;
}

function addToBucket(
  input: AllocatorInput,
  plan: AllocationPlan,
  bucket: Bucket,
  amount: number,
): AllocationPlan | null {
  if (
    bucket.kind === "rrsp-carry-forward" &&
    input.currentAge + 1 >= input.retirementAge
  ) {
    return null;
  }
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
    const claimAge =
      bucket.kind === "rrsp-deduct-now"
        ? input.currentAge
        : (carryForwardEntry(input, next)?.[0] ?? input.currentAge + 1);
    next.claimedDeductionByAge.set(
      claimAge,
      (next.claimedDeductionByAge.get(claimAge) ?? 0) + accepted,
    );
  }
  return optimizeCarryForwardAge(input, next);
}

function removeFromBucket(
  input: AllocatorInput,
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
    const claimAge =
      bucket.kind === "rrsp-deduct-now"
        ? input.currentAge
        : carryForwardEntry(input, next)?.[0];
    if (claimAge === undefined) return next;
    const remaining = (next.claimedDeductionByAge.get(claimAge) ?? 0) - amount;
    if (remaining > IMPROVEMENT_EPSILON) {
      next.claimedDeductionByAge.set(claimAge, remaining);
    } else {
      next.claimedDeductionByAge.delete(claimAge);
    }
  }
  return optimizeCarryForwardAge(input, next);
}

function bestAddition(
  input: AllocatorInput,
  plan: AllocationPlan,
  amount: number,
): AllocationPlan {
  const currentValue = combinedAfterTaxValue(input, plan);
  let bestPlan: AllocationPlan | null = null;
  let bestDelta = Number.NEGATIVE_INFINITY;
  for (const bucket of buckets()) {
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
): AllocationPlan {
  const allBuckets = buckets();
  let plan = initialPlan;
  for (
    let iteration = 0;
    iteration < MAX_LOCAL_SEARCH_ITERATIONS;
    iteration++
  ) {
    const currentValue = combinedAfterTaxValue(input, plan);
    let bestPlan: AllocationPlan | null = null;
    let bestValue = currentValue;
    for (const source of allBuckets) {
      if (
        bucketAmount(input, plan, source) + IMPROVEMENT_EPSILON <
        ALLOCATION_GRID
      ) {
        continue;
      }
      const withoutSource = removeFromBucket(
        input,
        plan,
        source,
        ALLOCATION_GRID,
      );
      for (const destination of allBuckets) {
        const candidate = addToBucket(
          input,
          withoutSource,
          destination,
          ALLOCATION_GRID,
        );
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

export function allocationSimplificationEpsilon(afterTaxValue: number): number {
  return Math.max(afterTaxValue * 0.005, 500, ALLOCATION_GRID);
}

function preferSimpleRrspTreatment(
  input: AllocatorInput,
  plan: AllocationPlan,
): AllocationPlan {
  const carry = carryForwardEntry(input, plan);
  if (!carry) return plan;

  const allDeductNow = clonePlan(plan);
  allDeductNow.claimedDeductionByAge.delete(carry[0]);
  allDeductNow.claimedDeductionByAge.set(
    input.currentAge,
    (allDeductNow.claimedDeductionByAge.get(input.currentAge) ?? 0) + carry[1],
  );
  const bestValue = combinedAfterTaxValue(input, plan);
  const simpleValue = combinedAfterTaxValue(input, allDeductNow);
  return bestValue - simpleValue < allocationSimplificationEpsilon(bestValue)
    ? allDeductNow
    : plan;
}

export function allocateLumpSum(
  input: AllocatorInput,
  lumpSum: number,
): AllocationResult {
  const safeLumpSum = Math.max(0, lumpSum);
  const fullIncrements = Math.floor(safeLumpSum / ALLOCATION_GRID);
  const remainder = safeLumpSum - fullIncrements * ALLOCATION_GRID;
  let plan = emptyPlan();

  for (let i = 0; i < fullIncrements; i++) {
    plan = bestAddition(input, plan, ALLOCATION_GRID);
  }
  plan = improveByExchange(input, plan);
  if (remainder > IMPROVEMENT_EPSILON) {
    plan = bestAddition(input, plan, remainder);
  }
  plan = preferSimpleRrspTreatment(input, plan);

  const evaluation = evaluatePlan(input, plan);
  const rrspDeductNow = plan.claimedDeductionByAge.get(input.currentAge) ?? 0;
  const carryForward = carryForwardEntry(input, plan);
  const rrspCarryForward = carryForward
    ? { age: carryForward[0], amount: carryForward[1] }
    : null;
  return {
    tfsa: plan.tfsa,
    rrspDeductNow,
    rrspCarryForward,
    nonReg: plan.nonRegDirect,
    projectedAfterTaxTotal: evaluation.afterTaxValue,
    refundTotal: evaluation.refundTotal,
    grid: ALLOCATION_GRID,
  };
}
