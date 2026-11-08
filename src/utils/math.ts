// monthly interest rate, semi-annual compounding
export function calculateMonthlyMortgageInterestRate(annualMortgageInterestRate: number): number {
  const rate = Math.pow(Math.pow(annualMortgageInterestRate / 2 / 100 + 1, 2), 1 / 12) - 1;
  return rate;
}

// monthly mortgage payment
export function calculateMonthlyMortgagePayment(
  mortgagePrincipal: number,
  annualMortgageInterestRate: number,
  amortization: number,
): number {
  // Soft-fail on invalid inputs (e.g. a field cleared mid-edit) rather than
  // throwing, which would crash any synchronous caller such as the form readout.
  if (amortization <= 0) return 0;

  if (mortgagePrincipal <= 0) return 0;

  if (annualMortgageInterestRate === 0) {
    return mortgagePrincipal / (amortization * 12);
  }

  const monthlyRate = calculateMonthlyMortgageInterestRate(annualMortgageInterestRate);

  const totalPayments = amortization * 12;

  if (monthlyRate === 0) {
    return mortgagePrincipal / totalPayments;
  }

  const monthlyPayment =
    (mortgagePrincipal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -totalPayments));

  return monthlyPayment;
}

export function calculateMortgagePrincipal(
  initialHomePrice: number,
  downPaymentPercentage: number,
): number {
  return initialHomePrice * (1 - downPaymentPercentage / 100);
}

/**
 * Canadian insured (high-ratio) mortgage rules, effective Dec 15, 2024 (CMHC; Sagen and
 * Canada Guaranty use the same premiums): homes under $1.5M can be bought with less than 20%
 * down, with a minimum of 5% of the first $500k plus 10% of the rest. The premium is a share of
 * the loan, added to the mortgage; a 30-year amortization (first-time buyers or new builds)
 * adds 0.20 points.
 */
export const INSURED_PRICE_CAP = 1_500_000;
const INSURED_PREMIUM_TIERS: { maxLtvPct: number; rate: number }[] = [
  { maxLtvPct: 85, rate: 0.028 },
  { maxLtvPct: 90, rate: 0.031 },
  { maxLtvPct: 95, rate: 0.04 },
];
const LONG_AMORTIZATION_SURCHARGE = 0.002;

/** Minimum down payment (% of price) for a purchase at this price. */
export function minimumDownPaymentPct(initialHomePrice: number): number {
  if (initialHomePrice <= 0) return 5;
  if (initialHomePrice >= INSURED_PRICE_CAP) return 20;
  const minimum =
    0.05 * Math.min(initialHomePrice, 500_000) + 0.1 * Math.max(0, initialHomePrice - 500_000);
  return (minimum / initialHomePrice) * 100;
}

/** Mortgage default insurance premium as a fraction of the loan (0 with 20%+ down). */
export function mortgageInsurancePremiumRate(
  downPaymentPercentage: number,
  amortization: number,
): number {
  if (downPaymentPercentage >= 20) return 0;
  const ltvPct = 100 - downPaymentPercentage;
  const tier =
    INSURED_PREMIUM_TIERS.find((t) => ltvPct <= t.maxLtvPct + 1e-9) ??
    INSURED_PREMIUM_TIERS[INSURED_PREMIUM_TIERS.length - 1];
  return tier.rate + (amortization > 25 ? LONG_AMORTIZATION_SURCHARGE : 0);
}

/** Opening mortgage balance: the loan plus any insurance premium rolled into it. */
export function calculateOpeningMortgageBalance(
  initialHomePrice: number,
  downPaymentPercentage: number,
  amortization: number,
): number {
  const loan = calculateMortgagePrincipal(initialHomePrice, downPaymentPercentage);
  return loan * (1 + mortgageInsurancePremiumRate(downPaymentPercentage, amortization));
}
