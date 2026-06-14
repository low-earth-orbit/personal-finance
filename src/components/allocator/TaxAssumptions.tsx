import { Container, Text } from "@mantine/core";

export default function TaxAssumptions() {
  return (
    <Container size="xl" pt="xl" pb="xs">
      <Text size="sm" c="dimmed" pb="xs">
        Uses 2025 federal, New Brunswick, Ontario, and British Columbia personal
        tax rules. All brackets, rates, credits, surtax thresholds, premium
        thresholds, and reduction thresholds are held constant in today&apos;s
        dollars, equivalent to indexing the modeled tax system fully with
        inflation. The engine includes the income-tested federal basic personal
        amount, provincial basic personal amounts, Ontario surtax, Ontario
        health premium, and Ontario/BC low-income tax reductions. Other credits
        and provinces are excluded.
      </Text>
      <Text size="sm" c="dimmed" pb="xs">
        The optimizer chooses how much to place in TFSA, RRSP with an immediate
        deduction, RRSP with the deduction carried forward, and non-registered.
        The full entered lump sum is invested now. Only RRSP deduction claims
        can be delayed, potentially across multiple future ages. Refunds arrive
        the year after deductions are claimed and are invested in available TFSA
        room, then non-registered. Amounts above available room spill into
        non-registered investments. Existing room is fixed nominal dollars, so
        unused room loses real value to inflation. Room is static and does not
        accrue annually in this version.
      </Text>
      <Text size="sm" c="dimmed" pb="xs">
        Non-registered distributions use an interest-income proxy; eligible
        dividend gross-up and credits are excluded. Reinvested after-tax
        distributions increase ACB. Capital losses receive no offset benefit.
        The RRSP withdrawal rate is a flat haircut on the whole RRSP balance.
        The separate capital-gains tax rate applies after the 50% inclusion rate
        to unrealized non-registered gains. OAS clawback is not modeled; raise
        the RRSP withdrawal rate to approximate it.
      </Text>
      <Text size="sm" c="dimmed">
        Deterministic illustration only. Returns, tax rules, room, and income
        can differ materially.
      </Text>
    </Container>
  );
}
