import { DEFAULTS, PORTFOLIO_PRESETS } from "./presets";
import type {
  AllocatorInput,
  PortfolioPresetId,
  Province,
  SalaryCurvePreset,
} from "./types";

export const KEY = "alloc_input";

const provinces: Province[] = ["NB", "ON", "BC"];
const curves: SalaryCurvePreset[] = [
  "flat",
  "modest",
  "strong",
  "fast",
  "custom",
];
const portfolioIds = PORTFOLIO_PRESETS.map(
  (preset) => preset.id,
) as PortfolioPresetId[];
portfolioIds.push("custom");

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

export function migrateInput(value: unknown): AllocatorInput {
  if (!value || typeof value !== "object") return { ...DEFAULTS };
  const parsed = value as Record<string, unknown>;
  const next = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof AllocatorInput)[]) {
    if (
      typeof DEFAULTS[key] === "number" &&
      typeof parsed[key] === "number" &&
      Number.isFinite(parsed[key])
    ) {
      (next[key] as number) = parsed[key];
    }
  }
  next.province = enumValue(parsed.province, provinces, DEFAULTS.province);
  if (
    parsed.salaryCurve === "steady-climb" ||
    parsed.salaryCurve === "early-peak" ||
    parsed.salaryCurve === "aggressive"
  ) {
    next.salaryCurve = "custom";
    next.salaryGrowthYears =
      parsed.salaryCurve === "early-peak"
        ? 15
        : parsed.salaryCurve === "aggressive"
          ? 20
          : Math.max(0, next.retirementAge - next.currentAge);
    if (parsed.salaryCurve === "aggressive") {
      next.salaryGrowthPct *= 1.5;
    }
  } else {
    next.salaryCurve = enumValue(
      parsed.salaryCurve,
      curves,
      DEFAULTS.salaryCurve,
    );
  }
  next.portfolioPresetId = enumValue(
    parsed.portfolioPresetId,
    portfolioIds,
    DEFAULTS.portfolioPresetId,
  );
  return next;
}

export function loadInput(): AllocatorInput {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? migrateInput(JSON.parse(raw)) : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function hasSavedInput(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
}

export function saveInput(input: AllocatorInput): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(input));
  } catch {
    // Storage may be unavailable or full.
  }
}

export function clearInput(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage may be unavailable.
  }
}
