import { DEFAULTS } from "./presets";
import type { RetirementInput } from "./types";

const KEY = "ret_input";

export function loadInput(): RetirementInput {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<RetirementInput>;
    // Saved before CPP and OAS had their own fields: the single "pension" field held all
    // guaranteed income, so keep it as is and add no separate CPP/OAS.
    const legacy = typeof parsed.cppAt65 !== "number" && typeof parsed.oasAt65 !== "number";
    return legacy ? { ...DEFAULTS, cppAt65: 0, oasAt65: 0, ...parsed } : { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveInput(input: RetirementInput): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(input));
  } catch {
    // localStorage may be unavailable (private mode, quota); ignore.
  }
}
