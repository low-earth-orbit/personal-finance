/**
 * Glide-path recommender engine — TypeScript port of `analysis/glide_path/recommender.py`.
 *
 * Optimizes the equity weight at each interval step by Monte Carlo coordinate ascent under
 * common random numbers, maximizing expected discounted CRRA utility of retirement
 * consumption. Real (today's) dollars; nominal geometric curve means are converted to real
 * arithmetic means before sampling; mid-year cash flow earns a half-year; a depleted
 * portfolio absorbs at zero. Guaranteed income starts at `guaranteedStartAge` (the portfolio
 * funds the whole target before then; inside u(c) bridge consumption is floored at the
 * guaranteed amount). An optional bequest term θ·u(final balance + k) uses the same γ.
 * Supports leverage (equity weight > 1, borrowing at a real cost).
 *
 * Two sampling modes:
 *   "iid-mc" — iid normal returns from the forward-CMA curve (default; the no-recovery
 *     baseline — see docs/glide-path/methodology.md §3 and §3d).
 *   "forward-block" — stationary block bootstrap from JST pooled history rescaled to
 *     forward-CMA marginals (the historical-sequencing scenario).
 *
 * One simulation kernel (`simulatePaths`) serves the optimizer and the outcome stats. Intended to
 * run inside a Web Worker.
 */

import { fillNormals } from "./rng";
import { sampleBlockPaths } from "./blockBootstrap";
import { DEFAULT_ALLOC_CURVE, GRID_STEP, type AllocAnchor } from "./presets";
import { JST_BOND, JST_EQUITY } from "./jstData";
import { arithmeticToGeometric, realArithmeticFromNominalGeometric } from "@/utils/returns";
import type {
  GlidePathInput,
  GlidePathResult,
  GlidePathReturnMode,
  ScheduleBlock,
  SlopeDir,
} from "./types";

const FLOOR = 1.0; // numerical floor on consumption (real $); a numerical guard, not a
// spending-floor assumption (bridge years use floorArr instead)
const OVER_FUNDED_TOL = 0.005; // every constant within 0.5% of target CE and < 0.5% shortfall
const FLAT_BAND = 0.1; // |Δ equity| within this is "Flat"
const SEED = 0x9e3779b9;
const STATS_SEED = 0x85ebca6b;
const SELECT_SEED = 0xc2b2ae35;
const MIN_OPT_PATHS = 200;
export const MAX_OPT_PATHS = 50000;
const MAX_STATS_PATHS = 8000;

// ── small numeric helpers ─────────────────────────────────────────────────────
export { arithmeticToGeometric } from "@/utils/returns";

/** Linear interpolation on ascending `xs`, clamped at the endpoints. */
function interp(x: number, xs: number[], ys: number[]): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let hi = 1;
  while (hi < n && xs[hi] < x) hi++;
  const lo = hi - 1;
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

function ceFromUtil(u: number, gamma: number): number {
  if (Math.abs(gamma - 1) < 1e-9) return Math.exp(u);
  const x = (1 - gamma) * u;
  // Only reachable when a bequest gain pushes utility past the CRRA bound.
  if (x <= 0) return Infinity;
  return Math.pow(x, 1 / (1 - gamma));
}

/**
 * Index of the maximum; among (near-)exact ties, the middle one. An over-funded plan makes
 * every weight score identically, and a first-wins argmax would then report 0% equity.
 */
export function tieMiddleArgmax(values: ArrayLike<number>, rtol = 1e-12): number {
  let best = -Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] > best) best = values[i];
  const tied: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] >= best - rtol * Math.abs(best)) tied.push(i);
  }
  return tied[Math.floor(tied.length / 2)];
}

// ── return curve → per-grid (real arithmetic mean, vol) ───────────────────────
/**
 * Precompute (real mean, vol) for every grid weight. For w > 1 (leverage): borrow (w-1)
 * at the real `borrowCostPct` to hold w in the all-equity portfolio — real mean
 * w·eq − (w−1)·borrow, vol w·eqVol.
 */
