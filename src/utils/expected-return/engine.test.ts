import { describe, expect, it } from "vitest";
import { geometricToArithmetic } from "@/utils/returns";
import {
  blendViews,
  computeExpectedReturn,
  earningsYield,
  endCape,
  gapClosed,
  marketConsistent,
  regionViews,
  riskPremium,
  valuationDrag,
} from "./engine";
import { DEFAULTS } from "./presets";
import type { ExpectedReturnInput } from "./types";

function withInput(patch: Partial<ExpectedReturnInput>): ExpectedReturnInput {
  return { ...structuredClone(DEFAULTS), ...patch };
}

describe("marketConsistent", () => {
  it("adds cash yield and real earnings growth", () => {
    expect(
      marketConsistent({ dividendYield: 1.2, buybackYield: 1, earningsGrowth: 2 }),
    ).toBeCloseTo(0.042, 12);
  });

  it("lets net dilution (negative buybacks) reduce the return", () => {
    expect(
      marketConsistent({ dividendYield: 2.8, buybackYield: -1.5, earningsGrowth: 3.5 }),
    ).toBeCloseTo(0.048, 12);
  });
});

describe("earningsYield", () => {
  it("is 1/CAPE scaled up for the 10-year earnings lag", () => {
    expect(earningsYield(25)).toBeCloseTo(0.043, 12);
    expect(earningsYield(38)).toBeCloseTo(1.075 / 38, 12);
  });
});

describe("riskPremium", () => {
  it("adds the equity premium to the real bond yield", () => {
    expect(riskPremium({ realYield: 1.8, equityPremium: 3.5 })).toBeCloseTo(0.053, 12);
    expect(riskPremium({ realYield: -0.5, equityPremium: 4 })).toBeCloseTo(0.035, 12);
  });
});

describe("valuation reversion", () => {
  it("closes half the gap per half-life", () => {
    expect(gapClosed(10, 0)).toBe(0);
    expect(gapClosed(10, 10)).toBeCloseTo(0.5, 12);
    expect(gapClosed(10, 20)).toBeCloseTo(0.75, 12);
    expect(gapClosed(10, 30)).toBeCloseTo(0.875, 12);
  });

  it("moves log CAPE toward the target", () => {
    // After one half-life, log CAPE is halfway: the geometric mean of today and the target.
    expect(endCape(38, 25, 10, 10)).toBeCloseTo(Math.sqrt(38 * 25), 12);
    expect(endCape(38, 25, 10, 30)).toBeCloseTo(38 ** 0.125 * 25 ** 0.875, 12);
  });

  it("has no drag when CAPE is already at target", () => {
    expect(valuationDrag(20, 20, 10, 30)).toBeCloseTo(0, 15);
  });

  it("annualizes the expected CAPE change over the horizon", () => {
    const drag = valuationDrag(38, 25, 10, 30);
    expect(38 * (1 + drag) ** 30).toBeCloseTo(endCape(38, 25, 10, 30), 9);
    expect(drag).toBeLessThan(0);
  });

  it("drags less a year over longer horizons, since most of the move comes early", () => {
    const tenYear = valuationDrag(38, 25, 10, 10);
    const thirtyYear = valuationDrag(38, 25, 10, 30);
    expect(tenYear).toBeLessThan(thirtyYear);
  });

  it("drags less with a longer half-life", () => {
    expect(valuationDrag(38, 25, 30, 30)).toBeGreaterThan(valuationDrag(38, 25, 10, 30));
    expect(valuationDrag(38, 25, 100, 30)).toBeLessThan(0);
  });

  it("adds to returns when the market sits below its target", () => {
    expect(valuationDrag(12, 16, 10, 20)).toBeGreaterThan(0);
  });
});

describe("blendViews", () => {
  const views = {
    market: 0.05,
    valuation: 0.03,
    earningsYield: 0.025,
    riskPremium: 0.055,
    history: 0.04,
  };
  const none = {
    weightMarket: 0,
    weightValuation: 0,
    weightEarningsYield: 0,
    weightRiskPremium: 0,
    weightHistory: 0,
  };

  it("is the weighted mean of the five views", () => {
    expect(
      blendViews(views, {
        weightMarket: 30,
        weightValuation: 20,
        weightEarningsYield: 10,
        weightRiskPremium: 15,
        weightHistory: 25,
      }),
    ).toBeCloseTo(0.3 * 0.05 + 0.2 * 0.03 + 0.1 * 0.025 + 0.15 * 0.055 + 0.25 * 0.04, 12);
  });

  it("returns the single view given all the weight", () => {
    expect(blendViews(views, { ...none, weightValuation: 100 })).toBe(0.03);
    expect(blendViews(views, { ...none, weightEarningsYield: 100 })).toBe(0.025);
    expect(blendViews(views, { ...none, weightRiskPremium: 100 })).toBe(0.055);
  });
});

