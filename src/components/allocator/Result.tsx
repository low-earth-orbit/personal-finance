"use client";

import { Alert, Loader, Paper, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";
import AllocationSplit from "./AllocationSplit";
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
  if (status === "idle") {
    return (
      <Paper withBorder radius="md" p="lg">
        <Text fw={700}>Review your numbers first</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The values shown are examples. Review the starting inputs, then
          generate a recommendation.
        </Text>
      </Paper>
    );
  }
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
      <Text size="xs" c="dimmed">
        Deterministic illustration. Not personalized advice.
      </Text>
    </Stack>
  );
}
