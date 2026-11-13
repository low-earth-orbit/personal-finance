import type { UserInput } from "../types";

/** Insurance share split out of the old combined "maintenance & insurance" input. */
const LEGACY_INSURANCE_PCT = { condo: 0.1, house: 0.2 };

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Bring saved or imported inputs from older versions up to date, so a scenario keeps the same
 * meaning after the inputs change. Safe to run on current inputs (it changes nothing).
 *
 * - `maintPct` used to cover maintenance and insurance together. Split the insurance share out
 *   (0.1% with condo fees, 0.2% without, as the built-in presets do) so the total is unchanged.
 * - `maintAgingPct` was an extra yearly rise for maintenance and condo fees on top of
 *   `ownerCostGrowthRate`. With one growth rate for all owner costs, half of it is added: property
 *   tax grew at the old rate and upkeep at the old rate plus aging, so the new rate sits between.
 */
export function migrateInput(values: Record<string, unknown>): Partial<UserInput> {
  const next: Record<string, unknown> = { ...values };

  if (!("insurancePct" in next) && isNumber(next.maintPct)) {
    const isCondo = isNumber(next.condoFeesPerMonth) && next.condoFeesPerMonth > 0;
    const share = isCondo ? LEGACY_INSURANCE_PCT.condo : LEGACY_INSURANCE_PCT.house;
    const insurance = Math.max(0, Math.min(next.maintPct, share));
    next.insurancePct = insurance;
    next.maintPct = round2(next.maintPct - insurance);
  }

  if ("maintAgingPct" in next) {
    if (isNumber(next.maintAgingPct) && isNumber(next.ownerCostGrowthRate)) {
      next.ownerCostGrowthRate = round2(next.ownerCostGrowthRate + next.maintAgingPct / 2);
    }
    delete next.maintAgingPct;
  }

  return next as Partial<UserInput>;
}
