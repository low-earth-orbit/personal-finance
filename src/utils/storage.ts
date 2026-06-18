import type { Preset, UserInput, UserInputKey } from "../types";

const KEY_INPUT = "rvb_userInput";
const KEY_ADVANCED_LEGACY = "rvb_advanced";
const KEY_EXPANDED_FIELDS = "rvb_expanded_fields";
const KEY_CUSTOM = "rvb_customPresets";
const KEY_HIDDEN = "rvb_hiddenBuiltins";
const KEY_ACTIVE = "rvb_activePresetId";
const KEY_DISCLAIMER = "rvb_disclaimerAccepted";

const ALL_KEYS = [
  KEY_INPUT,
  KEY_ADVANCED_LEGACY,
  KEY_EXPANDED_FIELDS,
  KEY_CUSTOM,
  KEY_HIDDEN,
  KEY_ACTIVE,
  KEY_DISCLAIMER,
];

function safeGet(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore (private mode, quota, etc.)
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadInput(): Partial<UserInput> | null {
  const v = safeGet(KEY_INPUT);
  return v && typeof v === "object" ? (v as Partial<UserInput>) : null;
}

export function saveInput(obj: UserInput): void {
  safeSet(KEY_INPUT, obj);
}

export function clearInput(): void {
  safeRemove(KEY_INPUT);
}

export function loadExpandedFields(): UserInputKey[] | null {
  const v = safeGet(KEY_EXPANDED_FIELDS);
  return Array.isArray(v) ? (v.filter((s) => typeof s === "string") as UserInputKey[]) : null;
}

export function saveExpandedFields(arr: UserInputKey[]): void {
  safeSet(KEY_EXPANDED_FIELDS, Array.isArray(arr) ? arr : []);
}

// One-shot read of the legacy `rvb_advanced` boolean. Returns the value (if
// any) and removes the key so subsequent loads no longer see it.
export function consumeLegacyAdvanced(): boolean | null {
  const v = safeGet(KEY_ADVANCED_LEGACY);
  safeRemove(KEY_ADVANCED_LEGACY);
  return typeof v === "boolean" ? v : null;
}

export function loadCustomPresets(): Preset[] | null {
  const v = safeGet(KEY_CUSTOM);
  return Array.isArray(v) ? (v as Preset[]) : null;
}

export function saveCustomPresets(arr: Preset[]): void {
  safeSet(KEY_CUSTOM, arr);
}

export function loadHiddenBuiltins(): string[] | null {
  const v = safeGet(KEY_HIDDEN);
  return Array.isArray(v) ? (v as string[]) : null;
}

export function saveHiddenBuiltins(arr: string[]): void {
  safeSet(KEY_HIDDEN, arr);
}

export function loadActivePresetId(): string | null {
  const v = safeGet(KEY_ACTIVE);
  return typeof v === "string" ? v : null;
}

export function saveActivePresetId(id: string | null): void {
  if (id == null) safeRemove(KEY_ACTIVE);
  else safeSet(KEY_ACTIVE, id);
}

export function loadDisclaimerAccepted(): boolean {
  return safeGet(KEY_DISCLAIMER) === true;
}

export function saveDisclaimerAccepted(): void {
  safeSet(KEY_DISCLAIMER, true);
}

export function clearAll(): void {
  for (const k of ALL_KEYS) safeRemove(k);
}
