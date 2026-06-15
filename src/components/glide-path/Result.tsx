"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Divider,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconInfoCircle,
  IconChartLine,
  IconTrendingDown,
  IconTrendingUp,
  IconMinus,
  IconAlertTriangle,
  IconCheck,
  IconArrowsShuffle,
} from "@tabler/icons-react";
import GlidePathChart from "./GlidePathChart";
import FieldLabel from "@/components/shared/FieldLabel";
import { formatCAD } from "@/utils/format";
import type {
  GlidePathInput,
  GlidePathResult,
  SlopeDir,
} from "@/utils/glide-path/types";

interface ResultProps {
  input: GlidePathInput;
  result: GlidePathResult | null;
  computing: boolean;
  updating?: boolean;
  /** Inputs changed since this result was generated. */
  stale?: boolean;
  /** A re-roll is in flight: keep the current result visible, just spin the re-roll button. */
  rerolling?: boolean;
  error?: boolean;
  hasErrors: boolean;
  /** Re-roll nonce currently shown (0 = canonical/default draw). */
  seed?: number;
  /** Opt-in: recompute with a fresh Monte Carlo seed, inputs unchanged. */
  onReroll?: () => void;
}

// Calibration (methodology §2e/§2f): the glide's honest out-of-sample CE edge is ≤ ~0.6%
// and MC noise at 8,000 stats paths is ~0.3%, while the era/mode brackets move CE by
// 2–3% — so CE gaps under 3% are within the model's own uncertainty and shouldn't
// overturn the simpler pick. The shortfall gates carry the real veto: 0.5pp/1.5pp are
// 2–4× the Monte Carlo standard error of those rates, so the simpler pick can't add
// meaningful tail risk, but noise can't flip the recommendation either.
const SIMPLICITY_CE_THRESHOLD = 0.03;
const SIMPLICITY_DRAWDOWN_THRESHOLD = 0.005;
const SIMPLICITY_FULLPATH_THRESHOLD = 0.015;
const DRAWDOWN_RISK_HIGHLIGHT_THRESHOLD = 0.15;
const FULLPATH_RISK_HIGHLIGHT_THRESHOLD = 0.3;
const LOW_DRAWDOWN_SHORTFALL_THRESHOLD = 0.05;

const METRIC_HELP = {
  ce: "Certainty-equivalent income — the steady, guaranteed yearly income that would feel as good as this uncertain plan once the bad years are penalised. It sits below the simple average because shortfalls hurt more than surpluses help.",
  drawdown:
    "Share of simulated retirements with at least one year the portfolio can't fully fund your target spending — measured from the expected balance at retirement. With high spending flexibility this reads near 0 by design: flexible spending scales the target down to whatever the balance allows, so it rarely 'falls short' — the risk shows up as income variability (CE income) instead, not shortfall.",
  fullPath:
    "The same shortfall measure taken over the whole path from today, so it also reflects the luck of markets in the years before you retire.",
} as const;

/**
 * A CE income this far below the target is the FLOOR=1 / CRRA artifact (the certainty-equivalent
 * collapses toward zero when consumption hits the floor in a meaningful share of paths), not a
 * real planning figure. We use it to suppress percentage comparisons against a degenerate
 * denominator; the shortfall rate is the pass/fail signal.
 */
function ceIsDegenerate(income: number, targetIncome: number): boolean {
  return income < Math.max(1000, 0.05 * targetIncome);
}

interface Recommendation {
  preferConstant: boolean;
  inconclusive: boolean;
  glideBad: boolean;
  flatBad: boolean;
}

/**
 * Decide which allocation to recommend. Bias toward the simpler constant weight when it wins all
 * comparable outcomes or comes within the simplicity threshold on CE income, drawdown shortfall,
 * or full-path shortfall. When both CE scores are tail-dominated, the comparison is inconclusive;
 * when only one is, prefer the allocation that avoids the near-zero-income tail.
 */
