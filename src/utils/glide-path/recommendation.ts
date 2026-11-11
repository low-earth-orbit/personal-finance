/**
 * Which allocation the glide-path tool recommends: the optimized glide or its best constant
 * weight. Both come from the same simulation; the rule only adds a simplicity bias inside the
 * model's own uncertainty (see docs/glide-path/methodology.md §1.5).
 */
import type { GlidePathInput, GlidePathResult } from "./types";

// Simplicity rule: recommend the constant weight unless the glide beats it by more than 3% on
// CE income or by more than 1 point on full-path shortfall. A bequest weight enters the
// objective that picks both allocations, but the gate compares spending CE only: welfare CE
// inverts u near the CRRA bound for well-funded plans, where tiny utility gaps (and Monte Carlo
// noise) become large CE gaps.
// Calibration (methodology §1.5, §2e, §3d): the glide's out-of-sample CE edge is typically
// ≤ ~0.5%, while the era/mode brackets move CE by 2–3%. A 72-case input grid (both return
// modes, savings $100k–$800k, target $50k/$75k, flex 0/0.5/1, γ 3/6, two seeds each, 2026-11)
// gave a largest glide edge of 1.7% and seed-to-seed swings of up to 2.3%; every CE threshold
// ≥ 2% gave the same seed-stable picks, and the constant never added more than 0.3pp full-path
// shortfall.
export const SIMPLICITY_CE_THRESHOLD = 0.03;
export const SIMPLICITY_SHORTFALL_THRESHOLD = 0.01;
export const DRAWDOWN_RISK_HIGHLIGHT_THRESHOLD = 0.15;
export const FULLPATH_RISK_HIGHLIGHT_THRESHOLD = 0.3;
export const LOW_DRAWDOWN_SHORTFALL_THRESHOLD = 0.05;

/** Guaranteed income below this (real $/yr) leaves consumption free to hit the numerical floor. */
const DEGENERATE_CE_FLOOR = 1000;

/**
 * A CE income this far below the target is the FLOOR=1 / CRRA artifact (the certainty-equivalent
 * collapses toward zero when consumption hits the floor in a meaningful share of paths), not a
 * real planning figure. We use it to suppress percentage comparisons against a degenerate
 * denominator; the shortfall rate is the pass/fail signal.
 *
 * The artifact needs guaranteed income near zero. With a real guaranteed income, consumption
 * never falls below it (bridge years included), so a low CE is a real figure for a plan that
 * mostly lives on that income. The web app requires at least $10,000, so this guards direct
 * engine callers.
 */
export function ceIsDegenerate(
  income: number,
  targetIncome: number,
  guaranteedIncome: number,
): boolean {
  if (guaranteedIncome >= DEGENERATE_CE_FLOOR) return false;
  return income < Math.max(DEGENERATE_CE_FLOOR, 0.05 * targetIncome);
}

export interface Recommendation {
  preferConstant: boolean;
  inconclusive: boolean;
  glideBad: boolean;
  flatBad: boolean;
}

/**
 * Decide which allocation to recommend. The constant weight is the default; the glide is
 * recommended only when it is clearly better (above either simplicity threshold). When both CE
 * scores are tail-dominated the comparison is inconclusive; when only one is, prefer the
 * allocation that avoids the near-zero-income tail.
 */
export function pickRecommendation(input: GlidePathInput, result: GlidePathResult): Recommendation {
  const glideBad = ceIsDegenerate(result.ceIncome, input.targetIncome, input.guaranteedIncome);
  const flatBad = ceIsDegenerate(result.flatCeIncome, input.targetIncome, input.guaranteedIncome);
  if (glideBad && flatBad) {
    return { preferConstant: false, inconclusive: true, glideBad, flatBad };
  }
  if (glideBad || flatBad) {
    return { preferConstant: glideBad, inconclusive: false, glideBad, flatBad };
  }

  const glideBetter =
    result.ceIncome > result.flatCeIncome * (1 + SIMPLICITY_CE_THRESHOLD) ||
    result.depletion < result.flatDepletion - SIMPLICITY_SHORTFALL_THRESHOLD;

  return { preferConstant: !glideBetter, inconclusive: false, glideBad, flatBad };
}
