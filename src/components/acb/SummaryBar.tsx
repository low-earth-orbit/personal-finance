import { Paper, SimpleGrid, Text } from "@mantine/core";
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
  value: string;
};

const Stat = ({ label, value }: StatProps) => (
  <div>
    <Text size="xs" c="dimmed">
      {label}
    </Text>
    <Text fw={600}>{value}</Text>
  </div>
);

/** Compact at-a-glance stats for the loaded transaction set. */
const SummaryBar = ({
  totalCostBasis,
  holdingsCount,
  transactionCount,
  dateRange,
}: SummaryBarProps) => (
  <Paper withBorder p="md" radius="md">
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
      <Stat label="Total cost basis" value={formatCAD(totalCostBasis)} />
      <Stat label="Holdings" value={String(holdingsCount)} />
      <Stat label="Transactions" value={String(transactionCount)} />
      <Stat label="Coverage" value={dateRange ? `${dateRange.min} – ${dateRange.max}` : "—"} />
    </SimpleGrid>
  </Paper>
);

export default SummaryBar;