function pickRecommendation(
  input: GlidePathInput,
  result: GlidePathResult,
): Recommendation {
  const glideBad = ceIsDegenerate(result.ceIncome, input.targetIncome);
  const flatBad = ceIsDegenerate(result.flatCeIncome, input.targetIncome);
  if (glideBad && flatBad) {
    return { preferConstant: false, inconclusive: true, glideBad, flatBad };
  }
  if (glideBad) {
    return { preferConstant: true, inconclusive: false, glideBad, flatBad };
  }
  if (flatBad) {
    return { preferConstant: false, inconclusive: false, glideBad, flatBad };
  }

  const ceWithin =
    result.flatCeIncome >= result.ceIncome * (1 - SIMPLICITY_CE_THRESHOLD);
  const drawdownWithin =
    result.flatDrawdownDepletion <=
    result.drawdownDepletion + SIMPLICITY_DRAWDOWN_THRESHOLD;
  const fullPathWithin =
    result.flatDepletion <= result.depletion + SIMPLICITY_FULLPATH_THRESHOLD;
  const constantWinsCe = result.flatCeIncome > result.ceIncome;
  const preferConstant =
    constantWinsCe || (ceWithin && drawdownWithin && fullPathWithin);

  return { preferConstant, inconclusive: false, glideBad, flatBad };
}

const DIR_COLOR: Record<SlopeDir, string> = {
  Rising: "teal",
  Falling: "indigo",
  Flat: "gray",
  "n/a": "gray",
};

function slopeIcon(dir: SlopeDir) {
  switch (dir) {
    case "Rising":
      return <IconTrendingUp size={12} />;
    case "Falling":
      return <IconTrendingDown size={12} />;
    case "Flat":
      return <IconMinus size={12} />;
    case "n/a":
      return undefined;
  }
}

/** Accumulation/retirement slope badges (+ tent sentence unless compact) for the glide path. */
function GlideShape({
  input,
  result,
  compact = false,
}: {
  input: GlidePathInput;
  result: GlidePathResult;
  compact?: boolean;
}) {
  const retireAge = input.startAge + result.params.accumYears;
  return (
    <Stack gap={compact ? 4 : "xs"}>
      <Group gap="xs" wrap="wrap">
        <Badge
          variant="light"
          color={DIR_COLOR[result.accumDir]}
          leftSection={slopeIcon(result.accumDir)}
          size={compact ? "sm" : "lg"}
        >
          Accumulation: {result.accumDir}
        </Badge>
        <Badge
          variant="light"
          color={DIR_COLOR[result.retireDir]}
          leftSection={slopeIcon(result.retireDir)}
          size={compact ? "sm" : "lg"}
        >
          Retirement: {result.retireDir}
        </Badge>
      </Group>
      {!compact && result.tentPct != null && result.tentAge != null && (
        <Text size="sm" c="dimmed">
          The equity weight bottoms at{" "}
          <Text span fw={600} c="bright">
            {result.tentPct}%
          </Text>{" "}
          around age {result.tentAge}, near retirement (age {retireAge}).
        </Text>
      )}
    </Stack>
  );
}

/** One-line description of an allocation's shape: glide-path badges or the flat-weight sentence. */
function ShapeSummary({
  kind,
  input,
  result,
  flatPct,
  compact = false,
}: {
  kind: "glide" | "constant";
  input: GlidePathInput;
  result: GlidePathResult;
  flatPct: number;
  compact?: boolean;
}) {
  if (kind === "glide") {
    return <GlideShape input={input} result={result} compact={compact} />;
  }
  const bonds = 100 - flatPct;
  const mix =
    bonds >= 0 ? `${flatPct}% stocks / ${bonds}% bonds` : `${flatPct}% equity`;
  return (
    <Text size="sm" c="dimmed">
      Hold {mix} at every age
      {compact
        ? "."
        : " — the simplest plan to implement and to hold through market swings."}
    </Text>
  );
}

/** One full-size metric: label with an info popover, the value, an optional note, a risk flag. */
function MetricItem({
  label,
  help,
  value,
  note,
  flagged = false,
}: {
  label: string;
  help: string;
  value: string;
  note?: string;
  flagged?: boolean;
}) {
  return (
    <Stack gap={2}>
      <Text size="sm" component="div">
        <FieldLabel label={label} helperText={help} />
      </Text>
      <Group gap={6} wrap="nowrap">
        <Text fw={700} fz="lg">
          {value}
        </Text>
        {flagged && (
          <IconAlertTriangle size={15} color="var(--mantine-color-yellow-6)" />
        )}
      </Group>
      {note && (
        <Text size="xs" c="dimmed">
          {note}
        </Text>
      )}
    </Stack>
  );
}

