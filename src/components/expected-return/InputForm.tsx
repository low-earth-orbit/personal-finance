"use client";

import { useState } from "react";
import { Accordion, Button, Group, Stack, Text } from "@mantine/core";
import FieldHeader from "@/components/shared/FieldHeader";
import FormResetButton from "@/components/shared/FormResetButton";
import SectionSummary, { summaryValue } from "@/components/shared/SectionSummary";
import UserInputFormItem from "@/components/shared/UserInputFormItem";
import { fieldRowClasses } from "@/components/shared/fieldRow";
import type { ViewWeights } from "@/utils/expected-return/engine";
import { formatRate } from "@/utils/expected-return/format";
import {
  REGION_IDS,
  REGION_LABELS,
  WEIGHT_PRESETS,
  matchWeightPreset,
  type WeightPresetId,
} from "@/utils/expected-return/presets";
import { GLOBAL_CONSTRAINTS, REGION_CONSTRAINTS } from "@/utils/expected-return/validation";
import type {
  ExpectedReturnErrors,
  ExpectedReturnInput,
  GlobalKey,
  OnGlobalChange,
  OnRegionChange,
  RegionId,
  RegionKey,
} from "@/utils/expected-return/types";
import type { FieldValue } from "@/types";

interface Props {
  input: ExpectedReturnInput;
  errors: ExpectedReturnErrors;
  onRegionChange: OnRegionChange;
  onChange: OnGlobalChange;
  onWeightsChange: (weights: ViewWeights) => void;
  /** Real return after costs each weight preset gives with the other inputs; null while invalid. */
  presetReturns: Record<WeightPresetId, number> | null;
  onReset: () => void;
}

type Section = RegionId | "views" | "weights" | "costs";

const VIEW_KEYS: GlobalKey[] = [
  "horizon",
  "halfLife",
  "realYield",
  "equityPremium",
  "historyReturn",
];

const WEIGHT_KEYS: GlobalKey[] = [
  "weightMarket",
  "weightValuation",
  "weightEarningsYield",
  "weightRiskPremium",
  "weightHistory",
];

/** Sections holding at least one error, so they can open when the form loads invalid. */
function errorSections(errors: ExpectedReturnErrors): Section[] {
  const sections = new Set<Section>();
  for (const key of Object.keys(errors)) {
    const region = REGION_IDS.find((id) => key.startsWith(`${id}.`));
    if (region || key === "regionWeights") sections.add(region ?? REGION_IDS[0]);
    else if (VIEW_KEYS.includes(key as GlobalKey)) sections.add("views");
    else if (key === "viewWeights" || WEIGHT_KEYS.includes(key as GlobalKey))
      sections.add("weights");
    else sections.add("costs");
  }
  return [...sections];
}

const REGION_HELP: Partial<Record<RegionKey, { description?: string; helper?: string }>> = {
  weight: {
    helper:
      "This region's share of your stock portfolio. VEQT holds about 30% Canada, 45% US, 18% international developed markets and 7% emerging markets; its fact sheet on Vanguard Canada's site has the current split.",
  },
  dividendYield: {
    helper:
      "Trailing 12-month dividend yield of the region's index. Index ETF pages list it: iShares XIC (Canada), XTOT (US), XEF (international developed), XEC (emerging). Those yields are after the fund's fee and, for XTOT, XEF and XEC, after foreign withholding tax paid inside the fund, so add both back: divide by about 0.85 for withholding (15% on US dividends; rates vary by country), then add the fee. The withholding drag is counted separately under costs.",
  },
  buybackYield: {
    helper:
      "Share buybacks minus new shares issued, as a percent of market value. US: S&P Dow Jones Indices reports S&P 500 buybacks quarterly; take off about 1% for new shares (mostly stock-based pay). Few free sources elsewhere: roughly 0–1% in developed markets, and negative in emerging markets, where companies issue more shares than they buy back.",
  },
  earningsGrowth: {
    description: "Total earnings, after inflation, not per share.",
    helper:
      "Use total earnings growth: buybacks already raise per-share growth and are counted in the buyback yield. Long-run real earnings growth has tracked real GDP growth or a little below it; the IMF World Economic Outlook has medium-term GDP projections by country.",
  },
  cape: {
    helper:
      "Cyclically adjusted P/E: price divided by the 10-year average of real earnings (Shiller). US: multpl.com/shiller-pe. Other regions: Research Affiliates' Asset Allocation Interactive (free sign-up). Without one, an index ETF's trailing P/E is a rough stand-in; it is usually lower than CAPE when earnings have grown.",
  },
  targetCape: {
    description: "Set equal to current CAPE to switch off reversion for this region.",
    helper:
      "The level CAPE drifts back toward. US medians: about 16.5 since 1881, 20 since 1950 and 26.5 since 1990 (Shiller data). Picking a recent-era median assumes part of the rise in valuations is permanent. The CAPE half-life sets how fast it gets there.",
  },
};

