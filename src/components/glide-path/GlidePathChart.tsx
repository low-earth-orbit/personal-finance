"use client";

import { useState } from "react";
import { Box, Card, Group, Paper, SegmentedControl, Text } from "@mantine/core";
import {
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GlidePathInput, GlidePathResult } from "@/utils/glide-path/types";
import { generateTicks } from "@/utils/charts";

const TEAL = "var(--mantine-color-teal-6)";
const INDIGO = "var(--mantine-color-indigo-5)";

type ChartView = "stepped" | "smoothed";

interface ChartPoint {
  age: number;
  equity: number;
  phase: "accum" | "retire";
}

interface SmoothedPoint extends ChartPoint {
  equitySmooth: number;
}

export function buildEquityAxis(maxEquityPct: number) {
  const yMax = Math.max(100, Math.round(maxEquityPct * 10) / 10);
  const ticks = generateTicks(0, yMax, 20);

  if (!ticks.includes(yMax)) ticks.push(yMax);

  return { yMax, ticks };
}

export function buildGlidePathChartData(
  input: Pick<GlidePathInput, "startAge" | "planningAge">,
  result: Pick<GlidePathResult, "equityByYear"> & {
    params: Pick<GlidePathResult["params"], "accumYears">;
  },
): ChartPoint[] {
  const retireAge = input.startAge + result.params.accumYears;
  const data: ChartPoint[] = result.equityByYear.map((w, i) => {
    const age = input.startAge + i;
    return {
      age,
      equity: Math.round(w * 1000) / 10,
      phase: age < retireAge ? "accum" : "retire",
    };
  });

  // Each weight applies to the year beginning at its age. Extend the final
  // holding period to the planning-age boundary without simulating another year.
  const finalPoint = data.at(-1);
  if (finalPoint && finalPoint.age < input.planningAge) {
    data.push({ ...finalPoint, age: input.planningAge });
  }

  return data;
}

/**
 * Add a centered moving average of the equity series. The raw optimized weights jump between
 * 5%-grid blocks (the welfare surface is near-flat, so the step-to-step shape is mostly Monte
 * Carlo noise); the smoothed series shows the underlying trend/level the steps wobble around.
 */
export function withSmoothed(data: ChartPoint[], window: number): SmoothedPoint[] {
  const half = Math.floor(Math.max(1, window) / 2);
  return data.map((p, i) => {
    let sum = 0;
    let count = 0;
    const lo = Math.max(0, i - half);
    const hi = Math.min(data.length - 1, i + half);
    for (let j = lo; j <= hi; j++) {
      sum += data[j].equity;
      count++;
    }
    return { ...p, equitySmooth: Math.round((sum / count) * 10) / 10 };
  });
}