function buildGridStats(
  grid: Float64Array,
  curve: AllocAnchor[],
  inflationPct: number,
  borrowCostPct: number,
): {
  gridMean: Float64Array;
  gridVol: Float64Array;
} {
  const sorted = [...curve].sort((a, b) => a[0] - b[0]);
  const cw = sorted.map((t) => t[0]);
  const stats = sorted.map((t) => realArithmeticFromNominalGeometric(t[1], t[2], inflationPct));
  const cmReal = stats.map((s) => s.mean);
  const cv = stats.map((s) => s.vol);
  const eqMean = interp(1, cw, cmReal);
  const eqVol = interp(1, cw, cv);
  const borrowReal = borrowCostPct / 100;

  const gridMean = new Float64Array(grid.length);
  const gridVol = new Float64Array(grid.length);
  for (let g = 0; g < grid.length; g++) {
    const w = grid[g];
    if (w > 1) {
      gridMean[g] = w * eqMean - (w - 1) * borrowReal;
      gridVol[g] = w * eqVol;
    } else {
      gridMean[g] = interp(w, cw, cmReal);
      gridVol[g] = interp(w, cw, cv);
    }
  }
  return { gridMean, gridVol };
}

// ── simulation context ────────────────────────────────────────────────────────
interface SimCtx {
  /** Sampling mode: "iid" = normal draws from curve; "block" = historical block paths. */
  mode: "iid" | "block";
  // iid mode — per-grid precomputed (mean, vol)
  gridMean: Float64Array;
  gridVol: Float64Array;
  /**
   * Per-grid geometric annual return of the sampled paths — what the deterministic
   * median-path projection should compound. iid: arithmetic-to-geometric conversion of the
   * sampled normal distribution. Block: geometric mean of the realized JST mix.
   */
  detMean: Float64Array;
  // block mode — equity weights per grid index + realized return paths
  grid: Float64Array;
  eqPaths: Float32Array; // [nYears * nPaths] row-major
  bdPaths: Float32Array; // [nYears * nPaths] row-major
  borrowReal: number; // real cost of leverage (fraction)
  // common
  accumYears: number;
  retireYears: number;
  disc: Float64Array; // beta^t, length retireYears
  gapArr: Float64Array; // portfolio-funded gap per retirement year
  guarArr: Float64Array; // guaranteed income per retirement year (0 before it starts)
  floorArr: Float64Array; // consumption floor inside u(c) per retirement year (bridge years)
  bequestWeight: number; // θ; 0 = money left at death is worth nothing
  bequestOffset: number; // k > 0 in u(final balance + k)
  flex: number;
  wr: number; // proportional withdrawal rate (fraction)
  contrib: number;
  startSavings: number;
  isLog: boolean; // gamma == 1
  oneMinusGamma: number;
  invOneMinusGamma: number;
}

/** Real portfolio return in simulation year `i` on path `p` for grid index `idx`. */
function portfolioReturn(
  ctx: SimCtx,
  idx: number,
  i: number,
  n: number,
  p: number,
  Z: Float64Array,
): number {
  if (ctx.mode === "block") {
    const w = ctx.grid[idx];
    const ep = ctx.eqPaths[i * n + p];
    return w > 1 ? w * ep - (w - 1) * ctx.borrowReal : w * ep + (1 - w) * ctx.bdPaths[i * n + p];
  }
  return ctx.gridMean[idx] + ctx.gridVol[idx] * Z[i * n + p];
}

/** Balance at retirement on path `p`: mid-year contributions; a negative balance floors at 0. */
function accumulate(yearIdx: Int32Array, ctx: SimCtx, Z: Float64Array, n: number, p: number) {
  let bal = ctx.startSavings;
  for (let i = 0; i < ctx.accumYears; i++) {
    const r = portfolioReturn(ctx, yearIdx[i], i, n, p, Z);
    const grown = bal * (1 + r);
    bal = (grown < 0 ? 0 : grown) + ctx.contrib * (1 + r / 2);
  }
  return bal;
}

interface PathTotals {
  /** Σ over paths of total utility (discounted consumption utility + bequest term). */
  utility: number;
  /** Σ over paths of discounted consumption utility only. */
  consUtility: number;
  /** Σ over paths of each path's coefficient of variation of retirement spending. */
  incomeCv: number;
  /** Paths with an income shortfall (a year the portfolio can't fund the target draw). */
  shortfalls: number;
}

