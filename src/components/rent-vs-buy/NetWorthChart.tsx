import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  Group,
  Paper,
  ScrollArea,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconHeart,
  IconScale,
} from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { SIMULATION_HORIZON_YEARS } from "@/utils/monteCarlo";
import { formatCAD, formatCADCompact } from "@/utils/format";
import { CHART_AXIS } from "@/utils/charts";
import { Eyebrow, Figure, FigureStrip } from "@/components/shared/Figures";
import type {
  BreakEven,
  MonteCarloResponse,
  MonteCarloYear,
  UserInput,
  UserInputKey,
} from "@/types";

const NUM_SIMULATIONS = 10000;

interface ChartPoint {
  year: number;
  renterP25: number;
  renterMedian: number;
  renterP75: number;
  renterBandBase: number;
  renterBandWidth: number;
  ownerP25: number;
  ownerMedian: number;
  ownerP75: number;
  ownerBandBase: number;
  ownerBandWidth: number;
  medianGap: number;
  renterWinPct: number;
}

const INPUT_LABELS = {
  monthlyRent: "Monthly rent ($)",
  initialHomePrice: "Home price ($)",
  downPaymentPercentage: "Down payment (%)",
  annualMortgageInterestRate: "Mortgage rate (%/yr)",
  amortization: "Amortization (years)",
  holdingPeriod: "Holding period (years)",
  rentIncreaseRate: "Rent increase rate (%/yr)",
  homePriceGrowthRate: "Home price growth (%/yr)",
  ownerCostGrowthRate: "Cost inflation (%/yr)",
  investmentReturnRate: "Compound investment return (%/yr)",
  dividendYield: "Dividend yield (%)",
  dividendTaxRate: "Dividend tax rate (%)",
  capitalGainTaxRate: "Capital gain tax rate (%)",
  taxShelteredPct: "Tax-sheltered (%)",
  propertyTaxRate: "Property tax rate (%)",
  maintPct: "Maintenance (%/yr)",
  maintAgingPct: "Building aging (%/yr)",
  condoFeesPerMonth: "Condo fees ($/month)",
  buyerClosingCostsPct: "Buyer closing costs (%)",
  sellerClosingCostsPct: "Seller closing costs (%)",
  homePriceGrowthSigma: "Home price growth sigma",
  investmentReturnSigma: "Investment return sigma",
  rentIncreaseSigma: "Rent increase sigma",
  ownerCostGrowthSigma: "Owner cost growth sigma",
  mortgageRateSigma: "Mortgage rate sigma",
  dividendYieldSigma: "Dividend yield sigma",
};

function ChartTooltip({ payload }: { payload?: { payload: ChartPoint }[] }) {
  if (!payload || payload.length === 0) return null;
  const point = payload[0].payload;
  const renter = point.renterMedian;
  const owner = point.ownerMedian;
  if (renter == null || owner == null) return null;
  const leader = renter >= owner ? "Renting leads" : "Buying leads";

  return (
    <Paper px="md" py="sm" shadow="md" style={{ border: "1px solid var(--pf-border)" }}>
      <Text fw={600} mb={4}>
        Year {point.year}
      </Text>
      <Text size="sm" c="ledger">
        Rent: {formatCAD(renter)}
        {point.renterP25 != null && (
          <Text size="xs" c="dimmed" span>
            {" "}
            ({formatCADCompact(point.renterP25)} – {formatCADCompact(point.renterP75)})
          </Text>
        )}
      </Text>
      <Text size="sm" c="ink">
        Buy: {formatCAD(owner)}
        {point.ownerP25 != null && (
          <Text size="xs" c="dimmed" span>
            {" "}
            ({formatCADCompact(point.ownerP25)} – {formatCADCompact(point.ownerP75)})
          </Text>
        )}
      </Text>
      <Text size="sm" mt={4}>
        {leader} by {formatCAD(Math.abs(renter - owner))}
      </Text>
    </Paper>
  );
}

