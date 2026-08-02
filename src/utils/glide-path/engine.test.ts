import { describe, expect, it } from "vitest";
import { DEFAULTS, DEFAULT_ALLOC_CURVE } from "./presets";
import { buildEquityGrid, recommendGlidePath } from "./engine";
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

  it("pays guaranteed income every retirement year (no bridge)", () => {
    // Guaranteed income starts at retirement, so no year funds the full target alone.
    const r = recommendGlidePath(
      base({ retirementAge: 55, planningAge: 95, guaranteedIncome: 25000 }),
    );
    expect(r.params.accumYears).toBe(20);
    expect(r.params.retireYears).toBe(40);
    expect(r.params.guaranteed).toBeCloseTo(25000, 0);
  });

  it("uses the guaranteed income amount directly", () => {
    const r = recommendGlidePath(base({ guaranteedIncome: 36000 }));
    expect(r.params.guaranteed).toBeCloseTo(36000, 0);
  });

  it("lowers recommended equity as risk aversion rises", () => {
    // Test the monotonicity property with the parametric iid-mc mode (deterministic at
    // low path counts); forward-block adds bootstrap noise that can flip the ordering at
    // numPaths=200.
    const cautious = recommendGlidePath(
      base({ gamma: 8, maxEquityPct: 100 }),
      undefined,
      0,
      "iid-mc",
    );
    const aggressive = recommendGlidePath(
      base({ gamma: 1, maxEquityPct: 100 }),
      undefined,
      0,
      "iid-mc",
    );
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(cautious.equityByYear)).toBeLessThanOrEqual(avg(aggressive.equityByYear) + 1e-9);
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
