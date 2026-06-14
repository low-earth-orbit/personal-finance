"use client";

import { useEffect, useRef, useState } from "react";
import { Container, Grid } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import InputForm from "./InputForm";
import Result from "./Result";
import { DEFAULTS } from "@/utils/allocator/presets";
import {
  clearInput,
  hasSavedInput,
  loadInput,
  saveInput,
} from "@/utils/allocator/storage";
import type {
  AllocatorInput,
  AllocatorInputKey,
  AllocationResponse,
  AllocationResult,
} from "@/utils/allocator/types";
import { validateAllocatorInput } from "@/utils/allocator/validation";

export type AllocatorStatus =
  | "idle"
  | "loading"
  | "invalid"
  | "ready"
  | "error";

export default function Main() {
  const [input, setInput] = useState<AllocatorInput>(() => loadInput());
  const [hasStarted, setHasStarted] = useState(() => hasSavedInput());
  const [response, setResponse] = useState<{
    input: AllocatorInput;
    allocation: AllocationResult;
  } | null>(null);
  const [errorInput, setErrorInput] = useState<AllocatorInput | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const errors = validateAllocatorInput(input);
  const [debouncedInput] = useDebouncedValue(input, 150);
  const inputsValid =
    Object.keys(validateAllocatorInput(debouncedInput)).length === 0;
  const status: AllocatorStatus = !hasStarted
    ? "idle"
    : !inputsValid
      ? "invalid"
      : errorInput === debouncedInput
        ? "error"
        : response?.input === debouncedInput
          ? "ready"
          : "loading";
  const allocation =
    response?.input === debouncedInput ? response.allocation : null;

  useEffect(() => {
    requestIdRef.current += 1;
    workerRef.current?.terminate();
    workerRef.current = null;
    if (!hasStarted || !inputsValid) {
      return;
    }
    const worker = new Worker(
      new URL("../../workers/allocationWorker.ts", import.meta.url),
    );
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<AllocationResponse>) => {
      if (event.data.requestId === requestIdRef.current) {
        setResponse({ input: debouncedInput, allocation: event.data.result });
        setErrorInput(null);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      }
    };
    worker.onerror = () => {
      setErrorInput(debouncedInput);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    worker.postMessage({
      input: debouncedInput,
      requestId: requestIdRef.current,
    });
    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [debouncedInput, hasStarted, inputsValid]);

  function handleChange(key: AllocatorInputKey, value: unknown) {
    setInput((previous) => {
      const next = { ...previous };
      if (typeof DEFAULTS[key] === "number") {
        (next as unknown as Record<string, unknown>)[key] =
          value === "" || value == null ? value : Number(value);
      } else {
        (next as unknown as Record<string, unknown>)[key] = value;
      }
      saveInput(next);
      return next;
    });
  }

  function handleReset() {
    const next = { ...DEFAULTS };
    setInput(next);
    clearInput();
    setHasStarted(false);
    setResponse(null);
    setErrorInput(null);
  }

  function handleShowRecommendation() {
    if (Object.keys(errors).length === 0) {
      saveInput(input);
      setHasStarted(true);
    }
  }

  return (
    <Container size="xl" pb="xl">
      <Grid gap="xl">
        <Grid.Col
          span={{ base: 12, lg: 6 }}
          order={{ base: status === "ready" ? 2 : 1, lg: 1 }}
        >
          <InputForm
            input={input}
            errors={errors}
            started={hasStarted}
            onChange={handleChange}
            onReset={handleReset}
            onShowRecommendation={handleShowRecommendation}
          />
        </Grid.Col>
        <Grid.Col
          span={{ base: 12, lg: 6 }}
          order={{ base: status === "ready" ? 1 : 2, lg: 2 }}
        >
          <Result
            allocation={allocation}
            input={debouncedInput}
            status={status}
          />
        </Grid.Col>
      </Grid>
    </Container>
  );
}
