import { DEFAULTS } from "./presets";
import type { GlidePathInput, GlidePathInputKey, GlidePathReturnMode } from "./types";

const KEY = "glide_input";

interface LegacyGlidePathInput extends Partial<GlidePathInput> {
  pensionPct?: number;
  preRetirementIncome?: number;
}

export function loadInput(): GlidePathInput {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as LegacyGlidePathInput;
    const current = Object.fromEntries(
      (Object.keys(DEFAULTS) as GlidePathInputKey[])
        .filter((key) => typeof parsed[key] === "number")
        .map((key) => [key, parsed[key]]),
    ) as Partial<GlidePathInput>;
    const guaranteedIncome =
      typeof current.guaranteedIncome === "number"
        ? current.guaranteedIncome
        : typeof parsed.pensionPct === "number"
          ? (parsed.pensionPct / 100) *
            (typeof parsed.preRetirementIncome === "number" ? parsed.preRetirementIncome : 100000)
          : DEFAULTS.guaranteedIncome;
    return { ...DEFAULTS, ...current, guaranteedIncome };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveInput(input: GlidePathInput): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(input));
  } catch {
    // localStorage may be unavailable (private mode, quota); ignore.
  }
}

const RETURN_MODE_KEY = "glide_return_mode";
const DEFAULT_RETURN_MODE: GlidePathReturnMode = "iid-mc";

export function loadReturnMode(): GlidePathReturnMode {
  if (typeof window === "undefined") return DEFAULT_RETURN_MODE;
  try {
    const raw = window.localStorage.getItem(RETURN_MODE_KEY);
    if (raw === "iid-mc" || raw === "forward-block") return raw;
  } catch {
    // ignore
  }
  return DEFAULT_RETURN_MODE;
}

export function saveReturnMode(mode: GlidePathReturnMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RETURN_MODE_KEY, mode);
  } catch {
    // ignore
  }
}
