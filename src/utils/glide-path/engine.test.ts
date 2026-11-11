import { describe, expect, it } from "vitest";
import { DEFAULTS, DEFAULT_ALLOC_CURVE } from "./presets";
import { buildEquityGrid, describeShape, recommendGlidePath, tieMiddleArgmax } from "./engine";
import type { GlidePathInput } from "./types";

// Fast settings for tests: few paths; the default glide-step interval is 5 years.
const base = (overrides: Partial<GlidePathInput> = {}): GlidePathInput => ({
  ...DEFAULTS,
  numPaths: 200,
  ...overrides,
});

describe("recommendGlidePath", () => {
  it("stays on the 5% grid without exceeding a max-equity cap", () => {
    const grid = Array.from(buildEquityGrid(1.18));

    expect(grid.at(-1)).toBe(1.15);
    expect(Math.max(...grid)).toBe(1.15);
  });

  it("returns a coherent schedule covering the full horizon", () => {
    const input = base();
    const r = recommendGlidePath(input);
    const nYears = input.planningAge - input.startAge;

    expect(r.equityByYear).toHaveLength(nYears);
    expect(r.schedule[0].ageStart).toBe(input.startAge);
    expect(r.schedule.at(-1)!.yearEnd).toBe(nYears - 1);
    // Phases labelled by the block's first year.
    expect(r.schedule[0].phase).toBe("accum");
    expect(r.schedule.at(-1)!.phase).toBe("retire");
    expect(r.params.interval).toBe(5);
    // Every weight is on the grid and within [0, maxLeverage].
    for (const w of r.equityByYear) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(r.params.maxLeverage + 1e-9);
    }
  });

  it("uses the requested whole-year glide-step interval", () => {
    const r = recommendGlidePath(base({ interval: 2 }));

    expect(r.params.interval).toBe(2);
    expect(r.schedule[0]).toMatchObject({ yearStart: 0, yearEnd: 1 });
  });

  it("reports sane outcome stats", () => {
    const r = recommendGlidePath(base());
    expect(r.ceIncome).toBeGreaterThan(0);
    expect(r.depletion).toBeGreaterThanOrEqual(0);
    expect(r.depletion).toBeLessThanOrEqual(1);
    expect(r.drawdownDepletion).toBeGreaterThanOrEqual(0);
    expect(r.drawdownDepletion).toBeLessThanOrEqual(1);
    expect(r.expectedRetirementBalance).toBeGreaterThan(0);
    expect(r.flatDepletion).toBeGreaterThanOrEqual(0);
    expect(r.flatDepletion).toBeLessThanOrEqual(1);
    expect(r.flatDrawdownDepletion).toBeGreaterThanOrEqual(0);
    expect(r.flatDrawdownDepletion).toBeLessThanOrEqual(1);
  });

  it("reports the expected balance and year-1 draw of each allocation", () => {
    const r = recommendGlidePath(base());
    expect(r.flatExpectedRetirementBalance).toBeGreaterThan(0);
    // Constant-dollar spending: both allocations draw the same gap from different balances.
    expect(r.flatInitialTargetDraw).toBe(r.initialTargetDraw);
    expect(r.flatFundingRatio).toBeCloseTo(
      r.flatInitialTargetDraw / r.flatExpectedRetirementBalance,
      3,
    );
    // An over-funded plan ties everywhere, so the glide is the constant weight itself and
    // reaches the same balance.
    const flat = recommendGlidePath(base({ startSavings: 5_000_000 }));
    expect(new Set(flat.equityByYear)).toEqual(new Set([flat.flatEquityPct / 100]));
    expect(flat.flatExpectedRetirementBalance).toBe(flat.expectedRetirementBalance);
    expect(flat.flatFundingRatio).toBe(flat.fundingRatio);
  });

  it("reports no shortfall when guaranteed income already covers the target", () => {
    // Guaranteed income fully funds the target, so the portfolio never has a gap to fund — there is no
    // income shortfall even with no savings. Regression: depletion used to count a zero balance
    // as failure, reporting 100% "shortfall" for a fully-funded plan.
    const r = recommendGlidePath(
      base({
        guaranteedIncome: 60000,
        targetIncome: 60000,
        startSavings: 0,
        annualContribution: 0,
      }),
    );
    expect(r.depletion).toBe(0);
    expect(r.drawdownDepletion).toBe(0);
  });

  it("reports a best constant allocation the glide path barely beats", () => {
    const r = recommendGlidePath(base());
    // Flat weight is on the grid, within [0, maxLeverage].
    expect(r.flatEquityPct).toBeGreaterThanOrEqual(0);
    expect(r.flatEquityPct).toBeLessThanOrEqual(r.params.maxLeverage * 100 + 1e-9);
    expect(r.flatCeIncome).toBeGreaterThan(0);
    // The glide path is optimized over a superset of constant paths, so its
    // in-sample edge is real but small — within a few % of the flat CE income.
    expect(r.ceIncome).toBeGreaterThanOrEqual(r.flatCeIncome * 0.98);
  });

  it("keeps the raw optimized glide even when the flat edge is marginal", () => {
    const r = recommendGlidePath(base());
    expect(new Set(r.equityByYear).size).toBeGreaterThan(1);
  });

  it("is deterministic for identical inputs (seeded)", () => {
    const a = recommendGlidePath(base());
    const b = recommendGlidePath(base());
    expect(a.equityByYear).toEqual(b.equityByYear);
    expect(a.ceIncome).toBe(b.ceIncome);
  });

  it("re-rolls to a new draw per seed while staying deterministic for that seed", () => {
    const a = recommendGlidePath(base()); // seed 0 (canonical)
    const b = recommendGlidePath(base(), DEFAULT_ALLOC_CURVE, 1);
    const c = recommendGlidePath(base(), DEFAULT_ALLOC_CURVE, 1);
    // Same seed → identical result.
    expect(b.equityByYear).toEqual(c.equityByYear);
    expect(b.ceIncome).toBe(c.ceIncome);
    // The default (no seed) equals an explicit seed 0.
    expect(recommendGlidePath(base(), DEFAULT_ALLOC_CURVE, 0).equityByYear).toEqual(a.equityByYear);
    // A different seed is a genuinely different draw (moves at least one reported figure).
    const differs =
      a.ceIncome !== b.ceIncome ||
      a.depletion !== b.depletion ||
      JSON.stringify(a.equityByYear) !== JSON.stringify(b.equityByYear);
    expect(differs).toBe(true);
  });

  it("falls back to a bounded path count for invalid direct engine calls", () => {
    const bounded = recommendGlidePath(base({ numPaths: Number.POSITIVE_INFINITY }));
    const minimum = recommendGlidePath(base({ numPaths: 200 }));
    expect(bounded.equityByYear).toEqual(minimum.equityByYear);
    expect(bounded.ceIncome).toBe(minimum.ceIncome);
  });

  it("pays guaranteed income from retirement when it starts at or before retirement", () => {
    const r = recommendGlidePath(
      base({
        retirementAge: 55,
        guaranteedStartAge: 50,
        planningAge: 95,
        guaranteedIncome: 25000,
      }),
    );
    expect(r.params.accumYears).toBe(20);
    expect(r.params.retireYears).toBe(40);
    expect(r.params.guaranteed).toBeCloseTo(25000, 0);
    expect(r.params.guaranteedDelay).toBe(0);
    expect(r.initialTargetDraw).toBeCloseTo(DEFAULTS.targetIncome - 25000, 0);
  });

  it("funds the whole target from the portfolio during a guaranteed-income bridge", () => {
    const noBridge = recommendGlidePath(base({ retirementAge: 60, guaranteedStartAge: 60 }));
    const bridge = recommendGlidePath(base({ retirementAge: 60, guaranteedStartAge: 65 }));
    expect(bridge.params.guaranteedDelay).toBe(5);
    expect(bridge.initialTargetDraw).toBeCloseTo(DEFAULTS.targetIncome, 0);
    expect(bridge.ceIncome).toBeLessThan(noBridge.ceIncome);
  });

  it("reports welfare CE equal to CE income without a bequest weight", () => {
    const r = recommendGlidePath(base());
    expect(r.params.bequestWeight).toBe(0);
    expect(r.welfareCe).toBeCloseTo(r.ceIncome, 6);
    expect(r.medianBequest).toBeGreaterThan(0);
  });

  it("adds the bequest term to welfare CE when a bequest weight is set", () => {
    const r = recommendGlidePath(base({ bequestWeight: 0.5 }));
    expect(r.params.bequestWeight).toBe(0.5);
    expect(r.welfareCe).not.toBeNull();
    expect(r.welfareCe!).toBeGreaterThan(r.ceIncome);
    expect(r.overFunded).toBe(false);
  });

  it("flags an over-funded plan and breaks the flat tie at the middle, not 0%", () => {
    const r = recommendGlidePath(base({ startSavings: 5_000_000 }));
    expect(r.overFunded).toBe(true);
    expect(r.flatEquityPct).toBeGreaterThan(0);
    expect(r.flatCeIncome).toBeCloseTo(DEFAULTS.targetIncome, -2);
    // A bequest weight gives the surplus a use, so the plan is no longer a tie.
    expect(
      recommendGlidePath(base({ startSavings: 5_000_000, bequestWeight: 0.25 })).overFunded,
    ).toBe(false);
  });

  it("does not flag the default plan as over-funded", () => {
    expect(recommendGlidePath(base({ startSavings: 0 })).overFunded).toBe(false);
  });

  it("uses the guaranteed income amount directly", () => {
    const r = recommendGlidePath(base({ guaranteedIncome: 36000 }));
    expect(r.params.guaranteed).toBeCloseTo(36000, 0);
  });

  it("lowers recommended equity as risk aversion rises", () => {
    // Test the monotonicity property with the parametric iid-mc mode (deterministic at
    // low path counts); forward-block adds bootstrap noise that can flip the ordering at
    // numPaths=200. Use semi-flexible spending: at flexibility 0 consumption is ~two-valued
    // (target or floor), so every γ ranks allocations by shortfall years and γ is ~inert.
    const cautious = recommendGlidePath(
      base({ gamma: 8, maxEquityPct: 100, flexibility: 0.5 }),
      undefined,
      0,
      "iid-mc",
    );
    const aggressive = recommendGlidePath(
      base({ gamma: 1, maxEquityPct: 100, flexibility: 0.5 }),
      undefined,
      0,
      "iid-mc",
    );
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(cautious.equityByYear)).toBeLessThan(avg(aggressive.equityByYear));
  });

  it("allows leverage (>100% equity) under low risk aversion and cheap borrowing", () => {
    const r = recommendGlidePath(base({ gamma: 1.5, maxEquityPct: 150, borrowCost: 0.5 }));
    expect(r.params.maxLeverage).toBeCloseTo(1.5, 6);
    expect(Math.max(...r.equityByYear)).toBeGreaterThan(1.0);
  });

  it("never exceeds a max-equity cap between grid steps", () => {
    const r = recommendGlidePath(base({ gamma: 1.5, maxEquityPct: 118, borrowCost: 0.5 }));

    expect(Math.max(...r.equityByYear)).toBeLessThanOrEqual(1.15);
    expect(r.flatEquityPct).toBeLessThanOrEqual(115);
  });

  it("keeps equity at/below 100% with no leverage", () => {
    const r = recommendGlidePath(base({ maxEquityPct: 100 }));
    expect(Math.max(...r.equityByYear)).toBeLessThanOrEqual(1.0 + 1e-9);
  });

  it("applies the retirement ceiling without limiting working years", () => {
    const input = base({
      retirementAge: 62, // intentionally splits the normal five-year cadence
      planningAge: 82,
      gamma: 1.5,
      maxEquityPct: 150,
      retirementMaxEquityPct: 50,
      borrowCost: 0.5,
    });
    const r = recommendGlidePath(input);
    const retireStart = input.retirementAge - input.startAge;
    expect(Math.max(...r.equityByYear.slice(retireStart))).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(Math.max(...r.equityByYear.slice(0, retireStart))).toBeGreaterThan(0.5);
    expect(r.schedule.find((block) => block.yearStart === retireStart)?.phase).toBe("retire");
    expect(r.params.retirementMaxLeverage).toBe(0.5);
  });
});

