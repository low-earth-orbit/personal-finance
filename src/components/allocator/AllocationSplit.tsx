import {
  Alert,
  Card,
  Divider,
  Group,
  List,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { formatCAD } from "@/utils/format";
import { taxOwed } from "@/utils/allocator/tax";
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
    {
      label: "RRSP contribution now — claim deduction now",
      amount: allocation.rrspDeductNow,
    },
    ...allocation.rrspCarryForward.map((claim) => ({
      label: `RRSP contribution now — claim deduction at age ${claim.age}`,
      amount: claim.amount,
    })),
    { label: "Non-registered", amount: allocation.nonReg },
  ].filter((row) => row.amount > 0);
  const registeredAllocated =
    allocation.tfsa +
    allocation.rrspDeductNow +
    allocation.rrspCarryForward.reduce((sum, claim) => sum + claim.amount, 0);
  const registeredRoom = input.availableTfsaRoom + input.availableRrspRoom;
  const registeredRoomFull =
    allocation.nonReg > 0 && registeredAllocated >= registeredRoom - 0.01;
  const incomeAfterCurrentClaim = Math.max(
    0,
    input.currentIncome - allocation.rrspDeductNow,
  );
  const estimatedCurrentRefund =
    taxOwed(input.province, input.currentIncome) -
    taxOwed(input.province, incomeAfterCurrentClaim);
  const effectiveCurrentRefundRate =
    allocation.rrspDeductNow > 0
      ? estimatedCurrentRefund / allocation.rrspDeductNow
      : 0;
  const rrspWithdrawalRate =
    input.retirementRateMode === "income" && input.retirementIncome > 0
      ? taxOwed(input.province, input.retirementIncome) / input.retirementIncome
      : input.retirementRateMode === "income"
        ? 0
        : input.retirementWithdrawalRatePct / 100;

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm">
        <Text size="sm" fw={600}>
          Invest the full lump sum now
        </Text>
        <Text size="xs" c="dimmed">
          Every amount below is contributed or invested now. Only RRSP deduction
          claims may be delayed.
        </Text>
        <Title order={2} c="teal">
          Invest {formatCAD(input.lumpSum)}
        </Title>
        <Stack gap={6}>
          {rows.map((row) => (
            <Group
              key={row.label}
              justify="space-between"
              wrap="wrap"
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
        <Alert variant="light" title="Do now">
          <List size="sm" spacing={4}>
            {allocation.tfsa > 0 && (
              <List.Item>
                Contribute {formatCAD(allocation.tfsa)} to TFSA.
              </List.Item>
            )}
            {registeredAllocated - allocation.tfsa > 0 && (
              <List.Item>
                Contribute {formatCAD(registeredAllocated - allocation.tfsa)} to
                RRSP now.
              </List.Item>
            )}
            {allocation.nonReg > 0 && (
              <List.Item>
                Invest {formatCAD(allocation.nonReg)} in non-registered.
              </List.Item>
            )}
            {allocation.rrspDeductNow > 0 && (
              <List.Item>
                Claim {formatCAD(allocation.rrspDeductNow)} of RRSP deductions
                now.
              </List.Item>
            )}
          </List>
        </Alert>
        {(allocation.rrspCarryForward.length > 0 ||
          allocation.refundTotal > 0) && (
          <Alert variant="light" color="orange" title="Do later">
            <List size="sm" spacing={4}>
              {allocation.rrspCarryForward.map((claim) => (
                <List.Item key={claim.age}>
                  Claim {formatCAD(claim.amount)} nominal of RRSP deductions at
                  age {claim.age}.
                </List.Item>
              ))}
              {allocation.refundSchedule.map((refund) => (
                <List.Item key={`${refund.claimAge}-${refund.arrivalAge}`}>
                  At age {refund.arrivalAge}, invest the projected{" "}
                  {formatCAD(refund.amountNominal)} nominal refund from the age{" "}
                  {refund.claimAge} tax return, using remaining TFSA room first,
                  then non-registered.
                </List.Item>
              ))}
            </List>
          </Alert>
        )}
        {allocation.carryForwardBenefitNominal > 0 && (
          <Text size="sm" c="dimmed">
            Delaying some deductions adds about{" "}
            <Text span fw={700}>
              {formatCAD(allocation.carryForwardBenefitNominal)}
            </Text>{" "}
            to projected after-tax value versus claiming all RRSP deductions
            now.
          </Text>
        )}
        {allocation.rrspDeductNow > 0 && (
          <Alert
            variant="light"
            color="blue"
            title="Why claim this amount now?"
          >
            <Text size="sm">
              The current RRSP claim reduces modeled base taxable income from{" "}
              {formatCAD(input.currentIncome)} to{" "}
              {formatCAD(incomeAfterCurrentClaim)}. Its estimated current tax
              refund is {formatCAD(estimatedCurrentRefund)}, an effective{" "}
              {(effectiveCurrentRefundRate * 100).toFixed(1)}% refund rate
              before investment distributions and unmodeled credits.
            </Text>
          </Alert>
        )}
        <Divider />
        <Alert variant="light" color="gray" title="Retirement valuation rates">
          <Text size="sm">
            RRSP balance haircut: {(rrspWithdrawalRate * 100).toFixed(1)}%.
            Taxable capital gains: {input.capitalGainsTaxRatePct.toFixed(1)}%
            after the 50% inclusion rate.
          </Text>
        </Alert>
        <Group justify="space-between" align="baseline">
          <Text size="sm" fw={600}>
            Projected after-tax at retirement
          </Text>
          <Text fw={700} c="teal.8">
            {formatCAD(allocation.projectedAfterTaxTotalNominal)}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          All amounts are in nominal (future) dollars at the time they occur;
          tax brackets are modeled as fully indexed to inflation. Searched to{" "}
          {formatCAD(allocation.precision)} precision. Refunds of{" "}
          {formatCAD(allocation.refundTotalNominal)} are additional invested
          cash, not part of the split above. The full entered lump sum is
          invested now using this year&apos;s room; only RRSP deduction claims
          may be delayed.
        </Text>
      </Stack>
    </Card>
  );
}
