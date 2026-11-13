import { DEFAULT_DYNAMICS, DEFAULTS } from "./presets";
import type { DynamicsMode, SwrInput, SwrInputKey } from "./types";

const KEY = "swr_input";
const DYNAMICS_KEY = "swr_dynamics";

export function loadInput(): SwrInput {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<SwrInputKey, unknown>>;
    // Keep only numeric fields; anything else falls back to the default.
    const current = Object.fromEntries(
      (Object.keys(DEFAULTS) as SwrInputKey[])
        .filter((key) => typeof parsed[key] === "number")
        .map((key) => [key, parsed[key]]),
    ) as Partial<SwrInput>;
    return { ...DEFAULTS, ...current };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveInput(input: SwrInput): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(input));
  } catch {
    // localStorage may be unavailable (private mode, quota); ignore.
  }
}

export function loadDynamics(): DynamicsMode {
  if (typeof window === "undefined") return DEFAULT_DYNAMICS;
  try {
    const raw = window.localStorage.getItem(DYNAMICS_KEY);
    if (raw === "independent" || raw === "historical" || raw === "custom") return raw;
  } catch {
    // ignore
  }
  return DEFAULT_DYNAMICS;
}

export function saveDynamics(mode: DynamicsMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DYNAMICS_KEY, mode);
  } catch {
    // ignore
  }
}
