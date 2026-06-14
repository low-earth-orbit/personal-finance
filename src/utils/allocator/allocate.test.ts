import { describe, expect, it } from "vitest";
import {
  allocateLumpSum,
  combinedAfterTaxValue,
  type AllocationPlan,
} from "./allocate";
import { DEFAULTS } from "./presets";
import { taxOwed } from "./tax";
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
  function exhaustiveDollarValue(input: AllocatorInput, lumpSum: number) {
    const ages = Array.from(
      { length: input.retirementAge - input.currentAge },
      (_, index) => input.currentAge + index,
    );
    let bestValue = Number.NEGATIVE_INFINITY;
    const plan: AllocationPlan = {
      tfsa: 0,
      rrspContrib: 0,
      claimedDeductionByAge: new Map(),
      nonRegDirect: 0,
    };

    function enumerate(bucketIndex: number, remaining: number) {
      if (bucketIndex === ages.length + 1) {
        plan.nonRegDirect = remaining;
        bestValue = Math.max(bestValue, combinedAfterTaxValue(input, plan));
        plan.nonRegDirect = 0;
        return;
      }
      for (let amount = 0; amount <= remaining; amount++) {
        if (bucketIndex === 0) {
          if (amount > input.availableTfsaRoom) break;
          plan.tfsa = amount;
        } else {
          const age = ages[bucketIndex - 1];
          if (plan.rrspContrib + amount > input.availableRrspRoom) break;
          plan.rrspContrib += amount;
          if (amount > 0) plan.claimedDeductionByAge.set(age, amount);
        }
        enumerate(bucketIndex + 1, remaining - amount);
        if (bucketIndex === 0) {
          plan.tfsa = 0;
        } else {
          const age = ages[bucketIndex - 1];
          plan.rrspContrib -= amount;
          plan.claimedDeductionByAge.delete(age);
        }
      }
    }

    enumerate(0, lumpSum);
    return bestValue;
  }

  it.each([
    {
      province: "NB" as const,
      currentIncome: 118_000,
      salaryCurve: "steady-climb" as const,
      salaryGrowthPct: 2,
    },
    {
      province: "ON" as const,
      currentIncome: 48_200,
      salaryCurve: "flat" as const,
      salaryGrowthPct: 0,
    },
    {
      province: "BC" as const,
      currentIncome: 210_000,
      salaryCurve: "early-peak" as const,
      salaryGrowthPct: 1.5,
      inflationPct: 5,
      availableTfsaRoom: 0,
    },
    {
      province: "NB" as const,
      currentIncome: 0,
      retirementWithdrawalRatePct: 0,
      capitalGainsTaxRatePct: 0,
      distributionYieldPct: 0,
    },
  ])("matches a dollar exhaustive oracle on a small case: %#", (overrides) => {
    const input = fixture({
      currentAge: 40,
      retirementAge: 43,
      lumpSum: 20,
      availableTfsaRoom: 8,
      availableRrspRoom: 20,
      ...overrides,
    });
    const result = allocateLumpSum(input, input.lumpSum);

    expect(result.projectedAfterTaxTotal).toBeCloseTo(
      exhaustiveDollarValue(input, input.lumpSum),
      6,
    );
  });

  it("matches a brute-force single-carry-age oracle on a small allocation", () => {
    const input = fixture();
    let bestValue = Number.NEGATIVE_INFINITY;

    const kinds = [
      "tfsa",
      "non-reg",
      ...Array.from(
        { length: input.retirementAge - input.currentAge },
        (_, index) => `rrsp-${input.currentAge + index}`,
      ),
    ];

    function enumerate(unit: number, plan: AllocationPlan) {
      if (unit === 5) {
        bestValue = Math.max(bestValue, combinedAfterTaxValue(input, plan));
        return;
      }
      for (const kind of kinds) {
        const next: AllocationPlan = {
          ...plan,
          claimedDeductionByAge: new Map(plan.claimedDeductionByAge),
        };
        if (kind === "tfsa") next.tfsa += 1_000;
        if (kind === "non-reg") next.nonRegDirect += 1_000;
        if (kind.startsWith("rrsp-")) {
          const age = Number(kind.slice(5));
          next.rrspContrib += 1_000;
          next.claimedDeductionByAge.set(
            age,
            (next.claimedDeductionByAge.get(age) ?? 0) + 1_000,
          );
        }
        enumerate(unit + 1, next);
      }
    }

    enumerate(0, {
      tfsa: 0,
      rrspContrib: 0,
      claimedDeductionByAge: new Map(),
      nonRegDirect: 0,
    });
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
    const rrsp =
      result.rrspDeductNow +
      result.rrspCarryForward.reduce((sum, item) => sum + item.amount, 0);

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

  it("carries deductions forward when steep salary growth makes it meaningful", () => {
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
        result.rrspDeductNow +
        result.rrspCarryForward.reduce((sum, item) => sum + item.amount, 0),
      claimedDeductionByAge: new Map([
        [
          input.currentAge,
          result.rrspDeductNow +
            result.rrspCarryForward.reduce((sum, item) => sum + item.amount, 0),
        ],
      ]),
      nonRegDirect: result.nonReg,
    };
    const allNowValue = combinedAfterTaxValue(input, allDeductNow);

    expect(result.rrspCarryForward.length).toBeGreaterThan(0);
    expect(result.projectedAfterTaxTotal).toBeGreaterThan(allNowValue);
    expect(result.carryForwardBenefit).toBeCloseTo(
      result.projectedAfterTaxTotal - allNowValue,
    );
  });

  it("can split carried deductions across multiple years", () => {
    const input = fixture({
      currentIncome: 60_000,
      lumpSum: 60_000,
      availableTfsaRoom: 0,
      availableRrspRoom: 60_000,
      portfolioReturn: 0,
      inflationPct: 0,
      distributionYieldPct: 0,
      retirementWithdrawalRatePct: 0,
    });
    const result = allocateLumpSum(input, input.lumpSum);

    expect(result.nonReg).toBe(0);
    expect(result.rrspCarryForward.length).toBeGreaterThan(0);
    expect(
      new Set([
        ...(result.rrspDeductNow > 0 ? [input.currentAge] : []),
        ...result.rrspCarryForward.map((item) => item.age),
      ]).size,
    ).toBeGreaterThan(1);
  });

  it("uses the same mid-year growth convention for registered and non-registered flows", () => {
    const input = fixture({
      currentAge: 40,
      retirementAge: 41,
      currentIncome: 0,
      portfolioReturn: 10,
      inflationPct: 0,
      distributionYieldPct: 0,
      retirementWithdrawalRatePct: 0,
      capitalGainsTaxRatePct: 0,
    });
    const tfsaPlan: AllocationPlan = {
      tfsa: 10_000,
      rrspContrib: 0,
      claimedDeductionByAge: new Map(),
      nonRegDirect: 0,
    };
    const nonRegPlan: AllocationPlan = {
      ...tfsaPlan,
      tfsa: 0,
      nonRegDirect: 10_000,
    };

    expect(combinedAfterTaxValue(input, tfsaPlan)).toBe(11_000);
    expect(combinedAfterTaxValue(input, nonRegPlan)).toBeCloseTo(
      combinedAfterTaxValue(input, tfsaPlan),
    );
  });

  it("keeps registered and non-registered balances consistent under inflation", () => {
    const input = fixture({
      currentAge: 40,
      retirementAge: 42,
      currentIncome: 0,
      portfolioReturn: 10,
      inflationPct: 5,
      distributionYieldPct: 0,
      retirementWithdrawalRatePct: 0,
      capitalGainsTaxRatePct: 0,
    });
    const tfsaPlan: AllocationPlan = {
      tfsa: 10_000,
      rrspContrib: 0,
      claimedDeductionByAge: new Map(),
      nonRegDirect: 0,
    };
    const nonRegPlan: AllocationPlan = {
      ...tfsaPlan,
      tfsa: 0,
      nonRegDirect: 10_000,
    };

    expect(combinedAfterTaxValue(input, nonRegPlan)).toBeCloseTo(
      combinedAfterTaxValue(input, tfsaPlan),
    );
  });

  it("settles a deduction and taxable distributions in the same year", () => {
    const input = fixture({
      currentAge: 40,
      retirementAge: 41,
      portfolioReturn: 10,
      inflationPct: 0,
      distributionYieldPct: 10,
      retirementWithdrawalRatePct: 0,
    });
    const plan: AllocationPlan = {
      tfsa: 0,
      rrspContrib: 10_000,
      claimedDeductionByAge: new Map([[input.currentAge, 10_000]]),
      nonRegDirect: 10_000,
    };
    // Deduct-now stacks the deduction at the top of current income.
    const refund =
      taxOwed(input.province, input.currentIncome) -
      taxOwed(input.province, input.currentIncome - 10_000);
    // Distribution tax stacks on full salary, independent of the deduction.
    const distribution = 10_000 * 0.1;
    const distributionTax =
      taxOwed(input.province, input.currentIncome + distribution) -
      taxOwed(input.province, input.currentIncome);
    const reinvested = distribution - distributionTax;
    // Price return is zero (10% return − 10% yield), so the non-reg principal
    // holds at 10_000 and only the reinvested distribution adds to it. The
    // refund arrives the next year, which is the terminal year here.
    const rrsp = 10_000 * 1.1;
    const nonReg = 10_000 + reinvested;

    expect(combinedAfterTaxValue(input, plan)).toBeCloseTo(
      rrsp + nonReg + refund,
    );
  });

  it("keeps carried deductions nominal while tax brackets stay constant in real dollars", () => {
    const input = fixture({
      currentAge: 40,
      retirementAge: 42,
      currentIncome: 100_000,
      portfolioReturn: 5,
      inflationPct: 5,
      distributionYieldPct: 0,
      retirementWithdrawalRatePct: 0,
      capitalGainsTaxRatePct: 0,
    });
    const plan: AllocationPlan = {
      tfsa: 0,
      rrspContrib: 10_000,
      claimedDeductionByAge: new Map([[41, 10_000]]),
      nonRegDirect: 0,
    };
    // A carried-forward claim stacks below the fresh RRSP room assumed used that
    // future year: floor = income − min(18% income, dollar limit).
    const freshRoom = Math.min(0.18 * input.currentIncome, 33_810);
    const claimFloor = input.currentIncome - freshRoom;
    const expectedRefund =
      taxOwed(input.province, claimFloor) -
      taxOwed(input.province, claimFloor - 10_000 / 1.05);

    expect(combinedAfterTaxValue(input, plan)).toBeCloseTo(
      10_000 + expectedRefund / 1.05,
    );
  });

  it("does not grow a tax refund with inflation while it waits one year to arrive", () => {
    const input = fixture({
      currentAge: 40,
      retirementAge: 42,
      currentIncome: 100_000,
      portfolioReturn: 0,
      inflationPct: 10,
      distributionYieldPct: 0,
      retirementWithdrawalRatePct: 0,
      capitalGainsTaxRatePct: 0,
    });
    const plan: AllocationPlan = {
      tfsa: 0,
      rrspContrib: 10_000,
      claimedDeductionByAge: new Map([[40, 10_000]]),
      nonRegDirect: 0,
    };
    const refund =
      taxOwed(input.province, input.currentIncome) -
      taxOwed(input.province, input.currentIncome - 10_000);

    expect(combinedAfterTaxValue(input, plan)).toBeCloseTo(
      (10_000 + refund) / 1.1 ** 2,
    );
  });

  it("keeps existing TFSA room nominal so it depreciates in real dollars", () => {
    const input = fixture({
      currentAge: 40,
      retirementAge: 42,
      currentIncome: 100_000,
      availableTfsaRoom: 1_000,
      portfolioReturn: 10,
      inflationPct: 10,
      distributionYieldPct: 0,
      retirementWithdrawalRatePct: 0,
      capitalGainsTaxRatePct: 60,
    });
    const plan: AllocationPlan = {
      tfsa: 0,
      rrspContrib: 10_000,
      claimedDeductionByAge: new Map([[40, 10_000]]),
      nonRegDirect: 0,
    };
    const refund =
      taxOwed(input.province, input.currentIncome) -
      taxOwed(input.province, input.currentIncome - 10_000);
    const remainingRefundNominal = refund - input.availableTfsaRoom;
    const rrspAtRetirement = (10_000 * 1.1 ** 2) / 1.1 ** 2;
    const tfsaAtRetirement = (input.availableTfsaRoom * 1.05) / 1.1 ** 2;
    const nonRegBalance = (remainingRefundNominal * 1.05) / 1.1 ** 2;
    const nonRegAcb = remainingRefundNominal / 1.1 ** 2;
    const nonRegTax = (nonRegBalance - nonRegAcb) * 0.5 * 0.6;

    expect(combinedAfterTaxValue(input, plan)).toBeCloseTo(
      rrspAtRetirement + tfsaAtRetirement + nonRegBalance - nonRegTax,
    );
  });

  it("deducts now for a high steady income because fresh room fills future top brackets", () => {
    // With a high, steadily rising income the saver already fills each future
    // year's fresh RRSP room at that year's top rate, so a carried-forward
    // deduction stacks below it and gains nothing — the optimizer deducts now.
    const input = fixture({
      currentAge: 34,
      retirementAge: 60,
      province: "NB",
      currentIncome: 118_000,
      salaryCurve: "steady-climb",
      salaryGrowthPct: 2,
      lumpSum: 50_000,
      availableRrspRoom: 200_000,
      availableTfsaRoom: 8_000,
      portfolioReturn: 6.87,
      inflationPct: 2.1,
      distributionYieldPct: 1.5,
      retirementRateMode: "income",
      retirementIncome: 80_000,
    });
    const result = allocateLumpSum(input, input.lumpSum);

    expect(result.tfsa).toBe(0);
    expect(result.rrspDeductNow).toBe(50_000);
    expect(result.rrspCarryForward).toEqual([]);
    expect(result.carryForwardBenefit).toBe(0);
  });

  it("invests an RRSP contribution now even when its deduction is claimed later", () => {
    const input = fixture({
      currentAge: 40,
      retirementAge: 42,
      currentIncome: 0,
      portfolioReturn: 10,
      inflationPct: 0,
      distributionYieldPct: 0,
      retirementWithdrawalRatePct: 0,
      capitalGainsTaxRatePct: 0,
    });
    const plan: AllocationPlan = {
      tfsa: 0,
      rrspContrib: 10_000,
      claimedDeductionByAge: new Map([[41, 10_000]]),
      nonRegDirect: 0,
    };

    expect(combinedAfterTaxValue(input, plan)).toBeCloseTo(12_100);
  });

  it("never values deferred claims below claiming the same RRSP contributions now", () => {
    const input = fixture({
      currentAge: 40,
      retirementAge: 44,
      currentIncome: 79_000,
      salaryCurve: "early-peak",
      salaryGrowthPct: 0.4,
      lumpSum: 7_100,
      availableRrspRoom: 7_100,
      availableTfsaRoom: 100_000,
      portfolioReturn: 3.2,
      inflationPct: 4.2,
      distributionYieldPct: 2.5,
      retirementWithdrawalRatePct: 15,
    });
    const result = allocateLumpSum(input, input.lumpSum);

    expect(result.carryForwardBenefit).toBeGreaterThanOrEqual(0);
  });

  it("uses a separate terminal capital-gains tax rate", () => {
    const input = fixture({
      currentAge: 40,
      retirementAge: 41,
      portfolioReturn: 10,
      inflationPct: 0,
      distributionYieldPct: 0,
      retirementWithdrawalRatePct: 60,
      capitalGainsTaxRatePct: 0,
    });
    const nonRegPlan: AllocationPlan = {
      tfsa: 0,
      rrspContrib: 0,
      claimedDeductionByAge: new Map(),
      nonRegDirect: 10_000,
    };

    expect(combinedAfterTaxValue(input, nonRegPlan)).toBe(11_000);
    expect(
      combinedAfterTaxValue(
        { ...input, capitalGainsTaxRatePct: 60 },
        nonRegPlan,
      ),
    ).toBe(10_700);
  });

  it("invests the full lump sum now, including a remainder", () => {
    const input = fixture({ lumpSum: 5_500 });
    const result = allocateLumpSum(input, input.lumpSum);
    const investedNow =
      result.tfsa +
      result.rrspDeductNow +
      result.rrspCarryForward.reduce((sum, item) => sum + item.amount, 0) +
      result.nonReg;
    expect(investedNow).toBe(input.lumpSum);
    expect(
      result.rrspDeductNow +
        result.rrspCarryForward.reduce((sum, item) => sum + item.amount, 0),
    ).toBeLessThanOrEqual(input.availableRrspRoom);
    expect(result.precision).toBe(1);
  });

  it("derives a zero withdrawal haircut from zero retirement income", () => {
    const input = fixture({
      retirementRateMode: "income",
      retirementIncome: 0,
      retirementWithdrawalRatePct: 60,
      availableTfsaRoom: 0,
      availableRrspRoom: 5_000,
    });

    expect(allocateLumpSum(input, input.lumpSum).rrspDeductNow).toBe(
      input.lumpSum,
    );
  });

  it("is deterministic", () => {
    const input = fixture();
    expect(allocateLumpSum(input, input.lumpSum)).toEqual(
      allocateLumpSum(input, input.lumpSum),
    );
  });
});
