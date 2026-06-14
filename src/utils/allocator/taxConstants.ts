export const TAX_YEAR = 2026;

export interface TaxBracket {
  threshold: number;
  rate: number;
}

// 2026 federal: lowest rate is 14% (the 2025 transition year used 14.5%).
export const FEDERAL_BRACKETS: TaxBracket[] = [
  { threshold: 0, rate: 0.14 },
  { threshold: 58_523, rate: 0.205 },
  { threshold: 117_045, rate: 0.26 },
  { threshold: 181_440, rate: 0.29 },
  { threshold: 258_482, rate: 0.33 },
];

export const FEDERAL_BPA = {
  max: 16_452,
  min: 14_829,
  phaseoutStart: 181_440,
  phaseoutEnd: 258_482,
  creditRate: 0.14,
} as const;

export const PROVINCIAL_TAX = {
  NB: {
    brackets: [
      { threshold: 0, rate: 0.094 },
      { threshold: 52_333, rate: 0.14 },
      { threshold: 104_666, rate: 0.16 },
      { threshold: 193_861, rate: 0.195 },
    ],
    bpa: 13_664,
  },
  ON: {
    brackets: [
      { threshold: 0, rate: 0.0505 },
      { threshold: 53_891, rate: 0.0915 },
      { threshold: 107_785, rate: 0.1116 },
      { threshold: 150_000, rate: 0.1216 },
      { threshold: 220_000, rate: 0.1316 },
    ],
    bpa: 12_989,
  },
  BC: {
    brackets: [
      { threshold: 0, rate: 0.056 },
      { threshold: 50_363, rate: 0.077 },
      { threshold: 100_728, rate: 0.105 },
      { threshold: 115_648, rate: 0.1229 },
      { threshold: 140_430, rate: 0.147 },
      { threshold: 190_405, rate: 0.168 },
      { threshold: 265_545, rate: 0.205 },
    ],
    bpa: 13_216,
  },
} as const;

export const ON_SURTAX = [
  { overBasicTax: 5_818, rate: 0.2 },
  { overBasicTax: 7_446, rate: 0.36 },
] as const;

// 2026 Ontario tax reduction: the tax-reduction basic amount (distinct from the
// Ontario BPA) is doubled, and the claimable credit is that doubled amount less
// Ontario tax after surtax (so it fully phases out as tax rises). Modeled exactly
// rather than as a linear ramp.
export const ON_TAX_REDUCTION = {
  basicAmount: 300,
} as const;

export const BC_TAX_REDUCTION = {
  max: 690,
  phaseoutStart: 25_570,
  phaseoutRate: 0.0356,
} as const;

// 2026 RRSP contribution limit: 18% of earned income, capped at the dollar
// limit. Used to model that, in any future year, the saver already fills that
// year's fresh RRSP room with new contributions deducted at that year's top
// rate — so a carried-forward deduction stacks *below* it, not on top.
export const RRSP_CONTRIBUTION = {
  earnedIncomeRate: 0.18,
  dollarLimit: 33_810,
} as const;
