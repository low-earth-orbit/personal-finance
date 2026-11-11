import { describe, expect, it } from "vitest";
import { sampleBlockIndices, sampleBlockPaths } from "./blockBootstrap";
import { JST_BOND, JST_EQUITY, JST_OBSERVATIONS, JST_SEG_LEN, JST_SEG_START } from "./jstData";

const N_YEARS = 60;
const N_PATHS = 400;

describe("sampleBlockIndices", () => {
  const indices = sampleBlockIndices(N_YEARS, N_PATHS, 123);

  it("returns one in-range history row per path-year", () => {
    expect(indices).toHaveLength(N_YEARS * N_PATHS);
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(JST_OBSERVATIONS);
    }
  });

  it("is deterministic per seed", () => {
    expect(sampleBlockIndices(N_YEARS, N_PATHS, 123)).toEqual(indices);
    expect(sampleBlockIndices(N_YEARS, N_PATHS, 124)).not.toEqual(indices);
  });

  it("continues a block to the next year of the same segment, wrapping at its end", () => {
    let continued = 0;
    let wrapped = 0;
    for (let i = 1; i < N_YEARS; i++) {
      for (let p = 0; p < N_PATHS; p++) {
        const prev = indices[(i - 1) * N_PATHS + p];
        const start = JST_SEG_START[prev];
        const next = start + ((prev - start + 1) % JST_SEG_LEN[prev]);
        if (indices[i * N_PATHS + p] !== next) continue;
        continued++;
        if (next === start && JST_SEG_LEN[prev] > 1) wrapped++;
      }
    }
    // Blocks average 10 years: ~90% of year-to-year steps continue the current run.
    const share = continued / ((N_YEARS - 1) * N_PATHS);
    expect(share).toBeGreaterThan(0.88);
    expect(share).toBeLessThan(0.92);
    expect(wrapped).toBeGreaterThan(0);
  });
});

describe("sampleBlockPaths", () => {
  it("gathers paired equity and bond returns for the sampled rows", () => {
    const indices = sampleBlockIndices(N_YEARS, N_PATHS, 7);
    const { eqPaths, bdPaths } = sampleBlockPaths(N_YEARS, N_PATHS, 7);
    expect(eqPaths).toHaveLength(N_YEARS * N_PATHS);
    for (let k = 0; k < indices.length; k += 97) {
      expect(eqPaths[k]).toBe(JST_EQUITY[indices[k]]);
      expect(bdPaths[k]).toBe(JST_BOND[indices[k]]);
    }
  });
});

describe("JST bundle", () => {
  it("has consistent segment arrays covering every observation", () => {
    expect(JST_EQUITY).toHaveLength(JST_OBSERVATIONS);
    expect(JST_BOND).toHaveLength(JST_OBSERVATIONS);
    expect(JST_SEG_START).toHaveLength(JST_OBSERVATIONS);
    expect(JST_SEG_LEN).toHaveLength(JST_OBSERVATIONS);
    for (let i = 0; i < JST_OBSERVATIONS; i++) {
      expect(JST_SEG_START[i]).toBeLessThanOrEqual(i);
      expect(i).toBeLessThan(JST_SEG_START[i] + JST_SEG_LEN[i]);
    }
  });

  it("is rescaled to the forward-CMA marginals", () => {
    const moments = (xs: Float32Array) => {
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
      return { mean, vol: Math.sqrt(variance) };
    };
    // Real arithmetic mean / vol of the default curve's 100% and 0% equity endpoints.
    expect(moments(JST_EQUITY).mean).toBeCloseTo(0.0538, 3);
    expect(moments(JST_EQUITY).vol).toBeCloseTo(0.1231, 3);
    expect(moments(JST_BOND).mean).toBeCloseTo(0.0156, 3);
    expect(moments(JST_BOND).vol).toBeCloseTo(0.0527, 3);
  });
});
