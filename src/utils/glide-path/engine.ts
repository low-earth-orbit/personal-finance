/**
 * Glide-path recommender engine — TypeScript port of `analysis/glide_path/recommender.py`.
 *
 * Optimizes the equity weight at each interval step by Monte Carlo coordinate ascent under
 * common random numbers, maximizing expected discounted CRRA utility of retirement
 * consumption. Real (today's) dollars; mid-year cash flow earns a half-year; a depleted
 * portfolio absorbs at zero. Guaranteed income is paid every retirement year. Supports
 * leverage (equity weight > 1, borrowing at a real cost).
 *
 * Two sampling modes:
 *   "iid-mc" — iid normal returns from the forward-CMA curve (default; the regime-robust
 *     recommendation — see docs/glide-path/methodology.md §2f robustness).
 *   "forward-block" — stationary block bootstrap from JST pooled history rescaled to
 *     forward-CMA marginals (the historical-sequencing scenario).
 *
 * The hot path (`meanUtility`) is specialized per mode. Intended to run inside a Web Worker.
 */

import { fillNormals } from "./rng";
import { sampleBlockPaths } from "./blockBootstrap";
import {
  DEFAULT_ALLOC_CURVE,
  GRID_STEP,
  WEB_GLIDE_INTERVAL,
  type AllocAnchor,
} from "./presets";
import type {
  GlidePathInput,
  GlidePathResult,
  GlidePathReturnMode,
  ScheduleBlock,
  SlopeDir,
} from "./types";

const FLOOR = 1.0; // numerical floor on consumption (real $); a numerical guard, not a
// spending-floor assumption (consumption can't approach it while guaranteed income is paid)
const FLAT_BAND = 0.1; // |Δ equity| within this is "Flat"
const SEED = 0x9e3779b9;
const STATS_SEED = 0x85ebca6b;
const SELECT_SEED = 0xc2b2ae35;
const MIN_OPT_PATHS = 200;
export const MAX_OPT_PATHS = 50000;
const MAX_STATS_PATHS = 8000;

// ── small numeric helpers ─────────────────────────────────────────────────────
function realMean(nominalPct: number, inflationPct: number): number {
  return (1 + nominalPct / 100) / (1 + inflationPct / 100) - 1;
}

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
  return Math.pow((1 - gamma) * u, 1 / (1 - gamma));
}

// ── return curve → per-grid (real mean, vol) ──────────────────────────────────
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
  eqMean: number;
  bondMean: number;
} {
  const sorted = [...curve].sort((a, b) => a[0] - b[0]);
  const cw = sorted.map((t) => t[0]);
  const cmReal = sorted.map((t) => realMean(t[1], inflationPct));
  const cv = sorted.map((t) => t[2] / 100);
  const eqMean = interp(1, cw, cmReal);
  const eqVol = interp(1, cw, cv);
  const bondMean = interp(0, cw, cmReal);
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
  return { gridMean, gridVol, eqMean, bondMean };
}

