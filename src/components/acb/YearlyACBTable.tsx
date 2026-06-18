import { Table, Text } from "@mantine/core";
import type { YearlySnapshot } from "@/utils/acb/parser";

const currencyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const sharesFormatter = new Intl.NumberFormat("en-CA", {
  maximumFractionDigits: 4,
});

type YearlyACBTableProps = {
  snapshots: YearlySnapshot[];
};

/**
 * Year-by-year ACB breakdown for one symbol. Snapshots with year 0 carry no
 * parseable date and render as "Unknown".
 */
const YearlyACBTable = ({ snapshots }: YearlyACBTableProps) => (
  <Table striped withTableBorder>
    <Table.Thead>
      <Table.Tr>
        <Table.Th>Year</Table.Th>
        <Table.Th ta="right">Buys (qty)</Table.Th>
        <Table.Th ta="right">Sells (qty)</Table.Th>
        <Table.Th ta="right">End Shares</Table.Th>
        <Table.Th ta="right">Cost Basis</Table.Th>
        <Table.Th ta="right">ACB/share</Table.Th>
      </Table.Tr>
    </Table.Thead>
    <Table.Tbody>
      {snapshots.map((snapshot) => (
        <Table.Tr key={snapshot.year}>
          <Table.Td>{snapshot.year === 0 ? "Unknown" : snapshot.year}</Table.Td>
          <Table.Td ta="right">{sharesFormatter.format(snapshot.buyQty)}</Table.Td>
          <Table.Td ta="right">{sharesFormatter.format(snapshot.sellQty)}</Table.Td>
          <Table.Td ta="right">{sharesFormatter.format(snapshot.endShares)}</Table.Td>
          <Table.Td ta="right">{currencyFormatter.format(snapshot.costBasis)}</Table.Td>
          <Table.Td ta="right">
            {snapshot.acbPerShare === null ? (
              <Text component="span" c="dimmed">
                —
              </Text>
            ) : (
              currencyFormatter.format(snapshot.acbPerShare)
            )}
          </Table.Td>
        </Table.Tr>
      ))}
    </Table.Tbody>
  </Table>
);

export default YearlyACBTable;
