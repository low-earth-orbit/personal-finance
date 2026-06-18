"use client";

import { Alert, Box, Card, Group, Paper, Text } from "@mantine/core";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceDot,
} from "recharts";
import { formatCAD, formatCADCompact } from "@/utils/format";
import { NUM_SIMULATIONS } from "@/utils/retirement/monteCarlo";
import type { RetirementInput, RetirementResult } from "@/utils/retirement/types";
import { generateTicks } from "@/utils/charts";

const TEAL = "var(--mantine-color-teal-6)";

interface ProjectionChartProps {
  input: RetirementInput;
  result: RetirementResult;
}

interface ChartPoint {
  age: number;
  /** Deterministic accumulation balance (currentAge..retireAge). */
  accum?: number;
  /** Monte Carlo median in retirement (retireAge..planningAge). */
  median?: number;
  bandBase?: number;
  bandWidth?: number;
  p10?: number;
  p90?: number;
}

/** Coarse, tiered read on how often the plan survives the simulated markets. */
function SuccessSummary({
  successRate,
  target,
  planningAge,
  flexPct,
}: {
  successRate: number;
  target: number;
  planningAge: number;
  flexPct: number;
}) {
  const pct = Math.round(successRate * 100);

  return (
    <Alert variant="default" radius="md">
      <Text size="sm">
        Your savings last to age {planningAge} in about {pct}% of simulated markets — within your{" "}
        {target}% confidence target.
        {flexPct > 0 && ` Assumes you trim spending by up to ${flexPct}% in weak markets.`}
      </Text>
    </Alert>
  );
}

function ChartTooltip({ payload }: { payload?: { payload: ChartPoint }[] }) {
  if (!payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const inRetirement = p.median != null;
  return (
    <Paper px="md" py="sm" withBorder shadow="md" radius="md">
      <Text fw={600} mb={4}>
        Age {p.age}
      </Text>
      {inRetirement ? (
        <>
          <Text size="sm" c="teal">
            Median: {formatCAD(p.median ?? 0)}
          </Text>
          <Text size="xs" c="dimmed">
            10–90%: {formatCADCompact(p.p10 ?? 0)} – {formatCADCompact(p.p90 ?? 0)}
          </Text>
        </>
      ) : (
        <Text size="sm" c="teal">
          Projected: {formatCAD(p.accum ?? 0)}
        </Text>
      )}
    </Paper>
  );
}

export default function ProjectionChart({ input, result }: ProjectionChartProps) {
  if (
    result.earliestRetirementAge === null ||
    !result.retirementBands ||
    result.successRate === null
  ) {
    return null;
  }

  const retireAge = result.earliestRetirementAge;

  // Merge the deterministic accumulation path and the MC retirement bands by
  // age. They overlap at retireAge (same balance), so the lines join cleanly.
  const byAge = new Map<number, ChartPoint>();
  for (const p of result.accumulationPath ?? []) {
    byAge.set(p.age, { age: p.age, accum: Math.max(0, Math.round(p.balance)) });
  }
  for (const b of result.retirementBands) {
    const point = byAge.get(b.age) ?? { age: b.age };
    point.median = Math.max(0, Math.round(b.p50));
    point.p10 = Math.max(0, Math.round(b.p10));
    point.p90 = Math.max(0, Math.round(b.p90));
    point.bandBase = point.p10;
    point.bandWidth = Math.max(0, point.p90 - point.p10);
    byAge.set(b.age, point);
  }
  const data = [...byAge.values()].sort((a, b) => a.age - b.age);
  const lastAge = data[data.length - 1]?.age ?? retireAge;

  const ageTicks = generateTicks(input.currentAge, input.planningAge, 5);

  return (
    <Card withBorder radius="md" padding="md">
      <Text fw={600} mb="md">
        Projected portfolio (in today&apos;s dollars)
      </Text>
      <SuccessSummary
        successRate={result.successRate}
        target={input.targetSuccessRate}
        planningAge={input.planningAge}
        flexPct={input.spendingFlexibilityPct}
      />
      <div
        role="img"
        aria-label="Retirement portfolio projection chart with a Monte Carlo range"
        style={{ width: "100%", minWidth: 0, marginTop: 12 }}
      >
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={data} margin={{ top: 24, right: 8, bottom: 28, left: 0 }}>
            <ReferenceArea
              x1={retireAge}
              x2={lastAge}
              fill="var(--mantine-color-gray-5)"
              fillOpacity={0.1}
              ifOverflow="visible"
              label={{
                value: "Retirement",
                position: "insideTopRight",
                fill: "var(--mantine-color-gray-6)",
                fontSize: 12,
              }}
            />
            <XAxis
              dataKey="age"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={ageTicks}
              tickMargin={8}
              label={{ value: "Age", position: "bottom", fontSize: 12 }}
              tick={{ fontSize: 12 }}
              interval={0}
            />
            <YAxis
              width={50}
              tickFormatter={(v) => formatCADCompact(Number(v))}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<ChartTooltip />} />
            {/* Stacked-area band: transparent base to P10, shaded width to P90. */}
            <Area
              type="monotone"
              dataKey="bandBase"
              stackId="band"
              stroke="none"
              fill="transparent"
              connectNulls={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="bandWidth"
              stackId="band"
              stroke="none"
              fill={TEAL}
              fillOpacity={0.18}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="accum"
              stroke={TEAL}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="median"
              stroke={TEAL}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <ReferenceLine
              x={retireAge}
              stroke={TEAL}
              strokeDasharray="4 4"
              label={{
                value: `Age ${retireAge}`,
                position: "insideTopLeft",
                fontSize: 12,
                fontWeight: 600,
                fill: "var(--mantine-color-teal-7)",
              }}
            />
            {result.portfolioAtRetirement != null && (
              <ReferenceDot
                x={retireAge}
                y={Math.max(0, Math.round(result.portfolioAtRetirement))}
                r={5}
                fill={TEAL}
                stroke="white"
                strokeWidth={2}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Group gap="lg" mt="sm" wrap="wrap">
        <Group gap={6} wrap="nowrap">
          <Box w={18} h={2} style={{ backgroundColor: TEAL }} aria-hidden />
          <Text size="xs" c="dimmed">
            Median
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Box w={18} h={10} style={{ backgroundColor: TEAL, opacity: 0.18 }} aria-hidden />
          <Text size="xs" c="dimmed">
            10–90% range
          </Text>
        </Group>
      </Group>
      <Text size="xs" c="dimmed" mt="sm">
        Accumulation is shown on mean returns; the retirement fan is{" "}
        {NUM_SIMULATIONS.toLocaleString()} simulations with year-to-year return swings, in
        today&apos;s dollars. Illustrative, not a guarantee.
      </Text>
    </Card>
  );
}
