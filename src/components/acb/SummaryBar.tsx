import type { ReactNode } from "react";
import { SimpleGrid, Text } from "@mantine/core";
import { formatCAD } from "@/utils/format";

type SummaryBarProps = {
  /** Adjusted cost basis summed across non-registered holdings still held. */
  totalCostBasis: number;
  /** Count of non-registered holdings with shares remaining. */
  holdingsCount: number;
  transactionCount: number;
  /** Earliest and latest transaction dates; null when no rows carry a date. */
  dateRange: { min: string; max: string } | null;
};

type StatProps = {
  label: string;
  value: ReactNode;
};

const Stat = ({ label, value }: StatProps) => (
  <div>
    <Text
      size="xs"
      c="dimmed"
      ff="var(--pf-font-figures)"
      tt="uppercase"
      style={{ letterSpacing: "0.06em" }}
    >
      {label}
    </Text>
    <Text ff="var(--pf-font-figures)" fz="xl" fw={500}>
      {value}
    </Text>
  </div>
);

/** Compact at-a-glance stats for the loaded transaction set. */
const SummaryBar = ({
  totalCostBasis,
  holdingsCount,
  transactionCount,
  dateRange,
}: SummaryBarProps) => (
  <div
    style={{
      borderTop: "1px solid var(--pf-ink)",
      paddingTop: "var(--mantine-spacing-md)",
    }}
  >
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
      <Stat label="Total cost basis" value={formatCAD(totalCostBasis)} />
      <Stat label="Holdings" value={String(holdingsCount)} />
      <Stat label="Transactions" value={String(transactionCount)} />
      <Stat
        label="Coverage"
        value={
          dateRange ? (
            // Each date stays whole; a narrow cell wraps at the dash, not inside "2025-03-03".
            <>
              <span style={{ whiteSpace: "nowrap" }}>{dateRange.min}</span> –{" "}
              <span style={{ whiteSpace: "nowrap" }}>{dateRange.max}</span>
            </>
          ) : (
            "—"
          )
        }
      />
    </SimpleGrid>
  </div>
);

export default SummaryBar;
