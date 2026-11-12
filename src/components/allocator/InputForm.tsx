"use client";

import { useState } from "react";
import { Accordion, Button, Select, Stack, Text } from "@mantine/core";
import FormResetButton from "@/components/shared/FormResetButton";
import SectionSummary, { summaryValue } from "@/components/shared/SectionSummary";
import { formatCADCompact } from "@/utils/format";
import UserInputFormItem from "@/components/shared/UserInputFormItem";
import { fieldRowClassNames, fieldRowClasses } from "@/components/shared/fieldRow";
import { PORTFOLIO_PRESETS, PROVINCES, SALARY_CURVE_PRESETS } from "@/utils/allocator/presets";
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
  loading: boolean;
  onChange: (key: AllocatorInputKey, value: unknown) => void;
  onReset: () => void;
  onShowRecommendation: () => void;
}

type InputSection = "money" | "profile" | "investment" | "retirement-tax";

const SECTION_BY_KEY: Record<AllocatorInputKey, InputSection> = {
  lumpSum: "money",
  availableRrspRoom: "money",
  availableTfsaRoom: "money",
  currentAge: "profile",
  retirementAge: "profile",
  province: "profile",
  currentIncome: "profile",
  salaryCurve: "profile",
  salaryGrowthPct: "profile",
  salaryGrowthYears: "profile",
  portfolioPresetId: "investment",
  portfolioReturn: "investment",
  inflationPct: "investment",
  distributionYieldPct: "investment",
  retirementWithdrawalRatePct: "retirement-tax",
  capitalGainsTaxRatePct: "retirement-tax",
};

function errorSections(errors: AllocatorErrors): string[] {
  const keys = Object.keys(errors) as AllocatorInputKey[];
  return [...new Set(keys.map((key) => SECTION_BY_KEY[key]))];
}

export default function InputForm({
  input,
  errors,
  started,
  loading,
  onChange,
  onReset,
  onShowRecommendation,
}: Props) {
  const [openedSections, setOpenedSections] = useState<string[]>(() => {
    const sections = errorSections(errors);
    return sections.length > 0 ? sections : ["money", "profile", "investment", "retirement-tax"];
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
  const selectedCurve = SALARY_CURVE_PRESETS.find((curve) => curve.value === input.salaryCurve);
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
      <Accordion multiple value={openedSections} onChange={setOpenedSections} variant="contained">
        <Accordion.Item value="money">
          <Accordion.Control>
            Money to invest
            <SectionSummary>{`${summaryValue(input.lumpSum, formatCADCompact)} lump sum`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
              <Text size="sm" c="dimmed" mb="xs">
                The full lump sum is invested now. Amounts above registered account room go to
                non-registered.
              </Text>
              <UserInputFormItem
                {...num("lumpSum")}
                label="Lump sum to invest now"
                prefix="$"
                thousandSeparator
              />
              <Stack gap={0}>
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
              </Stack>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="profile">
          <Accordion.Control>
            Tax profile &amp; timeline
            <SectionSummary>{`${input.province} · age ${summaryValue(input.currentAge)} → ${summaryValue(input.retirementAge)}`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
              <Stack gap={0}>
                <UserInputFormItem {...num("currentAge")} label="Current age" suffix=" yrs" />
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
                  className={`${fieldRowClasses.frame} ${fieldRowClasses.wide}`}
                  classNames={fieldRowClassNames}
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
              </Stack>
              <Select
                className={`${fieldRowClasses.frame} ${fieldRowClasses.wide}`}
                classNames={fieldRowClassNames}
                label="Real income curve"
                data={SALARY_CURVE_PRESETS.map(({ value, label }) => ({
                  value,
                  label,
                }))}
                value={input.salaryCurve}
                onChange={(value) => value && onChange("salaryCurve", value)}
              />
              <Text size="xs" c="dimmed" py="xs">
                {selectedCurve?.description}
              </Text>
              {input.salaryCurve === "custom" && (
                <Stack gap={0}>
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
                </Stack>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="investment">
          <Accordion.Control>
            Investment assumptions
            <SectionSummary>{`${PORTFOLIO_PRESETS.find((preset) => preset.id === input.portfolioPresetId)?.label ?? "custom return"} · ${summaryValue(input.inflationPct)}% inflation`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
              <Text size="sm" c="dimmed" mb="xs">
                Defaults are illustrations. Small changes can alter the suggested split.
              </Text>
              <Select
                className={`${fieldRowClasses.frame} ${fieldRowClasses.wide}`}
                classNames={fieldRowClassNames}
                label="Portfolio"
                data={PORTFOLIO_PRESETS.map((preset) => ({
                  value: preset.id,
                  label: `${preset.label} · ${preset.returnPct.toFixed(1)}%`,
                })).concat({ value: "custom", label: "Custom return" })}
                value={input.portfolioPresetId}
                onChange={setPortfolio}
              />
              <Stack gap={0}>
                {input.portfolioPresetId === "custom" && (
                  <UserInputFormItem
                    {...num("portfolioReturn")}
                    label="Nominal return"
                    description="Expected annual return before inflation."
                    suffix="%"
                  />
                )}
                <UserInputFormItem {...num("inflationPct")} label="Inflation" suffix="%" />
                <UserInputFormItem
                  {...num("distributionYieldPct")}
                  label="Non-reg distribution yield"
                  suffix="%"
                />
              </Stack>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="retirement-tax">
          <Accordion.Control>
            Retirement tax assumptions
            <SectionSummary>{`RRSP ${summaryValue(input.retirementWithdrawalRatePct)}% · gains ${summaryValue(input.capitalGainsTaxRatePct)}%`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
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
      {started ? (
        <Text size="xs" c="dimmed" mt="sm">
          The split updates automatically when inputs change.
        </Text>
      ) : (
        <Button
          fullWidth
          size="md"
          mt="lg"
          onClick={showRecommendation}
          loading={loading}
          disabled={loading}
        >
          Show split
        </Button>
      )}
      <FormResetButton onReset={onReset} confirm mt="lg" mb={0} />
    </>
  );
}
