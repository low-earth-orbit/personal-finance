import {
  Anchor,
  Card,
  Divider,
  Group,
  List,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { formatCAD } from "@/utils/format";
import { taxOwed } from "@/utils/allocator/tax";
import { TAX_YEAR } from "@/utils/allocator/taxConstants";
import type { AllocationResult, AllocatorInput } from "@/utils/allocator/types";

interface Row {
  label: string;
  amount: number;
}

const DISPLAY_INCREMENT = 100;

function roundDisplay(value: number, increment = DISPLAY_INCREMENT): number {
  return Math.round(value / increment) * increment;
}

function formatApproxCAD(value: number, increment = DISPLAY_INCREMENT): string {
  return formatCAD(roundDisplay(value, increment));
}

function actionIncrement(lumpSum: number): number {
  if (lumpSum < 1_000) return 1;
  if (lumpSum < 10_000) return 10;
  return DISPLAY_INCREMENT;
}

function taxYearForAge(input: AllocatorInput, age: number): number {
  return TAX_YEAR + age - input.currentAge;
}

function roundedRows(rows: Row[], lumpSum: number, increment: number): Row[] {
  const rounded = rows.map((row) => ({
    ...row,
    amount: roundDisplay(row.amount, increment),
  }));
  const difference =
    roundDisplay(lumpSum, increment) -
    rounded.reduce((sum, row) => sum + row.amount, 0);
  if (difference === 0 || rounded.length === 0) {
    return rounded.filter((row) => row.amount > 0);
  }
  const largest = rounded.reduce(
    (best, row, index) => (row.amount > rounded[best]!.amount ? index : best),
    0,
  );
  rounded[largest] = {
    ...rounded[largest]!,
    amount: rounded[largest]!.amount + difference,
  };
  return rounded.filter((row) => row.amount > 0);
}

export default function AllocationSplit({
  allocation,
  input,
}: {
  allocation: AllocationResult;
  input: AllocatorInput;
}) {
  const displayIncrement = actionIncrement(input.lumpSum);
  const rows = roundedRows(
    [
      { label: "TFSA", amount: allocation.tfsa },
      {
        label: "RRSP contribution",
        amount:
          allocation.rrspDeductNow +
          allocation.rrspCarryForward.reduce(
            (sum, claim) => sum + claim.amount,
            0,
          ),
      },
      { label: "Non-registered", amount: allocation.nonReg },
    ].filter((row) => row.amount > 0),
    input.lumpSum,
    displayIncrement,
  );
  const rrspAllocated =
    allocation.rrspDeductNow +
    allocation.rrspCarryForward.reduce((sum, claim) => sum + claim.amount, 0);
  const displayTfsa = rows.find((row) => row.label === "TFSA")?.amount ?? 0;
  const displayRrsp =
    rows.find((row) => row.label === "RRSP contribution")?.amount ?? 0;
  const displayNonReg =
    rows.find((row) => row.label === "Non-registered")?.amount ?? 0;
  const displayDeductNow = roundDisplay(
    allocation.rrspDeductNow,
    displayIncrement,
  );
  const registeredAllocated = allocation.tfsa + rrspAllocated;
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
  const rrspWithdrawalRate = input.retirementWithdrawalRatePct / 100;
  const hasFutureActions =
    allocation.rrspCarryForward.length > 0 ||
    allocation.refundSchedule.length > 0;

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm">
        <Text size="sm" fw={600}>
          Approximate account split
        </Text>
        <Text size="xs" c="dimmed">
          Invest the full lump sum now. Only RRSP deduction claims may be
          delayed. Account split and action amounts are rounded to the nearest{" "}
          {formatCAD(displayIncrement)}.
        </Text>
        <Title order={2} c="teal">
          Invest about {formatApproxCAD(input.lumpSum, displayIncrement)}
        </Title>
        <Stack gap={6}>
          {rows.map((row) => (
            <Group
              key={row.label}
              justify="space-between"
              wrap="wrap"
              px="sm"
              py={6}
              bg="var(--mantine-color-teal-light)"
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
          <Text size="sm" c="orange" fw={600}>
            {registeredRoom <= 0.01
              ? "No registered room: the full amount goes to non-registered."
              : "Registered room is full; the remainder goes to non-registered."}
          </Text>
        )}

        <Paper withBorder radius="md" p="md">
          <Text size="sm" fw={700} mb={6}>
            Why this split
          </Text>
          <List size="sm" spacing={4}>
            {displayTfsa > 0 && (
              <List.Item>
                TFSA growth and withdrawals avoid the modeled retirement tax
                haircut.
              </List.Item>
            )}
            {displayRrsp > 0 && (
              <List.Item>
                RRSP deductions create modeled tax refunds while the balance
                grows tax-deferred.
              </List.Item>
            )}
            {allocation.rrspCarryForward.length > 0 && (
              <List.Item>
                Some deductions wait because the entered income path produces
                more valuable future claim years.
              </List.Item>
            )}
            {displayNonReg > 0 && (
              <List.Item>
                Non-registered receives the amount not favored for available
                registered room under these assumptions.
              </List.Item>
            )}
          </List>
        </Paper>

        <Paper withBorder radius="md" p="md">
          <Text size="sm" fw={700} mb={6}>
            Do now
          </Text>
          <List size="sm" spacing={4}>
            {displayTfsa > 0 && (
              <List.Item>
                Contribute about {formatCAD(displayTfsa)} to TFSA.
              </List.Item>
            )}
            {displayRrsp > 0 && (
              <List.Item>
                Contribute about {formatCAD(displayRrsp)} to RRSP.
              </List.Item>
            )}
            {displayNonReg > 0 && (
              <List.Item>
                Invest about {formatCAD(displayNonReg)} in non-registered.
              </List.Item>
            )}
            {displayDeductNow > 0 && (
              <List.Item>
                On your {TAX_YEAR} tax return, claim about{" "}
                {formatCAD(displayDeductNow)} of RRSP deductions.
              </List.Item>
            )}
          </List>
        </Paper>

        {hasFutureActions && (
          <details>
            <summary
              style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}
            >
              Future tax-year timeline
            </summary>
            <Stack gap="sm" mt="sm">
              {allocation.rrspCarryForward.length > 0 && (
                <Paper withBorder radius="md" p="md">
                  <Text size="sm" fw={700} mb={6}>
                    Claim deductions
                  </Text>
                  <List size="sm" spacing={4}>
                    {allocation.rrspCarryForward.map((claim) => (
                      <List.Item key={claim.age}>
                        On your {taxYearForAge(input, claim.age)} tax return,
                        claim about{" "}
                        {formatApproxCAD(claim.amount, displayIncrement)}.
                      </List.Item>
                    ))}
                  </List>
                </Paper>
              )}
              {allocation.refundSchedule.length > 0 && (
                <Paper withBorder radius="md" p="md">
                  <Text size="sm" fw={700} mb={6}>
                    Invest projected refunds
                  </Text>
                  <List size="sm" spacing={4}>
                    {allocation.refundSchedule.map((refund) => (
                      <List.Item
                        key={`${refund.claimAge}-${refund.arrivalAge}`}
                      >
                        In {taxYearForAge(input, refund.arrivalAge)}, invest
                        about{" "}
                        {formatApproxCAD(
                          refund.amountNominal,
                          displayIncrement,
                        )}{" "}
                        using remaining TFSA room first, then non-registered.
                      </List.Item>
                    ))}
                  </List>
                </Paper>
              )}
            </Stack>
          </details>
        )}
        {allocation.carryForwardBenefitNominal > 0 && (
          <Text size="sm" c="dimmed">
            Delaying some deductions adds about{" "}
            <Text span fw={700}>
              {formatApproxCAD(allocation.carryForwardBenefitNominal)}
            </Text>{" "}
            to modeled after-tax value versus claiming all RRSP deductions now.
          </Text>
        )}

        <Paper withBorder radius="md" p="md">
          <Text size="sm" fw={700}>
            Before acting
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            Only BC, ON, and NB are supported. The model holds returns and tax
            law constant and excludes annual room accrual, pension adjustments,
            dividend credits, OAS clawback, and market uncertainty. Small
            assumption changes can change the split. Verify room and tax advice.
          </Text>
          <Anchor href="#model-assumptions" size="xs" mt={6}>
            Review detailed assumptions
          </Anchor>
        </Paper>

        <Divider />
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
            Show calculation detail
          </summary>
          <Stack gap="sm" mt="sm">
            {allocation.rrspDeductNow > 0 && (
              <Text size="sm">
                The current RRSP claim reduces modeled base taxable income from{" "}
                {formatCAD(input.currentIncome)} to{" "}
                {formatCAD(incomeAfterCurrentClaim)}. Its estimated current tax
                refund is {formatApproxCAD(estimatedCurrentRefund)}, an
                effective {(effectiveCurrentRefundRate * 100).toFixed(1)}%
                refund rate before investment distributions and unmodeled
                credits.
              </Text>
            )}
            <Text size="sm">
              Retirement valuation rates: RRSP balance haircut{" "}
              {(rrspWithdrawalRate * 100).toFixed(1)}%; effective tax on the
              full capital gain {input.capitalGainsTaxRatePct.toFixed(1)}%.
            </Text>
          </Stack>
        </details>
        <Group justify="space-between" align="baseline">
          <Text size="sm" fw={600}>
            Modeled after-tax value at retirement
          </Text>
          <Text fw={700} c="teal">
            About{" "}
            {formatApproxCAD(allocation.projectedAfterTaxTotalNominal, 1_000)}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          Future-dollar illustration, not a forecast. Projected refunds of about{" "}
          {formatApproxCAD(allocation.refundTotalNominal, 1_000)} are additional
          invested cash, not part of the split above. The search uses finer
          internal precision than the rounded display.
        </Text>
      </Stack>
    </Card>
  );
}
