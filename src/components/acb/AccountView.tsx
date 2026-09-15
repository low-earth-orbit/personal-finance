import { Paper, Stack, Table, Title } from "@mantine/core";
import HoldingsTable from "./HoldingsTable";
import { formatCADDecimal } from "@/utils/format";
import { computeHoldings, computeMarginInterest, type AccountGroup } from "@/utils/acb/parser";

type AccountSectionProps = {
  group: AccountGroup;
  /** Display label for the account header (broker-aware when pooling brokerages). */
  accountLabel: (group: AccountGroup) => string;
};

const AccountSection = ({ group, accountLabel }: AccountSectionProps) => {
  if (group.isRegistered) {
    return null;
  }

  const header = accountLabel(group);
  const holdings = computeHoldings(group.transactions);
  const marginInterest = computeMarginInterest(group.transactions);
  const marginYears = Object.keys(marginInterest)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Title order={3} fz="lg">
          {header}
        </Title>
        <HoldingsTable holdings={holdings} transactions={group.transactions} />
        {marginYears.length > 0 && (
          <Stack gap="xs">
            <Title order={4} fz="md">
              Margin Interest Paid
            </Title>
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tax Year</Table.Th>
                  <Table.Th ta="right">Interest Paid</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {marginYears.map((year) => (
                  <Table.Tr key={year}>
                    <Table.Td>{year}</Table.Td>
                    <Table.Td ta="right">{formatCADDecimal(marginInterest[year])}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
};

type AccountViewProps = {
  groups: AccountGroup[];
  /** Display label for each account header (broker-aware when pooling brokerages). */
  accountLabel: (group: AccountGroup) => string;
};

/**
 * By-account breakdown: one section per non-registered (broker, accountId,
 * accountType) group. Registered accounts (TFSA / RRSP / FHSA) are filtered
 * out and not shown. Book costs are raw transaction-derived figures with NO T3
 * or opening-lot adjustments — per-symbol adjustments can't be allocated to a
 * single account, and the unadjusted number is what broker statements show,
 * which is the point of this reconciliation view.
 */
const AccountView = ({ groups, accountLabel }: AccountViewProps) => (
  <Stack gap="lg">
    {groups.map((group) => (
      <AccountSection
        key={`${group.broker ?? ""}|${group.accountId}|${group.accountType}`}
        group={group}
        accountLabel={accountLabel}
      />
    ))}
  </Stack>
);

export default AccountView;
