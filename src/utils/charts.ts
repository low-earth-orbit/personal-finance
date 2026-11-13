// Generate ticker values at regular intervals (e.g. every 5 years) based on the data range
export const generateTicks = (min: number, max: number, step = 5) => {
  const ticks = [];
  // Round min down and max up to the nearest multiple of 5
  const start = Math.ceil(min / step) * step;
  const end = Math.floor(max / step) * step;

  for (let i = start; i <= end; i += step) {
    ticks.push(i);
  }
  return ticks;
};

/**
 * Evenly spaced round ticks covering [min, max]: the smallest step of 1, 2, 2.5 or 5 × 10^k that
 * needs no more than `maxTicks` ticks. Use the first and last tick as the axis domain, so the axis
 * reads $0 / $1M / $2M rather than whatever values the data happens to end on.
 */
export function niceTicks(min: number, max: number, maxTicks = 7): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  const lo = Math.min(min, max);
  const hi = lo === Math.max(min, max) ? lo + 1 : Math.max(min, max);
  let magnitude = 10 ** Math.floor(Math.log10((hi - lo) / maxTicks));
  for (;;) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * magnitude;
      const first = Math.floor(lo / step);
      const last = Math.ceil(hi / step);
      if (last - first + 1 <= maxTicks) {
        return Array.from({ length: last - first + 1 }, (_, i) =>
          Number(((first + i) * step).toPrecision(12)),
        );
      }
    }
    magnitude *= 10;
  }
}

/** Shared Recharts axis styling: mono tick labels in the muted ledger ink. */
export const CHART_AXIS = {
  stroke: "var(--pf-border)",
  tick: {
    fontSize: 12,
    fontFamily: "var(--font-sans), system-ui, sans-serif",
    fill: "var(--pf-muted)",
  },
};
