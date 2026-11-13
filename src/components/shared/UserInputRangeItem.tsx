import { Button, Group, NumberInput, Stack, Text } from "@mantine/core";
import { IconArrowBackUp, IconPlusMinus } from "@tabler/icons-react";
import FieldLabel from "./FieldLabel";
import { fieldRowClassNames, fieldRowClasses } from "./fieldRow";
import type { FieldConstraint, FieldValue } from "@/types";

const fmt = (n: FieldValue) => String(Number(Number(n).toFixed(2)));

interface UserInputRangeItemProps {
  baseField: string;
  sigmaField: string;
  label: string;
  helperText?: string;
  /** Short note shown under the field, e.g. what the value applies to. */
  additionalText?: string;
  baseValue: FieldValue;
  sigma: FieldValue;
  baseConstraint: FieldConstraint;
  sigmaConstraint: FieldConstraint;
  onBaseChange: (value: FieldValue) => void;
  onSigmaChange: (value: FieldValue) => void;
  baseError?: string;
  expanded: boolean;
  onToggleExpand: () => void;
  disabled?: boolean;
}

export default function UserInputRangeItem({
  baseField,
  sigmaField,
  label,
  helperText,
  additionalText,
  baseValue,
  sigma,
  baseConstraint,
  sigmaConstraint,
  onBaseChange,
  onSigmaChange,
  baseError,
  expanded,
  onToggleExpand,
  disabled,
}: UserInputRangeItemProps) {
  const sigmaNum = +sigma || 0;
  const baseNum = +baseValue || 0;
  const low = baseNum - 2 * sigmaNum;
  const high = baseNum + 2 * sigmaNum;
  const rangeKnown = baseValue !== "" && baseValue != null && sigma !== "" && sigma != null;

  const composedLabel = (
    <Group justify="flex-start" wrap="wrap" gap="xs">
      <FieldLabel label={label} helperText={helperText} />
      <Button
        variant={expanded ? "filled" : "default"}
        size="compact-xs"
        onClick={(event) => {
          // The toggle sits inside the field's <label>; don't let the click focus the input.
          event.preventDefault();
          onToggleExpand();
        }}
        disabled={disabled}
        aria-label={
          expanded ? `Reset uncertainty range for ${label}` : `Add uncertainty range for ${label}`
        }
        aria-expanded={expanded}
        leftSection={
          expanded ? (
            <IconArrowBackUp stroke={2} size={12} aria-hidden="true" />
          ) : (
            <IconPlusMinus stroke={2} size={12} aria-hidden="true" />
          )
        }
        styles={{ root: { minHeight: 24 }, section: { marginInlineEnd: 4 } }}
      >
        {expanded ? "Reset" : "Range"}
      </Button>
    </Group>
  );

  return (
    <Stack gap={0} className={fieldRowClasses.frame}>
      <NumberInput
        id={baseField}
        classNames={fieldRowClassNames}
        label={composedLabel}
        value={baseValue}
        onChange={onBaseChange}
        error={baseError}
        suffix="%"
        disabled={disabled}
        allowNegative={baseConstraint.allowNegative ?? false}
        min={baseConstraint.min}
        max={baseConstraint.max}
        step={baseConstraint.step}
        clampBehavior="none"
        styles={{ label: { display: "block" } }}
      />
      {additionalText && (
        <Text size="xs" c="dimmed" mt={4}>
          {additionalText}
        </Text>
      )}
      {expanded && (
        <div className={`${fieldRowClasses.custom} ${fieldRowClasses.subRow}`}>
          <Text size="xs" c="dimmed" aria-live="polite">
            {rangeKnown ? `range ${fmt(low)}% to ${fmt(high)}%` : "range —"}
          </Text>
          <NumberInput
            id={sigmaField}
            aria-label={`${label} uncertainty — 95% confidence spread`}
            variant="filled"
            value={2 * sigmaNum}
            onChange={(v) => {
              if (v === "" || v == null) {
                onSigmaChange(v);
              } else {
                onSigmaChange(+v / 2);
              }
            }}
            prefix="± "
            suffix="%"
            min={0}
            max={2 * (sigmaConstraint.max ?? 0)}
            step={2 * (sigmaConstraint.step ?? 0)}
            disabled={disabled}
            clampBehavior="none"
            allowNegative={false}
          />
        </div>
      )}
    </Stack>
  );
}
