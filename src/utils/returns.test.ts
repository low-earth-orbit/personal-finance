import { describe, expect, it } from "vitest";
import {
  arithmeticToGeometric,
  geometricToArithmetic,
  realArithmeticFromNominalGeometric,
} from "./returns";

describe("return-basis conversions", () => {
  it("round trips geometric and arithmetic returns", () => {
    const geometric = 0.0687;
    const volatility = 0.1257;
    const arithmetic = geometricToArithmetic(geometric, volatility);

    expect(arithmeticToGeometric(arithmetic, volatility)).toBeCloseTo(geometric, 12);
  });

  it("matches the known 100/0 conversion", () => {
    expect(geometricToArithmetic(0.0687, 0.1257)).toBeCloseTo(0.076, 3);
  });

  it("converts nominal geometric inputs to real arithmetic inputs", () => {
    const result = realArithmeticFromNominalGeometric(6.87, 12.57, 2.1);

    expect(result.mean).toBeCloseTo(0.0538, 3);
    expect(result.vol).toBeCloseTo(0.1231, 3);
  });
});