/**
 * The single simulation kernel: run `n` paths of one per-year allocation (grid indices) and
 * sum their outcomes. `fixedStart` = a common retirement balance (the drawdown-only view);
 * `null` = accumulate each path from today.
 *
 * Each retirement year targets (1−flex)·gap + flex·wr·start-of-year balance, capped at what
 * the portfolio can afford; consumption = guaranteed income + withdrawal (floored at the
 * bridge floor before guaranteed income starts), scored by CRRA, plus θ·u(final balance + k).
 * `finals`, when given, receives each path's final balance. At flex=1 the target is a fraction of the live balance and always affordable, so shortfall
 * is ~0 by construction — judge tail risk there by CE income / income CV.
 */
function simulatePaths(
  yearIdx: Int32Array,
  ctx: SimCtx,
  Z: Float64Array,
  n: number,
  fixedStart: number | null,
  finals: Float64Array | null = null,
): PathTotals {
  const { accumYears, retireYears, disc, gapArr, guarArr, floorArr, flex, wr } = ctx;
  const { isLog, oneMinusGamma, invOneMinusGamma, bequestWeight, bequestOffset } = ctx;
  const crra = (c: number) => (isLog ? Math.log(c) : Math.pow(c, oneMinusGamma) * invOneMinusGamma);
  let utilitySum = 0;
  let consSum = 0;
  let cvSum = 0;
  let shortfalls = 0;
  for (let p = 0; p < n; p++) {
    let bal = fixedStart ?? accumulate(yearIdx, ctx, Z, n, p);
    let u = 0;
    let sumC = 0;
    let sumC2 = 0;
    let shortfall = false;
    for (let t = 0; t < retireYears; t++) {
      const i = accumYears + t;
      const r = portfolioReturn(ctx, yearIdx[i], i, n, p, Z);
      let grown = bal * (1 + r);
      if (grown < 0) grown = 0;
      const target = (1 - flex) * gapArr[t] + flex * (wr * bal);
      const afford = grown / (1 + r / 2);
      const wdr = target < afford ? target : afford;
      bal = grown - wdr * (1 + r / 2);
      let c = guarArr[t] + wdr;
      if (c < floorArr[t]) c = floorArr[t];
      if (c < FLOOR) c = FLOOR;
      u += disc[t] * crra(c);
      sumC += c;
      sumC2 += c * c;
      if (wdr < target) shortfall = true;
    }
    consSum += u;
    utilitySum += bequestWeight > 0 ? u + bequestWeight * crra(bal + bequestOffset) : u;
    if (finals) finals[p] = bal;
    const mean = sumC / retireYears;
    const variance = sumC2 / retireYears - mean * mean;
    cvSum += (variance > 0 ? Math.sqrt(variance) : 0) / mean;
    if (shortfall) shortfalls++;
  }
  return { utility: utilitySum, consUtility: consSum, incomeCv: cvSum, shortfalls };
}

/** Mean total utility (consumption + bequest) — the optimizer's objective. */
function meanUtility(yearIdx: Int32Array, ctx: SimCtx, Z: Float64Array, n: number): number {
  return simulatePaths(yearIdx, ctx, Z, n, null).utility / n;
}

interface PathStats {
  ceIncome: number;
  /** CE including the bequest gain over leaving nothing (= ceIncome when θ = 0). */
  welfareCe: number;
  /** Mean total utility, the objective the flat comparator is chosen on. */
  meanUtility: number;
  /** Fraction of paths with an income shortfall. */
  depletion: number;
  incomeCv: number;
}

function toStats(totals: PathTotals, ctx: SimCtx, n: number, gamma: number): PathStats {
  let discSum = 0;
  for (let t = 0; t < ctx.retireYears; t++) discSum += ctx.disc[t];
  const { bequestWeight: theta, bequestOffset: k } = ctx;
  const leaveNothing =
    theta > 0
      ? theta * (ctx.isLog ? Math.log(k) : Math.pow(k, ctx.oneMinusGamma) * ctx.invOneMinusGamma)
      : 0;
  return {
    ceIncome: ceFromUtil(totals.consUtility / n / discSum, gamma),
    welfareCe: ceFromUtil((totals.utility / n - leaveNothing) / discSum, gamma),
    meanUtility: totals.utility / n,
    depletion: totals.shortfalls / n,
    incomeCv: totals.incomeCv / n,
  };
}

