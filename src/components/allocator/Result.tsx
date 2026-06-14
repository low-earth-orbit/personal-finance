"use client";

import { Alert, Loader, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";
import AllocationSplit from "./AllocationSplit";
import IncomeCurve from "./IncomeCurve";
import type { AllocatorStatus } from "./Main";
import type { AllocationResult, AllocatorInput } from "@/utils/allocator/types";

export default function Result({
  allocation,
  input,
  status,
}: {
  allocation: AllocationResult | null;
  input: AllocatorInput;
  status: AllocatorStatus;
}) {
  if (status === "invalid") {
    return (
      <Alert icon={<IconInfoCircle />} title="Complete the inputs">
        Fix the highlighted fields to optimize the allocation.
      </Alert>
    );
  }
  if (status === "error") {
    return (
      <Alert icon={<IconAlertCircle />} color="red" title="Calculation failed">
        Change an input to retry the recommendation.
      </Alert>
    );
  }
  if (status === "loading" || !allocation) {
    return (
      <Alert
        icon={<Loader size="sm" />}
        title="Calculating recommendation"
        aria-live="polite"
      >
        Comparing account splits and RRSP deduction years.
      </Alert>
    );
  }
  return (
    <Stack gap="lg">
      <AllocationSplit allocation={allocation} input={input} />
      <IncomeCurve allocation={allocation} input={input} />
      <Alert variant="light" color="gray" title="Model scope">
        <Text size="sm">
          Deterministic illustration using 2025 tax brackets and thresholds held
          constant in today&apos;s dollars, static registered room, and a
          constant return. Registered room and carried deductions remain fixed
          nominal amounts. Deduction claims are optimized only through the year
          before retirement. Verify room and tax advice before acting.
        </Text>
      </Alert>
    </Stack>
  );
}
