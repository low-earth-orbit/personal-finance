"use client";

import {
  Accordion,
  Button,
  Group,
  NumberInput,
  Popover,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import SectionSummary, { summaryValue } from "@/components/shared/SectionSummary";
import { formatCAD, formatCADCompact } from "@/utils/format";
import FieldHeader from "@/components/shared/FieldHeader";
import UserInputFormItem from "@/components/shared/UserInputFormItem";
import { Eyebrow } from "@/components/shared/Figures";
import { fieldRowClasses } from "@/components/shared/fieldRow";
import {
  RETURN_PRESETS,
  SUCCESS_RATE_PRESETS,
  type ReturnPreset,
} from "@/utils/retirement/presets";
import { cppAdjustment, oasAdjustment } from "@/utils/retirement/projection";
import { FIELD_CONSTRAINTS } from "@/utils/retirement/validation";
import type {
  RetirementErrors,
  RetirementInput,
  RetirementInputKey,
} from "@/utils/retirement/types";
import type { FieldValue } from "@/types";
import FormResetButton from "../shared/FormResetButton";

interface InputFormProps {
  input: RetirementInput;
  errors: RetirementErrors;
  onChange: (key: RetirementInputKey, value: FieldValue) => void;
  onReset: () => void;
}

/**
 * Note under CPP/OAS when the start age moves the amount off the age-65 figure the user entered, so
 * the automatic adjustment is visible. Nothing while the start age is 65 or a field is out of range.
 */
function startAgeNote(
  amountAt65: unknown,
  startAge: unknown,
  startAgeKey: "cppStartAge" | "oasStartAge",
  adjustment: (startAge: number) => number,
): string | undefined {
  const amount = Number(amountAt65);
  const age = Number(startAge);
  const { min, max } = FIELD_CONSTRAINTS[startAgeKey];
  if (!(amount > 0) || !Number.isInteger(age)) return undefined;
  if (age < (min ?? 0) || age > (max ?? Infinity)) return undefined;
  const factor = adjustment(age);
  if (factor === 1) return undefined;
  const change = Math.round(Math.abs(factor - 1) * 100);
  return `Adjusted for starting at ${age} (${factor > 1 ? "+" : "−"}${change}%): ${formatCAD(amount * factor)} /yr`;
}

export default function InputForm({ input, errors, onChange, onReset }: InputFormProps) {
  const bind = (key: RetirementInputKey) => (value: FieldValue) => onChange(key, value);

  const isSameRate = (value: FieldValue, presetValue: number) =>
    typeof value === "number" && Math.abs(value - presetValue) < 0.001;

  const activeReturnPreset = RETURN_PRESETS.find(
    (preset) =>
      isSameRate(input.accumReturn, preset.accumReturn) &&
      isSameRate(input.retireReturn, preset.retireReturn),
  );

  const applyReturnPreset = (preset: ReturnPreset) => {
    onChange("accumReturn", preset.accumReturn);
    onChange("retireReturn", preset.retireReturn);
  };

  const num = (key: RetirementInputKey) => {
    const c = FIELD_CONSTRAINTS[key];
    return {
      id: key,
      min: c.min,
      max: c.max,
      step: c.step,
      value: input[key] as FieldValue,
      onChange: bind(key),
      error: errors[key],
    };
  };

  /** Narrow start-age input shown at the end of a guaranteed-income row. */
  const startAge = (key: RetirementInputKey, ariaLabel: string) => {
    const c = FIELD_CONSTRAINTS[key];
    return (
      <NumberInput
        id={key}
        aria-label={ariaLabel}
        value={input[key] as FieldValue}
        onChange={bind(key)}
        min={c.min}
        max={c.max}
        step={c.step}
        error={Boolean(errors[key])}
        allowNegative={false}
        clampBehavior="none"
      />
    );
  };

  return (
    <>
      <Accordion multiple defaultValue={["you", "goals", "assumptions"]} variant="contained">
        <Accordion.Item value="you">
          <Accordion.Control>
            About you
            <SectionSummary>{`age ${summaryValue(input.currentAge)} · ${summaryValue(input.currentSavings, formatCADCompact)} saved`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Stack gap={0}>
                <UserInputFormItem {...num("currentAge")} label="Current age" suffix=" yrs" />
                <UserInputFormItem
                  {...num("currentIncome")}
                  label="Annual income"
                  labelHelperText="Gross income today. Used as the base for your savings rate and guaranteed-income percentages."
                  prefix="$"
                  thousandSeparator
                />
                <UserInputFormItem
                  {...num("currentSavings")}
                  label="Current savings"
                  labelHelperText="Total invested across RRSP, TFSA, and non-registered accounts today."
                  prefix="$"
                  thousandSeparator
                />
                <UserInputFormItem
                  {...num("contributionPct")}
                  label="Annual savings"
                  labelHelperText="How much you add to investments each year. Toggle between a dollar amount and a % of your income."
                  percentToggle={{
                    base: +input.currentIncome || 0,
                    defaultUnit: "%",
                    amountStep: 1000,
                    unitAriaLabel: "Annual savings input unit",
                  }}
                />
              </Stack>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="goals">
          <Accordion.Control>
            Retirement goals
            <SectionSummary>{`${summaryValue(input.targetIncomePct)}% of income · to age ${summaryValue(input.planningAge)} · ${summaryValue(input.targetSuccessRate)}% confidence`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
              <Stack gap={0}>
                <UserInputFormItem
                  {...num("targetIncomePct")}
                  label="Target income"
                  labelHelperText="The gross income you want in retirement — as a % of your current income (a replacement ratio of 60–70% is typical) or a dollar amount. Your guaranteed income below counts toward this."
                  percentToggle={{
                    base: +input.currentIncome || 0,
                    defaultUnit: "%",
                    amountStep: 1000,
                    unitAriaLabel: "Target retirement income input unit",
                  }}
                />
                <UserInputFormItem
                  {...num("planningAge")}
                  label="Plan until"
                  labelHelperText="The age your savings should last to (life expectancy). 95 is a common planning horizon, longer than the average ~85 to account for longevity risk."
                  suffix=" yrs"
                />
              </Stack>

              <div>
                <div className={fieldRowClasses.trailingHeader}>
                  <Eyebrow>Guaranteed income</Eyebrow>
                  <Eyebrow>Per year</Eyebrow>
                  <Eyebrow>Start age</Eyebrow>
                </div>
                <UserInputFormItem
                  {...num("cppAt65")}
                  error={errors.cppAt65 ?? errors.cppStartAge}
                  label="CPP at 65"
                  labelHelperText="Your CPP pension in today's dollars per year, as it would be if you started at 65. Your My Service Canada Account statement shows it (the 2026 maximum is about $18,000; most people get less). Enter a couple's combined amount if you're planning together. Start age: 60 to 70. Each year before 65 cuts CPP by 7.2% (−36% at 60); each year after adds 8.4% (+42% at 70), for life. If you retire before your first guaranteed income starts, your portfolio funds the full target until then (a 'bridge')."
                  prefix="$"
                  thousandSeparator
                  additionalText={startAgeNote(
                    input.cppAt65,
                    input.cppStartAge,
                    "cppStartAge",
                    cppAdjustment,
                  )}
                  trailing={startAge("cppStartAge", "CPP start age")}
                />
                <UserInputFormItem
                  {...num("oasAt65")}
                  error={errors.oasAt65 ?? errors.oasStartAge}
                  label="OAS at 65"
                  labelHelperText="Your Old Age Security in today's dollars per year, as it would be if you started at 65 — about $8,900 with 40 years in Canada after age 18, less with fewer years. It rises 10% at 75. The model ignores the OAS clawback on high incomes. Start age: 65 to 70. Each year of deferral adds 7.2% (+36% at 70), for life."
                  prefix="$"
                  thousandSeparator
                  additionalText={startAgeNote(
                    input.oasAt65,
                    input.oasStartAge,
                    "oasStartAge",
                    oasAdjustment,
                  )}
                  trailing={startAge("oasStartAge", "OAS start age")}
                />
                <UserInputFormItem
                  {...num("guaranteedIncomePct")}
                  error={errors.guaranteedIncomePct ?? errors.pensionStartAge}
                  label="Workplace pension"
                  labelHelperText="Annual defined-benefit (DB) or other guaranteed pension, as a dollar amount or a % of your current income. It begins at the pension start age."
                  percentToggle={{
                    base: +input.currentIncome || 0,
                    defaultUnit: "$",
                    dollarSuffix: "",
                    amountStep: 1000,
                    unitAriaLabel: "Workplace pension input unit",
                  }}
                  trailing={startAge("pensionStartAge", "Pension start age")}
                />
              </div>

              <Stack gap={4} className={`${fieldRowClasses.frame} ${fieldRowClasses.block}`}>
                <FieldHeader
                  label="Plan success rate"
                  description="The share of simulated markets your savings must outlast to your planning age."
                />
                <Button.Group
                  aria-label="Plan confidence target"
                  mt={6}
                  style={{ flexWrap: "wrap" }}
                >
                  {SUCCESS_RATE_PRESETS.map((rate) => (
                    <Button
                      key={rate}
                      variant={isSameRate(input.targetSuccessRate, rate) ? "filled" : "default"}
                      size="sm"
                      aria-pressed={isSameRate(input.targetSuccessRate, rate)}
                      onClick={() => onChange("targetSuccessRate", rate)}
                    >
                      {rate}%
                    </Button>
                  ))}
                </Button.Group>
                {input.targetSuccessRate < 90 && (
                  <Group gap={6} wrap="nowrap" align="flex-start">
                    <IconAlertTriangle
                      size={14}
                      color="var(--pf-warn)"
                      style={{ marginTop: 2, flexShrink: 0 }}
                    />
                    <Text size="xs" c="rust">
                      Below 90% leans optimistic — it accepts more sequence-of-returns risk. Many
                      planners use 90% or higher.
                    </Text>
                  </Group>
                )}
              </Stack>

              <Stack gap={4}>
                <UserInputFormItem
                  {...num("spendingFlexibilityPct")}
                  label="Max spending cut"
                  description="How much you'd trim spending in a weak market instead of risking running out. Optimistic by nature: it assumes you'll actually make the cut, and your confidence is measured against the reduced floor."
                  suffix="%"
                />
                {input.spendingFlexibilityPct > 20 && (
                  <Group gap={6} wrap="nowrap" align="flex-start">
                    <IconAlertTriangle
                      size={14}
                      color="var(--pf-warn)"
                      style={{ marginTop: 2, flexShrink: 0 }}
                    />
                    <Text size="xs" c="rust">
                      Cutting more than 20% is a big lifestyle reduction — the result assumes the
                      reduced floor is livable for many years if markets stay weak.
                    </Text>
                  </Group>
                )}
              </Stack>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="assumptions">
          <Accordion.Control>
            Market assumptions
            <SectionSummary>{`${activeReturnPreset?.label ?? "custom returns"} · ${summaryValue(input.inflationRate)}% inflation`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
              <Stack gap={4} className={`${fieldRowClasses.frame} ${fieldRowClasses.block}`}>
                <FieldHeader
                  label="Expected return"
                  description="Nominal compound (geometric) annual return, based on stock / bond mix — e.g. 80/20 is 80% stocks — before and after retirement. For simplicity, two distinct allocations are used, no gradual transition in-between."
                />
                <SimpleGrid
                  cols={{ base: 2, xs: 3 }}
                  spacing="xs"
                  role="group"
                  aria-label="Portfolio return presets"
                  mt="xs"
                >
                  {RETURN_PRESETS.map((preset) => (
                    <Button
                      key={preset.id}
                      variant={activeReturnPreset?.id === preset.id ? "filled" : "default"}
                      size="xs"
                      h={44}
                      aria-pressed={activeReturnPreset?.id === preset.id}
                      onClick={() => applyReturnPreset(preset)}
                    >
                      <Stack gap={0} align="center">
                        <Text span size="xs" fw={600}>
                          {preset.label}
                        </Text>
                        <Text span size="10px">
                          {preset.accumReturn === preset.retireReturn
                            ? `${preset.accumReturn}%`
                            : `${preset.accumReturn}% / ${preset.retireReturn}%`}
                        </Text>
                      </Stack>
                    </Button>
                  ))}
                  <Popover width={300} position="bottom" withArrow shadow="md">
                    <Popover.Target>
                      <Button
                        variant={activeReturnPreset ? "default" : "filled"}
                        size="xs"
                        h={44}
                        aria-pressed={!activeReturnPreset}
                      >
                        <Stack gap={0} align="center">
                          <Text span size="xs" fw={600}>
                            Custom
                          </Text>
                          <Text span size="10px">
                            {activeReturnPreset
                              ? ""
                              : `${input.accumReturn}% / ${input.retireReturn}%`}
                          </Text>
                        </Stack>
                      </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <Stack gap="sm">
                        <Text size="xs" c="dimmed">
                          Custom returns are easy to overstate. The presets use long-term capital
                          market assumptions; higher figures make any plan look feasible. Use
                          nominal (pre-inflation) compound returns.
                        </Text>
                        <UserInputFormItem
                          {...num("accumReturn")}
                          label="While working"
                          layout="stacked"
                          suffix="%"
                        />
                        <UserInputFormItem
                          {...num("retireReturn")}
                          label="In retirement"
                          layout="stacked"
                          suffix="%"
                        />
                      </Stack>
                    </Popover.Dropdown>
                  </Popover>
                </SimpleGrid>
              </Stack>
              <Stack gap={4}>
                <UserInputFormItem {...num("inflationRate")} label="Inflation" suffix="%" />
                {(input.inflationRate > 2.5 || input.inflationRate < 2) && (
                  <Group gap={6} wrap="nowrap" align="flex-start">
                    <IconAlertTriangle
                      size={14}
                      color="var(--pf-warn)"
                      style={{ marginTop: 2, flexShrink: 0 }}
                    />
                    <Text size="xs" c="rust">
                      Most planners use 2–2.5% inflation assumptions.
                      {input.inflationRate > 2.5
                        ? " Higher rates can make your plan look more conservative."
                        : " Lower rates can make your plan look more feasible."}
                    </Text>
                  </Group>
                )}
              </Stack>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <FormResetButton onReset={onReset} confirm mb={0} />
    </>
  );
}
