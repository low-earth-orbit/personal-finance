"use client";

import { useEffect, useState } from "react";
import { ActionIcon, Group, Loader, Modal, Stack, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconInfoCircle } from "@tabler/icons-react";
import { safeWithdrawalRate } from "@/utils/retirement/monteCarlo";
import { SWR_TABLE_ALLOCATIONS, SWR_TABLE_HORIZONS } from "@/utils/retirement/presets";
import type { RetirementInput } from "@/utils/retirement/types";

interface SwrTechnicalNoteProps {
  input: RetirementInput;
}

interface TableRow {
  label: string;
  swrs: number[];
}

/**
 * "Why this figure?" link + modal beside the headline safe withdrawal rate.
 * Explains why the rate is lower than the US "4% rule" and shows a reference
 * table of SWR by stock/bond mix and retirement horizon (computed live at the
 * user's chosen confidence). Pure-portfolio SWR — excludes CPP/OAS/pension.
 */
export default function SwrTechnicalNote({ input }: SwrTechnicalNoteProps) {
  const [opened, { open, close }] = useDisclosure(false);
  // The table is computed one allocation-row at a time, yielding between rows, so
  // the modal stays responsive and fills progressively. Tagged with the
  // (success, inflation) key it was built for; a stale key shows the loader.
  const [table, setTable] = useState<{
    key: string;
    rows: TableRow[];
    done: boolean;
  } | null>(null);

  const successPct = input.targetSuccessRate;
  const successRate = successPct / 100;
  const inflation = input.inflationRate;
  const key = `${successRate}|${inflation}`;

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    const acc: TableRow[] = [];
    let i = 0;
    const step = () => {
      if (cancelled) return;
      const a = SWR_TABLE_ALLOCATIONS[i];
      acc.push({
        label: a.label,
        swrs: SWR_TABLE_HORIZONS.map((h) =>
          safeWithdrawalRate(a.returnPct, a.volatility, inflation, h, successRate),
        ),
      });
      i += 1;
      const done = i >= SWR_TABLE_ALLOCATIONS.length;
      setTable({ key, rows: acc.slice(), done });
      if (!done) setTimeout(step, 0);
    };
    const id = setTimeout(step, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [opened, key, successRate, inflation]);

  const current = table && table.key === key ? table : null;
  const rows = current?.rows ?? null;
  const computing = current !== null && !current.done;

  return (
    <>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        radius="xl"
        onClick={open}
        aria-label="About the safe withdrawal rate"
      >
        <IconInfoCircle size={16} />
      </ActionIcon>

      <Modal
        opened={opened}
        onClose={close}
        title="About the safe withdrawal rate"
        size="xl"
        centered
      >
        <Stack gap="sm">
          <Text size="sm">
            The rate on your plan is your{" "}
            <strong>first-year withdrawal as a % of your savings</strong> at retirement, and it
            reflects your pension. If you retire before your pension starts, year 1 runs higher —
            your portfolio covers your whole income until the pension kicks in (the
            &ldquo;bridge&rdquo;).
          </Text>
          <Text size="sm">
            For some, it may look low next to the famous US &ldquo;4% rule.&rdquo; I believe
            it&apos;s right, for two reasons:
          </Text>
          <Text size="sm" component="div">
            <strong>1. Forward-looking Canadian returns.</strong> My return assumptions come from
            PWL Capital&apos;s capital-market estimates (corroborated by FP Canada&apos;s planning
            guidelines & RBC assumptions) — more modest than the 20th-century US history the 4% rule
            was built on.
          </Text>
          <Text size="sm" component="div">
            <strong>2. Longer retirements need lower rates.</strong> A 30-year retirement sustains a
            higher rate than a 50-year one. The figure beside your plan is for <em>your</em>{" "}
            horizon.
          </Text>
          <Text size="sm">
            I checked these rates against 150 years of global market history (16 countries,
            1870–2020): they are in line with what real history would have sustained. The takeaway
            is that the withdrawal rate is driven by the return assumption, not by an overly harsh
            risk model.
          </Text>

          <Text size="sm" fw={600} mt="xs">
            Safe withdrawal rate by allocation &amp; horizon
            <Text span c="dimmed" fw={400}>
              {" "}
              — {successPct}% success, today&apos;s dollars
            </Text>
          </Text>

          {rows === null ? (
            <Group justify="center" py="lg">
              <Loader size="sm" />
            </Group>
          ) : (
            <>
              <Table
                withTableBorder
                withColumnBorders
                striped
                horizontalSpacing="xs"
                verticalSpacing={6}
                fz="xs"
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Stocks / bonds</Table.Th>
                    {SWR_TABLE_HORIZONS.map((h) => (
                      <Table.Th key={h} ta="center">
                        {h}y
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((r) => (
                    <Table.Tr key={r.label}>
                      <Table.Td fw={600}>{r.label}</Table.Td>
                      {r.swrs.map((s, i) => (
                        <Table.Td key={i} ta="center">
                          {(s * 100).toFixed(1)}%
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              {computing && (
                <Group justify="center" py={4}>
                  <Loader size="xs" />
                </Group>
              )}
            </>
          )}

          <Text size="xs" c="dimmed">
            Each cell is a constant withdrawal — as a % of the starting portfolio, held in real
            terms — with a {successPct}% chance of lasting the full horizon. It&apos;s a generic
            benchmark for a globally-diversified mix and excludes CPP/OAS/pension, so it won&apos;t
            exactly match your plan&apos;s year-1 rate above (which reflects your pension).
          </Text>
        </Stack>
      </Modal>
    </>
  );
}