export default function InputForm({
  input,
  errors,
  onRegionChange,
  onChange,
  onWeightsChange,
  presetReturns,
  onReset,
}: Props) {
  const preset = matchWeightPreset(input);

  const [opened, setOpened] = useState<string[]>(() => [
    ...new Set<string>([REGION_IDS[0], "views", ...errorSections(errors)]),
  ]);

  const regionField = (id: RegionId, key: RegionKey) => {
    const { min, max, step, label } = REGION_CONSTRAINTS[key];
    return {
      id: `${id}-${key}`,
      label,
      // The same six fields repeat per region, so name the region for assistive tech.
      "aria-label": `${REGION_LABELS[id]}: ${label}`,
      min,
      max,
      step,
      allowNegative: min < 0,
      value: input.regions[id][key] as FieldValue,
      error: errors[`${id}.${key}`],
      description: REGION_HELP[key]?.description,
      labelHelperText: REGION_HELP[key]?.helper,
      onChange: (value: FieldValue) => onRegionChange(id, key, value),
    };
  };

  const field = (key: GlobalKey) => {
    const { min, max, step, label } = GLOBAL_CONSTRAINTS[key];
    return {
      id: key,
      label,
      min,
      max,
      step,
      allowNegative: min < 0,
      value: input[key] as FieldValue,
      error: errors[key],
      onChange: (value: FieldValue) => onChange(key, value),
    };
  };

  return (
    <>
      {/* Above the sections so it shows whichever region panels are open. */}
      {errors.regionWeights && (
        <Text size="xs" c="rust" fw={600} pb="xs" aria-live="polite">
          {errors.regionWeights}
        </Text>
      )}
      <Accordion multiple value={opened} onChange={setOpened} variant="contained">
        {REGION_IDS.map((id) => {
          const region = input.regions[id];
          return (
            <Accordion.Item key={id} value={id}>
              <Accordion.Control>
                {REGION_LABELS[id]}
                <SectionSummary>
                  {`${summaryValue(region.weight)}% · CAPE ${summaryValue(region.cape)}`}
                </SectionSummary>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap={0}>
                  <UserInputFormItem {...regionField(id, "weight")} suffix="%" />
                  <UserInputFormItem {...regionField(id, "dividendYield")} suffix="%" />
                  <UserInputFormItem {...regionField(id, "buybackYield")} suffix="%" />
                  <UserInputFormItem {...regionField(id, "earningsGrowth")} suffix="%" />
                  <UserInputFormItem {...regionField(id, "cape")} />
                  <UserInputFormItem {...regionField(id, "targetCape")} />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}

        <Accordion.Item value="views">
          <Accordion.Control>
            Horizon &amp; views
            <SectionSummary>
              {`${summaryValue(input.horizon)} yrs · ${summaryValue(input.halfLife)}-yr half-life`}
            </SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
              <UserInputFormItem
                {...field("horizon")}
                suffix=" yrs"
                description="Years the expected return is averaged over."
                labelHelperText="Use your planning horizon, such as the years until the money is spent. The CAPE change is spread over the horizon, so it matters less a year over long horizons."
              />
              <UserInputFormItem
                {...field("halfLife")}
                suffix=" yrs"
                description="Years for half the gap between current and target CAPE to close."
                labelHelperText="In US data since 1881, the gap between CAPE and its average has halved every 7–13 years, depending on how it's estimated (Shiller data). Longer means slower CAPE reversion and less drag."
              />
              <UserInputFormItem
                {...field("realYield")}
                suffix="%"
                description="US 10-year TIPS yield. Not a nominal yield: inflation is added separately."
                labelHelperText="The US 10-year TIPS yield is the real counterpart of the 10-year US Treasury that Damodaran's premium is measured against. FRED publishes it daily as series DFII10 (fred.stlouisfed.org/series/DFII10). Canada stopped issuing Real Return Bonds in 2022, and they trade thinly."
              />
              <UserInputFormItem
                {...field("equityPremium")}
                suffix="%"
                description="Extra return expected from stocks over that real yield."
                labelHelperText="Damodaran publishes an implied premium for the S&P 500 at the start of each month (pages.stern.nyu.edu/~adamodar, under Implied ERP). It is backed out of today's prices and analyst earnings forecasts, so it runs high when forecasts are optimistic. For comparison, stocks have beaten bonds by about 3% a year across countries since 1900 (UBS Global Investment Returns Yearbook)."
              />
              <UserInputFormItem
                {...field("historyReturn")}
                suffix="%"
                description="Real, compound. Used by the history view."
                labelHelperText="Global stocks have returned about 5% a year after inflation since 1900 (UBS Global Investment Returns Yearbook; Jordà–Schularick–Taylor data). The US alone returned more, but picking the winner after the fact overstates what to expect."
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="weights">
          <Accordion.Control>
            View weights
            <SectionSummary>
              {`${preset ? `${preset.label} · ` : ""}${WEIGHT_KEYS.map((key) => summaryValue(input[key])).join("/")}`}
            </SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
              <Text size="sm" c="dimmed" mb="xs">
                How much each view counts; they must add to 100%. The views overlap: CAPE reversion
                builds on yield + growth, and CAPE reversion and earnings yield both come from CAPE.
                Bond + premium and history are independent sources.
              </Text>
              <Stack gap={4} className={`${fieldRowClasses.frame} ${fieldRowClasses.block}`}>
                <FieldHeader
                  label="Preset"
                  labelHelperText="Each preset fills in the five weights below. The figure on each button is the real return after costs it gives with your other inputs, so the spread shows how much the answer rests on beliefs about CAPE reversion and bond yields. Editing a weight makes the weights custom."
                  description={preset?.description ?? "Custom weights."}
                />
                <Group gap={6} mt={6} role="group" aria-label="View weight preset">
                  {WEIGHT_PRESETS.map((option) => {
                    const selected = preset?.id === option.id;
                    return (
                      <Button
                        key={option.id}
                        variant={selected ? "filled" : "default"}
                        size="sm"
                        aria-pressed={selected}
                        onClick={() => onWeightsChange(option.weights)}
                      >
                        {option.label}
                        {presetReturns && (
                          <Text span size="xs" ff="var(--pf-font-figures)" ml={6} opacity={0.75}>
                            {formatRate(presetReturns[option.id])}
                          </Text>
                        )}
                      </Button>
                    );
                  })}
                </Group>
              </Stack>
              <UserInputFormItem
                {...field("weightMarket")}
                suffix="%"
                labelHelperText="Dividend yield + net buyback yield + real earnings growth, with valuations unchanged (the building-block model)."
              />
              <UserInputFormItem
                {...field("weightValuation")}
                suffix="%"
                labelHelperText="Yield + growth plus the yearly drag (or boost) from CAPE moving toward its target."
              />
              <UserInputFormItem
                {...field("weightEarningsYield")}
                suffix="%"
                labelHelperText="1.075 ÷ CAPE. CAPE's 10-year earnings average sits about 5 years behind today's earnings, so it is scaled up by about 5 years of 1.5% real growth (1.015^5 ≈ 1.075). It needs no growth input, so it checks an optimistic one. It overstates returns where companies issue many new shares (emerging markets)."
              />
              <UserInputFormItem
                {...field("weightRiskPremium")}
                suffix="%"
                labelHelperText="Real bond yield + equity risk premium, the same for every region. The only view that moves with interest rates."
              />
              <UserInputFormItem
                {...field("weightHistory")}
                suffix="%"
                labelHelperText="The long-run real return, the same for every region."
              />
              {errors.viewWeights && (
                <Text size="xs" c="rust" fw={600} py={4} aria-live="polite">
                  {errors.viewWeights}
                </Text>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="costs">
          <Accordion.Control>
            Costs &amp; conversion
            <SectionSummary>
              {`${summaryValue(input.mer)}% MER · ${summaryValue(input.inflation)}% inflation`}
            </SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
              <UserInputFormItem
                {...field("mer")}
                suffix="%"
                labelHelperText="Management expense ratio from the fund's fact sheet or Fund Facts document."
              />
              <UserInputFormItem
                {...field("withholding")}
                suffix="%"
                description="Lost in a TFSA or RRSP; mostly recoverable in a non-registered account."
                labelHelperText="Foreign countries withhold tax on dividends paid to the Canadian funds inside VEQT. In a TFSA or RRSP that tax is lost. In a non-registered account the fund reports it on your T3 as foreign tax paid, and you can mostly recover it with the foreign tax credit. Withholding one level further down (a fund holding a US-listed ETF) is lost in every account. PWL Capital (Justin Bender) publishes estimates for common ETFs."
              />
              <UserInputFormItem
                {...field("inflation")}
                suffix="%"
                description="Canadian inflation, for the nominal figures."
                labelHelperText="The Bank of Canada targets 2%. FP Canada's Projection Assumption Guidelines use 2.1%."
              />
              <UserInputFormItem
                {...field("volatility")}
                suffix="%"
                description="Yearly, in Canadian dollars. Only used for the arithmetic figure."
                labelHelperText="Standard deviation of yearly returns. For an unhedged global stock portfolio held in Canadian dollars it has been around 12–14%, lower than in local currencies because the Canadian dollar tends to fall when stocks do."
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <FormResetButton onReset={onReset} />
    </>
  );
}
