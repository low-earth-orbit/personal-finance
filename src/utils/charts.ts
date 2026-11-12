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

/** Shared Recharts axis styling: mono tick labels in the muted ledger ink. */
export const CHART_AXIS = {
  stroke: "var(--pf-border)",
  tick: {
    fontSize: 12,
    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
    fill: "var(--pf-muted)",
  },
};
