import { useState, type ReactNode } from "react";
import { Group, Popover, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

interface FieldLabelProps {
  label: ReactNode;
  helperText?: string;
}

export default function FieldLabel({ label, helperText }: FieldLabelProps) {
  const [opened, setOpened] = useState(false);

  if (!helperText) return label;

  return (
    <Group gap={4} wrap="nowrap" display="inline-flex" style={{ alignItems: "center" }}>
      <span>{label}</span>
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
            style={{
              display: "inline-flex",
              cursor: "pointer",
              background: "none",
              border: "none",
              padding: 0,
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
    </Group>
  );
}
