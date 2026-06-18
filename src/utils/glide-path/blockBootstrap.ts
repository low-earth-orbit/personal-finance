/**
 * Stationary block bootstrap sampler for the forward-block glide-path engine.
 *
 * Port of the Politis-Romano stationary bootstrap in `analysis/shared/jst_history.py`
 * (`sample_indices`, mode="historical-block"). Blocks wrap circularly within segment
 * boundaries so no sampled run ever straddles a country boundary or a data gap.
 *
 * Pre-computed segment arrays (JST_SEG_START, JST_SEG_LEN) live in jstData.ts.
 */

import { mulberry32 } from "./rng";
import { JST_BOND, JST_EQUITY, JST_OBSERVATIONS, JST_SEG_LEN, JST_SEG_START } from "./jstData";

/** Average block length (years) — matches the Python default. */
const BLOCK_YEARS = 10;

/**
 * Sample `nYears × nPaths` paired equity/bond return paths by stationary block
 * bootstrap from the pre-rescaled JST pooled history. Returns two flat Float32Arrays
 * (row-major: index = year * nPaths + path).
 */
export function sampleBlockPaths(
  nYears: number,
  nPaths: number,
  seed: number,
): { eqPaths: Float32Array; bdPaths: Float32Array } {
  const rand = mulberry32(seed);
  const obs = JST_OBSERVATIONS;
  const restartProb = 1.0 / BLOCK_YEARS;
  const indices = new Int32Array(nYears * nPaths);

  // Year 0: independent random starts for every path.
  for (let p = 0; p < nPaths; p++) {
    indices[p] = Math.floor(rand() * obs);
  }

  // Years 1..nYears-1: Politis-Romano stationary bootstrap.
  // Always draw both the new-start index and the restart flag to keep the
  // random stream fully deterministic regardless of data values.
  for (let i = 1; i < nYears; i++) {
    const prevRow = (i - 1) * nPaths;
    const curRow = i * nPaths;
    for (let p = 0; p < nPaths; p++) {
      const newStart = Math.floor(rand() * obs);
      const doRestart = rand() < restartProb;
      if (doRestart) {
        indices[curRow + p] = newStart;
      } else {
        const prev = indices[prevRow + p];
        const ss = JST_SEG_START[prev];
        const sl = JST_SEG_LEN[prev];
        indices[curRow + p] = ss + ((prev - ss + 1) % sl);
      }
    }
  }

  // Gather return paths from the pre-rescaled JST arrays.
  const eqPaths = new Float32Array(nYears * nPaths);
  const bdPaths = new Float32Array(nYears * nPaths);
  for (let k = 0; k < nYears * nPaths; k++) {
    const idx = indices[k];
    eqPaths[k] = JST_EQUITY[idx];
    bdPaths[k] = JST_BOND[idx];
  }

  return { eqPaths, bdPaths };
}
