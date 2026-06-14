# Lump-sum Allocation Optimizer Methodology

## Optimization basis

The allocator splits one lump sum across TFSA, RRSP, and non-registered
investments to maximize projected after-tax value at retirement. The RRSP
allocation can be divided between deductions claimed now and deductions carried
forward. The optimizer chooses both the split and the carry-forward claim age
automatically.

The allocation uses a `$1,000` search grid, plus any remainder below `$1,000`.
It respects the entered static RRSP and TFSA room. Amounts above available room
spill into non-registered investments.

For a deduction claimed in year `Y`, the refund is calculated once on all
deductions claimed that year:

```text
refund_Y = taxOwed(income_Y) - taxOwed(income_Y - totalDeductionClaimed_Y)
```

The refund enters available TFSA room in `Y + 1`, with overflow going to
non-registered. An immediate RRSP deduction is claimed at the current age. A
carried-forward deduction is claimed together at the optimizer-selected future
age. A deduction can cross brackets and Ontario surtax or premium bands, so the
engine calculates the full tax difference rather than assuming a point marginal
rate.

## Tax engine

The engine uses 2025 federal and NB, ON, and BC rules. Federal and provincial
tax are separate statutory components, each floored at zero. Basic personal
amounts are non-refundable credits. The federal BPA phases from its maximum to
minimum through the top-bracket phaseout range.

Ontario includes cumulative surtaxes on Ontario basic tax after credits and
before the tax reduction, followed by the Ontario tax reduction and health
premium. BC includes its low-income tax reduction. Marginal rates are computed
using a one-sided finite difference of total tax owed, so surtax, health-premium,
tax-reduction, and BPA-phaseout effects appear. Marginal rates are not assumed
to be monotonic.

The 2025 figures are held constant, effectively assuming full indexation. Other
credits and provinces are excluded.

## Accumulation and taxable ledger

Registered accounts use real-dollar contributions and a real return derived
from the nominal portfolio return and inflation. Contributions use a mid-year
flow convention.

The non-registered ledger runs in nominal dollars. Each real contribution is
inflated before entering. Every contribution and every reinvested after-tax
distribution increases adjusted cost base. Distributions are treated as
interest income and stacked on that year's salary:

```text
distribution tax = taxOwed(salary + distribution) - taxOwed(salary)
price return = nominal total return - distribution yield
```

At retirement, balance and ACB are deflated to real dollars. Positive gains are
taxed at a 50% inclusion rate using the assumed retirement tax rate. Capital
losses receive no benefit in this model.

## Withdrawal-rate haircut

The entered RRSP withdrawal tax rate is an effective average rate applied as a
flat haircut to the whole RRSP balance. This can penalize RRSP if actual
withdrawals would fill lower brackets, or flatter RRSP if withdrawals stack on
other income or trigger OAS recovery. OAS clawback is not modeled; increasing
the entered withdrawal rate can approximate it.

## Not modeled

- Provinces beyond NB, ON, and BC
- Eligible-dividend gross-up and dividend tax credit
- OAS recovery-tax engine
- Annual RRSP and TFSA room accrual
- FHSA
- Return variance and sequence risk
- Same-after-tax-cost RRSP gross-up

Results are deterministic illustrations, not tax or investment advice.
