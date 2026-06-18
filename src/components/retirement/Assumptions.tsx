import { Container, Text, Anchor } from "@mantine/core";

/**
 * Transparency note on the (intentionally simplified) prototype model.
 */
const Assumptions = () => {
  return (
    <Container size="xl" pt="xl" pb="xs">
      <Text size="sm" pb="xs" c="dimmed">
        This is a quick reality check, not a full retirement plan. Results are shown in today&apos;s
        dollars and use a simple glide path — one expected return while you&apos;re working and
        another (usually lower) in retirement. It finds the earliest age at which your savings can
        fund a constant gross income target and still last to your planning age in at least your
        chosen share of simulated markets. The retirement phase is run as a Monte Carlo simulation
        with year-to-year return swings to capture sequence-of-returns risk; accumulation uses the
        expected return.
      </Text>
      <Text size="sm" pb="xs" c="dimmed">
        Acknowledgement: Return and volatility assumptions are adopted from{" "}
        <Anchor
          href="https://pwlcapital.com/financial-planning-assumptions-market-capitalization-weighted-portfolio/"
          target="_blank"
          rel="noreferrer"
          c="dimmed"
        >
          PWL Capital
        </Anchor>
        .
      </Text>
    </Container>
  );
};

export default Assumptions;
