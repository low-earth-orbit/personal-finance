/**
 * Which allocation the glide-path tool recommends: the optimized glide or its best constant
 * weight. Both come from the same simulation; the rule only adds a simplicity bias inside the
 * model's own uncertainty (see docs/glide-path/methodology.md §1.5).
 */
import type { GlidePathInput, GlidePathResult } from "./types";

// Calibration (methodology §1.5, §2e, §3d). The glide's out-of-sample CE edge is typically
// ≤ ~0.5%, while the era/mode brackets move CE by 2–3%, so smaller CE gaps are inside the
// model's own uncertainty. A 72-case input grid (both return modes, savings $100k–$800k,
// target $50k/$75k, flex 0/0.5/1, γ 3/6, two seeds each, 2026-11) gave a largest glide edge
// of 1.7% and seed-to-seed swings in that edge of up to 2.3%. Every threshold ≥ 2% gave the
// same seed-stable picks; 1% flipped one case between seeds and 0% flipped ten. 3% keeps a
// margin above the worst swing. The shortfall gates carry the tail-risk veto; in that grid
// the constant never added more than 0.2pp drawdown or 0.3pp full-path shortfall.
export const SIMPLICITY_CE_THRESHOLD = 0.03;
export const SIMPLICITY_DRAWDOWN_THRESHOLD = 0.005;
export const SIMPLICITY_FULLPATH_THRESHOLD = 0.015;
export const DRAWDOWN_RISK_HIGHLIGHT_THRESHOLD = 0.15;
export const FULLPATH_RISK_HIGHLIGHT_THRESHOLD = 0.3;
export const LOW_DRAWDOWN_SHORTFALL_THRESHOLD = 0.05;

/**
 * A CE income this far below the target is the FLOOR=1 / CRRA artifact (the certainty-equivalent
 * collapses toward zero when consumption hits the floor in a meaningful share of paths), not a
 * real planning figure. We use it to suppress percentage comparisons against a degenerate
 * denominator; the shortfall rate is the pass/fail signal.
 */
export function ceIsDegenerate(income: number, targetIncome: number): boolean {
  return income < Math.max(1000, 0.05 * targetIncome);
}

export interface Recommendation {
  preferConstant: boolean;
  inconclusive: boolean;
  glideBad: boolean;
  flatBad: boolean;
}

/**
 * Decide which allocation to recommend. Bias toward the simpler constant weight when it wins all
 * comparable outcomes or comes within the simplicity threshold on CE income, drawdown shortfall,
 * or full-path shortfall. When both CE scores are tail-dominated, the comparison is inconclusive;
 * when only one is, prefer the allocation that avoids the near-zero-income tail.
 */
export function pickRecommendation(input: GlidePathInput, result: GlidePathResult): Recommendation {
  const glideBad = ceIsDegenerate(result.ceIncome, input.targetIncome);
  const flatBad = ceIsDegenerate(result.flatCeIncome, input.targetIncome);
  if (glideBad && flatBad) {
    return { preferConstant: false, inconclusive: true, glideBad, flatBad };
  }
  if (glideBad) {
    return { preferConstant: true, inconclusive: false, glideBad, flatBad };
  }
  if (flatBad) {
    return { preferConstant: false, inconclusive: false, glideBad, flatBad };
  }

  const ceWithin = result.flatCeIncome >= result.ceIncome * (1 - SIMPLICITY_CE_THRESHOLD);
  const drawdownWithin =
    result.flatDrawdownDepletion <= result.drawdownDepletion + SIMPLICITY_DRAWDOWN_THRESHOLD;
  const fullPathWithin = result.flatDepletion <= result.depletion + SIMPLICITY_FULLPATH_THRESHOLD;
  const constantWinsCe = result.flatCeIncome > result.ceIncome;
  const preferConstant = constantWinsCe || (ceWithin && drawdownWithin && fullPathWithin);

  return { preferConstant, inconclusive: false, glideBad, flatBad };
}
