import { useState } from "react";
import { Container, Grid } from "@mantine/core";
import Result from "./Result";
import UserInputForm from "./UserInputForm";
import {
  DEFAULTS,
  PRESETS,
  INPUT_UNCERTAINTIES,
  getActivePreset,
} from "@/utils/presets";
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
import type {
  FieldValue,
  Preset,
  SigmaKey,
  UserInput,
  UserInputKey,
} from "@/types";

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
  const [expandedFields, setExpandedFieldsState] = useState<UserInputKey[]>(
    () => {
      const loaded = loadExpandedFields();
      if (loaded) return loaded;
      const legacy = consumeLegacyAdvanced();
      if (legacy) {
        saveExpandedFields(PERTURBED_FIELDS);
        return PERTURBED_FIELDS;
      }
      return [];
    },
  );
  const [customPresets, setCustomPresets] = useState<Preset[]>(() =>
    (loadCustomPresets() ?? []).map((preset) => ({
      ...preset,
      values: normalizeInput(preset.values),
    })),
  );
  const [hiddenBuiltins, setHiddenBuiltins] = useState<string[]>(
    () => loadHiddenBuiltins() ?? [],
  );
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
    if (activePresetId !== null) setActivePresetId(null);
  }

  function handlePreset(preset: Preset) {
    setUserInput(normalizeInput(preset.values));
    clearInput();
    setActivePresetId(preset.id);
  }

  function toggleFieldExpanded(baseField: UserInputKey, sigmaField?: SigmaKey) {
    const wasExpanded = expandedFields.includes(baseField);
    setExpandedFieldsState((prev) => {
      const next = wasExpanded
        ? prev.filter((f) => f !== baseField)
        : [...prev, baseField];
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
  }

  function handleDeletePreset(preset: Preset) {
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

  function handleReset() {
    clearAll();
    setUserInput(DEFAULTS);
    setExpandedFieldsState([]);
    setCustomPresets([]);
    setHiddenBuiltins([]);
    setActivePresetIdState("defaults");
  }

  return (
    <Container size="xl">
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, lg: 6 }} order={{ base: 2, md: 1 }}>
          <UserInputForm
            userInput={userInput}
            handleChange={handleChange}
            handlePreset={handlePreset}
            handleReset={handleReset}
            expandedFields={expandedFields}
            toggleFieldExpanded={toggleFieldExpanded}
            errors={errors}
            activePreset={activePreset}
            visibleBuiltins={visibleBuiltins}
            customPresets={customPresets}
            onSavePreset={handleSavePreset}
            onDeletePreset={handleDeletePreset}
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
