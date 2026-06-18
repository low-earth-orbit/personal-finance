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
