"use client";

import { Alert, Group, Loader, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";
import AllocationSplit from "./AllocationSplit";
import { Eyebrow } from "@/components/shared/Figures";
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
      <Stack gap="xs" pt="md" style={{ borderTop: "1px solid var(--pf-ink)" }}>
        <Eyebrow>Approximate account split</Eyebrow>
        <Text fz={{ base: 22, sm: 26 }} fw={600} lh={1.2} style={{ letterSpacing: "-0.01em" }}>
          Review your numbers first
        </Text>
        <Text c="dimmed" maw="36rem">
          The values shown are examples. Review the starting inputs, then show the split.
        </Text>
      </Stack>
    );
  }
  if (status === "invalid" && !allocation) {
    return (
      <Alert icon={<IconInfoCircle />} title="Complete the inputs">
        Fix the highlighted fields to optimize the allocation.
      </Alert>
    );
  }
  if (status === "error" && !allocation) {
    return (
      <Alert icon={<IconAlertCircle />} color="red" title="Calculation failed">
        Change an input to retry.
      </Alert>
    );
  }
  if (!allocation) {
    return (
      <Alert icon={<Loader size="sm" />} title="Calculating split" aria-live="polite">
        Comparing account splits and RRSP deduction years.
      </Alert>
    );
  }
  return (
    <Stack gap="lg">
      {status === "updating" && (
        <Group gap="xs" aria-live="polite">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            Updating split…
          </Text>
        </Group>
      )}
      {status === "invalid" && (
        <Text size="xs" c="rust" fw={600} aria-live="polite">
          Update paused: fix the highlighted fields.
        </Text>
      )}
      {status === "error" && (
        <Text size="xs" c="red" fw={600} aria-live="polite">
          Update failed. Change an input to retry.
        </Text>
      )}
      <AllocationSplit allocation={allocation} input={input} />
      <Text size="xs" c="dimmed">
        Deterministic illustration. Not personalized advice.
      </Text>
    </Stack>
  );
}