describe("regionViews", () => {
  it("makes the valuation view equal the market view when the target is today's CAPE", () => {
    const us = DEFAULTS.regions.us;
    const views = regionViews({ ...us, targetCape: us.cape }, DEFAULTS);
    expect(views.valuation).toBeCloseTo(views.market, 15);
    expect(views.valuationDrag).toBeCloseTo(0, 15);
    expect(views.endCape).toBeCloseTo(us.cape, 12);
  });

  it("uses the long-run return for the history view", () => {
    const views = regionViews(DEFAULTS.regions.canada, { ...DEFAULTS, historyReturn: 4.5 });
    expect(views.history).toBeCloseTo(0.045, 12);
  });

  it("takes the earnings yield from the region's CAPE and the bond view from global inputs", () => {
    const views = regionViews(DEFAULTS.regions.canada, DEFAULTS);
    expect(views.earningsYield).toBeCloseTo(1.075 / 25, 12);
    expect(views.riskPremium).toBeCloseTo(0.06, 12);
  });
});

describe("computeExpectedReturn", () => {
  it("lists Canada first and weights regions by portfolio share", () => {
    const result = computeExpectedReturn(DEFAULTS);
    const manual = result.regions.reduce((sum, region) => sum + region.blended * region.weight, 0);
    expect(result.portfolio.blended).toBeCloseTo(manual, 12);
    expect(result.regions.map((region) => region.id)).toEqual([
      "canada",
      "us",
      "developed",
      "emerging",
    ]);
  });

  it("produces the documented US example from the defaults", () => {
    const us = computeExpectedReturn(DEFAULTS).regions.find((region) => region.id === "us")!;
    expect(us.market).toBeCloseTo(0.041, 12);
    // Three 10-year half-lives close 87.5% of the 40 -> 25 log gap: CAPE ends near 26.5,
    // about -1.4%/yr over 30 years.
    expect(us.endCape).toBeCloseTo(40 ** 0.125 * 25 ** 0.875, 9);
    expect(us.endCape).toBeCloseTo(26.51, 2);
    expect(us.valuationDrag).toBeCloseTo(-0.0136, 4);
  });

  it("subtracts MER and withholding drag from the headline and the view range", () => {
    const result = computeExpectedReturn(DEFAULTS);
    expect(result.costs).toBeCloseTo(0.0034, 12);
    expect(result.realGeometric).toBeCloseTo(result.portfolio.blended - 0.0034, 12);
    const { market, valuation, earningsYield, riskPremium, history } = result.portfolio;
    const views = [market, valuation, earningsYield, riskPremium, history];
    expect(result.range.low).toBeCloseTo(Math.min(...views) - 0.0034, 12);
    expect(result.range.high).toBeCloseTo(Math.max(...views) - 0.0034, 12);
    expect(result.range.low).toBeLessThanOrEqual(result.realGeometric);
    expect(result.range.high).toBeGreaterThanOrEqual(result.realGeometric);
  });

  it("compounds inflation onto the real return and converts to arithmetic with volatility", () => {
    const result = computeExpectedReturn(DEFAULTS);
    expect(result.nominalGeometric).toBeCloseTo((1 + result.realGeometric) * 1.021 - 1, 12);
    expect(result.nominalArithmetic).toBeCloseTo(
      geometricToArithmetic(result.nominalGeometric, 0.13),
      12,
    );
    // Roughly sigma^2 / 2 at 13% volatility.
    expect(result.nominalArithmetic - result.nominalGeometric).toBeCloseTo(0.0078, 4);
  });

  it("collapses to the history return when history gets all the weight", () => {
    const result = computeExpectedReturn(
      withInput({
        weightMarket: 0,
        weightValuation: 0,
        weightEarningsYield: 0,
        weightRiskPremium: 0,
        weightHistory: 100,
        historyReturn: 5,
      }),
    );
    expect(result.portfolio.blended).toBeCloseTo(0.05, 12);
  });

  it("ignores a region with zero weight", () => {
    const base = withInput({});
    base.regions.us.weight = 0;
    base.regions.canada.weight = 75;
    const changed = structuredClone(base);
    changed.regions.us.cape = 70;
    changed.regions.us.dividendYield = 9;
    expect(computeExpectedReturn(changed).realGeometric).toBeCloseTo(
      computeExpectedReturn(base).realGeometric,
      12,
    );
  });
});
