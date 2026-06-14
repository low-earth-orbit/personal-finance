/**
 * PWL Capital-based nominal expected returns and volatility by stock/bond mix.
 * Shared by tools so portfolio assumptions have one source of truth.
 */
export const ALLOCATIONS = {
  "100/0": { returnPct: 6.87, volatility: 12.57 },
  "90/10": { returnPct: 6.59, volatility: 11.59 },
  "80/20": { returnPct: 6.29, volatility: 10.62 },
  "70/30": { returnPct: 5.99, volatility: 9.68 },
  "60/40": { returnPct: 5.67, volatility: 8.79 },
  "50/50": { returnPct: 5.35, volatility: 7.94 },
  "40/60": { returnPct: 5.01, volatility: 7.17 },
  "30/70": { returnPct: 4.66, volatility: 6.49 },
  "20/80": { returnPct: 4.3, volatility: 5.94 },
  "10/90": { returnPct: 3.93, volatility: 5.56 },
  "0/100": { returnPct: 3.55, volatility: 5.38 },
} as const;

export type AllocationId = keyof typeof ALLOCATIONS;
