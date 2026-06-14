import { Container, Paper, Stack, Text } from "@mantine/core";

export default function TaxAssumptions() {
  return (
    <Container size="xl" pt="xl" pb="xs">
      <Paper withBorder p="md" radius="md">
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Detailed model assumptions
          </summary>
          <Stack gap="xs" mt="sm">
            <Text size="sm" c="dimmed">
              Uses 2026 federal, New Brunswick, Ontario, and British Columbia
              personal tax rules. All brackets, rates, credits, surtax
              thresholds, premium thresholds, and reduction thresholds are held
              constant in today&apos;s dollars, equivalent to indexing the
              modeled tax system fully with inflation. The engine includes the
              income-tested federal basic personal amount, provincial basic
              personal amounts, Ontario surtax, Ontario health premium, and
              Ontario/BC low-income tax reductions. Other credits and provinces
              are excluded.
            </Text>
            <Text size="sm" c="dimmed">
              Enter your full taxable income for the current tax year, before
              subtracting any RRSP deduction. A deduct-now claim is applied to
              that income at this year&apos;s marginal rate, and its refund is
              modeled as arriving the following year. A first-60-days
              contribution deducted against last year&apos;s income is not
              modeled separately — if that is your case, enter last year&apos;s
              income instead.
            </Text>
            <Text size="sm" c="dimmed">
              The optimizer chooses how much to place in TFSA, RRSP with an
              immediate deduction, RRSP with the deduction carried forward, and
              non-registered. The full entered lump sum is invested now. Only
              RRSP deduction claims can be delayed, potentially across multiple
              future ages. A deduction carried to a future year is assumed to
              stack below that year&apos;s fresh RRSP room (18% of the prior
              year&apos;s income, capped), since new contributions are assumed
              to claim that year&apos;s top rate first — so deferring helps only
              when a genuine higher band remains. Pension adjustments are
              ignored. Refunds arrive the year after deductions are claimed and
              are invested in available TFSA room, then non-registered. Amounts
              above available room spill into non-registered investments.
              Existing room is fixed nominal dollars, so unused room loses real
              value to inflation. Room is static and does not accrue annually in
              this version.
            </Text>
            <Text size="sm" c="dimmed">
              Non-registered distributions use an interest-income proxy;
              eligible dividend gross-up and credits are excluded. Reinvested
              after-tax distributions increase ACB. Capital losses receive no
              offset benefit. The RRSP withdrawal rate is a flat haircut on the
              whole RRSP balance. The separate capital-gains tax rate applies
              after the 50% inclusion rate to unrealized non-registered gains.
              OAS clawback is not modeled; raise the RRSP withdrawal rate to
              approximate it.
            </Text>
            <Text size="sm" c="dimmed">
              Deduction claims are optimized only through the year before
              retirement. Retirement-year and post-retirement deduction claims
              and their later refunds are outside the at-retirement objective.
            </Text>
            <Text size="sm" c="dimmed">
              Result amounts are shown in nominal (future) dollars; the
              income-curve chart is in real (today&apos;s) dollars to keep its
              shape readable. Income curves use the entered real growth rate:
              flat holds income constant, steady climb compounds to retirement,
              early peak compounds for 15 years then plateaus, and fast climb
              compounds 1.5x the rate for 20 years then plateaus.
            </Text>
            <Text size="sm" c="dimmed">
              Deterministic illustration only. Returns, tax rules, room, and
              income can differ materially.
            </Text>
          </Stack>
        </details>
      </Paper>
    </Container>
  );
}
