import { Anchor, Container, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

function Point({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <Text size="sm" c="dimmed">
      <Text span fw={600}>
        {heading}
      </Text>{" "}
      {children}
    </Text>
  );
}

/** Static explainer rendered below the tool. */
export default function Methodology() {
  return (
    <Container size="xl" py="xl">
      <Stack gap="md">
        <Title order={2} fz="xl">
          How this works — and why it&apos;s &ldquo;optimal&rdquo;
        </Title>

        <Text size="sm" c="dimmed">
          Most glide-path rules (e.g. &ldquo;100 minus your age&rdquo;,
          target-date funds) are heuristics — they have no explicit link to your
          income target, risk tolerance, or guaranteed income. This tool derives
          an allocation from first principles instead.
        </Text>

        <Title order={3} fz="md">
          What &ldquo;optimal&rdquo; means here
        </Title>
        <Text size="sm" c="dimmed">
          The optimizer finds the equity weight at each age that maximizes your{" "}
          <Text span fw={600}>
            expected utility of retirement consumption
          </Text>
          , scored with a{" "}
          <Text span fw={600}>
            CRRA (constant relative risk aversion)
          </Text>{" "}
          function — so a dollar of spending counts for more when you&apos;d
          otherwise fall short than when you&apos;re already comfortable. Two
          preferences shape the curve:{" "}
          <Text span fw={600}>
            γ
          </Text>{" "}
          sets how much you dislike swings in retirement spending (higher →
          safer, lower-equity plans), and{" "}
          <Text span fw={600}>
            β
          </Text>{" "}
          sets how much you front-load spending into your earlier, more active
          retirement years. The result is the best{" "}
          <Text span fw={600}>
            risk-adjusted outcome for your situation
          </Text>{" "}
          — not the highest expected return, and not the least volatile.
        </Text>
        <Text size="sm" c="dimmed">
          It maximizes welfare, not success rate: where no stock/bond mix can
          close a funding gap, the fix lives in your inputs (retire later, spend
          less, save more), not the allocation. Guaranteed income is assumed to
          start at retirement and be paid every year — a pre-pension
          &ldquo;bridge&rdquo; is out of scope (use the retirement tool for that
          funding question). Income shortfall — a year the portfolio can&apos;t
          fund your targeted spending — is reported two ways: drawdown-only
          (from the expected retirement balance) and full-path (which also
          includes pre-retirement market luck). See the analysis note below for
          how γ and β enter the objective and typical values for each.
        </Text>

        <Title order={3} fz="md">
          How it optimizes
        </Title>
        <Text size="sm" c="dimmed">
          The optimizer runs{" "}
          <Text span fw={600}>
            Monte Carlo coordinate ascent
          </Text>
          : it holds every 5-year step&apos;s weight fixed but one, scans all
          candidate equity weights for that step on a shared set of simulated
          market paths (common random numbers), keeps the best, then repeats for
          every other step — cycling until nothing improves. No parametric shape
          (flat, rising, falling) is assumed; the shape emerges from the math.
          By default, returns are independent (iid) Monte Carlo draws from our
          PWL / FP-Canada capital-market assumptions in real (today&apos;s)
          dollars — the model whose recommendation holds up across historical
          regimes. A sequence-aware mode (the Simulation toggle) instead replays
          historical stock and bond sequences (the JST Macrohistory
          cross-country panel) rescaled to the same assumptions and
          block-bootstrapped, preserving history&apos;s multi-year structure —
          crashes followed by recoveries, persistent inflation decades.
        </Text>

        <Title order={3} fz="md">
          Key findings
        </Title>
        <Point heading="The return model and the spending rule set the shape.">
          Under the default independent (iid) mode, rigid constant-$ spending
          derisks into a moderate &ldquo;bond tent&rdquo; near retirement — an
          interior answer that is never the worst case in any historical era or
          country cut we tested (it always sits inside the range the
          sequence-aware mode sweeps across regimes). Under the sequence-aware
          mode, history&apos;s joint pattern (equities recover, while long
          nominal bonds quietly fail in inflation decades) pushes the optimum to
          ~100% equity — but that result leans on pre-1990 monetary regimes,
          surviving developed markets, and long nominal bonds being the only
          alternative: swap in a real, short-duration holding (e.g. an
          inflation-linked bond fund) and the optimum drops well below 100%, so
          we treat the ~100% figure as a scenario rather than the default.
          Flexible spending (income moves with the market) stays near 100%
          equity in both — the two modes bracket the answer (see the analysis
          note&apos;s caveats).
        </Point>
        <Point heading="The shape is worth little; the level matters.">
          Out of sample, the full per-age glide path beats the best single flat
          weight by only ~0.5% of certainty-equivalent income under the default
          iid mode, and essentially nothing under the sequence-aware mode.
          Getting the equity level right matters far more than optimizing the
          curve. That is why we also report the best{" "}
          <Text span fw={600}>
            constant
          </Text>{" "}
          equity weight: since its outcome is nearly identical and a single
          fixed allocation is far easier to hold through market swings, it is
          often the more practical choice.
        </Point>
        <Point heading="Guaranteed income is your bond floor.">
          A larger guaranteed income (CPP + OAS + DB) lets the portfolio take
          more equity risk because it already covers some downside. With no
          guaranteed income, rare depleted years dominate CRRA utility, so the
          web app requires at least $10,000 per year for a meaningful
          recommendation.
        </Point>

        <Text size="sm" c="dimmed">
          Full methodology:{" "}
          <Anchor
            href="https://github.com/low-earth-orbit/personal-finance/blob/main/docs/glide-path/methodology.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            glide-path analysis note
          </Anchor>
          . Runs in your browser — nothing is sent anywhere. This is an
          illustration, not financial advice.
        </Text>
      </Stack>
    </Container>
  );
}
