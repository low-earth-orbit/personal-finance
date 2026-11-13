import { useState } from "react";
import { Group, Input, NumberInput, SegmentedControl, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import FieldLabel from "./FieldLabel";
import { fieldRowClassNames, fieldRowClasses } from "./fieldRow";
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
  /**
   * "row" (default): ledger row with the label left and the input right.
   * "stacked": label above the input, for narrow containers such as popovers.
   */
  layout?: "row" | "stacked";
  /**
   * A second, narrow control at the end of the row (e.g. a start age beside an amount). Row layout
   * only; give it its own `aria-label`.
   */
  trailing?: ReactNode;
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
  layout = "row",
  trailing,
  ...rest
}: UserInputFormItemProps) {
  const row = layout === "row";
  // With a trailing control the row frame becomes [field | trailing]; the field keeps its own
  // label/input grid inside the first cell.
  const withTrailing = row && trailing != null;
  // With a trailing control the note sits below the whole row, not inside the amount's cell: an
  // extra line there would make the cell taller and push the trailing input out of alignment.
  const noteEl = additionalText ? (
    <Text size="xs" c="dimmed" aria-live="polite" mt={withTrailing ? 0 : 4}>
      {additionalText}
    </Text>
  ) : null;
  const frame = (content: ReactNode) =>
    withTrailing ? (
      <div>
        <div className={`${fieldRowClasses.frame} ${fieldRowClasses.withTrailing}`}>
          <div className={fieldRowClasses.trailingMain}>{content}</div>
          <div>{trailing}</div>
        </div>
        {noteEl}
      </div>
    ) : (
      content
    );
  const frameClass = row && !withTrailing ? fieldRowClasses.frame : "";
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

    return frame(
      <div className={row ? `${frameClass} ${fieldRowClasses.custom}` : undefined}>
        <Group justify={row ? "flex-start" : "space-between"} align="center" wrap="wrap" gap="xs">
          <Input.Label htmlFor={id} className={row ? fieldRowClasses.customLabel : undefined}>
            <FieldLabel label={label} helperText={labelHelperText} />
          </Input.Label>
          <SegmentedControl
            size="xs"
            value={unit}
            onChange={setUnit}
            aria-label={unitAriaLabel}
            ff="monospace"
            styles={{
              root: { flexShrink: 0 },
              // Fixed whole-pixel segment widths keep the chip edges off sub-pixel positions.
              label: {
                width: 25,
                padding: 0,
                lineHeight: "22px",
                fontSize: 12,
                display: "flex",
                justifyContent: "center",
              },
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
      </div>,
    );
  }

  return frame(
    <Stack gap={0} className={frameClass || undefined}>
      <NumberInput
        id={id}
        classNames={row ? fieldRowClassNames : undefined}
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
      {!withTrailing && noteEl}
    </Stack>,
  );
}