/** Out-of-sample outcome stats for a fixed per-year path, simulated from today. */
function computeStats(
  yearIdx: Int32Array,
  ctx: SimCtx,
  Z: Float64Array,
  n: number,
  gamma: number,
): PathStats {
  return toStats(simulatePaths(yearIdx, ctx, Z, n, null), ctx, n, gamma);
}

/** `computeStats` plus the median balance left at the end of the plan. */
function computeStatsWithBequest(
  yearIdx: Int32Array,
  ctx: SimCtx,
  Z: Float64Array,
  n: number,
  gamma: number,
): PathStats & { medianBequest: number } {
  const finals = new Float64Array(n);
  const stats = toStats(simulatePaths(yearIdx, ctx, Z, n, null, finals), ctx, n, gamma);
  finals.sort();
  const mid = n >> 1;
  const medianBequest = n % 2 ? finals[mid] : (finals[mid - 1] + finals[mid]) / 2;
  return { ...stats, medianBequest };
}

/** Median-path balance at retirement: compounds each year's geometric return. */
function deterministicAccumBalance(yearIdx: Int32Array, ctx: SimCtx): number {
  const { detMean, accumYears, contrib, startSavings } = ctx;
  let bal = startSavings;
  for (let i = 0; i < accumYears; i++) {
    const r = detMean[yearIdx[i]];
    const grown = bal * (1 + r);
    bal = (grown < 0 ? 0 : grown) + contrib * (1 + r / 2);
  }
  return bal;
}

/** Geometric mean annual return of a weight's mix over the JST bundle rows. */
function historyGeometricMix(weight: number, borrowReal: number): number {
  let logSum = 0;
  for (let i = 0; i < JST_EQUITY.length; i++) {
    const mix =
      weight > 1
        ? weight * JST_EQUITY[i] - (weight - 1) * borrowReal
        : weight * JST_EQUITY[i] + (1 - weight) * JST_BOND[i];
    logSum += Math.log1p(Math.max(mix, -0.999999));
  }
  return Math.expm1(logSum / JST_EQUITY.length);
}

/**
 * Retirement-only stats starting every path from the median (geometric-growth) retirement
 * balance; `computeStats` is the full path from today including accumulation market luck.
 */
function computeDrawdownStats(
  yearIdx: Int32Array,
  ctx: SimCtx,
  Z: Float64Array,
  n: number,
  gamma: number,
): PathStats & { startBalance: number } {
  const startBalance = deterministicAccumBalance(yearIdx, ctx);
  return {
    ...toStats(simulatePaths(yearIdx, ctx, Z, n, startBalance), ctx, n, gamma),
    startBalance,
  };
}

