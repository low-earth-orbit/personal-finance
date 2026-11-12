import { useState } from "react";
import { Anchor, Box, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { IconDeviceFloppy, IconPlus, IconSettings } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import ManagePresetsModal, { type ImportSummary } from "./ManagePresetsModal";
import type { PresetFileEntry } from "@/utils/presetFile";
import { Eyebrow } from "@/components/shared/Figures";
import type { Preset } from "@/types";

interface PresetBarProps {
  /** Visible presets, built-ins first. */
  presets: Preset[];
  hiddenBuiltins: Preset[];
  /** Preset whose values match the inputs exactly (highlighted). */
  activePreset: Preset | null;
  /** Last preset the user picked or saved; still set after they edit away from it. */
  basePreset: Preset | null;
  recentlyDeleted: Preset | null;
  onSelect: (preset: Preset) => void;
  onSave: (name: string) => void;
  onUpdate: (preset: Preset) => void;
  onRename: (preset: Preset, name: string) => void;
  onDelete: (preset: Preset) => void;
  onUndoDelete: () => void;
  onShowBuiltin: (preset: Preset) => void;
  onImport: (entries: PresetFileEntry[]) => ImportSummary;
}

export default function PresetBar({
  presets,
  hiddenBuiltins,
  activePreset,
  basePreset,
  recentlyDeleted,
  onSelect,
  onSave,
  onUpdate,
  onRename,
  onDelete,
  onUndoDelete,
  onShowBuiltin,
  onImport,
}: PresetBarProps) {
  const [saveOpen, { open: openSave, close: closeSave }] = useDisclosure(false);
  const [manageOpen, { open: openManage, close: closeManage }] = useDisclosure(false);
  const [name, setName] = useState("");

  const edited = basePreset != null && activePreset?.id !== basePreset.id;
  const trimmed = name.trim();
  const clash =
    [...presets, ...hiddenBuiltins].find((p) => p.label.toLowerCase() === trimmed.toLowerCase()) ??
    null;
  const nameError =
    clash && !clash.custom ? "A built-in scenario already uses this name." : undefined;
  const replacing = clash?.custom ? clash : null;

  const startSave = () => {
    setName(edited && basePreset ? `${basePreset.label} (my version)` : "");
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
      <Group
        justify="space-between"
        align="center"
        gap="xs"
        pb={4}
        style={{ borderBottom: "1px solid var(--pf-ink)" }}
      >
        <Eyebrow>Scenario</Eyebrow>
        <Group gap={4}>
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<IconPlus size={12} />}
            onClick={startSave}
          >
            Save as preset
          </Button>
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<IconSettings size={12} />}
            onClick={openManage}
          >
            Manage
          </Button>
        </Group>
      </Group>
      <Group gap={6} pt={6} role="group" aria-label="Scenario presets">
        {presets.map((preset) => {
          const active = activePreset?.id === preset.id;
          const isBase = edited && basePreset?.id === preset.id;
          return (
            <Button
              key={preset.id}
              variant={active ? "filled" : isBase ? "outline" : "default"}
              size="sm"
              aria-pressed={active}
              onClick={() => onSelect(preset)}
            >
              {preset.label}
              {isBase ? " (edited)" : ""}
            </Button>
          );
        })}
      </Group>

      {/* Status slot: always reserves one row (compact-xs button height) so the "edited" / "undo"
          messages appearing and disappearing don't push the form below them up and down. */}
      <Box mih={22}>
        {edited && basePreset && (
          <Group gap="xs" aria-live="polite">
            <Text size="xs" c="dimmed">
              Edited from {basePreset.label}.
            </Text>
            {basePreset.custom ? (
              <Button
                variant="default"
                size="compact-xs"
                leftSection={<IconDeviceFloppy size={12} />}
                onClick={() => onUpdate(basePreset)}
              >
                Save to {basePreset.label}
              </Button>
            ) : (
              <Button
                variant="default"
                size="compact-xs"
                leftSection={<IconDeviceFloppy size={12} />}
                onClick={startSave}
              >
                Save as new preset
              </Button>
            )}
            <Anchor component="button" type="button" size="xs" onClick={() => onSelect(basePreset)}>
              Revert
            </Anchor>
          </Group>
        )}

        {recentlyDeleted && !manageOpen && (
          <Group gap="xs" aria-live="polite">
            <Text size="xs" c="dimmed">
              {recentlyDeleted.custom ? "Deleted" : "Hid"} {recentlyDeleted.label}.
            </Text>
            <Anchor component="button" type="button" size="xs" onClick={onUndoDelete}>
              Undo
            </Anchor>
          </Group>
        )}
      </Box>

      <ManagePresetsModal
        opened={manageOpen}
        onClose={closeManage}
        presets={presets}
        hiddenBuiltins={hiddenBuiltins}
        recentlyDeleted={recentlyDeleted}
        onRename={onRename}
        onDelete={onDelete}
        onUndoDelete={onUndoDelete}
        onShowBuiltin={onShowBuiltin}
        onImport={onImport}
      />

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
