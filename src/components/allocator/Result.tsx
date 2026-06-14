"use client";

import { Alert, Stack } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import AllocationSplit from "./AllocationSplit";
import type { AllocationResult, AllocatorInput } from "@/utils/allocator/types";

export default function Result({
  allocation,
  input,
}: {
  allocation: AllocationResult | null;
  input: AllocatorInput;
}) {
  if (!allocation) {
    return (
      <Alert icon={<IconInfoCircle />} title="Complete the inputs">
        Fix the highlighted fields to optimize the allocation.
      </Alert>
    );
  }
  return (
    <Stack gap="lg">
      <AllocationSplit allocation={allocation} input={input} />
    </Stack>
  );
}
