"use client";

import {
  Accordion,
  Select,
  SegmentedControl,
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
  onChange: (key: AllocatorInputKey, value: unknown) => void;
  onReset: () => void;
}

export default function InputForm({ input, errors, onChange, onReset }: Props) {
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

  return (
    <>
      <FormResetButton onReset={onReset} />
      <Accordion
        multiple
        defaultValue={["you", "amount", "room"]}
        variant="contained"
      >
        <Accordion.Item value="you">
          <Accordion.Control>About you</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <UserInputFormItem
                  {...num("currentAge")}
                  label="Current age"
                  suffix=" yrs"
                />
                <UserInputFormItem
                  {...num("retirementAge")}
                  label="Retirement age"
                  suffix=" yrs"
                />
                <Select
                  label="Province"
                  data={PROVINCES}
                  value={input.province}
                  onChange={(value) => value && onChange("province", value)}
                  error={errors.province}
                />
                <UserInputFormItem
                  {...num("currentIncome")}
                  label="This year's taxable income (before RRSP deduction)"
                  description="Your full expected taxable income for the current tax year, before subtracting any RRSP deduction — employment, self-employment, and other recurring income, in today's dollars. The deduct-now refund is taxed at this year's rate. Investment distributions are modeled separately."
                  prefix="$"
                  thousandSeparator
                />
              </SimpleGrid>
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
              {input.salaryCurve !== "flat" && (
                <UserInputFormItem
                  {...num("salaryGrowthPct")}
                  label="Real salary growth"
                  suffix="%"
                />
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="amount">
          <Accordion.Control>Amount to invest now</Accordion.Control>
          <Accordion.Panel>
            <UserInputFormItem
              {...num("lumpSum")}
              label="Lump sum to invest now"
              description="The full amount is invested this year; only RRSP deduction claims may be delayed."
              prefix="$"
              thousandSeparator
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="room">
          <Accordion.Control>Room</Accordion.Control>
          <Accordion.Panel>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <UserInputFormItem
                {...num("availableRrspRoom")}
                label="Available RRSP room"
                description="Current nominal dollars from your latest CRA notice"
                prefix="$"
                thousandSeparator
              />
              <UserInputFormItem
                {...num("availableTfsaRoom")}
                label="Available TFSA room"
                description="Current nominal dollars from your latest CRA notice; unused room loses real value to inflation"
                prefix="$"
                thousandSeparator
              />
            </SimpleGrid>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="returns">
          <Accordion.Control>Returns</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Select
                label="Portfolio"
                data={PORTFOLIO_PRESETS.map((preset) => ({
                  value: preset.id,
                  label: `${preset.label} · ${preset.returnPct}%`,
                })).concat({ value: "custom", label: "Custom return" })}
                value={input.portfolioPresetId}
                onChange={setPortfolio}
              />
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <UserInputFormItem
                  {...num("portfolioReturn")}
                  label="Nominal return"
                  suffix="%"
                  onChange={(value) => {
                    onChange("portfolioPresetId", "custom");
                    onChange(
                      "portfolioReturn",
                      value === "" || value == null ? value : Number(value),
                    );
                  }}
                />
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
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="retirement">
          <Accordion.Control>Retirement</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <SegmentedControl
                fullWidth
                data={[
                  { value: "rate", label: "Enter effective rate" },
                  { value: "income", label: "Derive from income" },
                ]}
                value={input.retirementRateMode}
                onChange={(value) => onChange("retirementRateMode", value)}
                aria-label="Retirement tax-rate input method"
              />
              {input.retirementRateMode === "rate" ? (
                <UserInputFormItem
                  {...num("retirementWithdrawalRatePct")}
                  label="Effective RRSP withdrawal tax rate"
                  suffix="%"
                />
              ) : (
                <UserInputFormItem
                  {...num("retirementIncome")}
                  label="Expected annual taxable retirement income"
                  description="Include RRSP withdrawals, pensions, CPP/OAS, and other taxable income. The engine derives an average tax rate and applies it as a flat valuation haircut."
                  prefix="$"
                  thousandSeparator
                />
              )}
              <UserInputFormItem
                {...num("capitalGainsTaxRatePct")}
                label="Tax rate on taxable capital gains at retirement"
                description="Applied after the 50% capital-gains inclusion rate"
                suffix="%"
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </>
  );
}
