"use client";

import { useState } from "react";
import { Container, Grid } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import InputForm from "./InputForm";
import Result from "./Result";
import { DEFAULTS } from "@/utils/retirement/presets";
import { computePlanSWR, computeRetirement } from "@/utils/retirement/monteCarlo";
import { loadInput, saveInput } from "@/utils/retirement/storage";
import { validateRetirementInput } from "@/utils/retirement/validation";
import type { RetirementInput, RetirementInputKey } from "@/utils/retirement/types";
import type { FieldValue } from "@/types";

export default function Main() {
  const [input, setInput] = useState<RetirementInput>(() => loadInput());

  const errors = validateRetirementInput(input);

  // The simulation is heavier than a single keystroke, so debounce the input
  // that drives it. Field errors still track the live input for instant feedback.
  const [debouncedInput] = useDebouncedValue(input, 150);
  const result =
    Object.keys(validateRetirementInput(debouncedInput)).length === 0
      ? computeRetirement(debouncedInput)
      : null;

  const planSWR =
    result?.earliestRetirementAge != null && result.portfolioAtRetirement != null
      ? computePlanSWR(debouncedInput, result.earliestRetirementAge, result.portfolioAtRetirement)
      : null;

  function handleChange(key: RetirementInputKey, value: FieldValue) {
    setInput((prev) => {
      // Keep "" while editing (mirrors rent-vs-buy); validation flags it.
      const next = {
        ...prev,
        [key]: value ? +value : value,
      } as RetirementInput;
      saveInput(next);
      return next;
    });
  }

  function handleReset() {
    const fresh: RetirementInput = { ...DEFAULTS };
    setInput(fresh);
    saveInput(fresh);
  }

  return (
    <Container size="xl" pb="xl">
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, lg: 6 }} order={{ base: 2, md: 1 }}>
          <InputForm input={input} errors={errors} onChange={handleChange} onReset={handleReset} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }} order={{ base: 1, md: 2 }}>
          <Result input={input} result={result} planSWR={planSWR} />
        </Grid.Col>
      </Grid>
    </Container>
  );
}
