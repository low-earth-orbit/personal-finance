import { Anchor, Container, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

function Point({ heading, children }: { heading: string; children: ReactNode }) {
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
          How this research model works
        </Title>

        <Text size="sm" c="dimmed">
          Most glide-path rules (e.g. &ldquo;100 minus your age&rdquo;, target-date funds) are
          heuristics — they have no explicit link to your income target, risk tolerance, or
          guaranteed income. This model derives an allocation from stated preferences and return
          assumptions instead.
        </Text>

        <Title order={3} fz="md">
          What &ldquo;optimal&rdquo; means here
        </Title>
        <Text size="sm" c="dimmed">
          The optimizer finds the equity weight at each age that maximizes the{" "}
          <Text span fw={600}>
            expected utility of retirement consumption
          </Text>
          , scored with a{" "}
          <Text span fw={600}>
            CRRA (constant relative risk aversion)
          </Text>{" "}
          function — so a dollar of spending counts for more when you&apos;d otherwise fall short
          than when you&apos;re already comfortable. Two preferences shape the curve:{" "}
          <Text span fw={600}>
            γ
          </Text>{" "}
          sets how much you dislike swings in retirement spending (higher → safer, lower-equity
          plans once spending is flexible; with constant-dollar spending it barely moves the
          allocation, because the plan is then driven by avoiding shortfall years), and{" "}
          <Text span fw={600}>
            β
          </Text>{" "}
          sets how much you front-load spending into your earlier, more active retirement years. The
          result is the best{" "}
          <Text span fw={600}>
            risk-adjusted outcome for the inputs entered
          </Text>{" "}
          — not the highest expected return, and not the least volatile.
        </Text>
        <Text size="sm" c="dimmed">
          It maximizes welfare, not success rate: where no stock/bond mix can close a funding gap,
          the fix lives in your inputs (retire later, spend less, save more), not the allocation.
          Guaranteed income starts at the age you set; before then (a &ldquo;bridge&rdquo; after an
          earlier retirement) the portfolio funds your whole target. Money left at the end of the
          plan counts only if you choose to leave money to heirs. Income shortfall — a year the
          portfolio can&apos;t fund your targeted spending — is reported two ways: drawdown-only
          (from the expected retirement balance) and full-path (which also includes pre-retirement
          market luck). See the analysis note below for how γ and β enter the objective and typical
          values for each.
        </Text>

        <Title order={3} fz="md">
          How it optimizes
        </Title>
        <Text size="sm" c="dimmed">
          The optimizer runs{" "}
          <Text span fw={600}>
            Monte Carlo coordinate ascent
          </Text>
          : it holds every 5-year step&apos;s weight fixed but one, scans all candidate equity
          weights for that step on a shared set of simulated market paths (common random numbers),
          keeps the best, then repeats for every other step — cycling until nothing improves. No
          parametric shape (flat, rising, falling) is assumed; the shape emerges from the math. By
          default, returns are independent (iid) Monte Carlo draws from our PWL / FP-Canada
          capital-market assumptions in real (today&apos;s) dollars. Those assumptions are{" "}
          <Text span fw={600}>
            compound (geometric)
          </Text>{" "}
          returns, so the simulation converts each one to the matching average annual return —
          otherwise volatility drag would make every mix, and equities most of all, compound below
          its stated rate. A sequence-aware mode (the Simulation toggle) instead replays historical
          stock and bond sequences (the JST Macrohistory cross-country panel) rescaled to the same
          assumptions and block-bootstrapped, preserving history&apos;s multi-year structure —
          crashes followed by recoveries, persistent inflation decades.
        </Text>

        <Title order={3} fz="md">
          Key findings
        </Title>
        <Point heading="The return model and the spending rule set the shape.">
          Under the default independent (iid) mode, rigid constant-$ spending derisks into a
          moderate &ldquo;bond tent&rdquo; near retirement. How deep that tent goes depends mostly
          on how well funded you are: the more your savings exceed what the spending target needs,
          the less upside you can use and the more the optimizer protects the floor. Under the
          sequence-aware mode, history&apos;s joint pattern (equities partly recover, while long
          nominal bonds suffer bad decades through inflation and interest-rate cycles) pushes the
          optimum to ~100% equity — but that result leans on pre-1990 monetary regimes, surviving
          developed markets, and long nominal bonds being the only alternative: swap in a real,
          short-duration holding (e.g. a short inflation-linked bond fund) and the optimum drops to
          roughly 50–70% equity in our tests, so we treat the ~100% figure as a scenario rather than
          the default. Flexible spending (income moves with the market) stays near 100% equity in
          both. The two modes bracket the answer, and across the historical eras we tested the
          income cost of picking the &ldquo;wrong&rdquo; regime is small (a few percent of
          certainty-equivalent income at most — see the analysis note).
        </Point>
        <Point heading="The shape is worth little; the level matters.">
          Out of sample, the full per-age glide path beats the best single flat weight by only ~0.5%
          of certainty-equivalent income under the default iid mode, and essentially nothing under
          the sequence-aware mode. Getting the equity level right matters far more than optimizing
          the curve. That is why we also report the best{" "}
          <Text span fw={600}>
            constant
          </Text>{" "}
          equity weight: since its outcome is nearly identical and a single fixed allocation is far
          easier to hold through market swings, it is often the more practical choice.
        </Point>
        <Point heading="Compare spending rules at the same spending level.">
          Flexible plans often show much higher certainty-equivalent income, but most of that gap is
          usually spending more, not spending flexibly: a 4% draw on a large balance can be double a
          constant-dollar target. Check the year-1 portfolio draw shown with your result. At the
          same starting draw, flexibility is worth a few thousand dollars a year in our default
          case.
        </Point>
        <Point heading="Guaranteed income is your bond floor.">
          A larger guaranteed income (CPP + OAS + DB) lets the portfolio take more equity risk
          because it already covers some downside. With no guaranteed income, rare depleted years
          dominate CRRA utility, so the web app requires at least $10,000 per year for a meaningful
          result. If guaranteed income covers your whole target and spending is fixed, the portfolio
          funds nothing and no allocation is better than another, so the tool asks you to adjust the
          inputs.
        </Point>

        <Title order={3} fz="md">
          Research findings
        </Title>
        <Point heading="The return model matters more than the shape.">
          The two return models can disagree on the right equity level by 30 percentage points,
          while the glide shape within either is worth about 0.5% of income. Comparing both settings
          of the Simulation toggle shows the range.
        </Point>
        <Point heading="Constant weights between the two models' answers hold up across eras.">
          Any constant weight from 70% to 100% equity cost at most about 2% of certainty-equivalent
          income in every historical era we tested, so the result depends little on which regime
          comes next.
        </Point>
        <Point heading="Leverage earns little.">
          For a young saver, allowing up to 150% equity raised certainty-equivalent income by under
          1% in both models, and only in the first decade of saving — before margin calls, rate
          changes or nerves. In this model, equity above about 110% is unrewarded.
        </Point>
        <Point heading="An over-funded plan has no best allocation.">
          If every allocation already delivers your target, the tool says so: the weight shown is
          the middle of a tie.
        </Point>
        <Point heading="What the start-age input does.">
          A guaranteed-income start age after retirement makes the portfolio carry the full target
          until the pension starts, which lowers income — retiring at 60 with CPP/OAS from 65 cost
          about 6% in our example.
        </Point>
        <Point heading="Bonds here are nominal.">
          The app&apos;s bond asset is an ordinary (nominal) bond. Our research finds that a mostly
          real-return bond sleeve pairs with a lower equity weight, but that rests on an assumed
          real-bond series and is not an option in the app — see the analysis note.
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
          . Runs in your browser — nothing is sent anywhere. This is a research model for education,
          not financial advice or a recommendation for any portfolio.
        </Text>
      </Stack>
    </Container>
  );
}
