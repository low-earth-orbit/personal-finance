import { Alert, Group, Stack, Text, Title } from "@mantine/core";
import { Eyebrow, Figure, FigureStrip } from "@/components/shared/Figures";
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

  return (
    <Stack gap="md" pt="md" style={{ borderTop: "1px solid var(--pf-ink)" }}>
      {/* Hero: the retirement age */}
      <Stack gap="xs">
        <Eyebrow>Projected earliest retirement · {input.targetSuccessRate}% confidence</Eyebrow>
        <Group gap="md" align="baseline" wrap="wrap">
          <Title
            order={2}
            ff="monospace"
            fw={600}
            fz={36}
            lh={1.1}
            c="ledger"
            style={{ letterSpacing: "-0.04em" }}
          >
            {retireNow ? "Now" : `Age ${earliestRetirementAge}`}
          </Title>
          {!retireNow && (
            <Text fz="lg">
              in {yearsUntilRetirement} {yearsUntilRetirement === 1 ? "year" : "years"}
            </Text>
          )}
        </Group>
        <Text maw="46rem">
          {retireNow ? `Projected savings already cover the target income.` : ``}
          {!retireNow && retirementAgeRange && (
            <>
              In half of the simulations, between ages {retirementAgeRange.p25} and{" "}
              {retirementAgeRange.p75}.
            </>
          )}
        </Text>
        <Text size="sm" c="dimmed" maw="46rem">
          The {input.targetSuccessRate}% confidence covers market swings after you retire: your
          savings are projected at the expected return until then. The age range above shows how
          market luck while saving moves the date.
        </Text>
      </Stack>

      <FigureStrip>
        {result.portfolioAtRetirement != null && (
          <Figure
            label="Savings at retirement"
            size="sm"
            value={formatCADCompact(result.portfolioAtRetirement)}
            note="today's dollars"
          />
        )}
        {result.guaranteedIncome > 0 && (
          <Figure
            label="Guaranteed income"
            size="sm"
            value={`${formatCADCompact(result.guaranteedIncome)} /yr`}
            note={`all started by age ${lastGuaranteedStartAge(input)}`}
          />
        )}
        {planSWR != null && (
          <Figure
            label="Year-1 withdrawal"
            size="sm"
            value={`${(planSWR * 100).toFixed(1)}%`}
            note="of savings"
            info={<SwrTechnicalNote input={input} />}
          />
        )}
        {medianLeft != null && (
          <Figure
            label={`Left at age ${input.planningAge}`}
            size="sm"
            value={formatCADCompact(medianLeft)}
            note="median, today's dollars"
          />
        )}
      </FigureStrip>
    </Stack>
  );
}
