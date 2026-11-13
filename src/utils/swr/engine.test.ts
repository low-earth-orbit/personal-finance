import { describe, expect, it } from "vitest";
import {
  SWR_ALLOCATIONS,
  computeSwrTable,
  generateAssetPaths,
  innovationCorrelation,
  phiFromVr,
  swrFromPaths,
  vrFromPhi,
} from "./engine";
import { DEFAULTS, SWR_HORIZONS } from "./presets";
import type { SwrInput } from "./types";

const input: SwrInput = { ...DEFAULTS };
const row = (label: string) => SWR_ALLOCATIONS.findIndex((a) => a.label === label);
const rate = (result: ReturnType<typeof computeSwrTable>, label: string, years: number) =>
  result.rates[row(label)][SWR_HORIZONS.indexOf(years as (typeof SWR_HORIZONS)[number])] * 100;

describe("VR <-> AR(1)", () => {
  it("maps VR 1 to phi 0 and round-trips other ratios", () => {
    expect(vrFromPhi(0)).toBe(1);
    expect(phiFromVr(1)).toBe(0);
    for (const vr of [0.6, 0.91, 1.5, 2.66]) {
      expect(vrFromPhi(phiFromVr(vr))).toBeCloseTo(vr, 8);
    }
  });

  it("reproduces the historical calibration", () => {
    expect(phiFromVr(0.91)).toBeCloseTo(-0.052, 2);
    expect(phiFromVr(2.66)).toBeCloseTo(0.51, 2);
  });

  it("clamps unreachable ratios to the phi limits", () => {
    expect(phiFromVr(0.0001)).toBe(-0.95);
    expect(phiFromVr(1000)).toBe(0.95);
  });
});

describe("innovation correlation", () => {
  it("equals the target correlation when both assets are independent", () => {
    const { value, clamped } = innovationCorrelation(0.48, 0, 0);
    expect(value).toBeCloseTo(0.48, 12);
    expect(clamped).toBe(false);
  });

  it("matches the historical figure", () => {
    expect(innovationCorrelation(0.48, phiFromVr(0.91), phiFromVr(2.66)).value).toBeCloseTo(
      0.574,
      2,
    );
  });

  it("clamps at +/-0.99 and flags it", () => {
    const high = innovationCorrelation(0.9, -0.9, 0.95);
    expect(high.value).toBe(0.99);
    expect(high.clamped).toBe(true);
    expect(innovationCorrelation(-0.9, -0.9, 0.95).value).toBe(-0.99);
  });
});

describe("computeSwrTable", () => {
  const iid = computeSwrTable(input, "independent");

  it("has 11 allocations x 7 horizons", () => {
    expect(iid.rates).toHaveLength(11);
    expect(iid.rates.every((r) => r.length === SWR_HORIZONS.length)).toBe(true);
    expect(iid.allocations[0].label).toBe("100/0");
    expect(iid.allocations[10].label).toBe("0/100");
  });

  it("reproduces the documented 60/40 rates at the defaults (iid)", () => {
    expect(Math.abs(rate(iid, "60/40", 20) - 5.28)).toBeLessThan(0.1);
    expect(Math.abs(rate(iid, "60/40", 30) - 3.87)).toBeLessThan(0.1);
    expect(Math.abs(rate(iid, "60/40", 50) - 2.83)).toBeLessThan(0.1);
    expect(Math.abs(rate(iid, "100/0", 30) - 3.88)).toBeLessThan(0.1);
    expect(Math.abs(rate(iid, "0/100", 30) - 3.31)).toBeLessThan(0.1);
  });

  it("lowers the bond-heavy rows under historical dynamics", () => {
    const hist = computeSwrTable(input, "historical");
    expect(hist.phiBond).toBeCloseTo(0.51, 2);
    expect(Math.abs(rate(hist, "60/40", 30) - 3.73)).toBeLessThan(0.1);
    expect(Math.abs(rate(hist, "0/100", 30) - 2.84)).toBeLessThan(0.1);
    expect(rate(hist, "0/100", 30)).toBeLessThan(rate(iid, "0/100", 30));
  });

  it("uses the custom VR inputs only in custom mode", () => {
    const custom = { ...input, stockVr: 0.91, bondVr: 2.66 };
    expect(computeSwrTable(custom, "independent").rates).toEqual(iid.rates);
    expect(computeSwrTable(custom, "custom").rates).toEqual(
      computeSwrTable(input, "historical").rates,
    );
  });

  it("falls as the horizon lengthens", () => {
    for (const r of iid.rates) {
      for (let i = 1; i < r.length; i++) expect(r[i]).toBeLessThanOrEqual(r[i - 1]);
    }
  });

  it("falls as the success rate rises", () => {
    const strict = computeSwrTable({ ...input, successRate: 99 }, "independent");
    const loose = computeSwrTable({ ...input, successRate: 80 }, "independent");
    expect(rate(strict, "60/40", 30)).toBeLessThan(rate(iid, "60/40", 30));
    expect(rate(iid, "60/40", 30)).toBeLessThan(rate(loose, "60/40", 30));
  });

  it("is identical for identical inputs", () => {
    expect(computeSwrTable(input, "independent").rates).toEqual(iid.rates);
  });

  it("flags a clamped correlation", () => {
    const result = computeSwrTable(
      { ...input, correlation: 0.9, stockVr: 0.5, bondVr: 3 },
      "custom",
      { paths: 200 },
    );
    expect(result.correlationClamped).toBe(true);
    expect(iid.correlationClamped).toBe(false);
  });

  it("matches a brute-force bisection simulation for one cell", () => {
    const paths = 2000;
    const years = 30;
    const successRate = input.successRate / 100;
    const assets = generateAssetPaths(input, "historical", paths, years);
    const equity = 0.6;

    function successShare(w: number): number {
      let ok = 0;
      for (let p = 0; p < paths; p++) {
        let balance = 1;
        let alive = true;
        for (let t = 0; t < years && alive; t++) {
          const r =
            equity * assets.stock[p * years + t] + (1 - equity) * assets.bond[p * years + t];
          balance = balance * (1 + r) - w * (1 + r / 2);
          if (balance <= 0) alive = false;
        }
        if (alive) ok++;
      }
      return ok / paths;
    }

    let lo = 0;
    let hi = 0.5;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (successShare(mid) >= successRate) lo = mid;
      else hi = mid;
    }

    const direct = swrFromPaths(assets, successRate, [years], [{ label: "60/40", equity }])[0][0];
    expect(direct).toBeCloseTo(lo, 3);
  });
});
