import type { ReactNode } from "react";
import { Anchor, Group, Stack, Table, Text, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import classes from "./AllocationSplit.module.css";
import { Eyebrow } from "@/components/shared/Figures";
import { formatCAD } from "@/utils/format";
import { taxOwed } from "@/utils/allocator/tax";
import { TAX_YEAR } from "@/utils/allocator/taxConstants";
import type { AllocationResult, AllocatorInput } from "@/utils/allocator/types";

interface Row {
  label: string;
  account: "tfsa" | "rrsp" | "nonReg";
  amount: number;
}

/** A dollar figure inside a sentence, set in mono like the rest of the ledger. */
function Amount({ children }: { children: ReactNode }) {
  return (
    <Text span inherit ff="monospace" c="var(--pf-ink)">
      {children}
    </Text>
  );
}

function sharePct(amount: number, total: number): string {
  return total > 0 ? `${Math.round((amount / total) * 100)}%` : "0%";
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
    roundDisplay(lumpSum, increment) - rounded.reduce((sum, row) => sum + row.amount, 0);
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
      { label: "TFSA", account: "tfsa" as const, amount: allocation.tfsa },
      {
        label: "RRSP contribution",
        account: "rrsp" as const,
        amount:
          allocation.rrspDeductNow +
          allocation.rrspCarryForward.reduce((sum, claim) => sum + claim.amount, 0),
      },
      { label: "Non-registered", account: "nonReg" as const, amount: allocation.nonReg },
    ].filter((row) => row.amount > 0),
    input.lumpSum,
    displayIncrement,
  );
  const rrspAllocated =
    allocation.rrspDeductNow +
    allocation.rrspCarryForward.reduce((sum, claim) => sum + claim.amount, 0);
  const displayTfsa = rows.find((row) => row.label === "TFSA")?.amount ?? 0;
  const displayRrsp = rows.find((row) => row.label === "RRSP contribution")?.amount ?? 0;
  const displayNonReg = rows.find((row) => row.label === "Non-registered")?.amount ?? 0;
  const displayDeductNow = roundDisplay(allocation.rrspDeductNow, displayIncrement);
  const registeredAllocated = allocation.tfsa + rrspAllocated;
  const registeredRoom = input.availableTfsaRoom + input.availableRrspRoom;
  const registeredRoomFull = allocation.nonReg > 0 && registeredAllocated >= registeredRoom - 0.01;
  const incomeAfterCurrentClaim = Math.max(0, input.currentIncome - allocation.rrspDeductNow);
  const estimatedCurrentRefund =
    taxOwed(input.province, input.currentIncome) - taxOwed(input.province, incomeAfterCurrentClaim);
  const effectiveCurrentRefundRate =
    allocation.rrspDeductNow > 0 ? estimatedCurrentRefund / allocation.rrspDeductNow : 0;
  const rrspWithdrawalRate = input.retirementWithdrawalRatePct / 100;
  const hasFutureActions =
    allocation.rrspCarryForward.length > 0 || allocation.refundSchedule.length > 0;

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const timeline = [
    ...allocation.rrspCarryForward.map((claim) => ({
      key: `claim-${claim.age}`,
      year: taxYearForAge(input, claim.age),
      action: "Claim RRSP deduction",
      amount: formatApproxCAD(claim.amount, displayIncrement),
    })),
    ...allocation.refundSchedule.map((refund) => ({
      key: `refund-${refund.claimAge}-${refund.arrivalAge}`,
      year: taxYearForAge(input, refund.arrivalAge),
      action: "Invest projected refund — TFSA room first, then non-registered",
      amount: formatApproxCAD(refund.amountNominal, displayIncrement),
    })),
  ].sort((a, b) => a.year - b.year);

  return (
    <Stack gap={36}>
      <Stack gap="sm" pt="md" style={{ borderTop: "1px solid var(--pf-ink)" }}>
        <Eyebrow>Approximate account split</Eyebrow>
        <Title order={2} fz={{ base: 28, sm: 34 }} lh={1.15} style={{ letterSpacing: "-0.02em" }}>
          Invest about{" "}
          <Text span inherit ff="monospace" fw={500} c="ledger">
            {formatApproxCAD(input.lumpSum, displayIncrement)}
          </Text>
        </Title>
        <Text c="dimmed" maw="45rem">
          Invest the full lump sum now. Only RRSP deduction claims may be delayed. Account split and
          action amounts are rounded to the nearest {formatCAD(displayIncrement)}.
        </Text>
      </Stack>

      <div>
        <div
          className={classes.bar}
          role="img"
          aria-label={`Split of the lump sum: ${rows
            .map((row) => `${row.label} ${sharePct(row.amount, total)}`)
            .join(", ")}`}
        >
          {rows.map((row) => (
            <span key={row.label} data-account={row.account} style={{ flex: row.amount }} />
          ))}
        </div>
        <div>
          {rows.map((row) => (
            <div key={row.label} className={classes.row}>
              <span className={classes.swatch} data-account={row.account} aria-hidden />
              <Text>{row.label}</Text>
              <span className={classes.share}>{sharePct(row.amount, total)}</span>
              <span className={classes.amount}>{formatCAD(row.amount)}</span>
            </div>
          ))}
        </div>
        {registeredRoomFull && (
          <Text size="sm" c="rust" fw={600} mt="sm">
            {registeredRoom <= 0.01
              ? "No registered room: the full amount goes to non-registered."
              : "Registered room is full; the remainder goes to non-registered."}
          </Text>
        )}
      </div>

      <div className={classes.columns}>
        <div>
          <Title order={3} fz="1.0625rem">
            Do now
          </Title>
          <ol className={classes.ruledList}>
            {displayTfsa > 0 && (
              <li>
                <span>
                  Contribute about <Amount>{formatCAD(displayTfsa)}</Amount> to TFSA.
                </span>
              </li>
            )}
            {displayRrsp > 0 && (
              <li>
                <span>
                  Contribute about <Amount>{formatCAD(displayRrsp)}</Amount> to RRSP.
                </span>
              </li>
            )}
            {displayNonReg > 0 && (
              <li>
                <span>
                  Invest about <Amount>{formatCAD(displayNonReg)}</Amount> in non-registered.
                </span>
              </li>
            )}
            {displayDeductNow > 0 && (
              <li>
                <span>
                  On your {TAX_YEAR} tax return, claim about{" "}
                  <Amount>{formatCAD(displayDeductNow)}</Amount> of RRSP deductions.
                </span>
              </li>
            )}
          </ol>
        </div>
        <div>
          <Title order={3} fz="1.0625rem">
            Why this split
          </Title>
          <ul className={classes.ruledList}>
            {displayTfsa > 0 && (
              <li>TFSA growth and withdrawals avoid the modeled retirement tax haircut.</li>
            )}
            {displayRrsp > 0 && (
              <li>
                RRSP deductions create modeled tax refunds while the balance grows tax-deferred.
              </li>
            )}
            {allocation.rrspCarryForward.length > 0 && (
              <li>
                Some deductions wait because the entered income path produces more valuable future
                claim years.
              </li>
            )}
            {displayNonReg > 0 && (
              <li>
                Non-registered receives the amount not favored for available registered room under
                these assumptions.
              </li>
            )}
          </ul>
        </div>
      </div>

      {hasFutureActions && (
        <Stack gap="xs">
          <Title order={3} fz="1.0625rem">
            Future tax-year timeline
          </Title>
          <Table verticalSpacing="sm" horizontalSpacing={0}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={88}>Tax year</Table.Th>
                <Table.Th>Action</Table.Th>
                <Table.Th ta="right">Amount</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {timeline.map((entry) => (
                <Table.Tr key={entry.key}>
                  <Table.Td>{entry.year}</Table.Td>
                  <Table.Td ff="text" pr="sm">
                    {entry.action}
                  </Table.Td>
                  <Table.Td ta="right">{entry.amount}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {allocation.carryForwardBenefitNominal > 0 && (
            <Text size="sm" c="dimmed">
              Delaying some deductions adds about{" "}
              <Amount>{formatApproxCAD(allocation.carryForwardBenefitNominal)}</Amount> to modeled
              after-tax value versus claiming all RRSP deductions now.
            </Text>
          )}
        </Stack>
      )}

      <div className={classes.total}>
        <Group justify="space-between" align="baseline" gap="sm">
          <Text fw={600}>Modeled after-tax value at retirement</Text>
          <span className={classes.totalValue}>
            About {formatApproxCAD(allocation.projectedAfterTaxTotalNominal, 1_000)}
          </span>
        </Group>
        <Text size="sm" c="dimmed">
          Future-dollar illustration, not a forecast. Projected refunds of about{" "}
          {formatApproxCAD(allocation.refundTotalNominal, 1_000)} are additional invested cash, not
          part of the split above. The search uses finer internal precision than the rounded
          display.
        </Text>
        <details>
          <summary className={classes.summary}>Show calculation detail</summary>
          <Stack gap="sm" mt="sm">
            {allocation.rrspDeductNow > 0 && (
              <Text size="sm">
                The current RRSP claim reduces modeled base taxable income from{" "}
                {formatCAD(input.currentIncome)} to {formatCAD(incomeAfterCurrentClaim)}. Its
                estimated current tax refund is {formatApproxCAD(estimatedCurrentRefund)}, an
                effective {(effectiveCurrentRefundRate * 100).toFixed(1)}% refund rate before
                investment distributions and unmodeled credits.
              </Text>
            )}
            <Text size="sm">
              Retirement valuation rates: RRSP balance haircut{" "}
              {(rrspWithdrawalRate * 100).toFixed(1)}%; effective tax on the full capital gain{" "}
              {input.capitalGainsTaxRatePct.toFixed(1)}%.
            </Text>
          </Stack>
        </details>
      </div>

      <Group gap="sm" wrap="nowrap" align="flex-start">
        <IconInfoCircle
          size={18}
          color="var(--pf-muted)"
          style={{ flexShrink: 0, marginTop: 3 }}
          aria-hidden
        />
        <Stack gap={4}>
          <Text fw={600}>Model limits</Text>
          <Text size="sm" c="dimmed">
            Only BC, ON, and NB are supported. The model holds returns and tax law constant and
            excludes annual room accrual, pension adjustments, dividend credits, OAS clawback, and
            market uncertainty. Small assumption changes can change the split. Check your
            contribution room and tax details before relying on it.
          </Text>
          <Anchor href="#model-assumptions" size="sm" ff="monospace" c="ledger" py={6}>
            Review detailed assumptions →
          </Anchor>
        </Stack>
      </Group>
    </Stack>
  );
}
