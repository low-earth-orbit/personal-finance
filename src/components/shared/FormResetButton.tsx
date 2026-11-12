import { Button, Group } from "@mantine/core";
import { IconRotate } from "@tabler/icons-react";

export default function FormResetButton({
  onReset,
  confirm = false,
  mt = "md",
  mb = "6",
}: {
  onReset: () => void;
  /** Ask for confirmation before resetting (guards against accidental wipes). */
  confirm?: boolean;
  mt?: string | number;
  mb?: string | number;
}) {
  const handleClick = () => {
    if (confirm && !window.confirm("Reset all inputs to their default values?")) {
      return;
    }
    onReset();
  };
  return (
    <Group justify="flex-end" mt={mt} mb={mb}>
      <Button
        variant="default"
        leftSection={<IconRotate size={14} />}
        onClick={handleClick}
        size="sm"
      >
        Reset to defaults
      </Button>
    </Group>
  );
}
