import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./presets";
import { validateRetirementInput } from "./validation";

describe("retirement validation", () => {
  it("accepts the defaults", () => {
    expect(validateRetirementInput({ ...DEFAULTS })).toEqual({});
  });

  it("bounds CPP to 60–70 and OAS to 65–70", () => {
    expect(validateRetirementInput({ ...DEFAULTS, cppStartAge: 59 }).cppStartAge).toBeTruthy();
    expect(validateRetirementInput({ ...DEFAULTS, cppStartAge: 60 })).toEqual({});
    expect(validateRetirementInput({ ...DEFAULTS, oasStartAge: 64 }).oasStartAge).toBeTruthy();
    expect(validateRetirementInput({ ...DEFAULTS, oasStartAge: 71 }).oasStartAge).toBeTruthy();
  });

  it("caps expected returns at 10%", () => {
    expect(validateRetirementInput({ ...DEFAULTS, accumReturn: 10 })).toEqual({});
    expect(validateRetirementInput({ ...DEFAULTS, accumReturn: 10.1 }).accumReturn).toBeTruthy();
    expect(validateRetirementInput({ ...DEFAULTS, retireReturn: 10 })).toEqual({});
    expect(validateRetirementInput({ ...DEFAULTS, retireReturn: 10.1 }).retireReturn).toBeTruthy();
  });

  it("requires whole-year start ages", () => {
    expect(validateRetirementInput({ ...DEFAULTS, cppStartAge: 62.5 }).cppStartAge).toBe(
      "Must be a whole number of years.",
    );
  });
});
