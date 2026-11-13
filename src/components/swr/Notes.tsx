import { Anchor, Text } from "@mantine/core";
import ToolNotes from "@/components/shared/ToolNotes";

const METHODOLOGY_URL =
  "https://github.com/low-earth-orbit/personal-finance/blob/main/docs/swr/methodology.md";

/** Plain-language method, acknowledgement and caveats under the tool. */
const Notes = () => {
  return (
    <ToolNotes title="Assumptions" columns>
      <Text size="sm" pb="xs" c="dimmed">
        The safe withdrawal rate follows the logic of the 4% rule from the Trinity study: you
        withdraw a set percentage of the starting portfolio in year 1, then raise that dollar amount
        with inflation every year after, regardless of what the market does. Each cell is the
        highest first-year rate that still lasts the whole horizon in your chosen share of 10,000
        simulated markets. Because the amount is indexed to inflation, it is the same spending power
        in today&apos;s dollars every year. Stocks and bonds are simulated separately from the
        nominal compound returns, volatilities, correlation and inflation you set, and the portfolio
        is rebalanced every year. The same simulated markets feed every row, so rows change
        smoothly.
      </Text>
      <Text size="sm" pb="xs" c="dimmed">
        &ldquo;Independent&rdquo; draws each year without memory. The variance ratio over 10 years,
        VR(10), measures memory: below 1 means a bad decade tends to be followed by recovery, above
        1 means it tends to continue. &ldquo;Historical&rdquo; uses the ratios from 150 years of
        data across 16 countries (stocks 0.91, bonds 2.66), modelled as a simple one-year memory.
        That is a rough fit: it can&apos;t reproduce history&apos;s joint stock and bond behaviour,
        so it lands below the block-bootstrap result in the{" "}
        <Anchor href={METHODOLOGY_URL} target="_blank" rel="noreferrer" c="dimmed">
          methodology notes
        </Anchor>
        . Bond persistence is what pulls bond-heavy rows down.
      </Text>
      <Text size="sm" pb="xs" c="dimmed">
        Acknowledgement: The default return, volatility and correlation assumptions are adopted from{" "}
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

export default Notes;
