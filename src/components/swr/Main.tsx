"use client";

import { useEffect, useRef, useState } from "react";
import { Container, Grid } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import InputForm from "./InputForm";
import Result from "./Result";
import ColumnHeader from "@/components/shared/ColumnHeader";
import layout from "@/components/shared/TwoColumn.module.css";
import { DEFAULT_DYNAMICS, DEFAULTS } from "@/utils/swr/presets";
import { computeSwrTable } from "@/utils/swr/engine";
import { loadDynamics, loadInput, saveDynamics, saveInput } from "@/utils/swr/storage";
import { validateSwrInput } from "@/utils/swr/validation";
import type {
  DynamicsMode,
  SwrInput,
  SwrInputKey,
  SwrResult,
  SwrWorkerResponse,
} from "@/utils/swr/types";
import type { FieldValue } from "@/types";

// Without Worker support (e.g. the unit-test DOM), compute on the main thread instead.
const hasWorker = typeof Worker !== "undefined";

export default function Main() {
  const [input, setInput] = useState<SwrInput>(() => loadInput());
  const [mode, setMode] = useState<DynamicsMode>(() => loadDynamics());
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [workerResult, setWorkerResult] = useState<SwrResult | null>(null);
  const [workerFailed, setWorkerFailed] = useState(false);

  const errors = validateSwrInput(input, mode);

  // The simulation is heavier than a single keystroke, so debounce the inputs that drive it.
  // Field errors still track the live input for instant feedback.
  const [debouncedInput] = useDebouncedValue(input, 150);
  const [debouncedMode] = useDebouncedValue(mode, 150);
  const debouncedValid = Object.keys(validateSwrInput(debouncedInput, debouncedMode)).length === 0;

  // Drop the last table when inputs turn invalid, so a later valid edit shows the loader
  // rather than a table computed for older inputs (render-time state adjustment).
  const [prevValid, setPrevValid] = useState(debouncedValid);
  if (prevValid !== debouncedValid) {
    setPrevValid(debouncedValid);
    if (!debouncedValid) setWorkerResult(null);
  }

  useEffect(() => {
    if (!hasWorker) return;
    const worker = new Worker(new URL("../../workers/swrWorker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<SwrWorkerResponse>) => {
      const { requestId, result } = event.data;
      if (requestId === requestIdRef.current) setWorkerResult(result);
    };
    // A worker that fails to load or throws falls back to the main thread.
    worker.onerror = () => setWorkerFailed(true);
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    // Bumping the id on invalid input also drops any reply still in flight.
    requestIdRef.current += 1;
    if (!workerRef.current || !debouncedValid) return;
    workerRef.current.postMessage({
      requestId: requestIdRef.current,
      input: debouncedInput,
      mode: debouncedMode,
    });
  }, [debouncedInput, debouncedMode, debouncedValid]);

  // While a newer request is in flight the previous table stays on screen.
  const onMainThread = !hasWorker || workerFailed;
  const result = !debouncedValid
    ? null
    : onMainThread
      ? computeSwrTable(debouncedInput, debouncedMode)
      : workerResult;
  const loading = debouncedValid && result == null;

  function handleChange(key: SwrInputKey, value: FieldValue) {
    setInput((prev) => {
      // Keep "" while editing (mirrors the other tools); validation flags it.
      const next = { ...prev, [key]: value === "" ? value : +value } as SwrInput;
      saveInput(next);
      return next;
    });
  }

  function handleModeChange(next: DynamicsMode) {
    setMode(next);
    saveDynamics(next);
  }

  function handleReset() {
    const fresh: SwrInput = { ...DEFAULTS };
    setInput(fresh);
    saveInput(fresh);
    handleModeChange(DEFAULT_DYNAMICS);
  }

  return (
    <Container size="xl" pb="xl">
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <ColumnHeader title="Inputs" />
          <InputForm
            input={input}
            mode={mode}
            errors={errors}
            onChange={handleChange}
            onModeChange={handleModeChange}
            onReset={handleReset}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }} className={layout.result} id="result">
          <ColumnHeader title="Result" note="Updates as you change inputs" />
          <Result input={input} result={result} loading={loading} />
        </Grid.Col>
      </Grid>
    </Container>
  );
}
