import { afterEach, describe, expect, it } from "vitest";
import { DEFAULTS } from "./presets";
import { loadInput } from "./storage";

afterEach(() => localStorage.clear());

describe("retirement storage", () => {
  it("keeps a pre-CPP/OAS saved pension as the only guaranteed income", () => {
    const { cppAt65, oasAt65, cppStartAge, oasStartAge, ...legacy } = DEFAULTS;
    void cppAt65;
    void oasAt65;
    void cppStartAge;
    void oasStartAge;
    localStorage.setItem("ret_input", JSON.stringify({ ...legacy, guaranteedIncomePct: 20 }));
    const loaded = loadInput();
    expect(loaded.cppAt65).toBe(0);
    expect(loaded.oasAt65).toBe(0);
    expect(loaded.guaranteedIncomePct).toBe(20);
  });

  it("loads current saved inputs unchanged", () => {
    const saved = { ...DEFAULTS, cppAt65: 15_000, cppStartAge: 70 };
    localStorage.setItem("ret_input", JSON.stringify(saved));
    expect(loadInput()).toEqual(saved);
  });
});
