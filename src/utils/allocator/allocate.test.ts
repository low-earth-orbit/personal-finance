import { describe, expect, it } from "vitest";
import {
  allocationSimplificationEpsilon,
  allocateLumpSum,
  combinedAfterTaxValue,
  type AllocationPlan,
} from "./allocate";
import { DEFAULTS } from "./presets";
import type { AllocatorInput } from "./types";

const fixture = (overrides: Partial<AllocatorInput> = {}): AllocatorInput => ({
  ...DEFAULTS,
  currentAge: 40,
  retirementAge: 43,
  currentIncome: 100_000,
  salaryCurve: "flat",
  salaryGrowthPct: 0,
  lumpSum: 5_000,
  availableRrspRoom: 100_000,
  availableTfsaRoom: 100_000,
  portfolioReturn: 5,
  inflationPct: 2,
  distributionYieldPct: 2,
  retirementRateMode: "rate",
  retirementWithdrawalRatePct: 30,
  ...overrides,
});

describe("one-time lump-sum allocator", () => {
  it("matches a brute-force single-carry-age oracle on a small allocation", () => {
    const input = fixture();
    let bestValue = Number.NEGATIVE_INFINITY;

    function enumerate(unit: number, plan: AllocationPlan, carryAge: number) {
      if (unit === 5) {
        bestValue = Math.max(bestValue, combinedAfterTaxValue(input, plan));
        return;
      }
      for (const kind of ["tfsa", "rrsp-now", "rrsp-carry", "non-reg"]) {
        const next: AllocationPlan = {
          ...plan,
          claimedDeductionByAge: new Map(plan.claimedDeductionByAge),
        };
        if (kind === "tfsa") next.tfsa += 1_000;
        if (kind === "non-reg") next.nonRegDirect += 1_000;
        if (kind === "rrsp-now" || kind === "rrsp-carry") {
          next.rrspContrib += 1_000;
          const age = kind === "rrsp-now" ? input.currentAge : carryAge;
          next.claimedDeductionByAge.set(
            age,
            (next.claimedDeductionByAge.get(age) ?? 0) + 1_000,
          );
        }
        enumerate(unit + 1, next, carryAge);
      }
    }

    for (
      let carryAge = input.currentAge + 1;
      carryAge < input.retirementAge;
      carryAge++
    ) {
      enumerate(
        0,
        {
          tfsa: 0,
          rrspContrib: 0,
          claimedDeductionByAge: new Map(),
          nonRegDirect: 0,
        },
        carryAge,
      );
    }
    const result = allocateLumpSum(input, input.lumpSum);
    expect(result.projectedAfterTaxTotal).toBeCloseTo(bestValue, 0);
  });

  it("spills amounts above total registered room to non-registered", () => {
    const input = fixture({
      lumpSum: 20_000,
      availableRrspRoom: 5_000,
      availableTfsaRoom: 4_000,
      retirementWithdrawalRatePct: 0,
    });
    const result = allocateLumpSum(input, input.lumpSum);
    const rrsp = result.rrspDeductNow + (result.rrspCarryForward?.amount ?? 0);

    expect(result.tfsa).toBeLessThanOrEqual(input.availableTfsaRoom);
    expect(rrsp).toBeLessThanOrEqual(input.availableRrspRoom);
    expect(result.nonReg).toBe(11_000);
  });

  it("favors TFSA when the retirement withdrawal rate is high", () => {
    const input = fixture({ retirementWithdrawalRatePct: 60 });
    expect(allocateLumpSum(input, input.lumpSum).tfsa).toBe(input.lumpSum);
  });

  it("favors deduct-now RRSP with a low retirement rate and flat salary", () => {
    const input = fixture({ retirementWithdrawalRatePct: 0 });
    expect(allocateLumpSum(input, input.lumpSum).rrspDeductNow).toBe(
      input.lumpSum,
    );
  });

  it("suppresses a low-growth carry-forward advantage", () => {
    const input = {
      ...DEFAULTS,
      lumpSum: 50_000,
      salaryCurve: "steady-climb" as const,
      salaryGrowthPct: 2,
    };
    const result = allocateLumpSum(input, input.lumpSum);

    expect(result.rrspCarryForward).toBeNull();
  });

  it("shows one carry-forward age when steep salary growth makes it meaningful", () => {
    const input = {
      ...DEFAULTS,
      currentAge: 25,
      currentIncome: 55_000,
      salaryCurve: "steady-climb" as const,
      salaryGrowthPct: 6,
      lumpSum: 50_000,
      availableTfsaRoom: 0,
      availableRrspRoom: 50_000,
    };
    const result = allocateLumpSum(input, input.lumpSum);
    const allDeductNow: AllocationPlan = {
      tfsa: result.tfsa,
      rrspContrib:
        result.rrspDeductNow + (result.rrspCarryForward?.amount ?? 0),
      claimedDeductionByAge: new Map([
        [
          input.currentAge,
          result.rrspDeductNow + (result.rrspCarryForward?.amount ?? 0),
        ],
      ]),
      nonRegDirect: result.nonReg,
    };
    const allNowValue = combinedAfterTaxValue(input, allDeductNow);

    expect(result.rrspCarryForward).not.toBeNull();
    expect(result.projectedAfterTaxTotal - allNowValue).toBeGreaterThanOrEqual(
      allocationSimplificationEpsilon(result.projectedAfterTaxTotal),
    );
  });

  it("preserves the lump-sum invariant, including a remainder", () => {
    const input = fixture({ lumpSum: 5_500 });
    const result = allocateLumpSum(input, input.lumpSum);
    const total =
      result.tfsa +
      result.rrspDeductNow +
      (result.rrspCarryForward?.amount ?? 0) +
      result.nonReg;
    expect(total).toBe(input.lumpSum);
  });

  it("is deterministic", () => {
    const input = fixture();
    expect(allocateLumpSum(input, input.lumpSum)).toEqual(
      allocateLumpSum(input, input.lumpSum),
    );
  });
});
