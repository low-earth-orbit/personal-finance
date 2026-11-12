import { Anchor, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import ToolNotes from "@/components/shared/ToolNotes";
import type { ReactNode } from "react";

function Point({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Text size="sm" c="dimmed">
      <Text span fw={600} c="bright">
        {heading}
      </Text>{" "}
      {children}
    </Text>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return (
    <Text span fw={600}>
      {children}
    </Text>
  );
}

/**
 * Static explainer rendered below the tool.
 *
 * Quotes and apostrophes are typed as typographic characters, not HTML entities: with an entity
 * in a text run, this toolchain drops the run's leading space after an inline element
 * ("<b>constant</b> equity" rendered as "constantequity").
 */
export default function Methodology() {
  return (
    <ToolNotes title="How this research model works">
      <Stack gap="lg">
        {/* Two columns on wide screens (how it works | what it finds) keep lines readable. */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={48} verticalSpacing="lg">
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Most glide-path rules (“100 minus your age”, target-date funds) are heuristics with no
              link to your income target, risk tolerance or guaranteed income. This model derives an
              allocation from stated preferences and return assumptions instead.
            </Text>

            <Title order={3} fz="md">
              What “optimal” means here
            </Title>
            <Text size="sm" c="dimmed">
              The optimizer picks the equity weight for each 5-year step that maximizes the{" "}
              <Strong>expected utility of retirement spending</Strong>, scored with a{" "}
              <Strong>CRRA (constant relative risk aversion)</Strong> function: a dollar counts for
              more when you would otherwise fall short than when you are already comfortable. The
              result is the best <Strong>risk-adjusted outcome for the inputs entered</Strong>, not
              the highest expected return and not the least volatile.
            </Text>
            <Text size="sm" c="dimmed">
              Two preferences shape it. <Strong>γ</Strong> sets how much you dislike uncertain
              retirement spending: a higher γ gives safer, lower-equity plans once spending is
              flexible, but barely moves the allocation with constant-dollar spending, because that
              plan is driven by avoiding shortfall years. <Strong>β</Strong> sets how much later
              retirement years count compared with earlier ones.
            </Text>
            <Text size="sm" c="dimmed">
              It maximizes welfare, not success rate. Where no stock/bond mix can close a funding
              gap, the fix is in your inputs (retire later, spend less, save more), not the
              allocation. Money left at the end of the plan has no value in the model.
            </Text>

            <Title order={3} fz="md">
              How it optimizes
            </Title>
            <Text size="sm" c="dimmed">
              <Strong>Monte Carlo coordinate ascent</Strong>: hold every step’s weight fixed but
              one, try every candidate weight for that step on the same simulated market paths
              (common random numbers), keep the best, and cycle through the steps until nothing
              improves. No shape (flat, rising, falling) is assumed.
            </Text>
            <Text size="sm" c="dimmed">
              By default each year’s return is an independent draw from our PWL / FP Canada
              capital-market assumptions, in real (today’s) dollars. Those assumptions are{" "}
              <Strong>compound (geometric)</Strong> returns, so the simulation converts each one to
              the matching average annual return; otherwise volatility drag would make every mix
              compound below its stated rate. The Historical sequences option instead replays stock
              and bond sequences from the JST Macrohistory cross-country panel, rescaled to the same
              assumptions and block-bootstrapped. That keeps history’s multi-year patterns: crashes
              followed by recoveries, and inflation decades.
            </Text>

            <Title order={3} fz="md">
              Reading your result
            </Title>
            <Text size="sm" c="dimmed">
              <Strong>CE income</Strong> (certainty-equivalent income) is the steady yearly income
              that would feel as good as the uncertain plan. <Strong>Shortfall</Strong> is the share
              of simulated retirements with at least one year the portfolio cannot fund your target.
              It is reported from the expected retirement balance (drawdown) and from today
              (full-path), which adds the luck of markets before you retire.
            </Text>
            <Text size="sm" c="dimmed">
              The tool prefers the best single <Strong>constant</Strong> equity weight unless the
              optimized glide path beats it by more than 3% of CE income or 1 point of full-path
              shortfall. Smaller gaps are inside the model’s own uncertainty, and one fixed
              allocation is easier to hold through market swings. Guaranteed income starts at the
              age you set; before then (a “bridge” after an earlier retirement) the portfolio funds
              your whole target.
            </Text>
          </Stack>

          <Stack gap="md">
            <Title order={3} fz="md">
              What the model finds
            </Title>
            <Point heading="The return model sets the equity level.">
              With independent returns, constant-dollar spending derisks into a moderate “bond tent”
              near retirement. With historical sequences, where equities partly recover while long
              nominal bonds suffer bad decades, the optimum is about 100% equity. The two can
              disagree by 30 percentage points, so compare both settings of the return model.
            </Point>
            <Point heading="About 100% equity is a scenario, not the default.">
              That result leans on pre-1990 monetary regimes, surviving developed markets, and long
              nominal bonds being the only alternative. With a real, short-duration holding (such as
              a short inflation-linked bond fund) the optimum drops to roughly 50–70% equity in our
              tests.
            </Point>
            <Point heading="The shape is worth little; the level matters.">
              Out of sample, the optimized glide path beats the best constant weight by only about
              0.5% of CE income with independent returns, and by essentially nothing with historical
              sequences.
            </Point>
            <Point heading="A wrong guess about the regime costs little.">
              Any constant weight from 70% to 100% equity cost at most about 2% of CE income in
              every historical era we tested.
            </Point>
            <Point heading="How well funded you are sets the tent.">
              The more your savings exceed what the spending target needs, the less upside you can
              use and the more the optimizer protects the floor. If every allocation already
              delivers your target, the tool says the plan is over-funded: the weight shown is the
              middle of a tie.
            </Point>
            <Point heading="Flexible spending holds about 100% equity.">
              That is true under both return models. Compare spending rules at the same spending
              level, though: a 4% draw on a large balance can be double a constant-dollar target, so
              most of a flexible plan’s higher CE income is spending more, not spending flexibly.
              Check the year-1 portfolio draw shown with your result. At the same starting draw,
              flexibility is worth a few thousand dollars a year in our default case.
            </Point>
            <Point heading="Guaranteed income is your bond floor.">
              A larger guaranteed income (CPP + OAS + DB) lets the portfolio take more equity risk.
              With none, rare depleted years dominate the score, so the tool requires at least
              $10,000 a year. If it covers your whole target and spending is fixed, no allocation is
              better than another and the tool asks you to adjust the inputs. Starting it after you
              retire lowers income: retiring at 60 with CPP/OAS from 65 cost about 6% in our
              example.
            </Point>
            <Point heading="Leverage earns little.">
              For a young saver, allowing up to 150% equity raised CE income by under 1% under both
              return models, and only in the first decade of saving, before margin calls, rate
              changes or nerves. In this model, equity above about 110% is unrewarded.
            </Point>
            <Point heading="Bonds here are nominal.">
              The app’s bond asset is an ordinary (nominal) bond. Our research finds that a mostly
              real-return bond sleeve pairs with a lower equity weight, but that rests on an assumed
              real-bond series and is not an option in the app.
            </Point>
          </Stack>
        </SimpleGrid>

        <Text size="sm" c="dimmed">
          Full methodology:{" "}
          <Anchor
            href="https://github.com/low-earth-orbit/personal-finance/blob/main/docs/glide-path/methodology.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            glide-path analysis note
          </Anchor>
          . Runs in your browser; nothing is sent anywhere. This is a research model for education,
          not financial advice or a recommendation for any portfolio.
        </Text>
      </Stack>
    </ToolNotes>
  );
}
