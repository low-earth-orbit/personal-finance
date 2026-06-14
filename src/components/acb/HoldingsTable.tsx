import { Fragment, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import YearlyACBTable from "./YearlyACBTable";
import {
  applyAdjustments,
  computeYearlyACB,
  t3NetAdjustment,
  type AcbTransaction,
  type Holding,
  type T3Slips,
} from "@/utils/acb/parser";
import { formatCADDecimal } from "@/utils/format";

/** T3 and opening-lot adjustments plus their edit handlers. */
export type AcbAdjustments = {
  t3Slips: T3Slips;
  onEditT3: (symbol: string) => void;
  /** Total opening-lot ACB per symbol, summed across its transfer lots. */
  openingLots: Record<string, number>;
  onEditTransfers: (symbol: string) => void;
};

type HoldingsTableProps = {
  holdings: Holding[];
  /**
   * Transactions backing these holdings. When provided, each row gets a
   * chevron that expands an inline year-by-year ACB breakdown.
   */
  transactions?: AcbTransaction[];
  /**
   * When provided, cost basis figures include T3 and opening-lot adjustments
   * and the table shows their edit controls. Omit for raw transaction-derived
   * book cost (the By account reconciliation view) — per-symbol adjustments
   * can't be allocated to a single account, so applying them per account
   * would double-count.
   */
  adjustments?: AcbAdjustments;
};

const sharesFormatter = new Intl.NumberFormat("en-CA", {
  maximumFractionDigits: 4,
});

const HoldingsTable = ({
  holdings,
  transactions,
  adjustments,
}: HoldingsTableProps) => {
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(
    new Set(),
  );

  // Hide ghost rows: fully sold positions carry no ACB to show.
  const visibleHoldings = holdings.filter((h) => h.shares > 0);
  const anyTransferred = visibleHoldings.some((h) => h.transferredShares > 0);
  const expandable = transactions !== undefined;
  const columnCount =
    4 + (expandable ? 1 : 0) + (adjustments ? 1 + (anyTransferred ? 1 : 0) : 0);

  function toggleExpanded(symbol: string) {
    setExpandedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  }

  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          {expandable && <Table.Th w={36} aria-label="Year breakdown" />}
          <Table.Th>Symbol</Table.Th>
          <Table.Th ta="right">Shares</Table.Th>
          <Table.Th ta="right">ACB per share</Table.Th>
          <Table.Th ta="right">Total cost basis</Table.Th>
          {adjustments && anyTransferred && <Table.Th>Transfer lots</Table.Th>}
          {adjustments && <Table.Th>T3 slips</Table.Th>}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {visibleHoldings.map((holding) => {
          const t3Net = adjustments
            ? t3NetAdjustment(adjustments.t3Slips[holding.symbol] ?? [])
            : 0;
          const openingLot = adjustments
            ? (adjustments.openingLots[holding.symbol] ?? 0)
            : 0;
          const shown = adjustments
            ? applyAdjustments(holding, openingLot, t3Net)
            : holding;
          const hasTransfers = holding.transferredShares > 0;
          const expanded = expandedSymbols.has(holding.symbol);
          return (
            <Fragment key={holding.symbol}>
              <Table.Tr>
                {expandable && (
                  <Table.Td>
                    <ActionIcon
                      variant="transparent"
                      size="sm"
                      aria-label={`Toggle year-by-year ACB for ${holding.symbol}`}
                      aria-expanded={expanded}
                      onClick={() => toggleExpanded(holding.symbol)}
                    >
                      {expanded ? (
                        <IconChevronDown size={16} />
                      ) : (
                        <IconChevronRight size={16} />
                      )}
                    </ActionIcon>
                  </Table.Td>
                )}
                <Table.Td fw={600}>
                  <Group gap="xs" wrap="nowrap">
                    {holding.symbol}
                    {hasTransfers && (
                      <Tooltip
                        label={`Includes ${sharesFormatter.format(holding.transferredShares)} transferred shares — no purchase history`}
                      >
                        <Badge color="yellow" size="sm" variant="light">
                          {sharesFormatter.format(holding.transferredShares)}{" "}
                          transferred
                        </Badge>
                      </Tooltip>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td ta="right">
                  {sharesFormatter.format(shown.shares)}
                </Table.Td>
                <Table.Td ta="right">
                  {shown.acbPerShare === null ? (
                    <Text component="span" c="dimmed">
                      —
                    </Text>
                  ) : (
                    formatCADDecimal(shown.acbPerShare)
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  {formatCADDecimal(shown.costBasis)}
                </Table.Td>
                {adjustments && anyTransferred && (
                  <Table.Td>
                    {hasTransfers ? (
                      <Group gap="xs" wrap="nowrap">
                        <Button
                          variant="transparent"
                          size="xs"
                          onClick={() =>
                            adjustments.onEditTransfers(holding.symbol)
                          }
                        >
                          Edit transfers
                        </Button>
                        {openingLot > 0 && (
                          <Badge size="sm" variant="light" color="teal">
                            {`+${formatCADDecimal(openingLot)}`}
                          </Badge>
                        )}
                      </Group>
                    ) : (
                      <Text component="span" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                )}
                {adjustments && (
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Button
                        variant="transparent"
                        size="xs"
                        onClick={() => adjustments.onEditT3(holding.symbol)}
                      >
                        Edit T3
                      </Button>
                      {t3Net !== 0 && (
                        <Badge
                          size="sm"
                          variant="light"
                          color={t3Net > 0 ? "teal" : "red"}
                        >
                          {`${t3Net < 0 ? "−" : "+"}${formatCADDecimal(Math.abs(t3Net))}`}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                )}
              </Table.Tr>
              {expandable && expanded && (
                <Table.Tr>
                  <Table.Td colSpan={columnCount} p="sm">
                    <YearlyACBTable
                      snapshots={computeYearlyACB(transactions, holding.symbol)}
                    />
                  </Table.Td>
                </Table.Tr>
              )}
            </Fragment>
          );
        })}
      </Table.Tbody>
    </Table>
  );
};

export default HoldingsTable;
