import type { SalaryCurvePreset } from "./types";

export function incomeAtAge(
  age: number,
  currentAge: number,
  curve: SalaryCurvePreset,
  startIncome: number,
  growthPct: number,
): number {
  const years = Math.max(0, age - currentAge);
  const growth = growthPct / 100;
  if (curve === "flat") return startIncome;
  if (curve === "steady-climb") return startIncome * (1 + growth) ** years;
  if (curve === "early-peak") {
    return startIncome * (1 + growth) ** Math.min(years, 10);
  }
  return startIncome * (1 + growth * 1.5) ** years;
}
