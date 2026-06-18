import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./presets";
import { accumulationBalances } from "./projection";
import {
  NUM_SIMULATIONS,
  computePlanSWR,
  computeRetirement,
  safeWithdrawalRate,
  simulateRetirementPhase,
} from "./monteCarlo";
import type { RetirementInput } from "./types";

const base = (overrides: Partial<RetirementInput> = {}): RetirementInput => ({
  ...DEFAULTS,
  ...overrides,
});

describe("simulateRetirementPhase", () => {
  it("starts every simulation at the given balance with ordered percentiles", () => {
    const start = 1_500_000;
    const { bands } = simulateRetirementPhase(base(), 60, start);

    expect(bands[0].age).toBe(60);
    expect(bands[0].p10).toBe(start);
    expect(bands[0].p50).toBe(start);
    expect(bands[0].p90).toBe(start);
    expect(bands.at(-1)!.age).toBe(DEFAULTS.planningAge);
    for (const b of bands) {
      expect(b.p10).toBeLessThanOrEqual(b.p50);
      expect(b.p50).toBeLessThanOrEqual(b.p90);
    }
  });

  it("is deterministic across runs (seeded)", () => {
    const a = simulateRetirementPhase(base(), 60, 1_500_000);
    const b = simulateRetirementPhase(base(), 60, 1_500_000);
    expect(a.successRate).toBe(b.successRate);
    expect(a.bands.at(-1)!.p50).toBe(b.bands.at(-1)!.p50);
  });

  it("keeps the success rate in [0, 1] and rising with a bigger starting balance", () => {
    const lean = simulateRetirementPhase(base(), 60, 800_000).successRate;
    const flush = simulateRetirementPhase(base(), 60, 5_000_000).successRate;
    expect(lean).toBeGreaterThanOrEqual(0);
    expect(flush).toBeLessThanOrEqual(1);
    expect(flush).toBeGreaterThanOrEqual(lean);
  });

  it("0% flexibility produces identical results to no-flexibility baseline", () => {
    const withZero = simulateRetirementPhase(base({ spendingFlexibilityPct: 0 }), 60, 900_000);
    const baseline = simulateRetirementPhase(base(), 60, 900_000);
    expect(withZero.successRate).toBe(baseline.successRate);
  });

  it("guardrail flexibility raises success rate substantially on a lean balance", () => {
    const strict = simulateRetirementPhase(
      base({ spendingFlexibilityPct: 0 }),
      60,
      900_000,
    ).successRate;
    const flexible = simulateRetirementPhase(
      base({ spendingFlexibilityPct: 20 }),
      60,
      900_000,
    ).successRate;
    // The guardrail trims spending while capital remains, so the effect is large
    // (~+18pts here). A regression to cutting only at depletion would barely move
    // this, so we assert a meaningful margin rather than a mere >=.
    expect(flexible - strict).toBeGreaterThan(0.1);
  });

  it("success rate is non-decreasing as flexibility increases", () => {
    const s0 = simulateRetirementPhase(
      base({ spendingFlexibilityPct: 0 }),
      60,
      900_000,
    ).successRate;
    const s20 = simulateRetirementPhase(
      base({ spendingFlexibilityPct: 20 }),
      60,
      900_000,
    ).successRate;
    const s50 = simulateRetirementPhase(
      base({ spendingFlexibilityPct: 50 }),
      60,
      900_000,
    ).successRate;
    expect(s20).toBeGreaterThanOrEqual(s0);
    expect(s50).toBeGreaterThanOrEqual(s20);
  });
});

