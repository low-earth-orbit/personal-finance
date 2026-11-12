"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
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
  IconRefresh,
} from "@tabler/icons-react";
import GlidePathChart from "./GlidePathChart";
import { Eyebrow, Figure, FigureStrip, Notice } from "@/components/shared/Figures";
import FieldLabel from "@/components/shared/FieldLabel";
import { formatCAD } from "@/utils/format";
import {
  DRAWDOWN_RISK_HIGHLIGHT_THRESHOLD,
  FULLPATH_RISK_HIGHLIGHT_THRESHOLD,
  LOW_DRAWDOWN_SHORTFALL_THRESHOLD,
  pickRecommendation,
} from "@/utils/glide-path/recommendation";
import type { GlidePathInput, GlidePathResult, SlopeDir } from "@/utils/glide-path/types";

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

const METRIC_HELP = {
  ce: "Certainty-equivalent income — the steady, guaranteed yearly income that would feel as good as this uncertain plan once the bad years are penalised. It sits below the simple average because shortfalls hurt more than surpluses help.",
  drawdown:
    "Share of simulated retirements with at least one year the portfolio can't fully fund your target spending — measured from the expected balance at retirement. With high spending flexibility this reads near 0 by design: flexible spending scales the target down to whatever the balance allows, so it rarely 'falls short' — the risk shows up as income variability (CE income) instead, not shortfall.",
  fullPath:
    "The same shortfall measure taken over the whole path from today, so it also reflects the luck of markets in the years before you retire.",
  bequest:
    "Median real balance left at the end of the plan, in today's dollars. The optimizer gives this money no value.",
} as const;

const SAME_ALLOCATION_NOTE = "The optimized glide path is this same constant allocation.";

/** Opacity of a result whose inputs have changed since it was generated. */
const STALE_OPACITY = 0.55;

const DIR_COLOR: Record<SlopeDir, string> = {
  Rising: "ledger",
  Falling: "ink",
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
          Within 15 years of retirement (age {retireAge}), the equity weight is lowest at{" "}
          <Text span fw={600} c="bright">
            {result.tentPct}%
          </Text>
          , around age {result.tentAge}.
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
  const mix = bonds >= 0 ? `${flatPct}% stocks / ${bonds}% bonds` : `${flatPct}% equity`;
  return (
    <Text size="sm" c="dimmed">
      Hold {mix} at every age
      {compact ? "." : " — the simplest schedule to follow."}
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
    <Figure
      size="sm"
      label={<FieldLabel label={label} helperText={help} />}
      value={value}
      note={note}
      tone={flagged ? "warn" : undefined}
      info={flagged ? <IconAlertTriangle size={14} color="var(--pf-warn)" /> : undefined}
    />
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
      <Text size="sm" ff="monospace" fw={500}>
        {value}
      </Text>
      {flagged && <IconAlertTriangle size={13} color="var(--pf-warn)" />}
    </Group>
  );
}

interface OptionStats {
  /** Median-path balance at retirement and the year-1 draw it funds, for this allocation. */
  expectedBalance: number;
  initialDraw: number;
  fundingRatio: number | null;
  ceIncome: number;
  ceDegenerate: boolean;
  /** CE including the bequest term; shown only when a bequest weight is set. */
  welfareCe: number | null;
  drawdownDepletion: number;
  fullPathShortfall: number;
  medianBequest: number;
}

/** Funding context for one option: the balance it is expected to reach and the first draw. */
function FundingLine({ stats }: { stats: OptionStats }) {
  const share =
    stats.fundingRatio === null
      ? "not available"
      : `${(stats.fundingRatio * 100).toFixed(1)}% of the expected retirement balance`;
  return (
    <Text size="sm" c="dimmed">
      Expected retirement balance ≈ {formatCAD(stats.expectedBalance)} · Year-1 portfolio draw ≈{" "}
      {formatCAD(stats.initialDraw)} ({share})
    </Text>
  );
}

