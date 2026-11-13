import { describe, expect, it } from "vitest";
import { niceTicks } from "./charts";

describe("niceTicks", () => {
  it("covers the range with round, evenly spaced values", () => {
    expect(niceTicks(0, 3_800_000)).toEqual([0, 1e6, 2e6, 3e6, 4e6]);
    expect(niceTicks(-300_000, 4_900_000)).toEqual([-1e6, 0, 1e6, 2e6, 3e6, 4e6, 5e6]);
    expect(niceTicks(120_000, 610_000)).toEqual([
      100_000, 200_000, 300_000, 400_000, 500_000, 600_000, 700_000,
    ]);
  });

  it("never exceeds the tick budget and handles a flat range", () => {
    expect(niceTicks(0, 9_999, 4).length).toBeLessThanOrEqual(4);
    expect(niceTicks(5, 5).length).toBeGreaterThan(1);
    expect(niceTicks(Number.NaN, 1)).toEqual([]);
  });
});