describe("computeRetirement", () => {
  it("returns the earliest age that meets the target success rate", () => {
    const input = base();
    const result = computeRetirement(input);
    const target = input.targetSuccessRate / 100;

    expect(result.earliestRetirementAge).not.toBeNull();
    const age = result.earliestRetirementAge!;
    expect(age).toBeGreaterThan(input.currentAge);
    expect(age).toBeLessThan(input.planningAge);
    expect(result.successRate!).toBeGreaterThanOrEqual(target);

    // One year earlier should fall short of the target (else it'd be chosen).
    const earlierBalance = accumulationBalances(input).find((p) => p.age === age - 1)!.balance;
    expect(simulateRetirementPhase(input, age - 1, earlierBalance).successRate).toBeLessThan(
      target,
    );
  });

  it("exposes the accumulation path and retirement bands for the chosen age", () => {
    const result = computeRetirement(base());
    const age = result.earliestRetirementAge!;

    expect(result.accumulationPath![0].age).toBe(DEFAULTS.currentAge);
    expect(result.accumulationPath!.at(-1)!.age).toBe(age);
    expect(result.retirementBands![0].age).toBe(age);
    expect(result.retirementBands!.at(-1)!.age).toBe(DEFAULTS.planningAge);
    expect(result.portfolioAtRetirement).toBeCloseTo(result.accumulationPath!.at(-1)!.balance, 6);
  });

  it("retires no earlier when the confidence target is higher", () => {
    const relaxed = computeRetirement(base({ targetSuccessRate: 75 }));
    const strict = computeRetirement(base({ targetSuccessRate: 95 }));

    expect(relaxed.earliestRetirementAge).not.toBeNull();
    expect(strict.earliestRetirementAge).not.toBeNull();
    expect(strict.earliestRetirementAge!).toBeGreaterThanOrEqual(relaxed.earliestRetirementAge!);
  });

  it("lets a heavily funded saver retire immediately", () => {
    const result = computeRetirement(base({ currentAge: 50, currentSavings: 10_000_000 }));
    expect(result.earliestRetirementAge).toBe(50);
    expect(result.yearsUntilRetirement).toBe(0);
    expect(result.successRate!).toBeGreaterThanOrEqual(0.95);
  });

  it("returns nulls when no age can hit the target", () => {
    const result = computeRetirement(
      base({
        currentAge: 60,
        currentSavings: 0,
        contributionPct: 0,
        guaranteedIncomePct: 0,
        targetIncomePct: 80,
      }),
    );
    expect(result.earliestRetirementAge).toBeNull();
    expect(result.retirementBands).toBeNull();
    expect(result.successRate).toBeNull();
    expect(result.portfolioWithdrawal).toBeGreaterThan(0);
  });

  it("includes a 50%-likely age range that brackets the point estimate", () => {
    const result = computeRetirement(base());
    const range = result.retirementAgeRange!;
    expect(range).not.toBeNull();
    expect(range.p25).toBeLessThanOrEqual(range.p50);
    expect(range.p50).toBeLessThanOrEqual(range.p75);
    const age = result.earliestRetirementAge!;
    expect(age).toBeGreaterThanOrEqual(range.p25 - 1);
    expect(age).toBeLessThanOrEqual(range.p75);
  });

  it("widens little and shifts later for a higher confidence target", () => {
    const relaxed = computeRetirement(base({ targetSuccessRate: 80 })).retirementAgeRange!;
    const strict = computeRetirement(base({ targetSuccessRate: 95 })).retirementAgeRange!;
    expect(strict.p50).toBeGreaterThanOrEqual(relaxed.p50);
  });

  it("has no age range when the plan is infeasible", () => {
    const result = computeRetirement(
      base({
        currentAge: 60,
        currentSavings: 0,
        contributionPct: 0,
        guaranteedIncomePct: 0,
        targetIncomePct: 80,
      }),
    );
    expect(result.retirementAgeRange).toBeNull();
  });

  it("runs the configured number of simulations", () => {
    expect(NUM_SIMULATIONS).toBe(1000);
  });

  it("retires no later with spending flexibility than without", () => {
    const strict = computeRetirement(base({ spendingFlexibilityPct: 0 }));
    const flexible = computeRetirement(base({ spendingFlexibilityPct: 20 }));
    if (strict.earliestRetirementAge !== null && flexible.earliestRetirementAge !== null) {
      expect(flexible.earliestRetirementAge).toBeLessThanOrEqual(strict.earliestRetirementAge);
    }
  });
});

describe("computePlanSWR", () => {
  const input = base({
    currentIncome: 100_000,
    targetIncomePct: 60, // $60k target
    guaranteedIncomePct: 25, // $25k pension → $35k gap
    pensionStartAge: 65,
  });

  it("uses the full target income in year 1 when retiring before the pension (bridge)", () => {
    // Retire at 60 (< pensionStartAge): year-1 draw is the whole $60k target.
    expect(computePlanSWR(input, 60, 1_000_000)).toBeCloseTo(0.06, 6);
  });

  it("uses the post-pension gap when retiring at/after the pension starts", () => {
    // Retire at 65: pension is already flowing, so year-1 draw is the $35k gap.
    expect(computePlanSWR(input, 65, 1_000_000)).toBeCloseTo(0.035, 6);
  });

  it("returns 0 for non-positive savings", () => {
    expect(computePlanSWR(input, 65, 0)).toBe(0);
  });
});

describe("safeWithdrawalRate", () => {
  it("returns a plausible 60/40 rate that falls as the horizon lengthens", () => {
    const swr30 = safeWithdrawalRate(5.67, 8.79, 2.1, 30, 0.9);
    const swr50 = safeWithdrawalRate(5.67, 8.79, 2.1, 50, 0.9);
    expect(swr30).toBeGreaterThan(0.025);
    expect(swr30).toBeLessThan(0.05);
    expect(swr50).toBeLessThan(swr30);
  });

  it("falls as the required success rate rises", () => {
    const swr80 = safeWithdrawalRate(5.67, 8.79, 2.1, 30, 0.8);
    const swr95 = safeWithdrawalRate(5.67, 8.79, 2.1, 30, 0.95);
    expect(swr95).toBeLessThan(swr80);
  });
});
