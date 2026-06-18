import type { IncomeBreakdown, ProjectionPoint, RetirementInput } from "./types";

/**
 * Real (inflation-adjusted) arithmetic mean return for a given nominal return.
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
 * Target gross income, guaranteed income, and the gap the portfolio must fund.
 * All taxable and in gross terms, so guaranteed income offsets the target
 * dollar-for-dollar and tax is implicit in the gross target.
 */
export function incomeBreakdown(input: RetirementInput): IncomeBreakdown {
  const targetGrossIncome = (input.currentIncome * input.targetIncomePct) / 100;
  const guaranteedIncome = (input.currentIncome * input.guaranteedIncomePct) / 100;
  return {
    targetGrossIncome,
    guaranteedIncome,
    portfolioWithdrawal: Math.max(0, targetGrossIncome - guaranteedIncome),
  };
}

/**
 * The portfolio's required gross withdrawal at a given age. Before the pension
 * starts the portfolio funds the full target (the "bridge"); once guaranteed
 * income kicks in, only the remaining gap.
 */
export function withdrawalAtAge(
  input: RetirementInput,
  breakdown: IncomeBreakdown,
  age: number,
): number {
  return age >= input.pensionStartAge ? breakdown.portfolioWithdrawal : breakdown.targetGrossIncome;
}

interface PathResult {
  points: ProjectionPoint[];
  /** Age at which the portfolio first goes negative, or null if it never does. */
  depletionAge: number | null;
}

/**
 * Deterministic year-by-year portfolio path (today's dollars) for a given
 * retirement age, using each phase's mean real return. Contributions and
 * withdrawals happen mid-year, earning a half-year of return — matching the
 * rent-vs-buy convention.
 */
export function projectPath(input: RetirementInput, retirementAge: number): PathResult {
  const contribution = (input.currentIncome * input.contributionPct) / 100;
  const breakdown = incomeBreakdown(input);

  let balance = input.currentSavings;
  const points: ProjectionPoint[] = [{ age: input.currentAge, balance }];
  let depletionAge: number | null = null;

  for (let age = input.currentAge; age < input.planningAge; age++) {
    const r = phaseRealMean(input, retirementAge, age);
    const flow =
      age < retirementAge
        ? contribution + (age >= input.pensionStartAge ? breakdown.guaranteedIncome : 0)
        : -withdrawalAtAge(input, breakdown, age);
    balance = balance * (1 + r) + flow * (1 + r / 2);

    const nextAge = age + 1;
    points.push({ age: nextAge, balance });
    if (balance < 0 && depletionAge === null) depletionAge = nextAge;
  }

  return { points, depletionAge };
}

/**
 * Deterministic accumulation balances (today's dollars) for every age from
 * currentAge to planningAge, contributing each year and growing at the
 * accumulation return. Pre-retirement growth doesn't depend on when you retire,
 * so this is computed once and indexed by age for any candidate retirement age
 * (the value at age A is the portfolio you'd retire on at age A).
 */
export function accumulationBalances(input: RetirementInput): ProjectionPoint[] {
  const contribution = (input.currentIncome * input.contributionPct) / 100;
  const { guaranteedIncome } = incomeBreakdown(input);
  const r = realMean(input.accumReturn, input.inflationRate);

  let balance = input.currentSavings;
  const points: ProjectionPoint[] = [{ age: input.currentAge, balance }];
  for (let age = input.currentAge; age < input.planningAge; age++) {
    // A pension that starts while still working is saved (added to the portfolio).
    const inflow = contribution + (age >= input.pensionStartAge ? guaranteedIncome : 0);
    balance = balance * (1 + r) + inflow * (1 + r / 2);
    points.push({ age: age + 1, balance });
  }
  return points;
}
