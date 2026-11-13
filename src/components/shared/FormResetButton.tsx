import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconRotate } from "@tabler/icons-react";

/** "Reset to defaults", confirmed in a dialog first so one stray click can't wipe the inputs. */
export default function FormResetButton({
  onReset,
  mt = "md",
  mb = "6",
}: {
  onReset: () => void;
  mt?: string | number;
  mb?: string | number;
}) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Modal opened={opened} onClose={close} title="Reset to defaults?" size="sm" centered>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            This replaces all your inputs with the default values. It can&apos;t be undone.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button
              color="rust"
              onClick={() => {
                onReset();
                close();
              }}
            >
              Reset to defaults
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Group justify="flex-end" mt={mt} mb={mb}>
        <Button variant="default" leftSection={<IconRotate size={14} />} onClick={open} size="sm">
          Reset to defaults
        </Button>
      </Group>
    </>
  );
}
