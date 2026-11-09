import { useState } from "react";
import { ActionIcon, Anchor, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { IconDeviceFloppy, IconPlus, IconX } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import type { Preset } from "@/types";

interface PresetBarProps {
  presets: Preset[];
  /** Preset whose values match the inputs exactly (highlighted). */
  activePreset: Preset | null;
  /** Last preset the user picked or saved; still set after they edit away from it. */
  basePreset: Preset | null;
  hiddenBuiltinCount: number;
  recentlyDeleted: Preset | null;
  onSelect: (preset: Preset) => void;
  onSave: (name: string) => void;
  onUpdate: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
  onUndoDelete: () => void;
  onRestoreBuiltins: () => void;
}

export default function PresetBar({
  presets,
  activePreset,
  basePreset,
  hiddenBuiltinCount,
  recentlyDeleted,
  onSelect,
  onSave,
  onUpdate,
  onDelete,
  onUndoDelete,
  onRestoreBuiltins,
}: PresetBarProps) {
  const [saveOpen, { open: openSave, close: closeSave }] = useDisclosure(false);
  const [name, setName] = useState("");

  const edited = basePreset != null && activePreset?.id !== basePreset.id;
  const trimmed = name.trim();
  const clash = presets.find((p) => p.label.toLowerCase() === trimmed.toLowerCase()) ?? null;
  const nameError =
    clash && !clash.custom ? "A built-in scenario already uses this name." : undefined;
  const replacing = clash?.custom ? clash : null;

  const startSave = () => {
    setName(edited && basePreset?.custom ? `${basePreset.label} (copy)` : "");
    openSave();
  };

  const submitSave = () => {
    if (!trimmed || nameError) return;
    if (replacing) onUpdate(replacing);
    else onSave(trimmed);
    closeSave();
  };

  return (
    <Stack gap={6}>
      <Group gap="xs" role="group" aria-label="Scenario presets">
        {presets.map((preset) => {
          const active = activePreset?.id === preset.id;
          const isBase = edited && basePreset?.id === preset.id;
          return (
            <Group key={preset.id} gap={0} wrap="nowrap">
              <Button
                variant={active ? "filled" : isBase ? "outline" : "light"}
                size="xs"
                radius="lg"
                aria-pressed={active}
                onClick={() => onSelect(preset)}
              >
                {preset.label}
                {isBase ? " (edited)" : ""}
              </Button>
              <ActionIcon
                variant="transparent"
                color="gray"
                size="sm"
                onClick={() => onDelete(preset)}
                aria-label={preset.custom ? `Delete ${preset.label}` : `Hide ${preset.label}`}
                title={preset.custom ? "Delete preset" : "Hide scenario"}
              >
                <IconX size={12} />
              </ActionIcon>
            </Group>
          );
        })}
        <Button
          variant="subtle"
          size="xs"
          color="gray"
          leftSection={<IconPlus size={12} />}
          onClick={startSave}
        >
          Save as preset
        </Button>
      </Group>

      {edited && basePreset && (
        <Group gap="xs" aria-live="polite">
          <Text size="xs" c="dimmed">
            Edited from {basePreset.label}.
          </Text>
          {basePreset.custom && (
            <Button
              variant="light"
              size="compact-xs"
              leftSection={<IconDeviceFloppy size={12} />}
              onClick={() => onUpdate(basePreset)}
            >
              Update {basePreset.label}
            </Button>
          )}
          <Anchor component="button" type="button" size="xs" onClick={() => onSelect(basePreset)}>
            Revert
          </Anchor>
        </Group>
      )}

      {recentlyDeleted && (
        <Group gap="xs" aria-live="polite">
          <Text size="xs" c="dimmed">
            {recentlyDeleted.custom ? "Deleted" : "Hid"} {recentlyDeleted.label}.
          </Text>
          <Anchor component="button" type="button" size="xs" onClick={onUndoDelete}>
            Undo
          </Anchor>
        </Group>
      )}

      {!recentlyDeleted && hiddenBuiltinCount > 0 && (
        <Anchor
          component="button"
          type="button"
          size="xs"
          c="dimmed"
          style={{ alignSelf: "flex-start" }}
          onClick={onRestoreBuiltins}
        >
          Show {hiddenBuiltinCount} hidden {hiddenBuiltinCount === 1 ? "scenario" : "scenarios"}
        </Anchor>
      )}

      <Modal opened={saveOpen} onClose={closeSave} title="Save as preset" size="sm" centered>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Saves all current inputs in this browser.
          </Text>
          <TextInput
            label="Name"
            placeholder="e.g. My place"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitSave();
              }
            }}
            error={nameError}
            description={replacing ? `Replaces your saved preset “${replacing.label}”.` : undefined}
            data-autofocus
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" onClick={closeSave}>
              Cancel
            </Button>
            <Button onClick={submitSave} disabled={!trimmed || !!nameError}>
              {replacing ? "Replace" : "Save"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
