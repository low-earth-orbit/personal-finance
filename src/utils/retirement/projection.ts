import type { IncomeBreakdown, ProjectionPoint, RetirementInput } from "./types";

/**
 * Real (inflation-adjusted) geometric/compound return for a given nominal return.
 * Working in real dollars lets us keep income and benefits constant over time,
 * which makes the projection easy to verify by hand.
 */
export function realMean(nominalPct: number, inflationPct: number): number {
  return (1 + nominalPct / 100) / (1 + inflationPct / 100) - 1;
}

/** Real expected return for the phase the given age falls in. */
export function phaseRealMean(input: RetirementInput, retirementAge: number, age: number): number {
  const nominal = age < retirementAge ? input.accumReturn : input.retireReturn;
  return realMean(nominal, input.inflationRate);
}

/**
 * CPP start-age adjustment (Service Canada): −0.6% per month before 65 (−36% at 60),
 * +0.7% per month after 65 (+42% at 70). Applied to the amount you'd get starting at 65.
 */
export function cppAdjustment(startAge: number): number {
  const months = (startAge - 65) * 12;
  return months < 0 ? 1 + 0.006 * months : 1 + 0.007 * months;
}

/** OAS deferral: +0.6% per month after 65 (+36% at 70). OAS can't start before 65. */
export function oasAdjustment(startAge: number): number {
  return 1 + 0.006 * Math.max(0, (startAge - 65) * 12);
}

/** OAS rises 10% from age 75 (July 2022 increase). */
export const OAS_AGE_75_INCREASE = 0.1;

/** Annual guaranteed income streams (real $/yr) once each has started. */
export function guaranteedStreams(input: RetirementInput): {
  cpp: number;
  oas: number;
  pension: number;
} {
  return {
    cpp: input.cppAt65 * cppAdjustment(input.cppStartAge),
    oas: input.oasAt65 * oasAdjustment(input.oasStartAge),
    pension: (input.currentIncome * input.guaranteedIncomePct) / 100,
  };
}

/** Total guaranteed income (real $/yr) received at a given age. */
export function guaranteedAtAge(input: RetirementInput, age: number): number {
  const { cpp, oas, pension } = guaranteedStreams(input);
  return (
    (age >= input.cppStartAge ? cpp : 0) +
    (age >= input.oasStartAge ? oas * (age >= 75 ? 1 + OAS_AGE_75_INCREASE : 1) : 0) +
    (age >= input.pensionStartAge ? pension : 0)
  );
}

/** Latest age at which a (non-zero) guaranteed stream starts; the 75 OAS bump is excluded. */
export function lastGuaranteedStartAge(input: RetirementInput): number | null {
  const { cpp, oas, pension } = guaranteedStreams(input);
  const ages = [
    cpp > 0 ? input.cppStartAge : null,
    oas > 0 ? input.oasStartAge : null,
    pension > 0 ? input.pensionStartAge : null,
  ].filter((a): a is number => a != null);
  return ages.length > 0 ? Math.max(...ages) : null;
}

/**
 * Target gross income, guaranteed income once every stream has started (before the OAS
 * age-75 increase), and the gap the portfolio then funds. All taxable and in gross terms, so
 * guaranteed income offsets the target dollar-for-dollar and tax is implicit in the target.
 */
export function incomeBreakdown(input: RetirementInput): IncomeBreakdown {
  const targetGrossIncome = (input.currentIncome * input.targetIncomePct) / 100;
  const { cpp, oas, pension } = guaranteedStreams(input);
  const guaranteedIncome = cpp + oas + pension;
  return {
    targetGrossIncome,
    guaranteedIncome,
    portfolioWithdrawal: Math.max(0, targetGrossIncome - guaranteedIncome),
  };
}

/**
 * The portfolio's required gross withdrawal at a given age: the target less whatever
 * guaranteed income has started by then. Before any starts, the portfolio funds the full
 * target (the "bridge").
 */
export function withdrawalAtAge(input: RetirementInput, age: number): number {
  const target = (input.currentIncome * input.targetIncomePct) / 100;
  return Math.max(0, target - guaranteedAtAge(input, age));
}

interface PathResult {
  points: ProjectionPoint[];
  /** Age at which the portfolio first goes negative, or null if it never does. */
  depletionAge: number | null;
}

/**
 * Deterministic year-by-year portfolio path (today's dollars) for a given
 * retirement age, using each phase's real geometric/compound return. Contributions
 * withdrawals happen mid-year, earning a half-year of return — matching the
 * rent-vs-buy convention.
 */
export function projectPath(input: RetirementInput, retirementAge: number): PathResult {
  const contribution = (input.currentIncome * input.contributionPct) / 100;

  let balance = input.currentSavings;
  const points: ProjectionPoint[] = [{ age: input.currentAge, balance }];
  let depletionAge: number | null = null;

  for (let age = input.currentAge; age < input.planningAge; age++) {
    const r = phaseRealMean(input, retirementAge, age);
    const flow =
      age < retirementAge
        ? contribution + guaranteedAtAge(input, age)
        : -withdrawalAtAge(input, age);
    balance = balance * (1 + r) + flow * (1 + r / 2);

    const nextAge = age + 1;
    points.push({ age: nextAge, balance });
    if (balance < 0 && depletionAge === null) depletionAge = nextAge;
  }

  return { points, depletionAge };
}

/**
 * Deterministic accumulation balances (today's dollars) for every age from
 * currentAge to planningAge, contributing each year and growing at the real
 * geometric/compound accumulation return. Pre-retirement growth doesn't depend on when you
 * retire,
 * so this is computed once and indexed by age for any candidate retirement age
 * (the value at age A is the portfolio you'd retire on at age A).
 */
export function accumulationBalances(input: RetirementInput): ProjectionPoint[] {
  const contribution = (input.currentIncome * input.contributionPct) / 100;
  const r = realMean(input.accumReturn, input.inflationRate);

  let balance = input.currentSavings;
  const points: ProjectionPoint[] = [{ age: input.currentAge, balance }];
  for (let age = input.currentAge; age < input.planningAge; age++) {
    // Guaranteed income that starts while still working is saved (added to the portfolio).
    const inflow = contribution + guaranteedAtAge(input, age);
    balance = balance * (1 + r) + inflow * (1 + r / 2);
    points.push({ age: age + 1, balance });
  }
  return points;
}

/** A run of retirement years with the same guaranteed income. */
export interface IncomePhase {
  fromAge: number;
  /** Last age in the phase (inclusive); planningAge − 1 for the final phase. */
  toAge: number;
  guaranteed: number;
  portfolio: number;
}

/**
 * Retirement years from `retireAge` to the plan end, grouped by guaranteed income: e.g. an
 * all-savings bridge, then CPP only, then CPP + OAS, then the OAS increase at 75.
 */
export function incomePhases(input: RetirementInput, retireAge: number): IncomePhase[] {
  const phases: IncomePhase[] = [];
  for (let age = retireAge; age < input.planningAge; age++) {
    const guaranteed = guaranteedAtAge(input, age);
    const last = phases[phases.length - 1];
    if (last && Math.abs(last.guaranteed - guaranteed) < 0.5) {
      last.toAge = age;
    } else {
      phases.push({
        fromAge: age,
        toAge: age,
        guaranteed,
        portfolio: withdrawalAtAge(input, age),
      });
    }
  }
  return phases;
}
