"use client";

import { useEffect, useRef, useState } from "react";
import { Container, Grid } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import InputForm from "./InputForm";
import Result from "./Result";
import { DEFAULTS } from "@/utils/allocator/presets";
import { loadInput, saveInput } from "@/utils/allocator/storage";
import type {
  AllocatorInput,
  AllocatorInputKey,
  AllocationResponse,
  AllocationResult,
} from "@/utils/allocator/types";
import { validateAllocatorInput } from "@/utils/allocator/validation";

export default function Main() {
  const [input, setInput] = useState<AllocatorInput>(() => loadInput());
  const [allocation, setAllocation] = useState<AllocationResult | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const errors = validateAllocatorInput(input);
  const [debouncedInput] = useDebouncedValue(input, 150);
  const inputsValid =
    Object.keys(validateAllocatorInput(debouncedInput)).length === 0;

  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../../workers/allocationWorker.ts", import.meta.url),
    );
    workerRef.current.onmessage = (event: MessageEvent<AllocationResponse>) => {
      if (event.data.requestId === requestIdRef.current) {
        setAllocation(event.data.result);
      }
    };
    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    if (!inputsValid || !workerRef.current) {
      setAllocation(null);
      return;
    }
    setAllocation(null);
    workerRef.current.postMessage({
      input: debouncedInput,
      lumpSum: debouncedInput.lumpSum,
      requestId: requestIdRef.current,
    });
  }, [debouncedInput, inputsValid]);

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
    saveInput(next);
  }

  return (
    <Container size="xl" pb="xl">
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, lg: 6 }} order={{ base: 2, md: 1 }}>
          <InputForm
            input={input}
            errors={errors}
            onChange={handleChange}
            onReset={handleReset}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }} order={{ base: 1, md: 2 }}>
          <Result allocation={allocation} input={debouncedInput} />
        </Grid.Col>
      </Grid>
    </Container>
  );
}
