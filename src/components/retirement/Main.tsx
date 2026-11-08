"use client";

import { useEffect, useRef, useState } from "react";
import { Container, Grid } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import InputForm from "./InputForm";
import Result from "./Result";
import { DEFAULTS } from "@/utils/retirement/presets";
import { computePlan } from "@/utils/retirement/monteCarlo";
import { loadInput, saveInput } from "@/utils/retirement/storage";
import { validateRetirementInput } from "@/utils/retirement/validation";
import type {
  RetirementInput,
  RetirementInputKey,
  RetirementResult,
  RetirementWorkerResponse,
} from "@/utils/retirement/types";
import type { FieldValue } from "@/types";

interface Plan {
  result: RetirementResult;
  planSWR: number | null;
}

// Without Worker support (e.g. the unit-test DOM), compute on the main thread instead.
const hasWorker = typeof Worker !== "undefined";

export default function Main() {
  const [input, setInput] = useState<RetirementInput>(() => loadInput());
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [workerPlan, setWorkerPlan] = useState<Plan | null>(null);

  const errors = validateRetirementInput(input);

  // The simulation is heavier than a single keystroke, so debounce the input
  // that drives it. Field errors still track the live input for instant feedback.
  const [debouncedInput] = useDebouncedValue(input, 150);
  const debouncedValid = Object.keys(validateRetirementInput(debouncedInput)).length === 0;

  useEffect(() => {
    if (!hasWorker) return;
    const worker = new Worker(new URL("../../workers/retirementWorker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<RetirementWorkerResponse>) => {
      const { requestId, result, planSWR } = event.data;
      if (requestId === requestIdRef.current) setWorkerPlan({ result, planSWR });
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (!workerRef.current || !debouncedValid) return;
    requestIdRef.current += 1;
    workerRef.current.postMessage({ requestId: requestIdRef.current, input: debouncedInput });
  }, [debouncedInput, debouncedValid]);

  // While a newer request is in flight the previous plan stays on screen.
  const plan = !debouncedValid ? null : hasWorker ? workerPlan : computePlan(debouncedInput);
  const loading = debouncedValid && plan == null;

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
          <Result
            input={input}
            result={plan?.result ?? null}
            planSWR={plan?.planSWR ?? null}
            loading={loading}
          />
        </Grid.Col>
      </Grid>
    </Container>
  );
}
