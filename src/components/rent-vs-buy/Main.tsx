import { useState } from "react";
import { Container, Grid } from "@mantine/core";
import Result from "./Result";
import UserInputForm from "./UserInputForm";
import PresetBar from "./PresetBar";
import { DEFAULTS, PRESETS, INPUT_UNCERTAINTIES, getActivePreset } from "@/utils/presets";
import { validateUserInput } from "@/utils/validation";
import {
  loadInput,
  saveInput,
  clearInput,
  loadExpandedFields,
  saveExpandedFields,
  consumeLegacyAdvanced,
  loadCustomPresets,
  saveCustomPresets,
  loadHiddenBuiltins,
  saveHiddenBuiltins,
  loadActivePresetId,
  saveActivePresetId,
  clearAll,
} from "@/utils/storage";
import type { FieldValue, Preset, SigmaKey, UserInput, UserInputKey } from "@/types";

const PERTURBED_FIELDS: UserInputKey[] = [
  "rentIncreaseRate",
  "homePriceGrowthRate",
  "ownerCostGrowthRate",
  "annualMortgageInterestRate",
  "investmentReturnRate",
  "dividendYield",
];

const normalizeInput = (values?: Partial<UserInput> | null): UserInput => ({
  ...DEFAULTS,
  ...(values ?? {}),
});