function ChartTooltip({
  view,
  payload,
}: {
  view?: ChartView;
  payload?: { payload: SmoothedPoint }[];
}) {
  if (!payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const value = view === "smoothed" ? p.equitySmooth : p.equity;
  return (
    <Paper px="md" py="sm" withBorder shadow="md" radius="md">
      <Text fw={600} mb={2}>
        Age {p.age}
      </Text>
      <Text size="sm" c="teal">
        Equity {value.toFixed(0)}%{view === "smoothed" ? " (trend)" : ""}
      </Text>
      <Text size="xs" c="dimmed">
        {p.phase === "accum" ? "Accumulation" : "Retirement"}
      </Text>
    </Paper>
  );
}

export default function GlidePathChart({
  input,
  result,
  showConstant = true,
}: {
  input: GlidePathInput;
  result: GlidePathResult;
  /** Hide the constant-equity reference line when that constant is itself degenerate. */
  showConstant?: boolean;
}) {
  const [view, setView] = useState<ChartView>("stepped");
  const retireAge = input.startAge + result.params.accumYears;
  // Window scales with the step size so it bridges adjacent blocks without erasing the macro shape.
  const smoothWindow = Math.min(13, Math.max(5, 2 * result.params.interval + 1));
  const data = withSmoothed(buildGlidePathChartData(input, result), smoothWindow);
  const lastAge = data.length ? data[data.length - 1].age : retireAge;
  const levCap = result.params.maxLeverage * 100;
  const { yMax, ticks: equityTicks } = buildEquityAxis(levCap);

  // The optimizer derisks the final block at the fixed planning horizon (an artifact, not
  // advice). Detect a notable drop in the last retirement step to footnote it.
  const lastBlock = result.schedule.at(-1);
  const prevBlock = result.schedule.at(-2);
  const terminalDerisk =
    lastBlock != null &&
    prevBlock != null &&
    lastBlock.phase === "retire" &&
    prevBlock.equityPct - lastBlock.equityPct >= 15;

  const ageTicks = generateTicks(input.startAge, input.planningAge, 5);

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" align="center" mb="md" wrap="wrap" gap="xs">
        <Text fw={600}>Optimal equity allocation by age</Text>
        <SegmentedControl
          size="xs"
          w={{ base: "100%", xs: "auto" }}
          value={view}
          onChange={(v) => setView(v as ChartView)}
          data={[
            { label: "Stepped", value: "stepped" },
            { label: "Smoothed", value: "smoothed" },
          ]}
          aria-label="Chart view"
        />
      </Group>
      <div
        role="img"
        aria-label="Optimal equity weight by age"
        style={{ width: "100%", minWidth: 0 }}
      >
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 28, left: 0 }}>
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
            />
            <YAxis
              width={44}
              domain={[0, yMax]}
              ticks={equityTicks}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<ChartTooltip view={view} />} />
            <ReferenceLine x={retireAge} stroke={TEAL} strokeDasharray="4 4" />
            {showConstant && (
              <ReferenceLine
                y={result.flatEquityPct}
                stroke={INDIGO}
                strokeWidth={2}
                strokeDasharray="5 4"
                label={{
                  value: `Constant ${result.flatEquityPct.toFixed(0)}%`,
                  position: "insideTopLeft",
                  fill: "var(--mantine-color-indigo-6)",
                  fontSize: 11,
                }}
              />
            )}
            <Line
              type={view === "smoothed" ? "monotone" : "stepAfter"}
              dataKey={view === "smoothed" ? "equitySmooth" : "equity"}
              stroke={TEAL}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Group gap="lg" mt="sm" wrap="wrap">
        <Group gap={6} wrap="nowrap">
          <Box w={18} h={2} style={{ backgroundColor: TEAL }} aria-hidden />
          <Text size="xs" c="dimmed">
            Optimized glide path
          </Text>
        </Group>
        {showConstant && (
          <Group gap={6} wrap="nowrap">
            <Box w={18} h={0} style={{ borderTop: `2px dashed ${INDIGO}` }} aria-hidden />
            <Text size="xs" c="dimmed">
              Best constant {result.flatEquityPct.toFixed(0)}% equity
            </Text>
          </Group>
        )}
        <Text size="xs" c="dimmed">
          Vertical line marks retirement.{" "}
          {view === "smoothed"
            ? "Smoothed view is a moving average that averages out the step-to-step Monte Carlo noise to show the trend — the actual schedule is the stepped view."
            : `Equity is held flat within each ${result.params.interval}-year step.`}
        </Text>
      </Group>
      <Text size="xs" c="dimmed" mt="xs">
        {result.params.returnMode === "forward-block"
          ? "Paths: stationary block bootstrap from JST Macrohistory (16 countries, 1871–2020), rescaled to forward-CMA marginals."
          : "Paths: IID normal draws from the forward-CMA capital-market curve."}
      </Text>
      {terminalDerisk && (
        <Text size="xs" c="dimmed" mt="xs">
          <Text span fw={600}>
            Note:
          </Text>{" "}
          the dip in the final years is a fixed-horizon artifact, not real. Because the model plans
          to a fixed age with nothing set aside to leave behind, holding stocks in the last years
          only adds risk with no upside (you can&apos;t spend a final-year windfall), so the
          optimizer derisks them.
        </Text>
      )}
    </Card>
  );
}
