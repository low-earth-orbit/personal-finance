/** Convert a nominal geometric return and volatility to the matching arithmetic return. */
export function geometricToArithmetic(geometric: number, volatility: number): number {
  const onePlusGeo = 1 + geometric;
  const q2 = onePlusGeo * onePlusGeo;
  return Math.sqrt((q2 + Math.sqrt(q2 * q2 + 4 * q2 * volatility * volatility)) / 2) - 1;
}

/** Convert an arithmetic return and volatility to the matching geometric return. */
export function arithmeticToGeometric(arithmetic: number, volatility: number): number {
  const onePlusArith = 1 + arithmetic;
  return onePlusArith / Math.sqrt(1 + (volatility / onePlusArith) ** 2) - 1;
}

/** Convert nominal geometric inputs in percent to real arithmetic mean and volatility fractions. */
export function realArithmeticFromNominalGeometric(
  nominalGeoPct: number,
  nominalVolPct: number,
  inflationPct: number,
): { mean: number; vol: number } {
  const inflation = inflationPct / 100;
  const nominalArithmetic = geometricToArithmetic(nominalGeoPct / 100, nominalVolPct / 100);
  return {
    mean: (1 + nominalArithmetic) / (1 + inflation) - 1,
    vol: nominalVolPct / 100 / (1 + inflation),
  };
}
