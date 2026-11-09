import { describe, expect, it } from "vitest";
import { parsePresetFile, serializePresets } from "./presetFile";
import { DEFAULTS } from "./presets";

describe("preset file", () => {
  it("round-trips exported presets", () => {
    const values = { ...DEFAULTS, monthlyRent: 4100 };
    const text = serializePresets([{ id: "x", label: "Mine", values, custom: true }]);
    expect(JSON.parse(text).app).toBe("rent-vs-buy");
    expect(parsePresetFile(text)).toEqual([{ label: "Mine", values }]);
  });

  it("accepts a bare array, drops unknown and non-numeric values, fills defaults", () => {
    const [entry] = parsePresetFile(
      JSON.stringify([
        { label: "  Old  ", values: { monthlyRent: 3000, evil: 1, initialHomePrice: "9" } },
      ]),
    );
    expect(entry.label).toBe("Old");
    expect(entry.values).toEqual({ ...DEFAULTS, monthlyRent: 3000 });
    expect("evil" in entry.values).toBe(false);
  });

  it("skips malformed entries and rejects files with none usable", () => {
    expect(
      parsePresetFile(
        JSON.stringify({
          presets: [
            null,
            { label: "" },
            { label: "No values" },
            { label: "Ok", values: { amortization: 20 } },
          ],
        }),
      ).map((e) => e.label),
    ).toEqual(["Ok"]);
    expect(() => parsePresetFile("{")).toThrow(/valid JSON/);
    expect(() => parsePresetFile(JSON.stringify({ foo: 1 }))).toThrow(/any presets/);
    expect(() => parsePresetFile(JSON.stringify([{ label: "x", values: { a: 1 } }]))).toThrow(
      /any presets/,
    );
  });
});