/** The four outcome metrics for one option, as a full grid or a compact inline row. */
function OutcomeMetrics({ stats, compact = false }: { stats: OptionStats; compact?: boolean }) {
  const ceValue = stats.ceDegenerate ? "Tail-dominated" : `${formatCAD(stats.ceIncome)}/yr`;
  const drawValue = `${(stats.drawdownDepletion * 100).toFixed(1)}%`;
  const fullValue = `${(stats.fullPathShortfall * 100).toFixed(1)}%`;
  const bequestValue = formatCAD(stats.medianBequest);
  const drawFlag = stats.drawdownDepletion >= DRAWDOWN_RISK_HIGHLIGHT_THRESHOLD;
  const fullFlag = stats.fullPathShortfall >= FULLPATH_RISK_HIGHLIGHT_THRESHOLD;

  if (compact) {
    return (
      <Group gap="lg" wrap="wrap">
        <CompactStat label="CE income" value={ceValue} flagged={stats.ceDegenerate} />
        <CompactStat label="Drawdown" value={drawValue} flagged={drawFlag} />
        <CompactStat label="Full-path" value={fullValue} flagged={fullFlag} />
        <CompactStat label="Left at end" value={bequestValue} />
      </Group>
    );
  }

  return (
    <FigureStrip>
      <MetricItem
        label="CE income"
        help={METRIC_HELP.ce}
        value={ceValue}
        note={
          stats.ceDegenerate
            ? "bad tails overwhelm the score"
            : stats.welfareCe != null
              ? `${formatCAD(stats.welfareCe)}/yr including what you leave`
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
      <MetricItem
        label="Money left at end"
        help={METRIC_HELP.bequest}
        value={bequestValue}
        note="median, today's dollars"
      />
    </FigureStrip>
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
      <Alert variant="light" color="gray" icon={<IconInfoCircle />} title="Incomplete inputs">
        Fix the highlighted fields to compare allocations.
      </Alert>
    );
  }

  if (error && !result) {
    return (
      <Alert variant="light" color="red" icon={<IconAlertTriangle />} title="Couldn't compute">
        Something went wrong while running the model. Adjust an input and generate again.
      </Alert>
    );
  }

  if (computing && !result) {
    return (
      <Center mih={400}>
        <Stack align="center" gap="md">
          <Loader size="xl" />
          <Text size="sm" c="dimmed" ta="center">
            Running the optimizer…
            <br />
            This may take a few moments.
          </Text>
        </Stack>
      </Center>
    );
  }

  if (!result) {
    // Below lg the result sits above the form; an empty placeholder there only pushes the form
    // down, so it is shown beside the form on wide screens only.
    return (
      <Center mih={400} visibleFrom="lg">
        <Stack align="center" gap="md">
          <ThemeIcon size={56} variant="light" color="ledger" radius="xl">
            <IconChartLine size={30} />
          </ThemeIcon>
          <Stack gap={4} align="center">
            <Text fw={600}>Ready to optimize</Text>
            <Text size="sm" c="dimmed" ta="center" maw={300}>
              Fill in your details, then click{" "}
              <Text span fw={600}>
                Generate allocation paths
              </Text>{" "}
              to run the model on these inputs.
            </Text>
          </Stack>
        </Stack>
      </Center>
    );
  }

  const reco = pickRecommendation(input, result);
  const flatPct = Math.round(result.flatEquityPct);
  const incomeDegenerate = reco.glideBad;
  const flatDegenerate = reco.flatBad;
  const showWelfare = result.params.bequestWeight > 0;

  const glide = {
    kind: "glide" as const,
    title: "Optimized glide path",
    stats: {
      expectedBalance: result.expectedRetirementBalance,
      initialDraw: result.initialTargetDraw,
      fundingRatio: result.fundingRatio,
      ceIncome: result.ceIncome,
      ceDegenerate: incomeDegenerate,
      welfareCe: showWelfare ? result.welfareCe : null,
      drawdownDepletion: result.drawdownDepletion,
      fullPathShortfall: result.depletion,
      medianBequest: result.medianBequest,
    },
  };
  const constant = {
    kind: "constant" as const,
    title: `Constant ${flatPct}% equity`,
    stats: {
      expectedBalance: result.flatExpectedRetirementBalance,
      initialDraw: result.flatInitialTargetDraw,
      fundingRatio: result.flatFundingRatio,
      ceIncome: result.flatCeIncome,
      ceDegenerate: flatDegenerate,
      welfareCe: showWelfare ? result.flatWelfareCe : null,
      drawdownDepletion: result.flatDrawdownDepletion,
      fullPathShortfall: result.flatDepletion,
      medianBequest: result.flatMedianBequest,
    },
  };
  // The optimizer often settles on one weight for every step (flexible spending, tightly funded
  // plans). The glide path and the constant allocation are then the same schedule with the same
  // outcomes, so it is shown once.
  const glideIsConstant = result.equityByYear.every(
    (w) => Math.abs(w * 100 - result.flatEquityPct) < 1e-6,
  );
  const primary = reco.preferConstant ? constant : glide;
  const secondary = reco.preferConstant ? glide : constant;
  const hasHighDrawdownRisk =
    !reco.inconclusive && primary.stats.drawdownDepletion >= DRAWDOWN_RISK_HIGHLIGHT_THRESHOLD;
  const hasHighFullPathRisk =
    !reco.inconclusive && primary.stats.fullPathShortfall >= FULLPATH_RISK_HIGHLIGHT_THRESHOLD;
  const planNeedsAdjustment = hasHighDrawdownRisk || hasHighFullPathRisk;
  // At high spending flexibility the shortfall rate is ~0 by construction (the target scales with
  // the balance), so a low drawdown shortfall no longer signals genuine slack — suppress the
  // "room to adjust" nudge there and let CE income / income variability carry the tail-risk read.
  const flexibility = typeof input.flexibility === "number" ? input.flexibility : 0;
  const shortfallIsMeaningful = flexibility < 0.5;
  const hasRoomToAdjustPlan =
    !result.overFunded &&
    shortfallIsMeaningful &&
    !reco.inconclusive &&
    primary.stats.drawdownDepletion < LOW_DRAWDOWN_SHORTFALL_THRESHOLD &&
    !hasHighFullPathRisk;
  const showNeutralOptions = reco.inconclusive || planNeedsAdjustment;

  const reasonText = glideIsConstant
    ? SAME_ALLOCATION_NOTE
    : reco.preferConstant
      ? reco.glideBad
        ? "The model prefers the constant allocation because the glide path's CE income is tail-dominated."
        : result.overFunded
          ? "The model prefers the constant allocation because every allocation gives about the same income; this weight is the middle of that tie."
          : "The model prefers the constant allocation because the optimized glide path is not clearly better (within 3% on CE income and 1 point on shortfall)."
      : reco.flatBad
        ? "The model prefers the glide path because the constant allocation's CE income is tail-dominated."
        : "The model prefers the glide path because the constant allocation trails it.";

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
        <Group gap="xs" wrap="nowrap" aria-live="polite">
          <IconRefresh size={16} color="var(--pf-warn)" style={{ flexShrink: 0 }} />
          <Text size="sm" c="rust" fw={600}>
            {hasErrors
              ? "Inputs changed: fix the highlighted fields, then generate again."
              : "Inputs changed. Generate allocation paths to refresh this result."}
          </Text>
        </Group>
      )}
      {error && (
        <Text size="xs" c="red" fw={600} aria-live="polite">
          Generation failed. Try again.
        </Text>
      )}
      {/* A result for earlier inputs stays readable but is dimmed so it does not pass as current. */}
      <Stack
        gap="lg"
        style={{ opacity: stale ? STALE_OPACITY : 1 }}
        data-stale={stale || undefined}
      >
        {planNeedsAdjustment && (
          <Notice
            tone="warn"
            icon={<IconAlertTriangle size={18} />}
            title="High shortfall in this scenario"
          >
            {hasHighDrawdownRisk && (
              <>
                Drawdown shortfall is {DRAWDOWN_RISK_HIGHLIGHT_THRESHOLD * 100}% or higher. In the
                model, a later retirement, lower spending or more saving reduces it.
              </>
            )}
            {!hasHighDrawdownRisk && hasHighFullPathRisk && (
              <>
                Full-path shortfall is {FULLPATH_RISK_HIGHLIGHT_THRESHOLD * 100}% or higher, so
                pre-retirement market luck has a meaningful effect.
              </>
            )}
          </Notice>
        )}

        {result.overFunded && (
          <Notice icon={<IconInfoCircle size={18} />} title="This scenario is over-funded">
            Every allocation gives about the same income for these inputs, so the model has no best
            weight.
          </Notice>
        )}

        {reco.inconclusive && (
          <Stack gap="xs" pt="md" style={{ borderTop: "2px solid var(--pf-warn)" }}>
            <Eyebrow>Comparison inconclusive</Eyebrow>
            <Group gap="sm" wrap="nowrap" align="center">
              <IconAlertTriangle size={24} color="var(--pf-warn)" style={{ flexShrink: 0 }} />
              <Title order={3} fz={{ base: 22, sm: 26 }} style={{ letterSpacing: "-0.01em" }}>
                CE income is tail-dominated
              </Title>
            </Group>
            <Text size="sm" c="dimmed" maw="46rem">
              Near-zero income in bad-luck paths overwhelms CE income, so it cannot reliably
              distinguish these allocations. Compare their shortfall rates below.
            </Text>
          </Stack>
        )}

        {showNeutralOptions ? (
          (glideIsConstant ? [constant] : [glide, constant]).map((option) => (
            <Card key={option.kind} withBorder radius="md" padding="lg">
              <Stack gap="md">
                <Title order={3} fz={{ base: 22, sm: 26 }} style={{ letterSpacing: "-0.01em" }}>
                  {option.title}
                </Title>
                <ShapeSummary kind={option.kind} input={input} result={result} flatPct={flatPct} />
                <FundingLine stats={option.stats} />
                <OutcomeMetrics stats={option.stats} />
                {glideIsConstant && (
                  <Text size="xs" c="dimmed">
                    {SAME_ALLOCATION_NOTE}
                  </Text>
                )}
              </Stack>
            </Card>
          ))
        ) : (
          <>
            {/* Primary — the model's preferred allocation, with its own outcomes inline. */}
            <Card withBorder radius="md" padding="md">
              <Stack gap="md">
                <Stack gap="xs">
                  <Eyebrow>Model&apos;s preferred allocation</Eyebrow>
                  <Group gap="sm" wrap="nowrap" align="center">
                    <IconCheck size={28} color="var(--pf-accent)" style={{ flexShrink: 0 }} />
                    <Title
                      order={3}
                      fz={{ base: 26, sm: 34 }}
                      lh={1.1}
                      style={{ letterSpacing: "-0.02em" }}
                    >
                      {primary.title}
                    </Title>
                  </Group>
                </Stack>

                <ShapeSummary kind={primary.kind} input={input} result={result} flatPct={flatPct} />
                <FundingLine stats={primary.stats} />

                <OutcomeMetrics stats={primary.stats} />

                <Text size="sm" c="dimmed" maw="46rem">
                  {reasonText} Research output under this model&apos;s assumptions, not personal
                  advice.
                </Text>
              </Stack>
            </Card>

            {/* Secondary — the alternative, compact. */}
            {!glideIsConstant && (
              <Card withBorder radius="md" padding="md">
                <Stack gap="xs">
                  <Eyebrow>Alternative — {secondary.title}</Eyebrow>
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
            )}
          </>
        )}

        {hasRoomToAdjustPlan && (
          <Notice
            tone="accent"
            icon={<IconInfoCircle size={18} />}
            title="Low shortfall in this scenario"
          >
            Drawdown shortfall is below 5%, so these inputs have slack: an earlier retirement or
            higher spending would also pass in the model.
          </Notice>
        )}

        <GlidePathChart
          input={input}
          result={result}
          showConstant={showNeutralOptions || !flatDegenerate}
        />
      </Stack>

      {onReroll && (
        <Group
          justify="space-between"
          align="center"
          gap="md"
          py="md"
          style={{ borderBlock: "1px solid var(--pf-hairline)" }}
        >
          <Text size="sm" c="dimmed" style={{ flex: "1 1 16rem" }}>
            {seed > 0
              ? `Showing simulation sample #${seed + 1}. Compare it with the prior result to gauge stability.`
              : "Optional stability check: rerun the same plan with a different simulation sample."}
          </Text>
          <Button
            variant="default"
            size="sm"
            leftSection={<IconArrowsShuffle size={14} />}
            onClick={onReroll}
            loading={rerolling}
            disabled={updating || stale}
          >
            Test another simulation sample
          </Button>
        </Group>
      )}
    </Stack>
  );
}
