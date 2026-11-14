import type { Preset, UserInput, UserInputKey } from "../types";

export const INPUT_UNCERTAINTIES = {
  homePriceGrowthSigma: 2.0,
  investmentReturnSigma: 2.0,
  rentIncreaseSigma: 1,
  ownerCostGrowthSigma: 1,
  mortgageRateSigma: 1.5,
  dividendYieldSigma: 0.3,
};

/**
 * National base case: nominal best estimates over a 10-20 year hold, reviewed Nov 2026.
 * Growth rates are compound (the median path grows at the rate entered).
 */
export const DEFAULTS = {
  monthlyRent: 3500,
  initialHomePrice: 1000000,
  // Rents track incomes (~3%) in the long run, less for one ageing unit under provincial
  // increase limits, and asking rents are falling today.
  rentIncreaseRate: 2.6,
  // One rate for property tax, condo fees, maintenance and insurance: a little above ~2.1%
  // inflation, because repairs and rebuilding are mostly skilled labour (wages outpace prices),
  // buildings age over the hold, and municipal levies have grown faster than prices.
  ownerCostGrowthRate: 3,
  // ~2.1% inflation + ~0.4% real. Below the last 40 years (falling rates and a price-to-income
  // ratio that doubled can't repeat) and held back near term (CREA: +0.2% 2026, +1.2% 2027);
  // above inflation because real incomes still grow and land stays scarce.
  homePriceGrowthRate: 2.5,
  buyerClosingCostsPct: 2,
  // Commission + sales tax + legal: ~5.7% Ontario, ~5.2% Quebec, ~3.5% BC and Alberta.
  sellerClosingCostsPct: 5,
  // Effective rate on market value: 0.3-0.7% in the big metros where homes cost this much,
  // 1%+ in smaller cities.
  propertyTaxRate: 0.7,
  // Repairs and replacements. Land doesn't wear out, so the share of price is lower for a $1M
  // home than a cheap one.
  maintPct: 1,
  // Home insurance less the tenant insurance a renter would pay: ~0.2% for a house, ~0.1% for a
  // condo unit (the building is insured through the condo fees).
  insurancePct: 0.2,
  condoFeesPerMonth: 0,
  downPaymentPercentage: 20,
  annualMortgageInterestRate: 4.5,
  amortization: 25,
  holdingPeriod: 12,
  // 80/20 global index portfolio after ~0.2% fund fees: equities ~6.8%, bonds ~3.8%.
  investmentReturnRate: 6,
  dividendYield: 2.4,
  dividendTaxRate: 22.5,
  capitalGainTaxRate: 15.6,
  /**
   * Share of invested savings (renter's and owner's) held in tax-sheltered accounts, treated as
   * TFSA-like. 50%: a couple's unused TFSA room (~$218k by 2026 if never used) plus RRSP room
   * could shelter most of a typical down payment, but many people have already used part of it,
   * and the portfolio outgrows new room over a long horizon.
   */
  taxShelteredPct: 50,
  ...INPUT_UNCERTAINTIES,
};

/**
 * Market presets. Price, rent and fees describe one matched unit as of Nov 2026; growth rates are
 * nominal best estimates over a 10-20 year hold. Anything not overridden inherits the national
 * DEFAULTS. Refresh prices/rents from the local board reports (TRREB, GVR, CREB, QPAREB, NSAR).
 */
