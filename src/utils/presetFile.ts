import { DEFAULTS } from "./presets";
import { migrateInput } from "./inputMigration";
import type { Preset, UserInput, UserInputKey } from "../types";

/** A preset as stored in an exported file: no id, values limited to known inputs. */
export interface PresetFileEntry {
  label: string;
  values: UserInput;
}

const FILE_APP = "rent-vs-buy";
const FILE_VERSION = 1;
const MAX_LABEL = 60;

/** JSON text for exporting the given presets. */
export function serializePresets(presets: Preset[]): string {
  return JSON.stringify(
    {
      app: FILE_APP,
      version: FILE_VERSION,
      exportedAt: new Date().toISOString(),
      presets: presets.map(({ label, values }) => ({ label, values })),
    },
    null,
    2,
  );
}

/**
 * Parse an exported presets file. Accepts the export format or a bare array of
 * `{ label, values }`. Unknown keys and non-numeric values are dropped; missing inputs take
 * their defaults. Throws an Error with a user-facing message when nothing usable is found.
 */
export function parsePresetFile(text: string): PresetFileEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The file isn't valid JSON.");
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { presets?: unknown }).presets)
      ? (data as { presets: unknown[] }).presets
      : null;
  if (!list) throw new Error("The file doesn't contain any presets.");

  const keys = Object.keys(DEFAULTS) as UserInputKey[];
  const entries: PresetFileEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { label, values } = item as { label?: unknown; values?: unknown };
    if (typeof label !== "string" || !label.trim()) continue;
    if (!values || typeof values !== "object") continue;
    // Files exported by an older version use older inputs; migrate before keeping known keys.
    const raw = migrateInput(values as Record<string, unknown>) as Record<string, unknown>;
    const clean = { ...DEFAULTS };
    let known = 0;
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "number" && Number.isFinite(v)) {
        clean[k] = v;
        known += 1;
      }
    }
    if (known === 0) continue;
    entries.push({ label: label.trim().slice(0, MAX_LABEL), values: clean });
  }
  if (entries.length === 0) throw new Error("The file doesn't contain any presets.");
  return entries;
}
