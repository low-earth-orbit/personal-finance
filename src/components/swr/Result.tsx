"use client";

import { Center, Loader, Stack, Table, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Eyebrow, Notice } from "@/components/shared/Figures";
import JumpToResult from "@/components/shared/JumpToResult";
import type { SwrInput, SwrResult } from "@/utils/swr/types";
import classes from "./Result.module.css";

interface ResultProps {
  input: SwrInput;
  /** Computed in Main; null while inputs are incomplete/invalid or the first run is pending. */
  result: SwrResult | null;
  /** Inputs are valid but the first simulation hasn't returned yet. */
  loading?: boolean;
}

const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;

const JUMP_ALLOCATION = "60/40";
const JUMP_HORIZON = 30;

export default function Result({ input, result, loading }: ResultProps) {
  if (!result) {
    return loading ? (
      <Center py="xl">
        <Loader size="sm" aria-label="Calculating" />
      </Center>
    ) : (
      <Notice
        tone="warn"
        icon={<IconAlertTriangle size={16} />}
        title="Fix the highlighted inputs to see the table."
      />
    );
  }

  // Highest rate in each horizon column.
  const best = result.horizons.map((_, h) => Math.max(...result.rates.map((row) => row[h])));

  const jumpRow = result.allocations.findIndex((a) => a.label === JUMP_ALLOCATION);
  const jumpCol = result.horizons.indexOf(JUMP_HORIZON);
  const jumpText =
    jumpRow >= 0 && jumpCol >= 0
      ? `${JUMP_ALLOCATION} · ${JUMP_HORIZON} yrs: ${formatRate(result.rates[jumpRow][jumpCol])}`
      : "Safe withdrawal rates";

  return (
    <Stack gap="md">
      <JumpToResult targetId="result">{jumpText}</JumpToResult>
      <Eyebrow>{`First-year withdrawal rate, then indexed to inflation · ${input.successRate}% success`}</Eyebrow>

      <Table.ScrollContainer minWidth={520}>
        <Table className={classes.table} verticalSpacing={6} horizontalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th className={`${classes.rowLabel} ${classes.headLabel}`}>
                Stocks / bonds
              </Table.Th>
              {result.horizons.map((h) => (
                <Table.Th key={h} className={classes.cell}>
                  {h} yrs
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {result.allocations.map((allocation, i) => (
              <Table.Tr key={allocation.label}>
                <Table.Td role="rowheader" className={classes.rowLabel}>
                  {allocation.label}
                </Table.Td>
                {result.rates[i].map((rate, h) => (
                  <Table.Td
                    key={result.horizons[h]}
                    className={`${classes.cell} ${rate === best[h] ? classes.best : ""}`}
                    data-best={rate === best[h] || undefined}
                  >
                    {formatRate(rate)}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Text size="xs" c="dimmed">
        <span className={classes.legend}>Bold green</span> marks the highest rate for each horizon.
      </Text>

      {result.correlationClamped && (
        <Notice tone="warn" icon={<IconAlertTriangle size={16} />} title="Correlation adjusted">
          With these variance ratios the stock-bond correlation can&apos;t be matched exactly, so
          the model caps the yearly shock correlation at ±0.99. Treat the table as approximate.
        </Notice>
      )}

      <Text size="xs" c="dimmed">
        Each cell is the <strong>first-year withdrawal as a % of the starting portfolio</strong>.
        After year 1, the dollar amount rises with inflation each year (the 4% rule method from the
        Trinity study), so spending power stays level. The chance of lasting the full horizon is{" "}
        {input.successRate}%. The portfolio is rebalanced yearly. It is a generic benchmark that
        excludes CPP, OAS and pensions.
      </Text>
    </Stack>
  );
}