/**
 * When buying takes the lead, read relative to the sale year. The lead can change hands more
 * than once (e.g. buying pulls ahead, then building aging lets renting back in front), so a
 * plain "first year buying leads" can contradict the headline.
 */
function breakEvenText(data: ChartPoint[], saleYear: number): string {
  const buyLeads = (d: ChartPoint) => d.renterWinPct < 0.5;
  const saleIdx = data.findIndex((d) => d.year === saleYear);
  const atSale = data[saleIdx];
  if (atSale && buyLeads(atSale)) {
    // Start of the buying-lead run that contains the sale year.
    let i = saleIdx;
    while (i > 0 && buyLeads(data[i - 1])) i--;
    return data[i].year === 1
      ? "Buying is ahead in most simulations from year 1."
      : `Buying has been ahead in most simulations since year ${data[i].year}.`;
  }
  const ledEarlier = data.slice(0, Math.max(saleIdx, 0)).some(buyLeads);
  const earlier = ledEarlier
    ? "Buying was ahead in most simulations in some earlier years, but not at the sale. "
    : "";
  const later = data.slice(saleIdx + 1).find(buyLeads);
  return later
    ? `${earlier}Holding longer, buying would pull ahead in most simulations in year ${later.year}.`
    : `${earlier}Buying doesn't pull ahead in most simulations by year ${data[data.length - 1].year}.`;
}

/** First year of buying's majority lead, read relative to the sale year (see `breakEvenText`). */
function buyingLeadYear(data: ChartPoint[], saleYear: number): number | null {
  const buyLeads = (d: ChartPoint) => d.renterWinPct < 0.5;
  const saleIdx = data.findIndex((d) => d.year === saleYear);
  const atSale = data[saleIdx];
  if (atSale && buyLeads(atSale)) {
    let i = saleIdx;
    while (i > 0 && buyLeads(data[i - 1])) i--;
    return data[i].year;
  }
  return data.slice(saleIdx + 1).find(buyLeads)?.year ?? null;
}

/** "Tie at a rent of $X/mo or a price of $Y" — the inputs that make it a 50/50 call. */
function breakEvenInputsText(be: BreakEven): string | null {
  const parts: string[] = [];
  if (be.monthlyRent != null) {
    parts.push(`a rent of ${formatCAD(be.monthlyRent)}/mo (now ${formatCAD(be.currentRent)})`);
  }
  if (be.homePrice != null) {
    parts.push(`a price of ${formatCAD(be.homePrice)} (now ${formatCAD(be.currentPrice)})`);
  }
  if (parts.length === 0) return null;
  return `It would be a 50/50 call at year ${be.year} with ${parts.join(" or ")}, other inputs unchanged.`;
}

/** Typical tie sentence, only used (hidden) to size the skeleton while the tie is computing. */
const TIE_PLACEHOLDER =
  "It would be a 50/50 call at year 25 with a rent of $4,500/mo (now $3,500) or a price of $1,000,000 (now $1,200,000), other inputs unchanged.";

