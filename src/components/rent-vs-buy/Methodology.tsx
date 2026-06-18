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
        Each year, the renter invests the surplus that the buyer spends on ownership costs (mortgage
        payments, property tax, maintenance, and insurance) above what the renter pays in rent. At
        the end of the holding period, the owner sells the home — net of selling costs and remaining
        mortgage balance — while the renter liquidates the portfolio net of capital gains tax. The
        option that leaves more after-tax net worth wins. Other calculators I recommend:{" "}
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
