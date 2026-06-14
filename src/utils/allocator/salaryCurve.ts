import type { SalaryCurvePreset } from "./types";

// Real wages rise over a career then flatten; none compound forever. Each
// climbing curve grows at its rate only until a plateau, after which real income
// holds flat. Plateaus are measured in years from the current age.
const EARLY_PEAK_PLATEAU_YEARS = 15;
const FAST_CLIMB_PLATEAU_YEARS = 20;
const FAST_CLIMB_RATE_MULTIPLIER = 1.5;

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
    return (
      startIncome * (1 + growth) ** Math.min(years, EARLY_PEAK_PLATEAU_YEARS)
    );
  }
  // Fast climb: a steeper rate that still plateaus at a career peak.
  return (
    startIncome *
    (1 + growth * FAST_CLIMB_RATE_MULTIPLIER) **
      Math.min(years, FAST_CLIMB_PLATEAU_YEARS)
  );
}
