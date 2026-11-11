import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./presets";
import { ceIsDegenerate, pickRecommendation } from "./recommendation";
import type { GlidePathResult } from "./types";

const result = (overrides: Partial<GlidePathResult>): GlidePathResult =>
  ({
    ceIncome: 58000,
    flatCeIncome: 57500,
    depletion: 0.03,
    flatDepletion: 0.035,
    drawdownDepletion: 0.002,
    flatDrawdownDepletion: 0.004,
    ...overrides,
  }) as GlidePathResult;

describe("pickRecommendation", () => {
  it("prefers the constant weight within the simplicity thresholds", () => {
    expect(pickRecommendation(DEFAULTS, result({})).preferConstant).toBe(true);
  });

  it("ignores drawdown-only shortfall gaps", () => {
    const r = pickRecommendation(DEFAULTS, result({ flatDrawdownDepletion: 0.02 }));
    expect(r.preferConstant).toBe(true);
  });

  it("keeps the glide when it cuts full-path shortfall by more than a point", () => {
    expect(pickRecommendation(DEFAULTS, result({ flatDepletion: 0.041 })).preferConstant).toBe(
      false,
    );
    expect(pickRecommendation(DEFAULTS, result({ flatDepletion: 0.04 })).preferConstant).toBe(true);
  });

  it("keeps the glide when its CE lead exceeds the threshold", () => {
    const r = pickRecommendation(DEFAULTS, result({ flatCeIncome: 55000 }));
    expect(r.preferConstant).toBe(false);
  });

  it("prefers the constant when it wins on CE and shortfall", () => {
    const r = pickRecommendation(DEFAULTS, result({ flatCeIncome: 58100, flatDepletion: 0.02 }));
    expect(r.preferConstant).toBe(true);
  });

  it("gates on spending CE, not the bequest-sensitive welfare CE", () => {
    // Rich plans: welfare CE gaps blow up near the CRRA bound while spending CE barely moves.
    const welfareGap = result({ welfareCe: 900000, flatWelfareCe: 780000 });
    expect(pickRecommendation(DEFAULTS, welfareGap).preferConstant).toBe(true);
  });

  it("prefers the constant for an over-funded tie", () => {
    const tie = result({ ceIncome: 60000, flatCeIncome: 60000, depletion: 0, flatDepletion: 0 });
    expect(pickRecommendation(DEFAULTS, tie).preferConstant).toBe(true);
  });

  it("is inconclusive when both CE scores are degenerate", () => {
    const noFloor = { ...DEFAULTS, guaranteedIncome: 0 };
    const r = pickRecommendation(noFloor, result({ ceIncome: 10, flatCeIncome: 12 }));
    expect(r.inconclusive).toBe(true);
  });

  it("compares a low CE normally when guaranteed income sets a real floor", () => {
    // Target far above the guaranteed income: CE near the floor is a real figure, not the
    // numerical-floor artifact.
    const input = { ...DEFAULTS, targetIncome: 300000, guaranteedIncome: 10000 };
    const r = pickRecommendation(input, result({ ceIncome: 12000, flatCeIncome: 11900 }));
    expect(r).toMatchObject({ inconclusive: false, glideBad: false, flatBad: false });
    expect(r.preferConstant).toBe(true);
  });
});

describe("ceIsDegenerate", () => {
  it("flags CE below max($1,000, 5% of target) without guaranteed income", () => {
    expect(ceIsDegenerate(2999, 60000, 0)).toBe(true);
    expect(ceIsDegenerate(3001, 60000, 0)).toBe(false);
    expect(ceIsDegenerate(999, 10000, 0)).toBe(true);
  });

  it("never flags a plan with a real guaranteed income", () => {
    expect(ceIsDegenerate(2999, 60000, 20000)).toBe(false);
    expect(ceIsDegenerate(12000, 300000, 10000)).toBe(false);
    expect(ceIsDegenerate(999, 60000, 999)).toBe(true);
  });
});
