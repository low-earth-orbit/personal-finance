"use client";

import { useState } from "react";
import {
  Accordion,
  Button,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import FormResetButton from "@/components/shared/FormResetButton";
import UserInputFormItem from "@/components/shared/UserInputFormItem";
import {
  PORTFOLIO_PRESETS,
  PROVINCES,
  SALARY_CURVE_PRESETS,
} from "@/utils/allocator/presets";
import { TAX_YEAR } from "@/utils/allocator/taxConstants";
import type {
  AllocatorErrors,
  AllocatorInput,
  AllocatorInputKey,
  PortfolioPresetId,
} from "@/utils/allocator/types";
import { FIELD_CONSTRAINTS } from "@/utils/allocator/validation";
import type { FieldValue } from "@/types";

interface Props {
  input: AllocatorInput;
  errors: AllocatorErrors;
  started: boolean;
  onChange: (key: AllocatorInputKey, value: unknown) => void;
  onReset: () => void;
  onShowRecommendation: () => void;
}

const BASIC_KEYS: AllocatorInputKey[] = [
  "currentAge",
  "province",
  "currentIncome",
  "lumpSum",
  "availableRrspRoom",
  "availableTfsaRoom",
];
const PLANNING_KEYS: AllocatorInputKey[] = [
  "retirementAge",
  "salaryCurve",
  "salaryGrowthPct",
  "salaryGrowthYears",
];

function errorSections(errors: AllocatorErrors): string[] {
  const keys = Object.keys(errors) as AllocatorInputKey[];
  const sections = new Set<string>();
  if (keys.some((key) => BASIC_KEYS.includes(key))) sections.add("basics");
  if (keys.some((key) => PLANNING_KEYS.includes(key))) sections.add("planning");
  if (
    keys.some(
      (key) => !BASIC_KEYS.includes(key) && !PLANNING_KEYS.includes(key),
    )
  ) {
    sections.add("advanced");
  }
  return [...sections];
}

export default function InputForm({
  input,
  errors,
  started,
  onChange,
  onReset,
  onShowRecommendation,
}: Props) {
  const [openedSections, setOpenedSections] = useState<string[]>(() => {
    const sections = errorSections(errors);
    return sections.length > 0 ? sections : ["basics"];
  });
  const num = (key: keyof typeof FIELD_CONSTRAINTS) => {
    const constraint = FIELD_CONSTRAINTS[key]!;
    return {
      id: key,
      min: constraint.min,
      max: constraint.max,
      step: constraint.step,
      value: input[key] as FieldValue,
      error: errors[key],
      onChange: (value: FieldValue) => onChange(key, value),
    };
  };
  const setPortfolio = (id: string | null) => {
    if (!id) return;
    if (id === "custom") {
      onChange("portfolioPresetId", id);
      return;
    }
    const preset = PORTFOLIO_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    onChange("portfolioPresetId", id as PortfolioPresetId);
    onChange("portfolioReturn", preset.returnPct);
  };
  const selectedCurve = SALARY_CURVE_PRESETS.find(
    (curve) => curve.value === input.salaryCurve,
  );
  const yearsToRetirement =
    typeof input.currentAge === "number" &&
    typeof input.retirementAge === "number" &&
    Number.isFinite(input.currentAge) &&
    Number.isFinite(input.retirementAge) &&
    input.retirementAge > input.currentAge
      ? input.retirementAge - input.currentAge
      : null;
  const showRecommendation = () => {
    const sections = errorSections(errors);
    if (sections.length > 0) {
      setOpenedSections((current) => [...new Set([...current, ...sections])]);
      return;
    }
    onShowRecommendation();
  };

  return (
    <>
      <Accordion
        multiple
        value={openedSections}
        onChange={setOpenedSections}
        variant="contained"
      >
        <Accordion.Item value="basics">
          <Accordion.Control>Start with your numbers</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Review these values before generating a recommendation.
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <UserInputFormItem
                  {...num("currentAge")}
                  label="Current age"
                  suffix=" yrs"
                />
                <Select
                  label="Province"
                  description="Only BC, ON, and NB tax rules are modeled"
                  data={PROVINCES}
                  value={input.province}
                  onChange={(value) => value && onChange("province", value)}
                  error={errors.province}
                />
                <UserInputFormItem
                  {...num("currentIncome")}
                  label={`${TAX_YEAR} taxable income`}
                  description={`Full expected taxable income before deductions for the ${TAX_YEAR} tax year.`}
                  labelHelperText="Include employment, self-employment, and other recurring taxable income before subtracting any RRSP deduction. Investment distributions are modeled separately."
                  prefix="$"
                  thousandSeparator
                />
                <UserInputFormItem
                  {...num("lumpSum")}
                  label="Lump sum to invest now"
                  description="The full amount is invested this year."
                  prefix="$"
                  thousandSeparator
                />
                <UserInputFormItem
                  {...num("availableRrspRoom")}
                  label="Available RRSP room"
                  prefix="$"
                  thousandSeparator
                />
                <UserInputFormItem
                  {...num("availableTfsaRoom")}
                  label="Available TFSA room"
                  prefix="$"
                  thousandSeparator
                />
              </SimpleGrid>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="planning">
          <Accordion.Control>Planning assumptions</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <UserInputFormItem
                {...num("retirementAge")}
                label="Retirement age"
                description={
                  yearsToRetirement == null
                    ? undefined
                    : `About ${TAX_YEAR + yearsToRetirement} (${yearsToRetirement} years from now)`
                }
                suffix=" yrs"
              />
              <Select
                label="Real income curve"
                data={SALARY_CURVE_PRESETS.map(({ value, label }) => ({
                  value,
                  label,
                }))}
                value={input.salaryCurve}
                onChange={(value) => value && onChange("salaryCurve", value)}
              />
              <Text size="xs" c="dimmed">
                {selectedCurve?.description}
              </Text>
              {input.salaryCurve === "custom" && (
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <UserInputFormItem
                    {...num("salaryGrowthPct")}
                    label="Real income growth"
                    description="Annual growth above inflation while income is rising."
                    suffix="%"
                  />
                  <UserInputFormItem
                    {...num("salaryGrowthYears")}
                    label="Growth period"
                    description="Years income grows before leveling off."
                    suffix=" yrs"
                  />
                </SimpleGrid>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="advanced">
          <Accordion.Control>
            Advanced tax &amp; return assumptions
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Text size="xs" c="dimmed">
                Defaults are illustrations. Small changes can alter the
                suggested split.
              </Text>
              <Select
                label="Portfolio"
                data={PORTFOLIO_PRESETS.map((preset) => ({
                  value: preset.id,
                  label: `${preset.label} · ${preset.returnPct.toFixed(1)}%`,
                })).concat({ value: "custom", label: "Custom return" })}
                value={input.portfolioPresetId}
                onChange={setPortfolio}
              />
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {input.portfolioPresetId === "custom" && (
                  <UserInputFormItem
                    {...num("portfolioReturn")}
                    label="Nominal return"
                    description="Expected annual return before inflation."
                    suffix="%"
                  />
                )}
                <UserInputFormItem
                  {...num("inflationPct")}
                  label="Inflation"
                  suffix="%"
                />
                <UserInputFormItem
                  {...num("distributionYieldPct")}
                  label="Non-reg distribution yield"
                  suffix="%"
                />
              </SimpleGrid>
              <UserInputFormItem
                {...num("retirementWithdrawalRatePct")}
                label="Effective RRSP withdrawal tax rate"
                description="Estimated average tax applied to RRSP withdrawals at retirement. Consider pensions, CPP/OAS, other taxable income, and possible OAS clawback."
                suffix="%"
              />
              <UserInputFormItem
                {...num("capitalGainsTaxRatePct")}
                label="Capital gains tax rate at retirement"
                description="Effective tax on the full capital gain after the inclusion rate. For example, enter 15% when a 30% marginal rate applies to half the gain."
                suffix="%"
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      {!started && (
        <Button fullWidth mt="lg" onClick={showRecommendation}>
          Show recommendation
        </Button>
      )}
      {started && (
        <Text size="xs" c="dimmed" mt="sm">
          Recommendation updates automatically when inputs change.
        </Text>
      )}
      <FormResetButton onReset={onReset} confirm mt="lg" mb={0} />
    </>
  );
}
