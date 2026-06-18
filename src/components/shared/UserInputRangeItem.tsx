import { Anchor, Group, NumberInput, Stack, Text } from "@mantine/core";
import { IconArrowBackUp, IconPlusMinus } from "@tabler/icons-react";
import FieldLabel from "./FieldLabel";
import type { FieldConstraint, FieldValue } from "@/types";

const fmt = (n: FieldValue) => String(Number(Number(n).toFixed(2)));

interface UserInputRangeItemProps {
  baseField: string;
  sigmaField: string;
  label: string;
  helperText?: string;
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
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <FieldLabel label={label} helperText={helperText} />
      <Anchor
        component="button"
        type="button"
        size="xs"
        c="dimmed"
        onClick={onToggleExpand}
        disabled={disabled}
        underline="never"
        aria-label={
          expanded ? `Reset uncertainty range for ${label}` : `Add uncertainty range for ${label}`
        }
        aria-expanded={expanded}
      >
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          {expanded ? (
            <>
              <IconArrowBackUp stroke={2} size={12} aria-hidden="true" /> Reset
            </>
          ) : (
            <>
              <IconPlusMinus stroke={2} size={12} aria-hidden="true" /> Range
            </>
          )}
        </span>
      </Anchor>
    </Group>
  );

  return (
    <Stack gap={4}>
      <NumberInput
        id={baseField}
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
      {expanded && (
        <>
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
          <Text size="xs" c="dimmed" aria-live="polite">
            {rangeKnown ? `range ${fmt(low)}% to ${fmt(high)}%` : "range —"}
          </Text>
        </>
      )}
    </Stack>
  );
}
