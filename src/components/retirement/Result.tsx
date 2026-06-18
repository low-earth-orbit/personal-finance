"use client";

import { Alert, Box, Card, Group, Stack, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import Headline from "./Headline";
import ProjectionChart from "./ProjectionChart";
import { formatCAD } from "@/utils/format";
import type { RetirementInput, RetirementResult } from "@/utils/retirement/types";

interface ResultProps {
  input: RetirementInput;
  /** Computed in Main; null while inputs are incomplete/invalid. */
  result: RetirementResult | null;
  /** Headline year-1 withdrawal rate (fraction); null when no feasible plan. */
  planSWR: number | null;
}

const TEAL = "var(--mantine-color-teal-6)";
const INDIGO = "var(--mantine-color-indigo-5)";

// Diagonal hatch over a light indigo fill — marks the portion of portfolio
// spending that's trimmed in weak markets (the flexible cut), vs. solid = firm.
const INDIGO_HATCH = {
  backgroundColor: "var(--mantine-color-indigo-1)",
  backgroundImage: `repeating-linear-gradient(45deg, ${INDIGO} 0, ${INDIGO} 2px, transparent 2px, transparent 5px)`,
};

function LegendItem({
  color,
  hatch,
  label,
  value,
}: {
  color?: string;
  hatch?: boolean;
  label: string;
  value?: string;
}) {
  return (
    <Stack gap={0}>
      <Group gap={6} wrap="nowrap">
        <Box
          w={10}
          h={10}
          style={
            hatch
              ? { borderRadius: 2, ...INDIGO_HATCH }
              : { borderRadius: 2, backgroundColor: color }
          }
        />
        <Text size="xs" c="dimmed">
          {label}
        </Text>
      </Group>
      {value && (
        <Text fw={600} size="sm">
          {value} /yr
        </Text>
      )}
    </Stack>
  );
}

function IncomeBar({
  guaranteed,
  portfolio,
  total,
  flexPct,
}: {
  guaranteed: number;
  portfolio: number;
  total: number;
  flexPct: number;
}) {
  const denom = Math.max(total, 1);
  // The cut (up to flexPct of total spending) comes entirely from the portfolio,
  // since guaranteed income is never trimmed. Show it as the hatched top slice.
  const cut = Math.min(portfolio, (total * flexPct) / 100);
  const guaranteedPct = (Math.min(guaranteed, denom) / denom) * 100;
  const firmPortfolioPct = ((portfolio - cut) / denom) * 100;
  const cutPct = (cut / denom) * 100;
  return (
    <Box
      style={{
        display: "flex",
        height: 26,
        borderRadius: 6,
        overflow: "hidden",
        backgroundColor: "var(--mantine-color-gray-2)",
      }}
    >
      <Box style={{ width: `${guaranteedPct}%`, backgroundColor: TEAL }} />
      <Box style={{ width: `${firmPortfolioPct}%`, backgroundColor: INDIGO }} />
      {cutPct > 0 && <Box style={{ width: `${cutPct}%`, ...INDIGO_HATCH }} />}
    </Box>
  );
}

function PhaseRow({
  label,
  note,
  guaranteed,
  portfolio,
  total,
  flexPct,
}: {
  label: string;
  note: string;
  guaranteed: number;
  portfolio: number;
  total: number;
  flexPct: number;
}) {
  return (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Text size="xs" c="dimmed" ta="right">
          {note}
        </Text>
      </Group>
      <IncomeBar guaranteed={guaranteed} portfolio={portfolio} total={total} flexPct={flexPct} />
    </Stack>
  );
}

function IncomeSummary({ input, result }: { input: RetirementInput; result: RetirementResult }) {
  const { targetGrossIncome, guaranteedIncome, portfolioWithdrawal } = result;
  const retireAge = result.earliestRetirementAge;
  const pensionAge = input.pensionStartAge;
  const hasBridge = retireAge != null && retireAge < pensionAge;
  const bridgeRange =
    retireAge === pensionAge - 1 ? `age ${retireAge}` : `age ${retireAge}–${pensionAge - 1}`;

  const flexPct = input.spendingFlexibilityPct;
  const isFlexible = flexPct > 0;
  // In weak markets the guardrail trims spending by up to flexPct; guaranteed
  // income is unaffected, so the floor sits this far below the full target.
  const floorIncome = targetGrossIncome * (1 - flexPct / 100);

  return (
    <Card withBorder radius="md" padding="md">
      <Text size="sm" fw={600} mb="sm">
        Retirement income {formatCAD(targetGrossIncome)} /yr
      </Text>

      {hasBridge ? (
        <Stack gap="md">
          <PhaseRow
            label={`Before pension · ${bridgeRange}`}
            note={`${formatCAD(targetGrossIncome)} all from savings`}
            guaranteed={0}
            portfolio={targetGrossIncome}
            total={targetGrossIncome}
            flexPct={flexPct}
          />
          <PhaseRow
            label={`From age ${pensionAge}`}
            note={`${formatCAD(guaranteedIncome)} pension + ${formatCAD(
              portfolioWithdrawal,
            )} portfolio`}
            guaranteed={guaranteedIncome}
            portfolio={portfolioWithdrawal}
            total={targetGrossIncome}
            flexPct={flexPct}
          />
          <Group gap="xl">
            <LegendItem color={TEAL} label="Guaranteed (CPP/OAS/pension)" />
            <LegendItem color={INDIGO} label="From your savings" />
            {isFlexible && <LegendItem hatch label={`Trimmed in weak markets (−${flexPct}%)`} />}
          </Group>
        </Stack>
      ) : (
        <>
          <IncomeBar
            guaranteed={guaranteedIncome}
            portfolio={portfolioWithdrawal}
            total={targetGrossIncome}
            flexPct={flexPct}
          />
          <Group mt="sm" gap="xl">
            <LegendItem
              color={TEAL}
              label="Guaranteed (CPP/OAS/pension)"
              value={formatCAD(guaranteedIncome)}
            />
            <LegendItem
              color={INDIGO}
              label="From your portfolio"
              value={formatCAD(portfolioWithdrawal)}
            />
            {isFlexible && <LegendItem hatch label={`Trimmed in weak markets (−${flexPct}%)`} />}
          </Group>
        </>
      )}

      {isFlexible && (
        <Text size="xs" c="dimmed" mt="md">
          Flexible spending: in weak markets you&apos;d trim up to {flexPct}% to{" "}
          {formatCAD(floorIncome)} /yr. The full target is your normal-market spend; confidence is
          measured against the lower floor.
        </Text>
      )}
    </Card>
  );
}

export default function Result({ input, result, planSWR }: ResultProps) {
  if (!result) {
    return (
      <Alert variant="light" color="gray" icon={<IconInfoCircle />} title="Incomplete inputs">
        Fix the highlighted fields to see your retirement projection.
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <Headline input={input} result={result} planSWR={planSWR} />
      <IncomeSummary input={input} result={result} />
      <ProjectionChart input={input} result={result} />
    </Stack>
  );
}
