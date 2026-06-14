import { describe, expect, it } from "vitest";

import { DEFAULTS } from "./presets";
import { validateAllocatorInput } from "./validation";

describe("allocator validation", () => {
  it("requires finite RRSP and TFSA room values", () => {
    const errors = validateAllocatorInput({
      ...DEFAULTS,
      availableRrspRoom: Number.NaN,
      availableTfsaRoom: Number.NaN,
    });

    expect(errors.availableRrspRoom).toBe("Available RRSP room is required.");
    expect(errors.availableTfsaRoom).toBe("Available TFSA room is required.");
  });

  it("requires a lump sum within the supported range", () => {
    expect(
      validateAllocatorInput({ ...DEFAULTS, lumpSum: Number.NaN }).lumpSum,
    ).toBe("Lump sum is required.");
    expect(
      validateAllocatorInput({ ...DEFAULTS, lumpSum: 10_000_001 }).lumpSum,
    ).toBe("Must be between 0 and 10000000");
  });
});