// ── simulation context ────────────────────────────────────────────────────────
interface SimCtx {
  /** Sampling mode: "iid" = normal draws from curve; "block" = historical block paths. */
  mode: "iid" | "block";
  // iid mode — per-grid precomputed (mean, vol)
  gridMean: Float64Array;
  gridVol: Float64Array;
  /**
   * Per-grid expected annual return of the sampled paths — what the deterministic
   * mean-return projection should compound. iid: same as gridMean (the curve). Block: the
   * linear stock/bond mix of the rescaled-history anchor means (the block data's actual
   * means), matching the Python recommender's market.mean_returns.
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
  guarArr: Float64Array; // guaranteed income per retirement year
  flex: number;
  wr: number; // proportional withdrawal rate (fraction)
  contrib: number;
  startSavings: number;
  isLog: boolean; // gamma == 1
  oneMinusGamma: number;
  invOneMinusGamma: number;
}

/**
 * Mean discounted utility over `n` paths for a per-year grid-index path. The single
 * inner kernel for both the flat init and the per-block grid search.
 */
function meanUtility(
  yearIdx: Int32Array,
  ctx: SimCtx,
  Z: Float64Array,
  n: number,
): number {
  const {
    mode,
    gridMean,
    gridVol,
    grid,
    eqPaths,
    bdPaths,
    borrowReal,
    accumYears,
    retireYears,
    disc,
    gapArr,
    guarArr,
    flex,
    wr,
    contrib,
    startSavings,
    isLog,
    oneMinusGamma,
    invOneMinusGamma,
  } = ctx;
  const isBlock = mode === "block";
  let sum = 0;
  for (let p = 0; p < n; p++) {
    let bal = startSavings;
    for (let i = 0; i < accumYears; i++) {
      const idx = yearIdx[i];
      let r: number;
      if (isBlock) {
        const w = grid[idx];
        const ep = eqPaths[i * n + p];
        const bp = bdPaths[i * n + p];
        r = w > 1 ? w * ep - (w - 1) * borrowReal : w * ep + (1 - w) * bp;
      } else {
        r = gridMean[idx] + gridVol[idx] * Z[i * n + p];
      }
      const grown = bal * (1 + r);
      bal = (grown < 0 ? 0 : grown) + contrib * (1 + r / 2);
    }
    let eu = 0;
    for (let t = 0; t < retireYears; t++) {
      const i = accumYears + t;
      const idx = yearIdx[i];
      let r: number;
      if (isBlock) {
        const w = grid[idx];
        const ep = eqPaths[i * n + p];
        const bp = bdPaths[i * n + p];
        r = w > 1 ? w * ep - (w - 1) * borrowReal : w * ep + (1 - w) * bp;
      } else {
        r = gridMean[idx] + gridVol[idx] * Z[i * n + p];
      }
      let grown = bal * (1 + r);
      if (grown < 0) grown = 0;
      const target = (1 - flex) * gapArr[t] + flex * (wr * bal);
      const afford = grown / (1 + r / 2);
      const wdr = target < afford ? target : afford;
      bal = grown - wdr * (1 + r / 2);
      let c = guarArr[t] + wdr;
      if (c < FLOOR) c = FLOOR;
      eu +=
        disc[t] *
        (isLog ? Math.log(c) : Math.pow(c, oneMinusGamma) * invOneMinusGamma);
    }
    sum += eu;
  }
  return sum / n;
}

interface PathStats {
  ceIncome: number;
  /** Fraction of paths with an income shortfall (a year the portfolio can't fund the target draw). */
  depletion: number;
  incomeCv: number;
}

interface DrawdownStats extends PathStats {
  startBalance: number;
}

/** Out-of-sample outcome stats for a fixed per-year path (CE income, shortfall rate, CV). */
function computeStats(
  yearIdx: Int32Array,
  ctx: SimCtx,
  Z: Float64Array,
  n: number,
  gamma: number,
): PathStats {
  const {
    mode,
    gridMean,
    gridVol,
    grid,
    eqPaths,
    bdPaths,
    borrowReal,
    accumYears,
    retireYears,
    disc,
    gapArr,
    guarArr,
    flex,
    wr,
    contrib,
    startSavings,
    isLog,
    oneMinusGamma,
    invOneMinusGamma,
  } = ctx;
  const isBlock = mode === "block";
  let discSum = 0;
  for (let t = 0; t < retireYears; t++) discSum += disc[t];

  let consEuSum = 0;
  let cvSum = 0;
  let depCount = 0;

  for (let p = 0; p < n; p++) {
    let bal = startSavings;
    for (let i = 0; i < accumYears; i++) {
      const idx = yearIdx[i];
      let r: number;
      if (isBlock) {
        const w = grid[idx];
        const ep = eqPaths[i * n + p];
        const bp = bdPaths[i * n + p];
        r = w > 1 ? w * ep - (w - 1) * borrowReal : w * ep + (1 - w) * bp;
      } else {
        r = gridMean[idx] + gridVol[idx] * Z[i * n + p];
      }
      const grown = bal * (1 + r);
      bal = (grown < 0 ? 0 : grown) + contrib * (1 + r / 2);
    }
    let consEu = 0;
    let sumC = 0;
    let sumC2 = 0;
    let shortfall = false;
    for (let t = 0; t < retireYears; t++) {
      const i = accumYears + t;
      const idx = yearIdx[i];
      let r: number;
      if (isBlock) {
        const w = grid[idx];
        const ep = eqPaths[i * n + p];
        const bp = bdPaths[i * n + p];
        r = w > 1 ? w * ep - (w - 1) * borrowReal : w * ep + (1 - w) * bp;
      } else {
        r = gridMean[idx] + gridVol[idx] * Z[i * n + p];
      }
      let grown = bal * (1 + r);
      if (grown < 0) grown = 0;
      const target = (1 - flex) * gapArr[t] + flex * (wr * bal);
      const afford = grown / (1 + r / 2);
      const wdr = target < afford ? target : afford;
      bal = grown - wdr * (1 + r / 2);
      let c = guarArr[t] + wdr;
      if (c < FLOOR) c = FLOOR;
      consEu +=
        disc[t] *
        (isLog ? Math.log(c) : Math.pow(c, oneMinusGamma) * invOneMinusGamma);
      sumC += c;
      sumC2 += c * c;
      // Shortfall = the portfolio couldn't fund the targeted draw (income fell short of plan).
      // Not "balance hit zero": a fully guaranteed-income-covered year has target 0 and no shortfall.
      // CAVEAT: at flex=1 the target is `wr * bal` (a fraction of the live balance), which is always
      // affordable, so shortfall is structurally ~0 regardless of markets. That's correct, not a bug —
      // flexible spending trades depletion risk for income volatility. Judge tail risk by CE income /
      // income CV at high flexibility, not by shortfall.
      if (wdr < target) shortfall = true;
    }
    consEuSum += consEu;
    const tMean = sumC / retireYears;
    const tVar = sumC2 / retireYears - tMean * tMean;
    cvSum += (tVar > 0 ? Math.sqrt(tVar) : 0) / tMean;
    if (shortfall) depCount++;
  }

  return {
    ceIncome: ceFromUtil(consEuSum / n / discSum, gamma),
    depletion: depCount / n,
    incomeCv: cvSum / n,
  };
}

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

/**
 * Retirement-phase stats conditional on reaching the deterministic mean-return balance
 * at retirement. This matches the `/retirement` tool's headline success-rate semantics;
 * `computeStats` above is the full path from today and includes accumulation market luck.
 */
function computeDrawdownStats(
  yearIdx: Int32Array,
  ctx: SimCtx,
  Z: Float64Array,
  n: number,
  gamma: number,
): DrawdownStats {
  const {
    mode,
    gridMean,
    gridVol,
    grid,
    eqPaths,
    bdPaths,
    borrowReal,
    accumYears,
    retireYears,
    disc,
    gapArr,
    guarArr,
    flex,
    wr,
    isLog,
    oneMinusGamma,
    invOneMinusGamma,
  } = ctx;
  const isBlock = mode === "block";
  let discSum = 0;
  for (let t = 0; t < retireYears; t++) discSum += disc[t];

  const startBalance = deterministicAccumBalance(yearIdx, ctx);
  let consEuSum = 0;
  let cvSum = 0;
  let depCount = 0;

  for (let p = 0; p < n; p++) {
    let bal = startBalance;
    let consEu = 0;
    let sumC = 0;
    let sumC2 = 0;
    let shortfall = false;
    for (let t = 0; t < retireYears; t++) {
      const i = accumYears + t;
      const idx = yearIdx[i];
      let r: number;
      if (isBlock) {
        const w = grid[idx];
        const ep = eqPaths[i * n + p];
        const bp = bdPaths[i * n + p];
        r = w > 1 ? w * ep - (w - 1) * borrowReal : w * ep + (1 - w) * bp;
      } else {
        r = gridMean[idx] + gridVol[idx] * Z[i * n + p];
      }
      let grown = bal * (1 + r);
      if (grown < 0) grown = 0;
      const target = (1 - flex) * gapArr[t] + flex * (wr * bal);
      const afford = grown / (1 + r / 2);
      const wdr = target < afford ? target : afford;
      bal = grown - wdr * (1 + r / 2);
      let c = guarArr[t] + wdr;
      if (c < FLOOR) c = FLOOR;
      consEu +=
        disc[t] *
        (isLog ? Math.log(c) : Math.pow(c, oneMinusGamma) * invOneMinusGamma);
      sumC += c;
      sumC2 += c * c;
      if (wdr < target) shortfall = true;
    }
    consEuSum += consEu;
    const tMean = sumC / retireYears;
    const tVar = sumC2 / retireYears - tMean * tMean;
    cvSum += (tVar > 0 ? Math.sqrt(tVar) : 0) / tMean;
    if (shortfall) depCount++;
  }

  return {
    ceIncome: ceFromUtil(consEuSum / n / discSum, gamma),
    depletion: depCount / n,
    incomeCv: cvSum / n,
    startBalance,
  };
}

// ── coordinate ascent ─────────────────────────────────────────────────────────
function optimize(
  ctx: SimCtx,
  Z: Float64Array,
  n: number,
  G: number,
  blockStart: Int32Array,
  blockEnd: Int32Array,
  blockOfYear: Int32Array,
  maxPasses: number,
): Int32Array {
  const nYears = ctx.accumYears + ctx.retireYears;
  const nBlocks = blockStart.length;
  const yearIdx = new Int32Array(nYears);

  // Flat init: the best single weight applied to every year (shape-neutral start).
  let bestFlat = -Infinity;
  let bestFlatG = 0;
  for (let g = 0; g < G; g++) {
    yearIdx.fill(g);
    const u = meanUtility(yearIdx, ctx, Z, n);
    if (u > bestFlat) {
      bestFlat = u;
      bestFlatG = g;
    }
  }
  const blockIdx = new Int32Array(nBlocks).fill(bestFlatG);
  for (let i = 0; i < nYears; i++) yearIdx[i] = blockIdx[blockOfYear[i]];

  for (let pass = 0; pass < maxPasses; pass++) {
    const forward = pass % 2 === 0;
    let changed = false;
    for (let k = 0; k < nBlocks; k++) {
      const b = forward ? k : nBlocks - 1 - k;
      const s = blockStart[b];
      const e = blockEnd[b];
      let bestU = -Infinity;
      let bestG = blockIdx[b];
      for (let g = 0; g < G; g++) {
        for (let i = s; i < e; i++) yearIdx[i] = g;
        const u = meanUtility(yearIdx, ctx, Z, n);
        if (u > bestU) {
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

function expand(
  blockIdx: Int32Array,
  blockOfYear: Int32Array,
  nYears: number,
): Int32Array {
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

  for (let g = 0; g <= fullSteps; g++)
    grid[g] = Math.round(g * GRID_STEP * 1e6) / 1e6;

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
 *   "iid-mc" (default) — iid normal draws from the forward-CMA curve. The regime-robust
 *     default: its interior recommendation is near-optimal across every historical cut,
 *     while forward-block's flat-100% holds only under the full-sample joint sequence
 *     structure (see methodology §2f robustness).
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
  const accumYears = Math.max(
    1,
    Math.round(input.retirementAge - input.startAge),
  );
  const retireYears = Math.max(
    1,
    Math.round(input.planningAge - input.retirementAge),
  );
  const nYears = accumYears + retireYears;
  const interval = WEB_GLIDE_INTERVAL;
  const gamma = input.gamma;
  const maxLeverage = Math.max(GRID_STEP, input.maxEquityPct / 100);

  // Grid of candidate equity weights 0..maxLeverage (weights > 1 are leveraged).
  const grid = buildEquityGrid(maxLeverage);
  const G = grid.length;
  const { gridMean, gridVol, eqMean, bondMean } = buildGridStats(
    grid,
    curve,
    input.inflation,
    input.borrowCost,
  );

  // Guaranteed income is paid every retirement year; the portfolio funds the gap.
  const guaranteed = input.guaranteedIncome;
  const gap = Math.max(input.targetIncome - guaranteed, 0);
  const guarArr = new Float64Array(retireYears).fill(guaranteed);
  const gapArr = new Float64Array(retireYears).fill(gap);
  const disc = new Float64Array(retireYears);
  for (let t = 0; t < retireYears; t++) disc[t] = Math.pow(input.beta, t);

  // Block layout: equity is constant within each interval block; the last absorbs the remainder.
  const nBlocks = Math.ceil(nYears / interval);
  const blockOfYear = new Int32Array(nYears);
  const blockStart = new Int32Array(nBlocks);
  const blockEnd = new Int32Array(nBlocks);
  for (let i = 0; i < nYears; i++)
    blockOfYear[i] = Math.min(Math.floor(i / interval), nBlocks - 1);
  for (let b = 0; b < nBlocks; b++) {
    blockStart[b] = b * interval;
    blockEnd[b] = b < nBlocks - 1 ? (b + 1) * interval : nYears;
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
    ({ eqPaths: optEqPaths, bdPaths: optBdPaths } = sampleBlockPaths(
      nYears,
      nOpt,
      optSeed,
    ));
    ({ eqPaths: stEqPaths, bdPaths: stBdPaths } = sampleBlockPaths(
      nYears,
      nStats,
      statsSeed,
    ));
    ({ eqPaths: selEqPaths, bdPaths: selBdPaths } = sampleBlockPaths(
      nYears,
      nStats,
      selectSeed,
    ));
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

  // The deterministic mean-return projection compounds the expected return of whatever
  // the engine actually samples: the curve under iid, the rescaled-history anchor mix
  // under block (the curve's interpolated means differ slightly at intermediate weights).
  let detMean = gridMean;
  if (isBlock) {
    detMean = new Float64Array(G);
    for (let g = 0; g < G; g++) {
      const w = grid[g];
      detMean[g] =
        w > 1
          ? w * eqMean - (w - 1) * borrowReal
          : w * eqMean + (1 - w) * bondMean;
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
    G,
    blockStart,
    blockEnd,
    blockOfYear,
    passes,
  );
  const yearIdx = expand(blockIdx, blockOfYear, nYears);
  const weights: number[] = [];
  for (let i = 0; i < nYears; i++) weights.push(grid[yearIdx[i]]);

  const st = computeStats(yearIdx, ctxStats, Zf, nStats, gamma);
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
  // recommend this flatter comparator when it is materially better.
  const flatIdx = new Int32Array(nYears);
  let bestFlatG = 0;
  let bestFlatCe = computeStats(flatIdx, ctxSelect, Zs, nStats, gamma).ceIncome;
  for (let g = 1; g < G; g++) {
    flatIdx.fill(g);
    const candidate = computeStats(flatIdx, ctxSelect, Zs, nStats, gamma);
    if (candidate.ceIncome > bestFlatCe) {
      bestFlatCe = candidate.ceIncome;
      bestFlatG = g;
    }
  }
  flatIdx.fill(bestFlatG);
  const flatStats = computeStats(flatIdx, ctxStats, Zf, nStats, gamma);
  const flatDrawdownStats = computeDrawdownStats(
    flatIdx,
    ctxStats,
    Zf,
    nStats,
    gamma,
  );

  // ── schedule + shape descriptors ─────────────────────────────────────────────
  const schedule: ScheduleBlock[] = [];
  for (let b = 0; b < nBlocks; b++) {
    const yearStart = b * interval;
    const yearEnd = Math.min((b + 1) * interval, nYears) - 1;
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
  // Classify a phase by its first-to-last change. The retirement phase drops its final year(s):
  // the optimizer drives equity toward 0 at the fixed horizon (an artifact, not real) that would
  // otherwise skew the read. Accumulation has no such artifact and is classified over its full span.
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
    depletion: Math.round(st.depletion * 1e4) / 1e4,
    drawdownDepletion: Math.round(drawdownSt.depletion * 1e4) / 1e4,
    expectedRetirementBalance: Math.round(drawdownSt.startBalance),
    flatDepletion: Math.round(flatStats.depletion * 1e4) / 1e4,
    flatDrawdownDepletion: Math.round(flatDrawdownStats.depletion * 1e4) / 1e4,
    incomeCv: Math.round(st.incomeCv * 1e4) / 1e4,
    params: {
      accumYears,
      retireYears,
      guaranteed,
      maxLeverage,
      borrowCost: input.borrowCost,
      gamma,
      interval,
      returnMode,
    },
  };
}
