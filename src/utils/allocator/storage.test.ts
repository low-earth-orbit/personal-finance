import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./presets";
import { migrateInput } from "./storage";

describe("allocator storage migration", () => {
  it("loads current fields and drops stale fields", () => {
    const migrated = migrateInput({
      ...DEFAULTS,
      availableRrspRoom: 123_000,
      availableTfsaRoom: 45_000,
      lumpSum: 88_000,
      refundDestination: "non-registered",
    });

    expect(migrated.availableRrspRoom).toBe(123_000);
    expect(migrated.availableTfsaRoom).toBe(45_000);
    expect(migrated.lumpSum).toBe(88_000);
    expect(migrated).not.toHaveProperty("refundDestination");
  });

  it("preserves a custom portfolio return", () => {
    expect(
      migrateInput({
        ...DEFAULTS,
        portfolioPresetId: "custom",
        portfolioReturn: 7.25,
      }),
    ).toMatchObject({
      portfolioPresetId: "custom",
      portfolioReturn: 7.25,
    });
  });

  it("falls back from an invalid portfolio preset", () => {
    expect(
      migrateInput({ ...DEFAULTS, portfolioPresetId: "not-a-preset" })
        .portfolioPresetId,
    ).toBe(DEFAULTS.portfolioPresetId);
  });
});