const Main = () => {
  const [userInput, setUserInput] = useState<UserInput>(() => {
    const loaded = loadInput();
    return loaded ? normalizeInput(loaded) : DEFAULTS;
  });
  const [expandedFields, setExpandedFieldsState] = useState<UserInputKey[]>(() => {
    const loaded = loadExpandedFields();
    if (loaded) return loaded;
    const legacy = consumeLegacyAdvanced();
    if (legacy) {
      saveExpandedFields(PERTURBED_FIELDS);
      return PERTURBED_FIELDS;
    }
    return [];
  });
  const [customPresets, setCustomPresets] = useState<Preset[]>(() =>
    (loadCustomPresets() ?? []).map((preset) => ({
      ...preset,
      values: normalizeInput(preset.values),
    })),
  );
  const [hiddenBuiltins, setHiddenBuiltins] = useState<string[]>(() => loadHiddenBuiltins() ?? []);
  const [activePresetId, setActivePresetIdState] = useState<string | null>(
    () => loadActivePresetId() ?? "defaults",
  );

  const errors = validateUserInput(userInput);

  const visibleBuiltins = PRESETS.filter((p) => !hiddenBuiltins.includes(p.id));
  const allPresets = [...visibleBuiltins, ...customPresets];

  // Highlight by explicit selection when valid; otherwise fall back to value match.
  let activePreset = allPresets.find((p) => p.id === activePresetId) ?? null;
  if (activePreset) {
    const ap = activePreset;
    const matches = (Object.keys(ap.values) as UserInputKey[]).every(
      (k) => ap.values[k] === userInput[k],
    );
    if (!matches) activePreset = null;
  }
  if (!activePreset) {
    activePreset = getActivePreset(userInput, allPresets);
  }
  // The last picked or saved preset stays the "base" after edits, so the bar can offer
  // Revert / Update.
  const basePreset = allPresets.find((p) => p.id === activePresetId) ?? activePreset;
  const [recentlyDeleted, setRecentlyDeleted] = useState<{ preset: Preset; index: number } | null>(
    null,
  );

  function setActivePresetId(id: string | null) {
    setActivePresetIdState(id);
    saveActivePresetId(id);
  }

  function handleChange(inputIdentifier: UserInputKey, newValue: FieldValue) {
    setUserInput((prev) => {
      const next = {
        ...prev,
        [inputIdentifier]: newValue ? +newValue : newValue,
      } as UserInput;
      saveInput(next);
      return next;
    });
    // Keep activePresetId: it now marks the base preset the inputs were edited from.
    if (activePresetId === null && activePreset) setActivePresetId(activePreset.id);
  }

  function handlePreset(preset: Preset) {
    setUserInput(normalizeInput(preset.values));
    clearInput();
    setActivePresetId(preset.id);
    setRecentlyDeleted(null);
  }

  function toggleFieldExpanded(baseField: UserInputKey, sigmaField?: SigmaKey) {
    const wasExpanded = expandedFields.includes(baseField);
    setExpandedFieldsState((prev) => {
      const next = wasExpanded ? prev.filter((f) => f !== baseField) : [...prev, baseField];
      saveExpandedFields(next);
      return next;
    });
    // Collapsing acts as "Reset": restore sigma to its global default.
    if (wasExpanded && sigmaField && INPUT_UNCERTAINTIES[sigmaField] != null) {
      setUserInput((prev) => {
        if (prev[sigmaField] === INPUT_UNCERTAINTIES[sigmaField]) return prev;
        const next: UserInput = {
          ...prev,
          [sigmaField]: INPUT_UNCERTAINTIES[sigmaField],
        };
        saveInput(next);
        return next;
      });
    }
  }

  function handleSavePreset(name: string) {
    const label = name.trim();
    if (!label) return;
    const entry: Preset = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `cp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label,
      values: userInput,
      custom: true,
    };
    const next = [...customPresets, entry];
    setCustomPresets(next);
    saveCustomPresets(next);
    setActivePresetId(entry.id);
    setRecentlyDeleted(null);
  }

  function handleUpdatePreset(preset: Preset) {
    const next = customPresets.map((p) => (p.id === preset.id ? { ...p, values: userInput } : p));
    setCustomPresets(next);
    saveCustomPresets(next);
    setActivePresetId(preset.id);
    setRecentlyDeleted(null);
  }

  function handleDeletePreset(preset: Preset) {
    setRecentlyDeleted({
      preset,
      index: preset.custom ? customPresets.findIndex((p) => p.id === preset.id) : -1,
    });
    if (preset.custom) {
      const next = customPresets.filter((p) => p.id !== preset.id);
      setCustomPresets(next);
      saveCustomPresets(next);
    } else {
      const next = [...hiddenBuiltins, preset.id];
      setHiddenBuiltins(next);
      saveHiddenBuiltins(next);
    }
    if (activePresetId === preset.id) setActivePresetId(null);
  }

  function handleUndoDelete() {
    if (!recentlyDeleted) return;
    const { preset, index } = recentlyDeleted;
    if (preset.custom) {
      const next = [...customPresets];
      next.splice(Math.max(0, Math.min(index, next.length)), 0, preset);
      setCustomPresets(next);
      saveCustomPresets(next);
    } else {
      const next = hiddenBuiltins.filter((id) => id !== preset.id);
      setHiddenBuiltins(next);
      saveHiddenBuiltins(next);
    }
    setRecentlyDeleted(null);
  }

  function handleRestoreBuiltins() {
    setHiddenBuiltins([]);
    saveHiddenBuiltins([]);
  }

  function handleReset() {
    clearAll();
    setUserInput(DEFAULTS);
    setExpandedFieldsState([]);
    setCustomPresets([]);
    setHiddenBuiltins([]);
    setActivePresetIdState("defaults");
    setRecentlyDeleted(null);
  }

  return (
    <Container size="xl">
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, lg: 6 }} order={{ base: 2, md: 1 }}>
          <UserInputForm
            userInput={userInput}
            handleChange={handleChange}
            handleReset={handleReset}
            expandedFields={expandedFields}
            toggleFieldExpanded={toggleFieldExpanded}
            errors={errors}
            presetBar={
              <PresetBar
                presets={allPresets}
                activePreset={activePreset}
                basePreset={basePreset}
                hiddenBuiltinCount={PRESETS.length - visibleBuiltins.length}
                recentlyDeleted={recentlyDeleted?.preset ?? null}
                onSelect={handlePreset}
                onSave={handleSavePreset}
                onUpdate={handleUpdatePreset}
                onDelete={handleDeletePreset}
                onUndoDelete={handleUndoDelete}
                onRestoreBuiltins={handleRestoreBuiltins}
              />
            }
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }} order={{ base: 1, md: 2 }}>
          <Result userInput={userInput} errors={errors} />
        </Grid.Col>
      </Grid>
    </Container>
  );
};

export default Main;
