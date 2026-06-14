# Lump-sum Allocation Optimizer Methodology

## Optimization basis

The allocator invests the full entered lump sum this year across TFSA, RRSP, and
non-registered investments. It searches for a high-value split using projected
after-tax value at retirement as the objective. RRSP contributions happen now,
but their deduction claims can be divided across the current and future years.
The optimizer chooses both the account split and the deduction schedule.

The entered income is the saver's full taxable income for the current tax year,
**before** any RRSP deduction (the engine subtracts the claim itself). A
deduct-now claim is applied to that income at this year's marginal rate, and its
refund is dated to the following year — matching a contribution made this year,
deducted on this year's return, refunded the next spring. The first-60-days rule
(deducting an early-year contribution against the prior year) is not modeled; a
saver using it should enter the prior year's income.

The allocation search starts with a coarse grid sized to cap the initial pass at
roughly 1,000 increments. It then progressively refines the best plan through
smaller exchange grids down to `$1` precision. This avoids exhaustively
enumerating every dollar from zero. It respects the entered static RRSP and TFSA
room. Amounts above available room spill into non-registered investments.

For each year `Y`, non-registered distributions and the RRSP deduction refund are
settled separately. Distribution tax stacks on full salary, independent of the
deduction-timing split — making the base depend on the carried claim would couple
non-registered distribution tax into the deduct-now-vs-carry decision and push the
deduction past clean bracket edges:

```text
distributionTax_Y =
  taxOwed(income_Y + taxableDistribution_Y) - taxOwed(income_Y)
```

The deduction refund is taken against an income floor (see below). A refund
enters available TFSA room in `Y + 1`, with overflow going to non-registered.
Entered TFSA room and carried RRSP deductions remain fixed nominal amounts; their
real value therefore shrinks with inflation. Deductions can cross brackets and
Ontario surtax or premium bands, so the engine calculates the full tax difference
rather than assuming a point marginal rate.

### Deferred deductions and future room

A deduction claimed now stacks at the top of this year's income — it is the
lump's actual decision. A deduction **carried forward** to a future year cannot
be assumed to reclaim that year's top bracket: the saver earns fresh RRSP room
every year (18% of the prior year's earned income, capped at the dollar limit)
and is assumed to fill it with new contributions deducted at that year's top
rate. A carried deduction therefore stacks _below_ that fresh room:

```text
freshRoom_Y = min(0.18 * income_(Y-1), dollarLimit)
floor_Y     = income_Y - freshRoom_Y
refund_Y    = taxOwed(floor_Y) - taxOwed(floor_Y - deductionClaimed_Y)
```

This prevents the optimizer from double-counting the same high bracket and
overstating the benefit of deferring. Carrying a deduction forward only helps
when a genuine high band remains above the saver's steady contributions — for a
high, steadily rising income it usually does not, and the optimizer deducts now.
The fresh-room model ignores pension adjustments (defined-benefit plan members
receive less room) and assumes the dollar limit grows with inflation.

Each resolution starts with greedy grid-sized additions or the prior coarser
plan, then improves the plan using grid-sized exchanges between every account
and deduction-year bucket. It never returns deferred claims that value worse
than claiming the same RRSP contributions now. This is a deterministic
multi-resolution local search, not a proof of the global continuous optimum.

## Tax engine

The engine uses 2026 federal and BC, ON, and NB rules. Federal and provincial
tax are separate statutory components, each floored at zero. Basic personal
amounts are non-refundable credits. The federal BPA phases from its maximum to
minimum through the top-bracket phaseout range.

Ontario includes cumulative surtaxes on Ontario basic tax after credits and
before the tax reduction, followed by the Ontario tax reduction and health
premium. BC includes its low-income tax reduction. Marginal rates are computed
using a one-sided finite difference of total tax owed, so surtax, health-premium,
tax-reduction, and BPA-phaseout effects appear. Marginal rates are not assumed
to be monotonic.

All 2026 brackets, rates, credits, surtax thresholds, premium thresholds, and
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

At retirement, balance and ACB are deflated to real dollars internally. Positive
gains are taxed using the entered effective capital-gains tax rate on the full
gain. Users should enter their marginal tax rate multiplied by the applicable
capital-gains inclusion rate. Capital losses receive no benefit in this model.

## Display basis

Result amounts — the projected after-tax value, total refunds, and the
carry-forward benefit — are shown in nominal (future) dollars: the engine's
internal real value multiplied by `(1 + inflation)^years`. Because the tax system
is modeled as fully inflation-indexed, the nominal and real comparisons rank the
options identically. The interface rounds recommendation amounts for display,
generally to the nearest `$100`, to avoid implying that the deterministic search
is a filing instruction.

## Income curves

The real-income path uses growth above inflation. **Income stays flat** holds
real income constant. **Slow career growth** grows 1% yearly for 15 years, then
plateaus. **Moderate career growth** grows 2% yearly for 15 years, then
plateaus. **Fast career growth** grows 3% yearly for 15 years, then plateaus.
**Custom** uses the entered real growth rate and growth period. The plateaus
keep long-horizon incomes realistic rather than compounding without bound.

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
- Retirement-year and post-retirement RRSP deduction claims
- Future changes in real tax brackets, rates, credits, or tax law

Results are deterministic illustrations, not tax or investment advice.
