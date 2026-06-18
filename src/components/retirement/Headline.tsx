import type { ReactNode } from "react";
import { Alert, Card, Divider, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { formatCADCompact } from "@/utils/format";
import SwrTechnicalNote from "./SwrTechnicalNote";
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

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm">
        {/* Hero: the retirement age */}
        <Stack gap={2}>
          <Text size="sm" fw="600">
            {retireNow ? "You can retire" : "You can retire at"}
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
            {retireNow ? `Your savings already support your target income.` : ``}
            {!retireNow && retirementAgeRange && (
              <>
                50% chance you retire between ages {retirementAgeRange.p25} and{" "}
                {retirementAgeRange.p75}.
              </>
            )}
          </Text>
        </Stack>

        <Divider />

        {/* Metric strip */}
        <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="lg" verticalSpacing="md">
          {result.portfolioAtRetirement != null && (
            <Metric
              label="Savings at retirement"
              value={formatCADCompact(result.portfolioAtRetirement)}
            />
          )}
          {result.guaranteedIncome > 0 && (
            <Metric
              label="Pension income"
              value={`${formatCADCompact(result.guaranteedIncome)} /yr`}
              note={`from age ${input.pensionStartAge}`}
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
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
