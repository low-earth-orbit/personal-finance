import { Text, Anchor } from "@mantine/core";
import ToolNotes from "@/components/shared/ToolNotes";

/**
 * Transparency note on the (intentionally simplified) prototype model.
 */
const Assumptions = () => {
  return (
    <ToolNotes title="Assumptions">
      <Text size="sm" pb="xs" c="dimmed" maw="60rem">
        This is a quick reality check, not a full retirement plan. Results are shown in today&apos;s
        dollars and use a simple glide path — one expected return while you&apos;re working and
        another (usually lower) in retirement. It finds the earliest age at which your savings can
        fund a constant gross income target and still last to your planning age in at least your
        chosen share of simulated markets. The retirement phase is run as a Monte Carlo simulation
        with year-to-year return swings to capture sequence-of-returns risk. Returns are nominal
        compound (geometric) averages; accumulation compounds that expected return, while Monte
        Carlo converts it to the matching average annual return.
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
    </ToolNotes>
  );
};

export default Assumptions;
