/** A fraction as a percent with `digits` decimals, using a true minus sign: -0.007 -> "−0.70%". */
export function formatRate(value: number, digits = 1): string {
  const text = `${Math.abs(value * 100).toFixed(digits)}%`;
  return value < 0 && Number(text.slice(0, -1)) !== 0 ? `−${text}` : text;
}

/** Like `formatRate` but always signed, for changes: 0.003 -> "+0.30%". */
export function formatSignedRate(value: number, digits = 2): string {
  const text = formatRate(value, digits);
  return text.startsWith("−") || Number(text.slice(0, -1)) === 0 ? text : `+${text}`;
}
