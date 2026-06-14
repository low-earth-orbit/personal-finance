export const TAX_YEAR = 2025;

export interface TaxBracket {
  threshold: number;
  rate: number;
}

export const FEDERAL_BRACKETS: TaxBracket[] = [
  { threshold: 0, rate: 0.145 },
  { threshold: 57_375, rate: 0.205 },
  { threshold: 114_750, rate: 0.26 },
  { threshold: 177_882, rate: 0.29 },
  { threshold: 253_414, rate: 0.33 },
];

export const FEDERAL_BPA = {
  max: 16_129,
  min: 14_538,
  phaseoutStart: 177_882,
  phaseoutEnd: 253_414,
  creditRate: 0.145,
} as const;

export const PROVINCIAL_TAX = {
  NB: {
    brackets: [
      { threshold: 0, rate: 0.094 },
      { threshold: 51_306, rate: 0.14 },
      { threshold: 102_614, rate: 0.16 },
      { threshold: 190_060, rate: 0.195 },
    ],
    bpa: 13_396,
  },
  ON: {
    brackets: [
      { threshold: 0, rate: 0.0505 },
      { threshold: 52_886, rate: 0.0915 },
      { threshold: 105_775, rate: 0.1116 },
      { threshold: 150_000, rate: 0.1216 },
      { threshold: 220_000, rate: 0.1316 },
    ],
    bpa: 12_747,
  },
  BC: {
    brackets: [
      { threshold: 0, rate: 0.0506 },
      { threshold: 49_279, rate: 0.077 },
      { threshold: 98_560, rate: 0.105 },
      { threshold: 113_158, rate: 0.1229 },
      { threshold: 137_407, rate: 0.147 },
      { threshold: 186_306, rate: 0.168 },
      { threshold: 259_829, rate: 0.205 },
    ],
    bpa: 12_932,
  },
} as const;

export const ON_SURTAX = [
  { overBasicTax: 5_710, rate: 0.2 },
  { overBasicTax: 7_307, rate: 0.36 },
] as const;

export const ON_TAX_REDUCTION = {
  max: 286,
  phaseoutStart: 18_411,
  phaseoutRate: 0.0505,
} as const;

export const BC_TAX_REDUCTION = {
  max: 562,
  phaseoutStart: 25_020,
  phaseoutRate: 0.0356,
} as const;
