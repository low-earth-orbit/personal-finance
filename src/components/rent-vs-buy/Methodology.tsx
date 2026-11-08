import { Anchor, Container, Text } from "@mantine/core";

/**
 * Rent-vs-buy-specific explanation of the cash-flow comparison method.
 * Lives with the tool rather than in the shared site footer.
 */
const Methodology = () => {
  return (
    <Container size="xl" pt="xl" pb="xs">
      <Text size="sm" c="dimmed">
        This calculator uses a cash-flow method to compare renting and buying on an equal footing.
        Each year, whoever has the lower housing cost invests the difference: the renter invests
        what the buyer spends on ownership costs (mortgage payments, property tax, maintenance, and
        insurance) above the rent, and once owning becomes cheaper (for example after the mortgage
        is paid off) the owner invests the savings instead. At the end of the holding period, the
        owner sells the home — net of selling costs and remaining mortgage balance — and both sides
        cash out their portfolios net of capital gains tax (none on the share held in a TFSA, or an
        RRSP at equal tax rates in and out). The option that leaves more after-tax net worth wins.
        Other calculators I recommend:{" "}
        <Anchor href="http://www.holypotato.net/?p=1235" target="_blank" rel="noreferrer">
          John Robertson
        </Anchor>{" "}
        and{" "}
        <Anchor
          href="https://research-tools.pwlcapital.com/research/rent-vs-buy"
          target="_blank"
          rel="noreferrer"
        >
          PWL Capital
        </Anchor>{" "}
        calculators.
      </Text>
    </Container>
  );
};

export default Methodology;
