import { Alert, Group, Stack, Table, Text, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { Eyebrow, Figure, FigureStrip } from "@/components/shared/Figures";
import { formatRate, formatSignedRate } from "@/utils/expected-return/format";
import type { ExpectedReturnInput, ExpectedReturnResult } from "@/utils/expected-return/types";

interface Props {
  /** Result for `input`, the last valid inputs; null when there has never been a valid set. */
  result: ExpectedReturnResult | null;
  input: ExpectedReturnInput;
  /** True when the live inputs are invalid and `result` shows the last valid ones. */
  paused: boolean;
}

const formatCape = (value: number) => (Math.round(value * 10) / 10).toString();

export default function Result({ result, input, paused }: Props) {
  if (!result) {
    return (
      <Alert icon={<IconInfoCircle />} title="Complete the inputs">
        Fix the highlighted fields to see the expected return.
      </Alert>
    );
  }

  const { portfolio } = result;

  return (
    <Stack gap="lg">
      {paused && (
        <Text size="xs" c="rust" fw={600} aria-live="polite">
          Update paused: fix the highlighted fields.
        </Text>
      )}

      <Stack gap="xs" pt="md" style={{ borderTop: "1px solid var(--pf-ink)" }}>
        <Eyebrow>Expected equity return · real, compound, after costs</Eyebrow>
        <Group gap="md" align="baseline" wrap="wrap">
          <Title
            order={2}
            ff="var(--pf-font-figures)"
            fw={600}
            fz={36}
            lh={1.1}
            c="ledger"
            style={{ letterSpacing: "-0.04em" }}
          >
            {formatRate(result.realGeometric)} a year
          </Title>
          <Text fz="lg">over {input.horizon} years</Text>
        </Group>
        <Text maw="46rem">
          The five views range from {formatRate(result.range.low)} to{" "}
          {formatRate(result.range.high)} after costs. Treat that spread as the uncertainty, not the
          headline&apos;s decimal.
        </Text>
      </Stack>

      <FigureStrip>
        <Figure
          label="Nominal, compound"
          value={formatRate(result.nominalGeometric)}
          note={`With ${input.inflation}% inflation`}
        />
        <Figure
          label="Nominal, arithmetic"
          value={formatRate(result.nominalArithmetic)}
          note={`At ${input.volatility}% volatility`}
        />
        <Figure label="Costs" value={formatRate(result.costs, 2)} note="MER + withholding drag" />
      </FigureStrip>
      <Text size="sm" c="dimmed" maw="46rem">
        Tools that ask for a nominal compound (geometric) return take the{" "}
        {formatRate(result.nominalGeometric)} figure. Use the arithmetic figure only where a tool
        asks for an average annual return.
      </Text>

      <Stack gap="xs">
        <Eyebrow id="er-breakdown">By region and view · real, compound, before costs</Eyebrow>
        <Table.ScrollContainer minWidth={640}>
          <Table aria-labelledby="er-breakdown">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Region</Table.Th>
                <Table.Th ta="right">Weight</Table.Th>
                <Table.Th ta="right">Yield + growth</Table.Th>
                <Table.Th ta="right">CAPE reversion</Table.Th>
                <Table.Th ta="right">Earnings yield</Table.Th>
                <Table.Th ta="right">Bond + premium</Table.Th>
                <Table.Th ta="right">History</Table.Th>
                <Table.Th ta="right">Blend</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {result.regions.map((region) => (
                <Table.Tr key={region.id}>
                  <Table.Td>
                    {region.label}
                    <Text size="xs" c="dimmed" ff="var(--pf-font-figures)">
                      CAPE {formatCape(input.regions[region.id].cape)} →{" "}
                      {formatCape(region.endCape)} · {formatSignedRate(region.valuationDrag)}/yr
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">{formatRate(region.weight, 0)}</Table.Td>
                  <Table.Td ta="right">{formatRate(region.market)}</Table.Td>
                  <Table.Td ta="right">{formatRate(region.valuation)}</Table.Td>
                  <Table.Td ta="right">{formatRate(region.earningsYield)}</Table.Td>
                  <Table.Td ta="right">{formatRate(region.riskPremium)}</Table.Td>
                  <Table.Td ta="right">{formatRate(region.history)}</Table.Td>
                  <Table.Td ta="right">{formatRate(region.blended)}</Table.Td>
                </Table.Tr>
              ))}
              <Table.Tr fw={600}>
                <Table.Td>
                  Portfolio
                  <Text size="xs" c="dimmed" fw={400} ff="var(--pf-font-figures)">
                    CAPE drag {formatSignedRate(portfolio.valuation - portfolio.market)}/yr
                  </Text>
                </Table.Td>
                <Table.Td ta="right">100%</Table.Td>
                <Table.Td ta="right">{formatRate(portfolio.market)}</Table.Td>
                <Table.Td ta="right">{formatRate(portfolio.valuation)}</Table.Td>
                <Table.Td ta="right">{formatRate(portfolio.earningsYield)}</Table.Td>
                <Table.Td ta="right">{formatRate(portfolio.riskPremium)}</Table.Td>
                <Table.Td ta="right">{formatRate(portfolio.history)}</Table.Td>
                <Table.Td ta="right">{formatRate(portfolio.blended)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Text size="xs" c="dimmed" maw="46rem">
          Yield + growth = dividend + net buyback yield + real earnings growth, multiples unchanged.
          CAPE reversion = yield + growth + CAPE drag: CAPE closes half its gap to target every{" "}
          {input.halfLife} years, and the change is averaged over the {input.horizon}-year horizon.
          Earnings yield = 1/CAPE × 1.075. Bond + premium = {input.realYield}% real yield +{" "}
          {input.equityPremium}% premium. Blend ={" "}
          {[
            input.weightMarket,
            input.weightValuation,
            input.weightEarningsYield,
            input.weightRiskPremium,
            input.weightHistory,
          ].join("/")}{" "}
          weights.
        </Text>
      </Stack>

      <Text size="xs" c="dimmed">
        An illustration from your assumptions, not a forecast or personalized advice.
      </Text>
    </Stack>
  );
}