export function Summary({
  data,
  holdingPeriod,
  breakEven = null,
}: {
  data: ChartPoint[];
  holdingPeriod: number;
  /** Tie-point inputs for the same request as `data`; null while they are computing. */
  breakEven?: BreakEven | null;
}) {
  const decision = data.find((d) => d.year === holdingPeriod) ?? data[data.length - 1];

  if (decision.renterWinPct == null) {
    return null;
  }

  const winPct = Math.round(decision.renterWinPct * 100);
  const renterFavored = decision.renterWinPct >= 0.5;
  const winnerPct = renterFavored ? winPct : 100 - winPct;
  const winner = renterFavored ? "Renting" : "Buying";

  const title =
    winnerPct >= 70
      ? `${winner} clearly leads`
      : winnerPct >= 60
        ? `${winner} likely leads`
        : "Too close to call";

  const sims = `${winner} comes out ahead in ${winnerPct}% of simulations at sale (year ${holdingPeriod}).`;
  // The median of the per-simulation gap has the same sign as the majority winner.
  const gap = `In the median simulation, ${winner.toLowerCase()} is ahead by ${formatCAD(Math.abs(decision.medianGap))}.`;
  const breakEvenLine = breakEvenText(data, decision.year);
  const breakEvenInput = breakEven ? breakEvenInputsText(breakEven) : null;
  const close = winnerPct < 60 ? " Small changes in your assumptions could flip the outcome." : "";
  const body = `${sims} ${gap} ${breakEvenLine}${close}`;

  const leadYear = buyingLeadYear(data, decision.year);
  const verdictColor =
    winnerPct < 60 ? "var(--pf-muted)" : renterFavored ? "var(--pf-accent)" : "var(--pf-ink)";

  return (
    <Stack gap="md" pt="md" style={{ borderTop: "1px solid var(--pf-ink)" }}>
      <Eyebrow>Result · sale at year {decision.year}</Eyebrow>
      <Group gap="sm" wrap="nowrap" align="center">
        <span data-testid="verdict-icon" style={{ display: "inline-flex", color: verdictColor }}>
          {winnerPct >= 60 ? <IconHeart size={26} /> : <IconScale size={26} />}
        </span>
        <Title order={2} fz={{ base: 26, sm: 34 }} lh={1.1} style={{ letterSpacing: "-0.02em" }}>
          {title}
        </Title>
      </Group>
      <Text lh={1.6} maw="46rem">
        {body}
      </Text>
      {breakEven === null ? (
        // The tie line arrives ~1 s after the chart. Wrap a typical-length sentence in a skeleton
        // (its text is hidden) so it wraps at this container's width and reserves the height the
        // real line will take, instead of the figures and everything below them jumping.
        <Skeleton aria-hidden data-testid="break-even-pending">
          <Text size="sm">{TIE_PLACEHOLDER}</Text>
        </Skeleton>
      ) : (
        breakEvenInput && (
          <Text size="sm" c="dimmed" maw="46rem">
            {breakEvenInput}
          </Text>
        )
      )}
      <FigureStrip>
        <Figure
          label={`${winner} wins`}
          value={`${winnerPct}%`}
          note="of simulations at sale"
          tone={winnerPct >= 60 && renterFavored ? "accent" : undefined}
        />
        <Figure
          label="Median gap"
          value={formatCAD(Math.abs(decision.medianGap))}
          note={`${winner.toLowerCase()} ahead at year ${decision.year}`}
        />
        <Figure
          label="Buying leads from"
          value={leadYear == null ? "—" : `Yr ${leadYear}`}
          note={
            leadYear == null ? `not by year ${data[data.length - 1].year}` : "in most simulations"
          }
        />
      </FigureStrip>
    </Stack>
  );
}