describe("recommendGlidePath (forward-block)", () => {
  const run = (overrides: Partial<GlidePathInput> = {}, seed = 0) =>
    recommendGlidePath(base(overrides), undefined, seed, "forward-block");

  it("is deterministic per seed and reports the mode", () => {
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a.params.returnMode).toBe("forward-block");
    expect(run({}, 1)).not.toEqual(a);
  });

  it("samples different paths from iid-mc but the same kind of result", () => {
    const block = run();
    const iid = recommendGlidePath(base());
    expect(block.ceIncome).not.toBe(iid.ceIncome);
    expect(block.equityByYear).toHaveLength(iid.equityByYear.length);
    expect(block.ceIncome).toBeGreaterThan(DEFAULTS.guaranteedIncome);
    expect(block.ceIncome).toBeLessThanOrEqual(DEFAULTS.targetIncome);
    for (const w of block.equityByYear) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it("projects the median balance from the bundled history, not the curve", () => {
    // Same constant weight in both modes; the deterministic balance differs only by the
    // return source (curve geometric mean vs the bundle's realized geometric mean).
    const block = run({ flexibility: 1 });
    const iid = recommendGlidePath(base({ flexibility: 1 }));
    expect(block.expectedRetirementBalance).toBeGreaterThan(0);
    expect(block.expectedRetirementBalance / iid.expectedRetirementBalance).toBeCloseTo(1, 1);
  });

  it("borrows at the real borrowing cost above 100% equity", () => {
    const r = run({ gamma: 1.5, maxEquityPct: 150, borrowCost: 0.5 });
    expect(Math.max(...r.equityByYear)).toBeGreaterThan(1);
    expect(Math.max(...r.equityByYear)).toBeLessThanOrEqual(1.5);
  });
});

describe("constant-dollar utility shortcut", () => {
  it("matches the general path for a negligible spending flexibility", () => {
    // flexibility 0 reads a fully funded year's utility from a precomputed table; any
    // flexibility > 0 computes it per path-year. A 1e-12 flexibility is the same plan.
    const exact = recommendGlidePath(base());
    const general = recommendGlidePath(base({ flexibility: 1e-12 }));
    expect(general.equityByYear).toEqual(exact.equityByYear);
    expect(general.ceIncome).toBe(exact.ceIncome);
    expect(general.flatEquityPct).toBe(exact.flatEquityPct);
    expect(general.depletion).toBe(exact.depletion);
  });
});

describe("describeShape", () => {
  // 10 working years then 20 retirement years in 5-year steps.
  const blockStart = [0, 5, 10, 15, 20, 25];
  const path = (steps: number[]) => steps.flatMap((w) => Array<number>(5).fill(w));

  it("leaves the final retirement step out of the retirement slope", () => {
    const shape = describeShape(path([1, 1, 1, 1, 1, 0.2]), blockStart, 10);
    expect(shape.retireDir).toBe("Flat");
    expect(describeShape(path([1, 1, 0.5, 0.8, 1, 0.2]), blockStart, 10).retireDir).toBe("Rising");
  });

  it("keeps the final step when fewer than three retirement steps exist", () => {
    // 10 working years + 10 retirement years: two retirement steps, nothing to trim.
    const shape = describeShape(path([1, 1, 1, 0.5]), [0, 5, 10, 15], 10);
    expect(shape.retireDir).toBe("Falling");
  });

  it("finds a tent bottom before retirement", () => {
    const shape = describeShape(path([1, 0.6, 0.9, 1, 1, 1]), blockStart, 10);
    // Lowest within 15 years either side of retirement; among ties, the year nearest it.
    expect(shape.tentYear).toBe(9);
    expect(shape.accumDir).toBe("Falling");
  });

  it("prefers the retirement side on a tie and ignores the final step", () => {
    expect(describeShape(path([1, 1, 1, 1, 1, 1]), blockStart, 10).tentYear).toBe(10);
    expect(describeShape(path([0.7, 0.7, 0.7, 1, 1, 0]), blockStart, 10).tentYear).toBe(10);
  });

  it("looks no further than 15 years from retirement", () => {
    // Retirement at year 22; the 30% years (0-4) end more than 15 years before it.
    const weights = [...Array<number>(5).fill(0.3), ...Array<number>(35).fill(0.8), 0.9, 0.9];
    expect(describeShape(weights, [0, 5, 22, 30, 40], 22).tentYear).toBe(22);
    // Moved inside the window, the same dip is the tent.
    const near = [
      ...Array<number>(10).fill(0.8),
      ...Array<number>(5).fill(0.3),
      ...weights.slice(15),
    ];
    expect(describeShape(near, [0, 10, 15, 22, 30, 40], 22).tentYear).toBe(14);
  });
});

describe("tieMiddleArgmax", () => {
  it("returns the unique maximum", () => {
    expect(tieMiddleArgmax([1, 3, 2])).toBe(1);
  });
  it("takes the middle of a tied run", () => {
    expect(tieMiddleArgmax([5, 5, 5, 5, 5])).toBe(2);
    expect(tieMiddleArgmax([1, 4, 4, 4, 4])).toBe(3);
  });
});