// ── coordinate ascent ─────────────────────────────────────────────────────────
function optimize(
  ctx: SimCtx,
  Z: Float64Array,
  n: number,
  blockStart: Int32Array,
  blockEnd: Int32Array,
  blockOfYear: Int32Array,
  maxGridByBlock: Int32Array,
  maxPasses: number,
): Int32Array {
  const nYears = ctx.accumYears + ctx.retireYears;
  const nBlocks = blockStart.length;
  const yearIdx = new Int32Array(nYears);

  // Flat init: the best single weight applied to every year (shape-neutral start); exact
  // ties take the middle tied weight.
  const maxFlatG = Math.min(...Array.from(maxGridByBlock));
  const flatU = new Float64Array(maxFlatG + 1);
  for (let g = 0; g <= maxFlatG; g++) {
    yearIdx.fill(g);
    flatU[g] = meanUtility(yearIdx, ctx, Z, n);
  }
  const bestFlatG = tieMiddleArgmax(flatU);
  const blockIdx = new Int32Array(nBlocks).fill(bestFlatG);
  for (let i = 0; i < nYears; i++) yearIdx[i] = blockIdx[blockOfYear[i]];

  for (let pass = 0; pass < maxPasses; pass++) {
    const forward = pass % 2 === 0;
    let changed = false;
    for (let k = 0; k < nBlocks; k++) {
      const b = forward ? k : nBlocks - 1 - k;
      const s = blockStart[b];
      const e = blockEnd[b];
      const currentG = blockIdx[b];
      for (let i = s; i < e; i++) yearIdx[i] = currentG;
      const currentU = meanUtility(yearIdx, ctx, Z, n);
      const tol = 1e-12 * Math.abs(currentU); // relative: CRRA utilities can be ~1e-14
      let bestU = currentU;
      let bestG = currentG;
      for (let g = 0; g <= maxGridByBlock[b]; g++) {
        for (let i = s; i < e; i++) yearIdx[i] = g;
        const u = meanUtility(yearIdx, ctx, Z, n);
        if (u > bestU + tol) {
          bestU = u;
          bestG = g;
        }
      }
      for (let i = s; i < e; i++) yearIdx[i] = bestG;
      if (bestG !== blockIdx[b]) {
        blockIdx[b] = bestG;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return blockIdx;
}

function expand(blockIdx: Int32Array, blockOfYear: Int32Array, nYears: number): Int32Array {
  const yearIdx = new Int32Array(nYears);
  for (let i = 0; i < nYears; i++) yearIdx[i] = blockIdx[blockOfYear[i]];
  return yearIdx;
}

function classify(d: number): SlopeDir {
  return d > FLAT_BAND ? "Rising" : d < -FLAT_BAND ? "Falling" : "Flat";
}

function clampPathCount(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Regular search grid that never exceeds the requested cap. */
export function buildEquityGrid(maxLeverage: number): Float64Array {
  const fullSteps = Math.floor((maxLeverage + 1e-9) / GRID_STEP);
  const grid = new Float64Array(fullSteps + 1);

  for (let g = 0; g <= fullSteps; g++) grid[g] = Math.round(g * GRID_STEP * 1e6) / 1e6;

  return grid;
}

// ── public entry point ────────────────────────────────────────────────────────
/**
 * Recommend the welfare-maximizing equity glide path for the given inputs. Pure and
 * deterministic for a given `seed`. `seed = 0` is the canonical draw; bumping it reseeds the
 * Monte Carlo to a different-but-reproducible draw (the opt-in "re-roll"). Runs the optimizer
 * and the out-of-sample stats. Intended to be called from the Web Worker.
 *
 * `returnMode`:
 *   "iid-mc" (default) — iid normal draws from the forward-CMA curve. The conservative
 *     no-recovery baseline; forward-block's flat-100% depends on the full-sample joint
 *     sequence structure (see methodology §3c–§3d for the era cuts and CE regret).
 *   "forward-block" — stationary block bootstrap from JST pooled history rescaled to
 *     forward-CMA marginals. Captures sequence risk (mean reversion, bond persistence)
 *     while honoring the user's return assumptions — the historical-sequencing scenario.
 */
export function recommendGlidePath(
  input: GlidePathInput,
  curve: AllocAnchor[] = DEFAULT_ALLOC_CURVE,
  seed = 0,
  returnMode: GlidePathReturnMode = "iid-mc",
): GlidePathResult {
  const accumYears = Math.max(1, Math.round(input.retirementAge - input.startAge));
  const retireYears = Math.max(1, Math.round(input.planningAge - input.retirementAge));
  const nYears = accumYears + retireYears;
  // The UI accepts whole years; normalize defensively for callers that bypass form validation.
  const interval = Math.min(10, Math.max(1, Math.round(input.interval)));
  const gamma = input.gamma;
  const maxLeverage = Math.max(GRID_STEP, input.maxEquityPct / 100);
  const retirementMaxLeverage = Math.min(
    maxLeverage,
    Math.max(0, (input.retirementMaxEquityPct ?? input.maxEquityPct) / 100),
  );

  // Grid of candidate equity weights 0..maxLeverage (weights > 1 are leveraged).
  const grid = buildEquityGrid(maxLeverage);
  const G = grid.length;
  const { gridMean, gridVol } = buildGridStats(grid, curve, input.inflation, input.borrowCost);

  // Guaranteed income starts `guaranteedDelay` years into retirement; the target is gross, so
  // the portfolio funds the whole target before then and the gap after. Bridge consumption
  // inside u(c) is floored at the guaranteed amount (shortfall is still counted).
  const guaranteed = input.guaranteedIncome;
  const guaranteedDelay = Math.max(
    0,
    Math.round((input.guaranteedStartAge ?? input.retirementAge) - input.retirementAge),
  );
  const guarArr = new Float64Array(retireYears);
  const gapArr = new Float64Array(retireYears);
  const floorArr = new Float64Array(retireYears);
  for (let t = 0; t < retireYears; t++) {
    const started = t >= guaranteedDelay;
    guarArr[t] = started ? guaranteed : 0;
    floorArr[t] = started ? 0 : guaranteed;
    gapArr[t] = Math.max(input.targetIncome - guarArr[t], 0);
  }
  const bequestWeight = Math.max(0, input.bequestWeight ?? 0);
  const disc = new Float64Array(retireYears);
  for (let t = 0; t < retireYears; t++) disc[t] = Math.pow(input.beta, t);

  // Block layout: equity is constant within each interval block; the last absorbs the remainder.
  // Do not let a 5-year block straddle retirement: the retirement ceiling applies to
  // every retirement year, without unnecessarily limiting the preceding working years.
  const starts: number[] = [];
  const ends: number[] = [];
  for (let start = 0; start < nYears; ) {
    const phaseEnd = start < accumYears ? accumYears : nYears;
    const end = Math.min(start + interval, phaseEnd);
    starts.push(start);
    ends.push(end);
    start = end;
  }
  const nBlocks = starts.length;
  const blockOfYear = new Int32Array(nYears);
  const blockStart = Int32Array.from(starts);
  const blockEnd = Int32Array.from(ends);
  const retirementMaxGrid = Math.floor((retirementMaxLeverage + 1e-9) / GRID_STEP);
  const maxGridByBlock = new Int32Array(nBlocks);
  for (let b = 0; b < nBlocks; b++) {
    maxGridByBlock[b] = blockStart[b] < accumYears ? G - 1 : retirementMaxGrid;
    for (let year = blockStart[b]; year < blockEnd[b]; year++) blockOfYear[year] = b;
  }

  const nOpt = clampPathCount(input.numPaths, MIN_OPT_PATHS, MAX_OPT_PATHS);
  const nStats = MAX_STATS_PATHS;
  const passes = 6;
  // Offset all seeds by the re-roll nonce so a new draw is independent yet reproducible.
  // seed = 0 leaves the base seeds untouched (the canonical draw).
  const optSeed = (SEED + Math.imul(seed, 0x9e3779b9)) >>> 0;
  const statsSeed = (STATS_SEED + Math.imul(seed, 0x85ebca6b)) >>> 0;
  const selectSeed = (SELECT_SEED + Math.imul(seed, 0x27d4eb2f)) >>> 0;

  // Build mode-specific samples for optimization, stats, and flat-comparator selection.
  // iid: Box-Muller normals; block: stationary bootstrap from pre-rescaled JST history.
  const isBlock = returnMode === "forward-block";
  const borrowReal = input.borrowCost / 100;
  let Z: Float64Array;
  let Zf: Float64Array;
  let Zs: Float64Array;
  let optEqPaths: Float32Array;
  let optBdPaths: Float32Array;
  let stEqPaths: Float32Array;
  let stBdPaths: Float32Array;
  let selEqPaths: Float32Array;
  let selBdPaths: Float32Array;

  if (isBlock) {
    Z = new Float64Array(0);
    Zf = new Float64Array(0);
    Zs = new Float64Array(0);
    ({ eqPaths: optEqPaths, bdPaths: optBdPaths } = sampleBlockPaths(nYears, nOpt, optSeed));
    ({ eqPaths: stEqPaths, bdPaths: stBdPaths } = sampleBlockPaths(nYears, nStats, statsSeed));
    ({ eqPaths: selEqPaths, bdPaths: selBdPaths } = sampleBlockPaths(nYears, nStats, selectSeed));
  } else {
    Z = fillNormals(optSeed, nYears * nOpt);
    Zf = fillNormals(statsSeed, nYears * nStats);
    Zs = fillNormals(selectSeed, nYears * nStats);
    optEqPaths = new Float32Array(0);
    optBdPaths = new Float32Array(0);
    stEqPaths = new Float32Array(0);
    stBdPaths = new Float32Array(0);
    selEqPaths = new Float32Array(0);
    selBdPaths = new Float32Array(0);
  }

  // The deterministic projection compounds the geometric (median-path) growth of whatever
  // the engine actually samples: arithmetic-to-geometric iid returns, or realized geometric
  // means of the JST annual mix under block mode.
  const detMean = new Float64Array(G);
  for (let g = 0; g < G; g++) {
    detMean[g] = arithmeticToGeometric(gridMean[g], gridVol[g]);
  }
  if (isBlock) {
    for (let g = 0; g < G; g++) {
      detMean[g] = historyGeometricMix(grid[g], borrowReal);
    }
  }

  // Build the optimization context (opt paths), stats context (stats paths), and the
  // flat-selection context. The three share everything except the sampled paths.
  const ctxBase = {
    mode: isBlock ? ("block" as const) : ("iid" as const),
    gridMean,
    gridVol,
    detMean,
    grid,
    borrowReal,
    accumYears,
    retireYears,
    disc,
    gapArr,
    guarArr,
    floorArr,
    bequestWeight,
    // k ≈ one year of target spending keeps u finite when nothing is left.
    bequestOffset: Math.max(1, input.targetIncome),
    flex: input.flexibility,
    wr: input.withdrawalRate / 100,
    contrib: input.annualContribution,
    startSavings: input.startSavings,
    isLog: Math.abs(gamma - 1) < 1e-9,
    oneMinusGamma: 1 - gamma,
    invOneMinusGamma: 1 / (1 - gamma),
  };
  const ctx: SimCtx = {
    ...ctxBase,
    eqPaths: optEqPaths,
    bdPaths: optBdPaths,
  };
  const ctxStats: SimCtx = {
    ...ctxBase,
    eqPaths: stEqPaths,
    bdPaths: stBdPaths,
  };
  const ctxSelect: SimCtx = {
    ...ctxBase,
    eqPaths: selEqPaths,
    bdPaths: selBdPaths,
  };

  // ── optimization + out-of-sample stats ───────────────────────────────────────
  const blockIdx = optimize(
    ctx,
    Z,
    nOpt,
    blockStart,
    blockEnd,
    blockOfYear,
    maxGridByBlock,
    passes,
  );
  const yearIdx = expand(blockIdx, blockOfYear, nYears);
  const weights: number[] = [];
  for (let i = 0; i < nYears; i++) weights.push(grid[yearIdx[i]]);

  const st = computeStatsWithBequest(yearIdx, ctxStats, Zf, nStats, gamma);
  const drawdownSt = computeDrawdownStats(yearIdx, ctxStats, Zf, nStats, gamma);

  // ── best single constant (flat) equity weight ────────────────────────────────
  // The glide path's edge over the best *constant* allocation is typically tiny, so we
  // report that simpler alternative for the UI to quantify the gap and recommend the
  // behaviorally-stickier flat weight. Choose it on its own selection sample, independent
  // of both the optimization sample (tail-sensitive utility plus leverage can overfit
  // rare bad paths and pick a fragile constant weight) and the stats sample (an argmax
  // over candidates on the scoring draw would hand the flat comparator a selection
  // advantage over the fixed glide). The winner is then scored on the same stats sample
  // as the glide. The raw optimized glide is still returned and charted; the UI can
  // recommend this flatter comparator when it is materially better. Exact ties (an
  // over-funded plan) take the middle tied weight rather than 0%.
  const flatIdx = new Int32Array(nYears);
  const flatU = new Float64Array(retirementMaxGrid + 1);
  let overFunded = bequestWeight === 0;
  for (let g = 0; g <= retirementMaxGrid; g++) {
    flatIdx.fill(g);
    const candidate = computeStats(flatIdx, ctxSelect, Zs, nStats, gamma);
    flatU[g] = candidate.meanUtility;
    if (
      Math.abs(candidate.ceIncome / input.targetIncome - 1) > OVER_FUNDED_TOL ||
      candidate.depletion >= OVER_FUNDED_TOL
    ) {
      overFunded = false;
    }
  }
  const bestFlatG = tieMiddleArgmax(flatU);
  flatIdx.fill(bestFlatG);
  const flatStats = computeStatsWithBequest(flatIdx, ctxStats, Zf, nStats, gamma);
  const flatDrawdownStats = computeDrawdownStats(flatIdx, ctxStats, Zf, nStats, gamma);
  const initialTargetDraw =
    (1 - input.flexibility) * gapArr[0] +
    input.flexibility * (input.withdrawalRate / 100) * drawdownSt.startBalance;
  const fundingRatio =
    drawdownSt.startBalance > 0 ? initialTargetDraw / drawdownSt.startBalance : null;

  // ── schedule + shape descriptors ─────────────────────────────────────────────
  const schedule: ScheduleBlock[] = [];
  for (let b = 0; b < nBlocks; b++) {
    const yearStart = blockStart[b];
    const yearEnd = blockEnd[b] - 1;
    schedule.push({
      step: b,
      yearStart,
      yearEnd,
      ageStart: input.startAge + yearStart,
      phase: yearStart < accumYears ? "accum" : "retire",
      equityPct: Math.round(grid[blockIdx[b]] * 1000) / 10,
    });
  }

  const acc = weights.slice(0, accumYears);
  const ret = weights.slice(accumYears);
  const twin = Math.min(15, retireYears);
  let tentI = 0;
  for (let i = 1; i < twin; i++) if (ret[i] < ret[tentI]) tentI = i;
  // Classify a phase by its first-to-last change. At flex=1 the last-year allocation does not
  // affect the objective; ties are kept at the incoming value. At flex<1 the end value is a
  // genuine optimum of the horizon. Keep the final-year trim for slope classification.
  const slope = (w: number[], trimLast: boolean): SlopeDir => {
    const eff = trimLast && w.length >= 3 ? w.slice(0, -1) : w;
    return eff.length >= 2 ? classify(eff[eff.length - 1] - eff[0]) : "n/a";
  };
  const accumDir = slope(acc, false);
  const retireDir = slope(ret, true);

  return {
    schedule,
    equityByYear: weights.map((w) => Math.round(w * 1e4) / 1e4),
    accumDir,
    retireDir,
    tentPct: retireYears ? Math.round(ret[tentI] * 1000) / 10 : null,
    tentAge: retireYears ? input.startAge + accumYears + tentI : null,
    ceIncome: Math.round(st.ceIncome),
    flatEquityPct: Math.round(grid[bestFlatG] * 1000) / 10,
    flatCeIncome: Math.round(flatStats.ceIncome),
    welfareCe: Number.isFinite(st.welfareCe) ? Math.round(st.welfareCe) : null,
    flatWelfareCe: Number.isFinite(flatStats.welfareCe) ? Math.round(flatStats.welfareCe) : null,
    medianBequest: Math.round(st.medianBequest),
    flatMedianBequest: Math.round(flatStats.medianBequest),
    overFunded,
    depletion: Math.round(st.depletion * 1e4) / 1e4,
    drawdownDepletion: Math.round(drawdownSt.depletion * 1e4) / 1e4,
    expectedRetirementBalance: Math.round(drawdownSt.startBalance),
    initialTargetDraw: Math.round(initialTargetDraw),
    fundingRatio: fundingRatio === null ? null : Math.round(fundingRatio * 1e4) / 1e4,
    flatDepletion: Math.round(flatStats.depletion * 1e4) / 1e4,
    flatDrawdownDepletion: Math.round(flatDrawdownStats.depletion * 1e4) / 1e4,
    incomeCv: Math.round(st.incomeCv * 1e4) / 1e4,
    params: {
      accumYears,
      retireYears,
      guaranteed,
      guaranteedDelay,
      bequestWeight,
      maxLeverage,
      retirementMaxLeverage,
      borrowCost: input.borrowCost,
      gamma,
      interval,
      returnMode,
    },
  };
}
