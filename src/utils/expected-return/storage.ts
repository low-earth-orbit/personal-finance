import { DEFAULTS, REGION_IDS } from "./presets";
import type { ExpectedReturnInput, GlobalKey, RegionKey } from "./types";

export const KEY = "er_input";

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export function cloneDefaults(): ExpectedReturnInput {
  return structuredClone(DEFAULTS);
}

/** Keeps only finite numeric fields from saved data; anything else falls back to the default. */
export function migrateInput(value: unknown): ExpectedReturnInput {
  const next = cloneDefaults();
  const parsed = asRecord(value);

  for (const key of Object.keys(DEFAULTS).filter((k) => k !== "regions") as GlobalKey[]) {
    if (isNumber(parsed[key])) next[key] = parsed[key];
  }

  const regions = asRecord(parsed.regions);
  for (const id of REGION_IDS) {
    const saved = asRecord(regions[id]);
    for (const key of Object.keys(DEFAULTS.regions[id]) as RegionKey[]) {
      if (isNumber(saved[key])) next.regions[id][key] = saved[key];
    }
  }
  return next;
}

export function loadInput(): ExpectedReturnInput {
  if (typeof window === "undefined") return cloneDefaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? migrateInput(JSON.parse(raw)) : cloneDefaults();
  } catch {
    return cloneDefaults();
  }
}

export function saveInput(input: ExpectedReturnInput): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(input));
  } catch {
    // localStorage may be unavailable (private mode, quota); ignore.
  }
}

export function clearInput(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
