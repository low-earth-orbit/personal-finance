import type { SalaryCurvePreset } from "./types";

const FIXED_CURVE_TERMS: Record<
  Exclude<SalaryCurvePreset, "custom">,
  { growthPct: number; growthYears: number }
> = {
  flat: { growthPct: 0, growthYears: 0 },
  modest: { growthPct: 1, growthYears: 15 },
  strong: { growthPct: 2, growthYears: 15 },
  fast: { growthPct: 3, growthYears: 15 },
};

export function salaryCurveTerms(
  curve: SalaryCurvePreset,
  customGrowthPct: number,
  customGrowthYears: number,
): { growthPct: number; growthYears: number } {
  return curve === "custom"
    ? { growthPct: customGrowthPct, growthYears: customGrowthYears }
    : FIXED_CURVE_TERMS[curve];
}

export function incomeAtAge(
  age: number,
  currentAge: number,
  curve: SalaryCurvePreset,
  startIncome: number,
  customGrowthPct: number,
  customGrowthYears: number,
): number {
  const years = Math.max(0, age - currentAge);
  const { growthPct, growthYears } = salaryCurveTerms(
    curve,
    customGrowthPct,
    customGrowthYears,
  );
  return startIncome * (1 + growthPct / 100) ** Math.min(years, growthYears);
}
