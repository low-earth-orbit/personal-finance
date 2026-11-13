import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULTS } from "./presets";
import { KEY, clearInput, loadInput, migrateInput, saveInput } from "./storage";

describe("expected-return storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns a copy of the defaults when nothing is saved", () => {
    const input = loadInput();
    expect(input).toEqual(DEFAULTS);
    input.regions.us.cape = 99;
    expect(DEFAULTS.regions.us.cape).toBe(40);
  });

  it("round-trips saved input", () => {
    const input = structuredClone(DEFAULTS);
    input.horizon = 10;
    input.regions.canada.targetCape = 18;
    saveInput(input);
    expect(loadInput()).toEqual(input);
    clearInput();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps numeric fields and drops everything else", () => {
    const migrated = migrateInput({
      horizon: 20,
      mer: "0.5",
      regions: { us: { cape: 30, weight: null }, unknown: { cape: 1 } },
    });
    expect(migrated.horizon).toBe(20);
    expect(migrated.mer).toBe(DEFAULTS.mer);
    expect(migrated.regions.us.cape).toBe(30);
    expect(migrated.regions.us.weight).toBe(DEFAULTS.regions.us.weight);
  });

  it("falls back to the defaults on corrupt data", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(loadInput()).toEqual(DEFAULTS);
    expect(migrateInput("nope")).toEqual(DEFAULTS);
  });
});
