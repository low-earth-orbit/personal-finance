"use client";

import { Accordion, Button, Group, SegmentedControl, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import SectionSummary, { summaryValue } from "@/components/shared/SectionSummary";
import FieldHeader from "@/components/shared/FieldHeader";
import UserInputFormItem from "@/components/shared/UserInputFormItem";
import FormResetButton from "@/components/shared/FormResetButton";
import { fieldRowClasses } from "@/components/shared/fieldRow";
import { HISTORICAL_VR, SUCCESS_RATE_PRESETS } from "@/utils/swr/presets";
import { FIELD_CONSTRAINTS } from "@/utils/swr/validation";
import type { DynamicsMode, SwrErrors, SwrInput, SwrInputKey } from "@/utils/swr/types";
import type { FieldValue } from "@/types";

interface InputFormProps {
  input: SwrInput;
  mode: DynamicsMode;
  errors: SwrErrors;
  onChange: (key: SwrInputKey, value: FieldValue) => void;
  onModeChange: (mode: DynamicsMode) => void;
  onReset: () => void;
}

const MODE_LABELS: Record<DynamicsMode, string> = {
  independent: "Independent",
  historical: "Historical",
  custom: "Custom",
};

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <Group gap={6} wrap="nowrap" align="flex-start">
      <IconAlertTriangle
        size={14}
        color="var(--pf-warn)"
        style={{ marginTop: 2, flexShrink: 0 }}
        aria-hidden
      />
      <Text size="xs" c="rust">
        {children}
      </Text>
    </Group>
  );
}

export default function InputForm({
  input,
  mode,
  errors,
  onChange,
  onModeChange,
  onReset,
}: InputFormProps) {
  const isSameRate = (value: FieldValue, presetValue: number) =>
    typeof value === "number" && Math.abs(value - presetValue) < 0.001;

  const num = (key: SwrInputKey) => {
    const c = FIELD_CONSTRAINTS[key];
    return {
      id: key,
      min: c.min,
      max: c.max,
      step: c.step,
      value: input[key] as FieldValue,
      onChange: (value: FieldValue) => onChange(key, value),
      error: errors[key],
    };
  };

  // Negative correlations are valid, so this field must accept a minus sign.
  const correlation = { ...num("correlation"), allowNegative: true };

  const dynamicsSummary =
    mode === "custom"
      ? `custom · VR ${summaryValue(input.stockVr)} / ${summaryValue(input.bondVr)}`
      : mode === "historical"
        ? `historical · VR ${HISTORICAL_VR.stockVr} / ${HISTORICAL_VR.bondVr}`
        : "independent years";

  return (
    <>
      <Accordion multiple defaultValue={["assumptions", "success", "dynamics"]} variant="contained">
        <Accordion.Item value="assumptions">
          <Accordion.Control>
            Capital market assumptions
            <SectionSummary>{`stocks ${summaryValue(input.stockReturn)}% · bonds ${summaryValue(input.bondReturn)}% · ${summaryValue(input.inflationRate)}% inflation`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
              <UserInputFormItem
                {...num("stockReturn")}
                label="Stock return"
                labelHelperText="Expected nominal compound (geometric) annual return of stocks, before inflation."
                suffix="%"
              />
              <UserInputFormItem
                {...num("stockVol")}
                label="Stock volatility"
                labelHelperText="Annual standard deviation of stock returns."
                suffix="%"
              />
              <UserInputFormItem
                {...num("bondReturn")}
                label="Bond return"
                labelHelperText="Expected nominal compound (geometric) annual return of bonds, before inflation."
                suffix="%"
              />
              <UserInputFormItem
                {...num("bondVol")}
                label="Bond volatility"
                labelHelperText="Annual standard deviation of bond returns."
                suffix="%"
              />
              <UserInputFormItem
                {...correlation}
                label="Stock-bond correlation"
                labelHelperText="Correlation between stock and bond returns in the same year. 0.48 is what the PWL Capital assumptions imply."
              />
              <Stack gap={4}>
                <UserInputFormItem {...num("inflationRate")} label="Inflation" suffix="%" />
                {(input.inflationRate > 2.5 || input.inflationRate < 2) && (
                  <Warning>
                    Most planners use 2–2.5% inflation assumptions.
                    {input.inflationRate > 2.5
                      ? " Higher rates can make your plan look more conservative."
                      : " Lower rates can make your plan look more feasible."}
                  </Warning>
                )}
              </Stack>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="success">
          <Accordion.Control>
            Success rate
            <SectionSummary>{`${summaryValue(input.successRate)}% of simulated markets`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={4} className={`${fieldRowClasses.frame} ${fieldRowClasses.block}`}>
              <FieldHeader
                label="Success rate"
                description="The share of simulated markets in which the withdrawal lasts the full horizon."
              />
              <Button.Group aria-label="Success rate" mt={6} style={{ flexWrap: "wrap" }}>
                {SUCCESS_RATE_PRESETS.map((rate) => (
                  <Button
                    key={rate}
                    variant={isSameRate(input.successRate, rate) ? "filled" : "default"}
                    size="sm"
                    aria-pressed={isSameRate(input.successRate, rate)}
                    onClick={() => onChange("successRate", rate)}
                  >
                    {rate}%
                  </Button>
                ))}
              </Button.Group>
              {input.successRate < 90 && (
                <Warning>
                  Below 90% leans optimistic — it accepts more sequence-of-returns risk. Many
                  planners use 90% or higher.
                </Warning>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="dynamics">
          <Accordion.Control>
            Return dynamics
            <SectionSummary>{dynamicsSummary}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Stack gap={4} className={`${fieldRowClasses.frame} ${fieldRowClasses.block}`}>
                <FieldHeader
                  label="Return dynamics"
                  description="Independent draws each year's return separately. Historical gives stocks slight mean reversion and bonds strong persistence, as in 150 years of data from 16 countries. Custom sets the 10-year variance ratio (VR) of each asset: below 1 is mean reversion, above 1 is persistence."
                />
                <SegmentedControl
                  value={mode}
                  onChange={(v) => onModeChange(v as DynamicsMode)}
                  aria-label="Return dynamics"
                  data={(Object.keys(MODE_LABELS) as DynamicsMode[]).map((value) => ({
                    value,
                    label: MODE_LABELS[value],
                  }))}
                  size="sm"
                  mt={6}
                />
              </Stack>
              {mode === "custom" && (
                <Stack gap={0}>
                  <UserInputFormItem
                    {...num("stockVr")}
                    label="Stock VR(10)"
                    description="Below 1: a bad decade tends to be followed by recovery. Historical: 0.91."
                  />
                  <UserInputFormItem
                    {...num("bondVr")}
                    label="Bond VR(10)"
                    description="Above 1: bond returns persist, so a bad decade tends to continue. Historical: 2.66."
                  />
                </Stack>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <FormResetButton onReset={onReset} mb={0} />
    </>
  );
}
