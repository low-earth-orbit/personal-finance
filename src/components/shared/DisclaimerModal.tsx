import { Button, Group, Modal, Stack, Text } from "@mantine/core";

type DisclaimerModalProps = {
  opened: boolean;
  onAccept: () => void;
};

const DisclaimerModal = ({ opened, onAccept }: DisclaimerModalProps) => {
  function handleLeave() {
    // window.close() only succeeds for script-opened tabs; otherwise fall back
    // to clearing the page so the user doesn't land on the calculator.
    window.close();
    window.location.href = "about:blank";
  }

  return (
    <Modal.Root
      opened={opened}
      onClose={onAccept}
      centered
      size="lg"
      closeOnClickOutside={false}
      closeOnEscape={false}
    >
      <Modal.Overlay />
      {/* Render the title inside the body (not a Modal.Header) so Mantine
          doesn't emit a <header> element — nested under the dialog's
          role="dialog" section, axe counts it as a second banner landmark.
          Modal.Title still registers the title id, so the dialog keeps its
          accessible name (aria-labelledby) without the header. */}
      <Modal.Content>
        <Modal.Body>
          <Stack gap="md">
            <Modal.Title fw={700} fz="lg">
              Before you start
            </Modal.Title>
            <Text size="sm">
              Hi! This is a hobby project from a personal finance and FIRE enthusiast — a small
              collection of free, Canada-focused calculators built to make these numbers easier to
              explore.
            </Text>
            <Text size="sm">
              It&apos;s not financial advice. Results are estimates based on the assumptions you
              enter, not predictions, and provided as-is. For big decisions, do your own research or
              talk to a professional.
            </Text>
            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={handleLeave}>
                I&apos;m not sure
              </Button>
              <Button onClick={onAccept}>I understand</Button>
            </Group>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};

export default DisclaimerModal;
