import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./presets";
import {
  accumulationBalances,
  incomeBreakdown,
  phaseRealMean,
  projectPath,
  realMean,
} from "./projection";
import type { RetirementInput } from "./types";

const base = (overrides: Partial<RetirementInput> = {}): RetirementInput => ({
  ...DEFAULTS,
  ...overrides,
});

describe("realMean", () => {
  it("deflates nominal return by inflation", () => {
    expect(realMean(6, 2.5)).toBeCloseTo(1.06 / 1.025 - 1, 6);
  });
});

describe("phaseRealMean", () => {
  it("uses accumulation returns before retirement and retirement returns after", () => {
    const input = base({
      accumReturn: 7,
      retireReturn: 4,
      inflationRate: 2,
    });

    expect(phaseRealMean(input, 65, 64)).toBeCloseTo(1.07 / 1.02 - 1, 6);
    expect(phaseRealMean(input, 65, 65)).toBeCloseTo(1.04 / 1.02 - 1, 6);
  });
});

describe("incomeBreakdown", () => {
  it("calculates the gross income gap the portfolio must fund", () => {
    const result = incomeBreakdown(
      base({
        currentIncome: 100_000,
        targetIncomePct: 60,
        guaranteedIncomePct: 25,
      }),
    );

    expect(result.targetGrossIncome).toBe(60_000);
    expect(result.guaranteedIncome).toBe(25_000);
    expect(result.portfolioWithdrawal).toBe(35_000);
  });
});

describe("projectPath", () => {
  it("accumulates before retirement and draws down after", () => {
    const input = base();
    const { points } = projectPath(input, 60);

    expect(points[0]).toEqual({
      age: input.currentAge,
      balance: input.currentSavings,
    });
    const atRetire = points.find((p) => p.age === 60)!.balance;
    expect(atRetire).toBeGreaterThan(input.currentSavings); // accumulated
  });
});

describe("accumulationBalances", () => {
  it("starts at current savings and grows each year to the planning age", () => {
    const input = base({ currentSavings: 100_000 });
    const points = accumulationBalances(input);

    expect(points).toHaveLength(input.planningAge - input.currentAge + 1);
    expect(points[0]).toEqual({ age: input.currentAge, balance: 100_000 });
    expect(points.at(-1)!.age).toBe(input.planningAge);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].balance).toBeGreaterThan(points[i - 1].balance);
    }
  });

  it("matches the deterministic accumulation portion of projectPath", () => {
    const input = base();
    const at60 = accumulationBalances(input).find((p) => p.age === 60)!.balance;
    // Still accumulating at 60 when retiring at 70, so the paths agree there.
    const viaPath = projectPath(input, 70).points.find((p) => p.age === 60)!.balance;
    expect(at60).toBeCloseTo(viaPath, 6);
  });

  it("saves a pension that begins while still working (before retirement)", () => {
    const early = accumulationBalances(base({ pensionStartAge: 60, guaranteedIncomePct: 25 }));
    const late = accumulationBalances(base({ pensionStartAge: 90, guaranteedIncomePct: 25 }));
    // By age 70 the early pension (from 60) has been added to savings each year.
    const earlyAt70 = early.find((p) => p.age === 70)!.balance;
    const lateAt70 = late.find((p) => p.age === 70)!.balance;
    expect(earlyAt70).toBeGreaterThan(lateAt70);
  });
});