/** One compact metric ("Label value") for the secondary option row. */
function CompactStat({
  label,
  value,
  flagged = false,
}: {
  label: string;
  value: string;
  flagged?: boolean;
}) {
  return (
    <Group gap={4} wrap="nowrap">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={600}>
        {value}
      </Text>
      {flagged && (
        <IconAlertTriangle size={13} color="var(--mantine-color-yellow-6)" />
      )}
    </Group>
  );
}

interface OptionStats {
  ceIncome: number;
  ceDegenerate: boolean;
  drawdownDepletion: number;
  fullPathShortfall: number;
}

/** The three outcome metrics for one option, as a full grid or a compact inline row. */
function OutcomeMetrics({
  stats,
  compact = false,
}: {
  stats: OptionStats;
  compact?: boolean;
}) {
  const ceValue = stats.ceDegenerate
    ? "Tail-dominated"
    : `${formatCAD(stats.ceIncome)}/yr`;
  const drawValue = `${(stats.drawdownDepletion * 100).toFixed(1)}%`;
  const fullValue = `${(stats.fullPathShortfall * 100).toFixed(1)}%`;
  const drawFlag = stats.drawdownDepletion >= DRAWDOWN_RISK_HIGHLIGHT_THRESHOLD;
  const fullFlag = stats.fullPathShortfall >= FULLPATH_RISK_HIGHLIGHT_THRESHOLD;

  if (compact) {
    return (
      <Group gap="lg" wrap="wrap">
        <CompactStat
          label="CE income"
          value={ceValue}
          flagged={stats.ceDegenerate}
        />
        <CompactStat label="Drawdown" value={drawValue} flagged={drawFlag} />
        <CompactStat label="Full-path" value={fullValue} flagged={fullFlag} />
      </Group>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
      <MetricItem
        label="CE income"
        help={METRIC_HELP.ce}
        value={ceValue}
        note={
          stats.ceDegenerate
            ? "bad tails overwhelm the score"
            : "risk-adjusted lifetime income"
        }
        flagged={stats.ceDegenerate}
      />
      <MetricItem
        label="Drawdown shortfall"
        help={METRIC_HELP.drawdown}
        value={drawValue}
        note="from expected retirement savings"
        flagged={drawFlag}
      />
      <MetricItem
        label="Full-path shortfall"
        help={METRIC_HELP.fullPath}
        value={fullValue}
        note="includes pre-retirement markets"
        flagged={fullFlag}
      />
    </SimpleGrid>
  );
}

export default function Result({
  input,
  result,
  computing,
  updating = false,
  stale = false,
  rerolling = false,
  error = false,
  hasErrors,
  seed = 0,
  onReroll,
}: ResultProps) {
  if (hasErrors && !result) {
    return (
      <Alert
        variant="light"
        color="gray"
        icon={<IconInfoCircle />}
        title="Incomplete inputs"
      >
        Fix the highlighted fields to compare your allocation options.
      </Alert>
    );
  }

  if (error && !result) {
    return (
      <Alert
        variant="light"
        color="red"
        icon={<IconAlertTriangle />}
        title="Couldn't compute"
      >
        Something went wrong while optimizing your allocation. Adjust an input
        and generate again.
      </Alert>
    );
  }

  if (computing && !result) {
    return (
      <Center mih={400}>
        <Stack align="center" gap="md">
          <Loader size="xl" />
          <Text size="sm" c="dimmed" ta="center">
            Optimizing your allocation paths…
            <br />
            This may take a few moments.
          </Text>
        </Stack>
      </Center>
    );
  }

  if (!result) {
    return (
      <Center mih={400}>
        <Stack align="center" gap="md">
          <ThemeIcon size={56} variant="light" color="teal" radius="xl">
            <IconChartLine size={30} />
          </ThemeIcon>
          <Stack gap={4} align="center">
            <Text fw={600}>Ready to optimize</Text>
            <Text size="sm" c="dimmed" ta="center" maw={300}>
              Fill in your details, then click{" "}
              <Text span fw={600}>
                Generate allocation paths
              </Text>{" "}
              to find your personalized equity allocation.
            </Text>
          </Stack>
        </Stack>
      </Center>
    );
  }

  const reco = pickRecommendation(input, result);
  const flatPct = Math.round(result.flatEquityPct);
  const incomeDegenerate = ceIsDegenerate(result.ceIncome, input.targetIncome);
  const flatDegenerate = ceIsDegenerate(
    result.flatCeIncome,
    input.targetIncome,
  );

  const glide = {
    kind: "glide" as const,
    title: "Optimized glide path",
    stats: {
      ceIncome: result.ceIncome,
      ceDegenerate: incomeDegenerate,
      drawdownDepletion: result.drawdownDepletion,
      fullPathShortfall: result.depletion,
    },
  };
  const constant = {
    kind: "constant" as const,
    title: `Constant ${flatPct}% equity`,
    stats: {
      ceIncome: result.flatCeIncome,
      ceDegenerate: flatDegenerate,
      drawdownDepletion: result.flatDrawdownDepletion,
      fullPathShortfall: result.flatDepletion,
    },
  };
  const primary = reco.preferConstant ? constant : glide;
  const secondary = reco.preferConstant ? glide : constant;
  const hasHighDrawdownRisk =
    !reco.inconclusive &&
    primary.stats.drawdownDepletion >= DRAWDOWN_RISK_HIGHLIGHT_THRESHOLD;
  const hasHighFullPathRisk =
    !reco.inconclusive &&
    primary.stats.fullPathShortfall >= FULLPATH_RISK_HIGHLIGHT_THRESHOLD;
  const planNeedsAdjustment = hasHighDrawdownRisk || hasHighFullPathRisk;
  // At high spending flexibility the shortfall rate is ~0 by construction (the target scales with
  // the balance), so a low drawdown shortfall no longer signals genuine slack — suppress the
  // "room to adjust" nudge there and let CE income / income variability carry the tail-risk read.
  const flexibility =
    typeof input.flexibility === "number" ? input.flexibility : 0;
  const shortfallIsMeaningful = flexibility < 0.5;
  const hasRoomToAdjustPlan =
    shortfallIsMeaningful &&
    !reco.inconclusive &&
    primary.stats.drawdownDepletion < LOW_DRAWDOWN_SHORTFALL_THRESHOLD &&
    !hasHighFullPathRisk;
  const showNeutralOptions = reco.inconclusive || planNeedsAdjustment;

  const reasonText = reco.preferConstant
    ? reco.glideBad
      ? "The constant allocation is preferred because the glide path's CE income is tail-dominated."
      : "The constant allocation is preferred because the optimized glide path is only marginally better."
    : reco.flatBad
      ? "The glide path is preferred because the constant allocation's CE income is tail-dominated."
      : "The glide path is preferred because the constant allocation trails it.";

  return (
    <Stack gap="lg" pos="relative">
      {updating && (
        <Group gap="xs" aria-live="polite">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            Updating allocation paths...
          </Text>
        </Group>
      )}
      {stale && (
        <Text size="xs" c="orange" fw={600} aria-live="polite">
          {hasErrors
            ? "Inputs changed: fix the highlighted fields, then generate again."
            : "Inputs changed. Generate allocation paths to refresh this result."}
        </Text>
      )}
      {error && (
        <Text size="xs" c="red" fw={600} aria-live="polite">
          Generation failed. Try again.
        </Text>
      )}
      {planNeedsAdjustment && (
        <Card withBorder radius="md" padding="md">
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <ThemeIcon color="yellow" variant="light" size={34} radius="xl">
              <IconAlertTriangle size={19} />
            </ThemeIcon>
            <Stack gap={2}>
              <Text fw={600}>Your plan may need adjustment</Text>
              {hasHighDrawdownRisk && (
                <Text size="sm" c="dimmed">
                  Drawdown shortfall is{" "}
                  {DRAWDOWN_RISK_HIGHLIGHT_THRESHOLD * 100}% or higher. Consider
                  retiring later, reducing retirement spending, or saving more.
                </Text>
              )}
              {!hasHighDrawdownRisk && hasHighFullPathRisk && (
                <Text size="sm" c="dimmed">
                  Full-path shortfall is{" "}
                  {FULLPATH_RISK_HIGHLIGHT_THRESHOLD * 100}% or higher, so
                  pre-retirement market luck has a meaningful effect.
                </Text>
              )}
            </Stack>
          </Group>
        </Card>
      )}

      {reco.inconclusive && (
        <Card
          withBorder
          radius="md"
          padding="lg"
          style={{
            borderColor: "var(--mantine-color-yellow-5)",
            borderWidth: 2,
          }}
        >
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <ThemeIcon color="yellow" variant="light" size={38} radius="xl">
              <IconAlertTriangle size={22} />
            </ThemeIcon>
            <Stack gap={2}>
              <Text size="xs" fw={700} c="yellow.7" tt="uppercase">
                Comparison inconclusive
              </Text>
              <Title order={3} fz="lg">
                CE income is tail-dominated
              </Title>
              <Text size="sm" c="dimmed">
                Near-zero income in bad-luck paths overwhelms CE income, so it
                cannot reliably distinguish these allocations. Compare their
                shortfall rates below.
              </Text>
            </Stack>
          </Group>
        </Card>
      )}

      {showNeutralOptions ? (
        [glide, constant].map((option) => (
          <Card key={option.kind} withBorder radius="md" padding="lg">
            <Stack gap="md">
              <Title order={3} fz="lg">
                {option.title}
              </Title>
              <ShapeSummary
                kind={option.kind}
                input={input}
                result={result}
                flatPct={flatPct}
              />
              <Divider />
              <OutcomeMetrics stats={option.stats} />
            </Stack>
          </Card>
        ))
      ) : (
        <>
          {/* Primary — the recommended allocation, with its own outcomes inline. */}
          <Card
            withBorder
            radius="md"
            padding="lg"
            style={{
              borderColor: "var(--mantine-color-teal-5)",
              borderWidth: 2,
            }}
          >
            <Stack gap="md">
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <ThemeIcon color="teal" size={38} radius="xl">
                  <IconCheck size={22} />
                </ThemeIcon>
                <Stack gap={0}>
                  <Text size="xs" fw={700} c="teal" tt="uppercase">
                    Recommended allocation
                  </Text>
                  <Title order={3} fz="lg">
                    {primary.title}
                  </Title>
                </Stack>
              </Group>

              <ShapeSummary
                kind={primary.kind}
                input={input}
                result={result}
                flatPct={flatPct}
              />

              <Divider />

              <OutcomeMetrics stats={primary.stats} />

              <Text size="xs" c="dimmed">
                {reasonText}
              </Text>
            </Stack>
          </Card>

          {/* Secondary — the alternative, compact. */}
          <Card withBorder radius="md" padding="md">
            <Stack gap="xs">
              <Group justify="space-between" align="center" wrap="nowrap">
                <Text size="sm" fw={600} c="dimmed">
                  Alternative — {secondary.title}
                </Text>
              </Group>
              <ShapeSummary
                kind={secondary.kind}
                input={input}
                result={result}
                flatPct={flatPct}
                compact
              />
              <OutcomeMetrics stats={secondary.stats} compact />
            </Stack>
          </Card>
        </>
      )}

      {hasRoomToAdjustPlan && (
        <Card withBorder radius="md" padding="md">
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <Stack gap={2}>
              <Text fw={600}>You may have room to adjust your plan</Text>
              <Text size="sm" c="dimmed">
                This plan&apos;s drawdown shortfall is below 5%. You may be able
                to retire earlier or increase your retirement spending.
              </Text>
            </Stack>
          </Group>
        </Card>
      )}

      <GlidePathChart
        input={input}
        result={result}
        showConstant={showNeutralOptions || !flatDegenerate}
      />

      {onReroll && (
        <Stack gap={4} align="center" mt="xs">
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            leftSection={<IconArrowsShuffle size={14} />}
            onClick={onReroll}
            loading={rerolling}
            disabled={updating || stale}
          >
            Test another simulation sample
          </Button>
          <Text size="xs" c="dimmed" ta="center" maw={440}>
            {seed > 0
              ? `Showing simulation sample #${seed + 1}. Compare it with the prior result to gauge stability.`
              : "Optional stability check: rerun the same plan with a different simulation sample."}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