export default function NetWorthChart({ userInput }: { userInput: UserInput }) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [mcData, setMcData] = useState<MonteCarloYear[] | null>(null);
  const [breakEven, setBreakEven] = useState<BreakEven | null>(null);
  const [debouncedInput] = useDebouncedValue(userInput, 300);
  const [tableOpen, setTableOpen] = useState(false);

  useEffect(() => {
    workerRef.current = new Worker(new URL("../../workers/monteCarloWorker.ts", import.meta.url));
    workerRef.current.onmessage = (event: MessageEvent<MonteCarloResponse>) => {
      const data = event.data;
      if (data.requestId !== requestIdRef.current) return;
      if ("result" in data) {
        setMcData(data.result);
        setBreakEven(null); // the previous tie belongs to older inputs
      } else {
        setBreakEven(data.breakEven);
      }
    };
    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    if (!workerRef.current) return;
    requestIdRef.current += 1;
    workerRef.current.postMessage({
      userInput: debouncedInput,
      numSimulations: NUM_SIMULATIONS,
      requestId: requestIdRef.current,
    });
  }, [debouncedInput]);

  // React Compiler auto-memoizes this derivation; no useMemo needed.
  const chartData: ChartPoint[] | null = mcData
    ? mcData.map((mc) => ({
        year: mc.year,
        renterP25: mc.renterP25,
        renterMedian: mc.renterMedian,
        renterP75: mc.renterP75,
        renterBandBase: mc.renterP25,
        renterBandWidth: mc.renterP75 - mc.renterP25,
        ownerP25: mc.ownerP25,
        ownerMedian: mc.ownerMedian,
        ownerP75: mc.ownerP75,
        ownerBandBase: mc.ownerP25,
        ownerBandWidth: mc.ownerP75 - mc.ownerP25,
        medianGap: mc.medianGap,
        renterWinPct: mc.renterWinPct,
      }))
    : null;

  // Early return if chartData isn't ready yet.
  if (!chartData) return null;

  // Non-null alias so nested closures keep the narrowing.
  const points: ChartPoint[] = chartData;
  const lastPoint = points[points.length - 1];
  const saleYear = userInput.holdingPeriod;

  const allValues = chartData
    .flatMap((d) => [d.renterP25, d.renterP75, d.ownerP25, d.ownerP75])
    .filter((v): v is number => v != null && isFinite(v));

  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const yPad = (yMax - yMin) * 0.1;
  const yDomain = [
    Math.floor((yMin - yPad) / 50000) * 50000,
    Math.ceil((yMax + yPad) / 50000) * 50000,
  ];

  function downloadCSV() {
    const esc = (v: unknown) => {
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [
      ["Input", "Value"],
      ...Object.entries(INPUT_LABELS)
        .filter(([key]) => userInput[key as UserInputKey] !== undefined)
        .map(([key, label]) => [label, userInput[key as UserInputKey]]),
      [],
      [
        "Year",
        "Rent median",
        "Rent P25",
        "Rent P75",
        "Buy median",
        "Buy P25",
        "Buy P75",
        "Median gap (rent − buy)",
        "Renter win %",
      ],
      ...points.map((d) => [
        d.year,
        Math.round(d.renterMedian ?? 0),
        Math.round(d.renterP25 ?? 0),
        Math.round(d.renterP75 ?? 0),
        Math.round(d.ownerMedian ?? 0),
        Math.round(d.ownerP25 ?? 0),
        Math.round(d.ownerP75 ?? 0),
        Math.round(d.medianGap ?? 0),
        d.renterWinPct != null ? `${Math.round(d.renterWinPct * 100)}%` : "",
      ]),
    ];
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rent-vs-buy.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Stack gap="xs">
      <Summary data={chartData} holdingPeriod={userInput.holdingPeriod} breakEven={breakEven} />
      <Text fw={600} fz="lg" mt="lg">
        Net worth — median and 25–75% range
      </Text>
      <div
        role="img"
        aria-label={`Net worth projection chart comparing renting versus buying over ${SIMULATION_HORIZON_YEARS} years using ${NUM_SIMULATIONS.toLocaleString()} Monte Carlo simulations. The data table below provides the same information in accessible text form.`}
      >
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData} margin={{ top: 25, right: 50, left: 0, bottom: 20 }}>
            <XAxis
              dataKey="year"
              label={{
                value: "Year",
                position: "bottom",
                fontSize: 12,
              }}
              {...CHART_AXIS}
            />
            <YAxis domain={yDomain} tickFormatter={formatCADCompact} {...CHART_AXIS} width={70} />
            <Tooltip content={<ChartTooltip />} />

            <Area
              type="linear"
              dataKey="renterBandBase"
              stackId="renter"
              fill="transparent"
              stroke="none"
              legendType="none"
              name=""
              isAnimationActive
              animationDuration={300}
              animationEasing="ease-out"
            />
            <Area
              type="linear"
              dataKey="renterBandWidth"
              stackId="renter"
              fill="var(--pf-accent)"
              fillOpacity={0.18}
              stroke="none"
              legendType="none"
              name=""
              isAnimationActive
              animationDuration={300}
              animationEasing="ease-out"
            />
            <Area
              type="linear"
              dataKey="ownerBandBase"
              stackId="owner"
              fill="transparent"
              stroke="none"
              legendType="none"
              name=""
              isAnimationActive
              animationDuration={300}
              animationEasing="ease-out"
            />
            <Area
              type="linear"
              dataKey="ownerBandWidth"
              stackId="owner"
              fill="var(--pf-ink)"
              fillOpacity={0.18}
              stroke="none"
              legendType="none"
              name=""
              isAnimationActive
              animationDuration={300}
              animationEasing="ease-out"
            />

            <Line
              type="linear"
              dataKey="renterMedian"
              name="Rent"
              stroke="var(--pf-accent)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive
              animationDuration={300}
              animationEasing="ease-out"
            />
            <Line
              type="linear"
              dataKey="ownerMedian"
              name="Buy"
              stroke="var(--pf-ink)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive
              animationDuration={300}
              animationEasing="ease-out"
            />
            <ReferenceDot
              x={lastPoint.year}
              y={lastPoint.renterMedian}
              r={0}
              ifOverflow="visible"
              label={{
                value: "Rent",
                position: "right",
                fill: "var(--pf-accent)",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            <ReferenceDot
              x={lastPoint.year}
              y={lastPoint.ownerMedian}
              r={0}
              ifOverflow="visible"
              label={{
                value: "Buy",
                position: "right",
                fill: "var(--pf-ink)",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            <ReferenceLine
              x={saleYear}
              stroke="var(--pf-warn)"
              strokeWidth={1.5}
              label={{
                value: `Sale (Yr ${saleYear})`,
                position: "top",
                fontSize: 11,
                fill: "var(--pf-warn)",
                fontWeight: 600,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Group gap="lg" wrap="wrap">
        <Group gap={6} wrap="nowrap">
          <Box w={18} h={2} style={{ backgroundColor: "var(--pf-accent)" }} aria-hidden="true" />
          <Text size="xs" c="dimmed">
            <Text span fw={600} c="ledger">
              Rent
            </Text>{" "}
            — median
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Box w={18} h={0} style={{ borderTop: "2px dashed var(--pf-ink)" }} aria-hidden="true" />
          <Text size="xs" c="dimmed">
            <Text span fw={600} c="ink">
              Buy
            </Text>{" "}
            — median
          </Text>
        </Group>

        <Group gap={6} wrap="nowrap">
          <Box
            w={18}
            h={10}
            style={{ backgroundColor: "var(--pf-accent)", opacity: 0.18 }}
            aria-hidden="true"
          />
          <Text size="xs" c="dimmed">
            Rent 25–75% range
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Box
            w={18}
            h={10}
            style={{ backgroundColor: "var(--pf-ink)", opacity: 0.18 }}
            aria-hidden="true"
          />
          <Text size="xs" c="dimmed">
            Buy 25–75% range
          </Text>
        </Group>

        <Group gap={6} wrap="nowrap">
          <Box w={18} h={2} style={{ backgroundColor: "var(--pf-warn)" }} aria-hidden="true" />
          <Text size="xs" c="dimmed">
            <Text span fw={600} c="rust">
              Sale
            </Text>{" "}
            — year you sell
          </Text>
        </Group>
      </Group>

      <Text size="xs" c="dimmed">
        The chart shows net worth projections for both renting and buying scenarios from{" "}
        {NUM_SIMULATIONS.toLocaleString()} Monte Carlo simulations. It extends to a{" "}
        {SIMULATION_HORIZON_YEARS}-year horizon to show what would happen if you held longer. These
        projections are based on your assumptions and are illustrative only — results are subject to
        modelling error, uncertain inputs, and real-world complexity.
      </Text>

      <Group justify="space-between" align="center" mt="xs">
        <Button
          variant="default"
          size="sm"
          aria-expanded={tableOpen}
          aria-controls="net-worth-data-table"
          leftSection={
            tableOpen ? (
              <IconChevronUp size={14} aria-hidden="true" />
            ) : (
              <IconChevronDown size={14} aria-hidden="true" />
            )
          }
          onClick={() => setTableOpen((o) => !o)}
        >
          {tableOpen ? "Hide" : "Show"} data table
        </Button>
        <Button
          size="sm"
          leftSection={<IconDownload size={14} aria-hidden="true" />}
          onClick={downloadCSV}
        >
          Download CSV
        </Button>
      </Group>

      <Collapse expanded={tableOpen}>
        <div id="net-worth-data-table">
          <ScrollArea>
            <Table fz="xs" style={{ minWidth: 620 }}>
              <caption
                style={{
                  captionSide: "top",
                  textAlign: "left",
                  fontSize: "0.75rem",
                  color: "var(--mantine-color-dimmed)",
                  paddingBottom: 4,
                }}
              >
                Year-by-year net worth comparison: Renting vs buying (
                {NUM_SIMULATIONS.toLocaleString()} Monte Carlo simulations)
              </caption>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th scope="col">Year</Table.Th>
                  <Table.Th scope="col" ta="right" c="ledger">
                    Rent median
                  </Table.Th>
                  <Table.Th scope="col" ta="right" c="ledger">
                    <abbr title="25th percentile">Rent P25</abbr>
                  </Table.Th>
                  <Table.Th scope="col" ta="right" c="ledger">
                    <abbr title="75th percentile">Rent P75</abbr>
                  </Table.Th>
                  <Table.Th scope="col" ta="right" c="ink">
                    Buy median
                  </Table.Th>
                  <Table.Th scope="col" ta="right" c="ink">
                    <abbr title="25th percentile">Buy P25</abbr>
                  </Table.Th>
                  <Table.Th scope="col" ta="right" c="ink">
                    <abbr title="75th percentile">Buy P75</abbr>
                  </Table.Th>
                  <Table.Th scope="col" ta="right">
                    Renter win %<VisuallyHidden> (% of simulations)</VisuallyHidden>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {chartData.map((d) => (
                  <Table.Tr
                    key={d.year}
                    style={
                      d.year === userInput.holdingPeriod
                        ? { fontWeight: 600, backgroundColor: "var(--pf-surface)" }
                        : undefined
                    }
                  >
                    <Table.Td>
                      {d.year}
                      {d.year === userInput.holdingPeriod && (
                        <>
                          {" "}
                          <span aria-hidden="true">★</span>
                          <VisuallyHidden> (sale year)</VisuallyHidden>
                        </>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">{formatCADCompact(d.renterMedian)}</Table.Td>
                    <Table.Td ta="right" c="dimmed">
                      {formatCADCompact(d.renterP25)}
                    </Table.Td>
                    <Table.Td ta="right" c="dimmed">
                      {formatCADCompact(d.renterP75)}
                    </Table.Td>
                    <Table.Td ta="right">{formatCADCompact(d.ownerMedian)}</Table.Td>
                    <Table.Td ta="right" c="dimmed">
                      {formatCADCompact(d.ownerP25)}
                    </Table.Td>
                    <Table.Td ta="right" c="dimmed">
                      {formatCADCompact(d.ownerP75)}
                    </Table.Td>
                    <Table.Td ta="right">
                      {d.renterWinPct != null ? `${Math.round(d.renterWinPct * 100)}%` : "—"}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
          <Text size="xs" c="dimmed" mt={4}>
            <span aria-hidden="true">★</span> Sale year (holding period)
          </Text>
        </div>
      </Collapse>
    </Stack>
  );
}
