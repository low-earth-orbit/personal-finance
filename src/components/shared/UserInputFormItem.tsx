import { useState } from "react";
import { Group, Input, NumberInput, SegmentedControl, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import FieldLabel from "./FieldLabel";
import type { FieldValue } from "@/types";

interface PercentToggleOptions {
  base: number;
  defaultUnit?: "$" | "%";
  dollarSuffix?: string;
  amountStep?: number;
  unitAriaLabel: string;
}

interface UserInputFormItemProps {
  id: string;
  label: ReactNode;
  labelHelperText?: string;
  description?: ReactNode;
  additionalText?: string;
  min?: number;
  max?: number;
  step?: number;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  thousandSeparator?: boolean;
  disabled?: boolean;
  allowNegative?: boolean;
  error?: string;
  prefix?: string;
  suffix?: string;
  /** Accessible name, for fields whose visible heading sits outside the input. */
  "aria-label"?: string;
  percentToggle?: PercentToggleOptions;
}

export default function UserInputFormItem({
  id,
  label,
  labelHelperText,
  description,
  additionalText,
  min,
  max,
  step,
  value,
  onChange,
  thousandSeparator,
  disabled,
  allowNegative,
  error,
  percentToggle,
  ...rest
}: UserInputFormItemProps) {
  const [unit, setUnit] = useState<string>(percentToggle?.defaultUnit ?? "$");

  if (percentToggle) {
    const { base, dollarSuffix = " /yr", amountStep, unitAriaLabel } = percentToggle;
    const valueIsEmpty = value === "" || value == null;
    const displayValue =
      unit === "$" ? (valueIsEmpty ? "" : base > 0 ? Math.round((+value / 100) * base) : 0) : value;

    const handleChange = (next: FieldValue) => {
      if (next === "" || next == null) {
        onChange(next);
        return;
      }
      if (unit === "%") {
        onChange(next);
        return;
      }
      if (!base || base <= 0) return;
      // 4 dp avoids floating-point noise like 0.8500000000000001 while
      // preserving $1/yr precision at a $1M base.
      const pct = (+next / base) * 100;
      onChange(Math.round(pct * 10000) / 10000);
    };

    return (
      <Stack gap={0}>
        <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
          <Input.Label htmlFor={id}>
            <FieldLabel label={label} helperText={labelHelperText} />
          </Input.Label>
          <SegmentedControl
            size="xs"
            value={unit}
            onChange={setUnit}
            aria-label={unitAriaLabel}
            styles={{
              root: { height: 22, padding: 2, flexShrink: 0 },
              label: { padding: "0 6px", lineHeight: "18px" },
            }}
            data={[
              { label: "$", value: "$" },
              { label: "%", value: "%" },
            ]}
          />
        </Group>
        <NumberInput
          id={id}
          value={displayValue}
          onChange={handleChange}
          error={error}
          prefix={unit === "$" ? "$" : undefined}
          suffix={unit === "$" ? dollarSuffix : "%"}
          thousandSeparator={unit === "$" ? "," : undefined}
          min={unit === "$" ? (base > 0 ? Math.round(((min ?? 0) / 100) * base) : 0) : (min ?? 0)}
          max={
            unit === "$"
              ? max != null && base > 0
                ? Math.round((max / 100) * base)
                : undefined
              : max
          }
          step={unit === "$" ? amountStep || 100 : (step ?? 0.1)}
          allowNegative={false}
          clampBehavior="none"
        />
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <NumberInput
        id={id}
        label={<FieldLabel label={label} helperText={labelHelperText} />}
        description={description}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        allowNegative={allowNegative ?? false}
        thousandSeparator={thousandSeparator ? "," : undefined}
        error={error}
        clampBehavior="none"
        styles={{ label: { display: "block" } }}
        {...rest}
      />
      {additionalText && (
        <Text size="xs" c="dimmed" aria-live="polite">
          {additionalText}
        </Text>
      )}
    </Stack>
  );
}
