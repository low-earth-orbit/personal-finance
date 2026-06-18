import { describe, expect, it } from "vitest";
import { buildEquityAxis, buildGlidePathChartData, withSmoothed } from "./GlidePathChart";

describe("buildEquityAxis", () => {
  it("keeps 100% as the minimum axis ceiling", () => {
    expect(buildEquityAxis(80)).toEqual({
      yMax: 100,
      ticks: [0, 20, 40, 60, 80, 100],
    });
  });

  it.each([
    [100, [0, 20, 40, 60, 80, 100]],
    [125, [0, 20, 40, 60, 80, 100, 120, 125]],
    [118, [0, 20, 40, 60, 80, 100, 118]],
  ])("ends exactly at a %s%% equity cap", (maxEquityPct, expectedTicks) => {
    expect(buildEquityAxis(maxEquityPct)).toEqual({
      yMax: maxEquityPct,
      ticks: expectedTicks,
    });
  });
});

describe("buildGlidePathChartData", () => {
  it("extends the final holding period to the planning-age boundary", () => {
    const data = buildGlidePathChartData(
      { startAge: 35, planningAge: 95 },
      {
        equityByYear: Array.from({ length: 60 }, () => 0.6),
        params: { accumYears: 30 },
      },
    );

    expect(data).toHaveLength(61);
    expect(data.at(-2)).toMatchObject({ age: 94, equity: 60 });
    expect(data.at(-1)).toEqual({ age: 95, equity: 60, phase: "retire" });
  });
});

describe("withSmoothed", () => {
  it("averages out step-to-step jumps while preserving length and raw values", () => {
    const raw = buildGlidePathChartData(
      { startAge: 60, planningAge: 70 },
      {
        equityByYear: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
        params: { accumYears: 0 },
      },
    );
    const smoothed = withSmoothed(raw, 5);

    expect(smoothed).toHaveLength(raw.length);
    // The raw 100/0 zig-zag collapses toward its ~50% mean in the interior.
    const mid = smoothed[Math.floor(smoothed.length / 2)].equitySmooth;
    expect(mid).toBeGreaterThanOrEqual(40);
    expect(mid).toBeLessThanOrEqual(60);
    // Raw values are kept alongside the smoothed series (the stepped view still works).
    expect(smoothed[0].equity).toBe(raw[0].equity);
  });

  it("leaves a flat series unchanged", () => {
    const raw = buildGlidePathChartData(
      { startAge: 35, planningAge: 95 },
      {
        equityByYear: Array.from({ length: 60 }, () => 0.6),
        params: { accumYears: 30 },
      },
    );
    const smoothed = withSmoothed(raw, 11);
    expect(smoothed.every((p) => p.equitySmooth === 60)).toBe(true);
  });
});
