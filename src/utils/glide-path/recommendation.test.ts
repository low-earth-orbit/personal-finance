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

  it("keeps the glide when the constant adds meaningful shortfall risk", () => {
    const r = pickRecommendation(DEFAULTS, result({ flatDrawdownDepletion: 0.02 }));
    expect(r.preferConstant).toBe(false);
  });

  it("keeps the glide when its CE lead exceeds the threshold", () => {
    const r = pickRecommendation(DEFAULTS, result({ flatCeIncome: 55000 }));
    expect(r.preferConstant).toBe(false);
  });

  it("prefers the constant whenever it wins on CE outright", () => {
    const r = pickRecommendation(DEFAULTS, result({ flatCeIncome: 58100, flatDepletion: 0.2 }));
    expect(r.preferConstant).toBe(true);
  });

  it("is inconclusive when both CE scores are degenerate", () => {
    const r = pickRecommendation(DEFAULTS, result({ ceIncome: 10, flatCeIncome: 12 }));
    expect(r.inconclusive).toBe(true);
  });
});

describe("ceIsDegenerate", () => {
  it("flags CE below max($1,000, 5% of target)", () => {
    expect(ceIsDegenerate(2999, 60000)).toBe(true);
    expect(ceIsDegenerate(3001, 60000)).toBe(false);
  });
});
