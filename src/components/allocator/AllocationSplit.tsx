import { Card, Divider, Group, Stack, Text, Title } from "@mantine/core";
import { formatCAD } from "@/utils/format";
import type { AllocationResult, AllocatorInput } from "@/utils/allocator/types";

interface Row {
  label: string;
  amount: number;
}

export default function AllocationSplit({
  allocation,
  input,
}: {
  allocation: AllocationResult;
  input: AllocatorInput;
}) {
  const rows: Row[] = [
    { label: "TFSA", amount: allocation.tfsa },
    { label: "RRSP — deduct now", amount: allocation.rrspDeductNow },
    ...(allocation.rrspCarryForward
      ? [
          {
            label: `RRSP — carry deduction forward to age ${allocation.rrspCarryForward.age}`,
            amount: allocation.rrspCarryForward.amount,
          },
        ]
      : []),
    { label: "Non-registered", amount: allocation.nonReg },
  ].filter((row) => row.amount > 0);
  const registeredAllocated =
    allocation.tfsa +
    allocation.rrspDeductNow +
    (allocation.rrspCarryForward?.amount ?? 0);
  const registeredRoom = input.availableTfsaRoom + input.availableRrspRoom;
  const registeredRoomFull =
    allocation.nonReg > 0 && registeredAllocated >= registeredRoom - 0.01;

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm">
        <Text size="sm" fw={600}>
          One-time allocation
        </Text>
        <Title order={2} c="teal">
          Invest {formatCAD(input.lumpSum)}
        </Title>
        <Stack gap={6}>
          {rows.map((row) => (
            <Group
              key={row.label}
              justify="space-between"
              wrap="nowrap"
              px="sm"
              py={6}
              bg="teal.0"
              style={{ borderLeft: "4px solid var(--mantine-color-teal-6)" }}
            >
              <Text size="sm">{row.label}</Text>
              <Text size="sm" fw={700}>
                {formatCAD(row.amount)}
              </Text>
            </Group>
          ))}
        </Stack>
        {registeredRoomFull && (
          <Text size="sm" c="orange.8" fw={600}>
            Registered room full — remainder in non-registered.
          </Text>
        )}
        <Divider />
        <Group justify="space-between" align="baseline">
          <Text size="sm" fw={600}>
            Projected after-tax at retirement
          </Text>
          <Text fw={700} c="teal.8">
            {formatCAD(allocation.projectedAfterTaxTotal)}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          Optimized on a {formatCAD(allocation.grid)} grid. Refunds of{" "}
          {formatCAD(allocation.refundTotal)} are additional invested cash,
          reinvested in TFSA/non-registered, and are not part of the split
          above. This is a one-time allocation using this year&apos;s room.
        </Text>
      </Stack>
    </Card>
  );
}