export const PRESETS: Preset[] = [
  { id: "defaults", label: "Base Case", values: DEFAULTS },
  {
    // Downtown Toronto ~680 sq ft 1-bed+den. Urbanation Q2 2026 condo rent $3.74/sq ft;
    // TRREB C01 condo median ~$615k (Q1 2026), City condo average $659k (Oct 2026).
    id: "bay-street",
    label: "Bay Street Condo",
    values: {
      ...DEFAULTS,
      // Benchmark still falling (-7% y/y) with unsold inventory to clear, then a recovery as
      // completions dry up: roughly flat for 3-4 years, ~2.5% after.
      homePriceGrowthRate: 1.5,
      monthlyRent: 2550,
      initialHomePrice: 650000,
      maintPct: 0.4,
      insurancePct: 0.1,
      condoFeesPerMonth: 550,
      // 0.77% statutory rate on frozen 2016 assessments, about 0.5% of today's market value.
      propertyTaxRate: 0.49,
      // Ontario + Toronto land transfer tax: ~3.3% repeat buyer, ~2% first-time buyer.
      buyerClosingCostsPct: 2.5,
      sellerClosingCostsPct: 6,
    },
  },
  {
    // City of Toronto 3-bed semi-detached. TRREB 416 semi average $1,225,229 (Oct 2026; detached
    // is $1.6M). Rent is a judgment call: 3-bed listings average $3,300-3,650, a home at this
    // price rents above that.
    id: "toronto-house",
    label: "Toronto house",
    values: {
      ...DEFAULTS,
      // A little above national and well above the condo: scarce land, and house prices are
      // holding (semi +0.5% y/y) while condos fall. Capped by a ~4% gross rent yield.
      homePriceGrowthRate: 2.7,
      monthlyRent: 4000,
      initialHomePrice: 1225000,
      // Most of the value is land, so upkeep is a smaller share of price than the 1% default.
      maintPct: 0.8,
      // Same frozen-2016-assessment effect as the condo.
      propertyTaxRate: 0.5,
      // Ontario + Toronto land transfer tax ~3.4% plus legal; rebates are small at this price.
      buyerClosingCostsPct: 3.5,
      sellerClosingCostsPct: 5.5,
    },
  },
  {
    // City of Vancouver ~700 sq ft 1-bed+den. GVR apartment benchmark $673k metro (Oct 2026),
    // roughly $635k East / $750k West; Rentals.ca average asking rent $2,754.
    id: "vancouver",
    label: "Vancouver condo",
    values: {
      ...DEFAULTS,
      // Same shape as Toronto: benchmark -6% y/y, loose supply near term, recovery later.
      homePriceGrowthRate: 1.5,
      monthlyRent: 2750,
      initialHomePrice: 700000,
      maintPct: 0.7,
      insurancePct: 0.1,
      condoFeesPerMonth: 450,
      propertyTaxRate: 0.3,
      // Property transfer tax: ~2% repeat buyer, under 1% with the first-time buyer exemption.
      buyerClosingCostsPct: 1.5,
      // 7% on the first $100k + 2.5% on the balance, plus GST and legal.
      sellerClosingCostsPct: 3.5,
    },
  },
  {
    // CREB detached benchmark $735,100 (Oct 2026); 3-bed house asking rents $2,350-2,600.
    id: "calgary",
    label: "Calgary House",
    values: {
      ...DEFAULTS,
      // Above national: land-heavy detached, strong in-migration, price-to-income well below
      // Toronto/Vancouver. Not higher: elastic supply, and prices were flat 2007-2020.
      homePriceGrowthRate: 2.8,
      // No rent control.
      rentIncreaseRate: 2.8,
      monthlyRent: 2500,
      initialHomePrice: 735000,
      maintPct: 1.3,
      propertyTaxRate: 0.67,
      // No land transfer tax: land titles fees, legal, inspection.
      buyerClosingCostsPct: 0.6,
      // 7% on the first $100k + 3% on the balance, plus GST and legal.
      sellerClosingCostsPct: 4,
    },
  },
  {
    // Island of Montreal 2-bed, ~850 sq ft. Median condo price $430,500 (Oct 2026); 2-bed asking
    // rents $1,900-2,250 depending on source.
    id: "montreal",
    label: "Montreal Condo",
    values: {
      ...DEFAULTS,
      // Holding up (+0.3% y/y) with a ~6% gross rent yield and no Toronto-style glut; slightly
      // under national for an ageing condo structure.
      homePriceGrowthRate: 2.0,
      // Tribunal (TAL) guideline now tracks a 3-year CPI average for sitting tenants.
      rentIncreaseRate: 2.4,
      monthlyRent: 2100,
      initialHomePrice: 430000,
      maintPct: 0.7,
      insurancePct: 0.1,
      condoFeesPerMonth: 330,
      propertyTaxRate: 0.7,
      // Welcome tax ~1.1% at this price, plus notary.
      buyerClosingCostsPct: 1.5,
      sellerClosingCostsPct: 5.5,
    },
  },
  {
    // Halifax-Dartmouth detached. Median sale $568k, single-family average $645k, composite
    // benchmark ~$545k (Sep-Oct 2026). Rent is an estimate: no solid 3-bed house figure found.
    id: "halifax",
    label: "Halifax House",
    values: {
      ...DEFAULTS,
      // Prices roughly doubled 2019-2023 and are easing (benchmark -4% y/y), so a little under
      // national while that run-up is digested.
      homePriceGrowthRate: 2.2,
      monthlyRent: 2800,
      initialHomePrice: 575000,
      maintPct: 1.3,
      // ~1.135% urban rate; the assessment cap resets to market value on sale.
      propertyTaxRate: 1.1,
      // 1.5% deed transfer tax, no first-time buyer rebate, plus legal.
      buyerClosingCostsPct: 2,
      sellerClosingCostsPct: 5.5,
    },
  },
];

export function getActivePreset(userInput: UserInput, allPresets: Preset[]): Preset | null {
  return (
    allPresets.find((p) =>
      (Object.keys(p.values) as UserInputKey[]).every((k) => p.values[k] === userInput[k]),
    ) ?? null
  );
}
