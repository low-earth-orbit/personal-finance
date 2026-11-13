import { Box, Input } from "@mantine/core";
import type { ReactNode } from "react";
import FieldLabel from "./FieldLabel";
import classes from "./FieldRow.module.css";

interface FieldHeaderProps {
  label: ReactNode;
  labelHelperText?: string;
  description?: ReactNode;
}

/**
 * Standalone label + description for controls that aren't a plain
 * `UserInputFormItem` (sliders, button groups, etc.). Renders Mantine's own
 * `Input.Label`/`Input.Description` primitives at the field-row size so the
 * typography matches `UserInputFormItem`, and supports the same helper popover.
 *
 * The two are wrapped in a single block (not a fragment) so the label and
 * description sit flush — matching `NumberInput`, where the wrapper puts no
 * margin between them — instead of inheriting the parent `Stack`'s gap.
 */
export default function FieldHeader({ label, labelHelperText, description }: FieldHeaderProps) {
  return (
    <Box>
      <Input.Label size="md" className={classes.label}>
        <FieldLabel label={label} helperText={labelHelperText} />
      </Input.Label>
      {description && (
        <Input.Description size="md" mt={2}>
          {description}
        </Input.Description>
      )}
    </Box>
  );
}
