import { useState, type ReactNode } from "react";
import { Popover, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

interface FieldLabelProps {
  label: ReactNode;
  helperText?: string;
}

/** A no-break space: no line break may fall between it and its neighbours. */
const GLUE = " ";

export default function FieldLabel({ label, helperText }: FieldLabelProps) {
  const [opened, setOpened] = useState(false);

  if (!helperText) return label;

  // The icon follows the text inline, glued to the last word, so a label that wraps keeps its icon
  // beside the words instead of pushed to the far edge of the label column. A no-break space alone
  // doesn't stop Chrome breaking before an inline button, hence the nowrap wrapper.
  return (
    <span>
      {label}
      <span style={{ whiteSpace: "nowrap" }}>
        {GLUE}
        <Popover
          opened={opened}
          onChange={setOpened}
          width={260}
          withArrow
          shadow="md"
          position="top-start"
        >
          <Popover.Target>
            <button
              type="button"
              // Mantine's focus ring (ink), not the browser's blue one.
              className="mantine-focus-auto"
              style={{
                display: "inline-flex",
                verticalAlign: "middle",
                cursor: "pointer",
                background: "none",
                border: "none",
                // A 25px hit area around the 13px icon; the negative margin keeps the layout unchanged.
                padding: 6,
                margin: -6,
                borderRadius: 4,
                outlineOffset: 0,
                color: "inherit",
              }}
              aria-label={`More information about ${label}`}
              aria-haspopup="dialog"
              aria-expanded={opened}
              onClick={(e) => {
                e.preventDefault();
                setOpened((o) => !o);
              }}
            >
              <IconInfoCircle size={13} />
            </button>
          </Popover.Target>
          <Popover.Dropdown>
            <Text size="sm">{helperText}</Text>
          </Popover.Dropdown>
        </Popover>
      </span>
    </span>
  );
}
