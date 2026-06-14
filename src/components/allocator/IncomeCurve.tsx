"use client";

import { Card, Group, Paper, Stack, Text } from "@mantine/core";
import {
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCAD, formatCADCompact } from "@/utils/format";
import { incomeAtAge } from "@/utils/allocator/salaryCurve";
import type { AllocationResult, AllocatorInput } from "@/utils/allocator/types";
import { generateTicks } from "@/utils/charts";

const TEAL = "var(--mantine-color-teal-6)";
const ORANGE = "var(--mantine-color-orange-6)";

export interface IncomeCurvePoint {
  age: number;
  income: number;
  claimNominal?: number;
  claimReal?: number;
  incomeAfterClaim?: number;
}

export function buildIncomeCurveData(
  input: Pick<
    AllocatorInput,
    | "currentAge"
    | "retirementAge"
    | "salaryCurve"
    | "currentIncome"
    | "salaryGrowthPct"
    | "salaryGrowthYears"
  >,
): IncomeCurvePoint[] {
  return Array.from(
    { length: input.retirementAge - input.currentAge },
    (_, index) => {
      const age = input.currentAge + index;
      return {
        age,
        income: incomeAtAge(
          age,
          input.currentAge,
          input.salaryCurve,
          input.currentIncome,
          input.salaryGrowthPct,
          input.salaryGrowthYears,
        ),
      };
    },
  );
}

function ChartTooltip({
  payload,
}: {
  payload?: { payload: IncomeCurvePoint }[];
}) {
  if (!payload?.length) return null;
  const point = payload[0].payload;
  return (
    <Paper px="md" py="sm" withBorder shadow="md" radius="md">
      <Text fw={600}>Age {point.age}</Text>
      <Text size="sm" c="teal">
        Base income: {formatCAD(point.income)}
      </Text>
      {point.claimNominal != null && (
        <>
          <Text size="sm" c="orange">
            Claim deduction: {formatCAD(point.claimNominal)} nominal
          </Text>
          <Text size="xs" c="dimmed">
            {formatCAD(point.claimReal ?? 0)} in today&apos;s dollars; modeled
            base income after claim: {formatCAD(point.incomeAfterClaim ?? 0)}
          </Text>
        </>
      )}
    </Paper>
  );
}

export default function IncomeCurve({
  input,
  allocation,
}: {
  input: AllocatorInput;
  allocation: AllocationResult;
}) {
  const data = buildIncomeCurveData(input);
  const claims = [
    ...(allocation.rrspDeductNow > 0
      ? [{ age: input.currentAge, amount: allocation.rrspDeductNow }]
      : []),
    ...allocation.rrspCarryForward,
  ];
  const claimsByAge = new Map(claims.map((claim) => [claim.age, claim.amount]));
  const chartData = data.map((point) => {
    const claimNominal = claimsByAge.get(point.age);
    if (claimNominal == null) return point;
    const inflationFactor =
      (1 + input.inflationPct / 100) ** (point.age - input.currentAge);
    const claimReal = claimNominal / inflationFactor;
    return {
      ...point,
      claimNominal,
      claimReal,
      incomeAfterClaim: Math.max(0, point.income - claimReal),
    };
  });
  const ageTicks = generateTicks(input.currentAge, input.retirementAge, 5);

  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="xs">
        <Text fw={600}>
          Modeled base income before retirement (real, today&apos;s dollars)
        </Text>
        <Text size="sm" c="dimmed">
          RRSP deduction timing follows this real-dollar income curve plus
          modeled taxable investment distributions. Orange dots mark deduction
          claims.
        </Text>
        <div
          role="img"
          aria-label="Modeled base income by age with future RRSP deduction claim ages"
          style={{ width: "100%", minWidth: 0 }}
        >
          <ResponsiveContainer width="100%" height={270}>
            <ComposedChart
              data={chartData}
              margin={{ top: 16, right: 12, bottom: 26, left: 0 }}
            >
              <XAxis
                dataKey="age"
                type="number"
                domain={[input.currentAge, input.retirementAge]}
                ticks={ageTicks}
                tick={{ fontSize: 12 }}
                tickMargin={8}
                label={{ value: "Age", position: "bottom", fontSize: 12 }}
              />
              <YAxis
                width={56}
                tickFormatter={(value) => formatCADCompact(Number(value))}
                tick={{ fontSize: 12 }}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine
                x={input.retirementAge}
                stroke="var(--mantine-color-gray-5)"
                strokeDasharray="4 4"
              />
              <Line
                type="monotone"
                dataKey="income"
                stroke={TEAL}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
              {chartData
                .filter((point) => point.claimNominal != null)
                .map((point) => (
                  <ReferenceDot
                    key={point.age}
                    x={point.age}
                    y={point.income}
                    r={5}
                    fill={ORANGE}
                    stroke="white"
                  />
                ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Group gap="lg" wrap="wrap">
          <Group gap={6} wrap="nowrap">
            <span
              style={{
                width: 14,
                height: 3,
                borderRadius: 2,
                background: TEAL,
                display: "inline-block",
              }}
            />
            <Text size="xs" c="dimmed">
              Base income
            </Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: ORANGE,
                border: "1px solid white",
                display: "inline-block",
              }}
            />
            <Text size="xs" c="dimmed">
              RRSP deduction claim
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            Income axis in today&apos;s dollars; claims are fixed nominal
            dollars. Vertical line marks retirement.
          </Text>
        </Group>
        {claims.length > 0 && (
          <Text size="xs" c="dimmed">
            Deduction claims (fixed nominal dollars):{" "}
            {claims
              .map((claim) => `age ${claim.age}: ${formatCAD(claim.amount)}`)
              .join("; ")}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
