import { useState } from "react";
import {
  ActionIcon,
  Anchor,
  Button,
  Divider,
  FileButton,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconCheck,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { parsePresetFile, serializePresets, type PresetFileEntry } from "@/utils/presetFile";
import type { Preset } from "@/types";

/** File contents as text (FileReader: `Blob.text()` is missing in some environments). */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsText(file);
  });
}

export interface ImportSummary {
  added: number;
  replaced: number;
}

interface ManagePresetsModalProps {
  opened: boolean;
  onClose: () => void;
  /** Visible presets, built-ins first. */
  presets: Preset[];
  hiddenBuiltins: Preset[];
  recentlyDeleted: Preset | null;
  onRename: (preset: Preset, name: string) => void;
  onDelete: (preset: Preset) => void;
  onUndoDelete: () => void;
  onShowBuiltin: (preset: Preset) => void;
  onImport: (entries: PresetFileEntry[]) => ImportSummary;
}

export default function ManagePresetsModal({
  opened,
  onClose,
  presets,
  hiddenBuiltins,
  recentlyDeleted,
  onRename,
  onDelete,
  onUndoDelete,
  onShowBuiltin,
  onImport,
}: ManagePresetsModalProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const saved = presets.filter((p) => p.custom);
  const builtins = presets.filter((p) => !p.custom);
  const newTrimmed = newName.trim();
  const renaming = presets.find((p) => p.id === renamingId) ?? null;
  const renameClash = [...presets, ...hiddenBuiltins].some(
    (p) => p.id !== renamingId && p.label.toLowerCase() === newTrimmed.toLowerCase(),
  );
  const canRename = !!renaming && !!newTrimmed && !renameClash && newTrimmed !== renaming.label;

  const startRename = (preset: Preset) => {
    setNewName(preset.label);
    setRenamingId(preset.id);
  };
  const submitRename = () => {
    if (!renaming || !canRename) return;
    onRename(renaming, newTrimmed);
    setRenamingId(null);
  };

  const exportSaved = () => {
    const blob = new Blob([serializePresets(saved)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rent-vs-buy-presets-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({
      ok: true,
      text: `Exported ${saved.length} ${saved.length === 1 ? "preset" : "presets"}.`,
    });
  };

  const importFile = async (file: File | null) => {
    if (!file) return;
    try {
      const { added, replaced } = onImport(parsePresetFile(await readText(file)));
      const parts = [
        `Imported ${added + replaced} ${added + replaced === 1 ? "preset" : "presets"}`,
      ];
      if (replaced > 0) parts.push(`${replaced} replaced a saved preset with the same name`);
      setMessage({ ok: true, text: `${parts.join("; ")}.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't read that file." });
    }
  };

  const close = () => {
    setRenamingId(null);
    setMessage(null);
    onClose();
  };

  const row = (preset: Preset) => (
    <Group key={preset.id} justify="space-between" wrap="nowrap" gap="xs" mih={34}>
      {renamingId === preset.id ? (
        <Group gap={4} wrap="nowrap" style={{ flex: 1 }}>
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitRename();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setRenamingId(null);
              }
            }}
            error={renameClash ? "Another preset already uses this name." : undefined}
            aria-label={`New name for ${preset.label}`}
            data-autofocus
            autoFocus
          />
          <ActionIcon
            variant="default"
            onClick={submitRename}
            disabled={!canRename}
            aria-label="Save name"
          >
            <IconCheck size={14} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => setRenamingId(null)}
            aria-label="Cancel rename"
          >
            <IconX size={14} />
          </ActionIcon>
        </Group>
      ) : (
        <>
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <Text size="sm" truncate>
              {preset.label}
            </Text>
          </Group>
          <Group gap={4} wrap="nowrap">
            {preset.custom ? (
              <>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => startRename(preset)}
                  aria-label={`Rename ${preset.label}`}
                  title="Rename"
                >
                  <IconPencil size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => onDelete(preset)}
                  aria-label={`Delete ${preset.label}`}
                  title="Delete"
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </>
            ) : (
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => onDelete(preset)}
                aria-label={`Hide ${preset.label}`}
                title="Hide"
              >
                <IconEyeOff size={14} />
              </ActionIcon>
            )}
          </Group>
        </>
      )}
    </Group>
  );

  return (
    <Modal opened={opened} onClose={close} title="Manage presets" size="md" centered>
      <Stack gap="md">
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

        <Stack gap={4}>
          <Text size="sm" fw={600}>
            Your presets
          </Text>
          {saved.length > 0 ? (
            saved.map(row)
          ) : (
            <Text size="xs" c="dimmed">
              None yet. Use &ldquo;Save as preset&rdquo; to keep the current inputs, or import a
              file.
            </Text>
          )}
        </Stack>

        <Stack gap={4}>
          <Text size="sm" fw={600}>
            Built-in scenarios
          </Text>
          {builtins.map(row)}
          {hiddenBuiltins.map((preset) => (
            <Group key={preset.id} justify="space-between" wrap="nowrap" mih={34}>
              <Text size="sm" c="dimmed">
                {preset.label} (hidden)
              </Text>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => onShowBuiltin(preset)}
                aria-label={`Show ${preset.label}`}
                title="Show"
              >
                <IconEye size={14} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>

        <Divider />

        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            Presets live in this browser only. Export your presets to a file to back them up or move
            them to another device.
          </Text>
          <Group gap="xs">
            <Button
              variant="default"
              size="xs"
              leftSection={<IconDownload size={14} />}
              onClick={exportSaved}
              disabled={saved.length === 0}
            >
              Export to file
            </Button>
            <FileButton onChange={importFile} accept="application/json,.json">
              {(props) => (
                <Button
                  {...props}
                  variant="default"
                  size="xs"
                  leftSection={<IconUpload size={14} />}
                >
                  Import from file
                </Button>
              )}
            </FileButton>
          </Group>
          {message && (
            <Text size="xs" c={message.ok ? "ledger" : "red"} aria-live="polite">
              {message.text}
            </Text>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}
