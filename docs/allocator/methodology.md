# Lump-sum Allocation Optimizer Methodology

## Optimization basis

The allocator invests the full entered lump sum this year across TFSA, RRSP, and
non-registered investments. It searches for a high-value split using projected
after-tax value at retirement as the objective. RRSP contributions happen now,
but their deduction claims can be divided across the current and future years.
The optimizer chooses both the account split and the deduction schedule.

The allocation search starts with a coarse grid sized to cap the initial pass at
roughly 1,000 increments. It then progressively refines the best plan through
smaller exchange grids down to `$1` precision. This avoids exhaustively
enumerating every dollar from zero. It respects the entered static RRSP and TFSA
room. Amounts above available room spill into non-registered investments.

For each year `Y`, non-registered distributions and RRSP deductions are settled
together against the modeled salary:

```text
tax change_Y =
  taxOwed(income_Y + taxableDistribution_Y - deductionClaimed_Y)
  - taxOwed(income_Y)
```

A negative tax change is a refund. It enters available TFSA room in `Y + 1`,
with overflow going to non-registered. Entered TFSA room and carried RRSP
deductions remain fixed nominal amounts; their real value therefore shrinks with
inflation. A positive tax change reduces the distribution amount reinvested.
Deductions can cross brackets and Ontario surtax or premium bands, so the engine
calculates the full tax difference rather than assuming a point marginal rate.

Each resolution starts with greedy grid-sized additions or the prior coarser
plan, then improves the plan using grid-sized exchanges between every account
and deduction-year bucket. It never returns deferred claims that value worse
than claiming the same RRSP contributions now. This is a deterministic
multi-resolution local search, not a proof of the global continuous optimum.

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

All 2025 brackets, rates, credits, surtax thresholds, premium thresholds, and
reduction thresholds are held constant in real dollars. This is equivalent to
fully indexing the modeled tax system with inflation. Other credits and
provinces are excluded.

## Accumulation and taxable ledger

All account ledgers run in nominal dollars and are deflated once at retirement.
The entered lump sum is invested at the start of the first modeled year and
receives a full year of growth. Later tax refunds use a mid-year flow convention.

Every non-registered contribution and every reinvested after-tax distribution
increases adjusted cost base. Distributions are treated as interest income and
stacked on that year's real-dollar salary:

```text
price return = nominal total return - distribution yield
```

At retirement, balance and ACB are deflated to real dollars. Positive gains are
taxed at a 50% inclusion rate using the entered capital-gains tax rate. Capital
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
- Future changes in real tax brackets, rates, credits, or tax law

Results are deterministic illustrations, not tax or investment advice.
