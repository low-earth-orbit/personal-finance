"use client";

import { useEffect, useRef, useState } from "react";
import { Container, Grid } from "@mantine/core";
import InputForm from "./InputForm";
import Result from "./Result";
import { DEFAULTS } from "@/utils/glide-path/presets";
import {
  loadInput,
  loadReturnMode,
  saveInput,
  saveReturnMode,
} from "@/utils/glide-path/storage";
import { validateGlidePathInput } from "@/utils/glide-path/validation";
import type {
  GlidePathInput,
  GlidePathInputKey,
  GlidePathResult,
  GlidePathResponse,
  GlidePathReturnMode,
} from "@/utils/glide-path/types";
import type { FieldValue } from "@/types";

/** The result paired with the input snapshot it was computed for. */
interface Computed {
  data: GlidePathResult;
  input: GlidePathInput;
  returnMode: GlidePathReturnMode;
  seed: number;
}

export default function Main() {
  const [input, setInput] = useState<GlidePathInput>(() => loadInput());
  const [returnMode, setReturnMode] = useState<GlidePathReturnMode>(() =>
    loadReturnMode(),
  );
  const [computed, setComputed] = useState<Computed | null>(null);
  const [computing, setComputing] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const [error, setError] = useState(false);

  const errors = validateGlidePathInput(input);
  const hasErrors = Object.keys(errors).length > 0;

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const seedRef = useRef(0);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function terminateWorker() {
    workerRef.current?.terminate();
    workerRef.current = null;
  }

  function cancelPendingComputation() {
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    updateTimerRef.current = null;
    terminateWorker();
    requestIdRef.current += 1;
    setComputing(false);
    setRerolling(false);
  }

  useEffect(
    () => () => {
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      terminateWorker();
    },
    [],
  );

  function compute(
    seedValue: number,
    isReroll: boolean,
    inputSnapshot = input,
    returnModeSnapshot = returnMode,
  ) {
    if (Object.keys(validateGlidePathInput(inputSnapshot)).length > 0) return;
    setError(false);
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    terminateWorker();

    const worker = new Worker(
      new URL("../../workers/glidePathWorker.ts", import.meta.url),
    );
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<GlidePathResponse>) => {
      const { requestId: responseId, result } = event.data;
      if (responseId === requestIdRef.current) {
        setComputed({
          data: result,
          input: inputSnapshot,
          returnMode: returnModeSnapshot,
          seed: seedValue,
        });
        setComputing(false);
        setRerolling(false);
      }
      if (workerRef.current === worker) terminateWorker();
    };
    worker.onerror = () => {
      if (requestId === requestIdRef.current) {
        setComputing(false);
        setRerolling(false);
        setError(true);
      }
      if (workerRef.current === worker) terminateWorker();
    };

    // Re-roll keeps the current result visible (only the button spins); a fresh Generate
    // swaps to the full loader.
    if (isReroll) setRerolling(true);
    else setComputing(true);
    worker.postMessage({
      input: inputSnapshot,
      requestId,
      seed: seedValue,
      returnMode: returnModeSnapshot,
    });
  }

  function scheduleUpdate(
    inputSnapshot: GlidePathInput,
    returnModeSnapshot: GlidePathReturnMode,
  ) {
    if (!computed) return;
    updateTimerRef.current = setTimeout(() => {
      updateTimerRef.current = null;
      compute(0, false, inputSnapshot, returnModeSnapshot);
    }, 400);
  }

  function handleGenerate() {
    cancelPendingComputation();
    seedRef.current = 0;
    compute(0, false);
  }

  // Opt-in: redraw the Monte Carlo with the next seed, leaving inputs untouched, so the user
  // can see how much the recommendation depends on simulation luck.
  function handleReroll() {
    cancelPendingComputation();
    const next = seedRef.current + 1;
    seedRef.current = next;
    compute(next, true);
  }

  function handleChange(key: GlidePathInputKey, value: FieldValue) {
    const next = {
      ...input,
      [key]: value === "" ? value : +value,
    } as GlidePathInput;
    setInput(next);
    saveInput(next);
    cancelPendingComputation();
    setError(false);
    seedRef.current = 0;
    if (Object.keys(validateGlidePathInput(next)).length === 0) {
      scheduleUpdate(next, returnMode);
    }
  }

  function handleReturnModeChange(mode: GlidePathReturnMode) {
    setReturnMode(mode);
    saveReturnMode(mode);
    cancelPendingComputation();
    setError(false);
    seedRef.current = 0;
    scheduleUpdate(input, mode);
  }

  function handleReset() {
    const fresh: GlidePathInput = { ...DEFAULTS };
    setInput(fresh);
    saveInput(fresh);
    setComputed(null);
    cancelPendingComputation();
    setError(false);
    seedRef.current = 0;
  }

  const updating =
    computed !== null &&
    (computing ||
      computed.input !== input ||
      computed.returnMode !== returnMode);

  return (
    <Container size="xl" pb="xl">
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, lg: 6 }} order={{ base: 2, lg: 1 }}>
          <InputForm
            input={input}
            errors={errors}
            returnMode={returnMode}
            onChange={handleChange}
            onReturnModeChange={handleReturnModeChange}
            onReset={handleReset}
            onGenerate={handleGenerate}
            generating={computing && !computed}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }} order={{ base: 1, lg: 2 }}>
          <Result
            input={computed?.input ?? input}
            result={computed?.data ?? null}
            computing={computing}
            updating={updating}
            rerolling={rerolling}
            error={error}
            hasErrors={hasErrors}
            seed={computed?.seed ?? 0}
            onReroll={handleReroll}
          />
        </Grid.Col>
      </Grid>
    </Container>
  );
}
