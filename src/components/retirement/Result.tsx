"use client";

import { Alert, Box, Card, Center, Group, Loader, Stack, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import Headline from "./Headline";
import ProjectionChart from "./ProjectionChart";
import { formatCAD } from "@/utils/format";
import { incomePhases, type IncomePhase } from "@/utils/retirement/projection";
import type { RetirementInput, RetirementResult } from "@/utils/retirement/types";

interface ResultProps {
  input: RetirementInput;
  /** Computed in Main; null while inputs are incomplete/invalid. */
  result: RetirementResult | null;
  /** Headline year-1 withdrawal rate (fraction); null when no feasible plan. */
  planSWR: number | null;
  /** Inputs are valid but the first simulation hasn't returned yet. */
  loading?: boolean;
}

const ACCENT = "var(--pf-accent)";
const INK = "var(--pf-ink)";

// Diagonal accent hatch over a light surface fill — marks the portion of portfolio
// spending that's trimmed in weak markets (the flexible cut), vs. solid = firm.
const INK_HATCH = {
  backgroundColor: "var(--pf-surface)",
  backgroundImage: `repeating-linear-gradient(45deg, ${ACCENT} 0, ${ACCENT} 2px, transparent 2px, transparent 5px)`,
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
            hatch ? { borderRadius: 2, ...INK_HATCH } : { borderRadius: 2, backgroundColor: color }
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
      <Box style={{ width: `${guaranteedPct}%`, backgroundColor: INK }} />
      <Box style={{ width: `${firmPortfolioPct}%`, backgroundColor: ACCENT }} />
      {cutPct > 0 && <Box style={{ width: `${cutPct}%`, ...INK_HATCH }} />}
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

function phaseLabel(phase: IncomePhase, isLast: boolean): string {
  const range =
    phase.fromAge === phase.toAge ? `age ${phase.fromAge}` : `age ${phase.fromAge}–${phase.toAge}`;
  if (phase.guaranteed === 0) return `Before guaranteed income · ${range}`;
  return isLast ? `From age ${phase.fromAge}` : `${range[0].toUpperCase()}${range.slice(1)}`;
}

function phaseNote(phase: IncomePhase, target: number): string {
  if (phase.guaranteed === 0) return `${formatCAD(target)} all from savings`;
  if (phase.portfolio === 0) return `${formatCAD(phase.guaranteed)} guaranteed covers it`;
  return `${formatCAD(phase.guaranteed)} guaranteed + ${formatCAD(phase.portfolio)} portfolio`;
}

function IncomeSummary({ input, result }: { input: RetirementInput; result: RetirementResult }) {
  const { targetGrossIncome } = result;
  const retireAge = result.earliestRetirementAge ?? input.currentAge;
  const phases = incomePhases(input, retireAge);
  const single = phases.length <= 1;
  const only = phases[0] ?? {
    fromAge: retireAge,
    toAge: retireAge,
    guaranteed: result.guaranteedIncome,
    portfolio: result.portfolioWithdrawal,
  };

  const flexPct = input.spendingFlexibilityPct;
  const isFlexible = flexPct > 0;
  // In weak markets the guardrail trims spending by up to flexPct; guaranteed
  // income is unaffected, so the floor sits this far below the full target.
  const floorIncome = targetGrossIncome * (1 - flexPct / 100);

  return (
    <Stack gap="sm" pt="md" style={{ borderTop: "1px solid var(--pf-hairline)" }}>
      <Group justify="space-between" align="baseline">
        <Text fw={600} fz="lg">
          Retirement income
        </Text>
        <Text ff="monospace" fw={500}>
          {formatCAD(targetGrossIncome)} /yr
        </Text>
      </Group>

      {!single ? (
        <Stack gap="md">
          {phases.map((phase, i) => (
            <PhaseRow
              key={phase.fromAge}
              label={phaseLabel(phase, i === phases.length - 1)}
              note={phaseNote(phase, targetGrossIncome)}
              guaranteed={phase.guaranteed}
              portfolio={phase.portfolio}
              total={targetGrossIncome}
              flexPct={flexPct}
            />
          ))}
          <Group gap="xl">
            <LegendItem color={INK} label="Guaranteed (CPP/OAS/pension)" />
            <LegendItem color={ACCENT} label="From your savings" />
            {isFlexible && <LegendItem hatch label={`Trimmed in weak markets (−${flexPct}%)`} />}
          </Group>
        </Stack>
      ) : (
        <>
          <IncomeBar
            guaranteed={only.guaranteed}
            portfolio={only.portfolio}
            total={targetGrossIncome}
            flexPct={flexPct}
          />
          <Group mt="sm" gap="xl">
            <LegendItem
              color={INK}
              label="Guaranteed (CPP/OAS/pension)"
              value={formatCAD(only.guaranteed)}
            />
            <LegendItem
              color={ACCENT}
              label="From your portfolio"
              value={formatCAD(only.portfolio)}
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
    </Stack>
  );
}

export default function Result({ input, result, planSWR, loading = false }: ResultProps) {
  if (!result && loading) {
    return (
      <Card withBorder radius="md" padding="lg">
        <Center mih={120}>
          <Loader size="sm" aria-label="Simulating your plan" />
        </Center>
      </Card>
    );
  }
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
