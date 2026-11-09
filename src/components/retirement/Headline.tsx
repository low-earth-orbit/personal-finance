import type { ReactNode } from "react";
import { Alert, Card, Divider, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { formatCADCompact } from "@/utils/format";
import SwrTechnicalNote from "./SwrTechnicalNote";
import { lastGuaranteedStartAge } from "@/utils/retirement/projection";
import type { RetirementInput, RetirementResult } from "@/utils/retirement/types";

interface HeadlineProps {
  input: RetirementInput;
  result: RetirementResult;
  /** Year-1 withdrawal rate (fraction); null when no feasible plan. */
  planSWR: number | null;
}

/** One cell in the metric strip below the retirement-age hero. */
function Metric({
  label,
  value,
  note,
  info,
}: {
  label: string;
  value: string;
  note?: ReactNode;
  /** Optional adornment shown next to the label (e.g. an info-icon button). */
  info?: ReactNode;
}) {
  return (
    <Stack gap={2}>
      <Group gap={4} align="center" wrap="nowrap">
        <Text size="sm">{label}</Text>
      </Group>
      <Text fw={600} fz="md">
        {value}
        {info}
      </Text>
      {note && (
        <Text size="xs" c="dimmed">
          {note}
        </Text>
      )}
    </Stack>
  );
}

export default function Headline({ input, result, planSWR }: HeadlineProps) {
  if (result.earliestRetirementAge === null) {
    return (
      <Alert
        variant="light"
        color="red"
        icon={<IconAlertTriangle />}
        title="Your plan does not reach the target yet"
      >
        <Text size="sm">
          Even working to age {input.planningAge - 1}, your plan doesn&apos;t reach your{" "}
          {input.targetSuccessRate}% confidence target of lasting to age {input.planningAge}. Try a
          lower target income, a higher savings rate, more guaranteed income, or a lower confidence
          target.
        </Text>
      </Alert>
    );
  }

  const { earliestRetirementAge, yearsUntilRetirement, retirementAgeRange } = result;
  const retireNow = yearsUntilRetirement === 0;
  const bands = result.retirementBands;
  const medianLeft = bands && bands.length > 0 ? bands[bands.length - 1].p50 : null;
  const showCutRate = input.spendingFlexibilityPct > 0 && result.cutRate != null;

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm">
        {/* Hero: the retirement age */}
        <Stack gap={2}>
          <Text size="sm" fw="600">
            Projected earliest retirement
          </Text>
          <Group gap="xs" align="baseline" wrap="nowrap">
            <Title order={2} fz={{ base: 30, sm: 36 }} c="teal">
              {retireNow ? "Now" : `Age ${earliestRetirementAge}`}
            </Title>
            {!retireNow && (
              <Text size="sm">
                in {yearsUntilRetirement} {yearsUntilRetirement === 1 ? "year" : "years"}
              </Text>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {retireNow ? `Projected savings already cover the target income.` : ``}
            {!retireNow && retirementAgeRange && (
              <>
                In half of the simulations, between ages {retirementAgeRange.p25} and{" "}
                {retirementAgeRange.p75}.
              </>
            )}
          </Text>
          <Text size="xs" c="dimmed">
            The {input.targetSuccessRate}% confidence covers market swings after you retire: your
            savings are projected at the expected return until then. The age range above shows how
            market luck while saving moves the date.
          </Text>
        </Stack>

        <Divider />

        {/* Metric strip */}
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="lg" verticalSpacing="md">
          {result.portfolioAtRetirement != null && (
            <Metric
              label="Savings at retirement"
              value={formatCADCompact(result.portfolioAtRetirement)}
            />
          )}
          {result.guaranteedIncome > 0 && (
            <Metric
              label="Guaranteed income"
              value={`${formatCADCompact(result.guaranteedIncome)} /yr`}
              note={`all started by age ${lastGuaranteedStartAge(input)}`}
            />
          )}
          {planSWR != null && (
            <Metric
              label="Year-1 withdrawal"
              value={`${(planSWR * 100).toFixed(1)}%`}
              note="of savings"
              info={<SwrTechnicalNote input={input} />}
            />
          )}
          {medianLeft != null && (
            <Metric
              label={`Left at age ${input.planningAge}`}
              value={formatCADCompact(medianLeft)}
              note="median, today's dollars"
            />
          )}
          {showCutRate && (
            <Metric
              label="Chance of trimming spending"
              value={`${Math.round((result.cutRate ?? 0) * 100)}%`}
              note="at least one year of reduced spending"
            />
          )}
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
