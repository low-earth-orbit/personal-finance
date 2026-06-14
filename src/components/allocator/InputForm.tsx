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
    const preset = PORTFOLIO_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    onChange("portfolioPresetId", id as PortfolioPresetId);
    onChange("portfolioReturn", preset.returnPct);
  };

  return (
    <>
      <FormResetButton onReset={onReset} />
      <Accordion
        multiple
        defaultValue={["you", "amount", "room", "returns", "retirement"]}
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
                  label="Current annual income"
                  prefix="$"
                  thousandSeparator
                />
              </SimpleGrid>
              <Text size="sm" fw={600}>
                Real salary path
              </Text>
              <SegmentedControl
                fullWidth
                data={SALARY_CURVE_PRESETS}
                value={input.salaryCurve}
                onChange={(value) => onChange("salaryCurve", value)}
              />
              <UserInputFormItem
                {...num("salaryGrowthPct")}
                label="Real salary growth"
                suffix="%"
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="amount">
          <Accordion.Control>Amount to invest now</Accordion.Control>
          <Accordion.Panel>
            <UserInputFormItem
              {...num("lumpSum")}
              label="Lump sum to invest now"
              description="One-time amount to split across accounts"
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
                description="From your latest CRA notice"
                prefix="$"
                thousandSeparator
              />
              <UserInputFormItem
                {...num("availableTfsaRoom")}
                label="Available TFSA room"
                description="From your latest CRA notice"
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
                }))}
                value={input.portfolioPresetId}
                onChange={setPortfolio}
              />
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <UserInputFormItem
                  {...num("portfolioReturn")}
                  label="Nominal return"
                  suffix="%"
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
                  label="Expected retirement income"
                  description="The engine derives an average tax rate and applies it as a flat valuation haircut."
                  prefix="$"
                  thousandSeparator
                />
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </>
  );
}
