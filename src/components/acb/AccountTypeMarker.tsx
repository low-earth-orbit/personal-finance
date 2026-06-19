import { Group, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import type { AccountRegistrationOverrides } from "@/utils/acb/parser";

type AccountTypeMarkerAccount = {
  accountId: string;
  accountType: string;
  detectedRegistered: boolean;
};

type AccountTypeMarkerProps = {
  accounts: AccountTypeMarkerAccount[];
  overrides: AccountRegistrationOverrides;
  onChange: (accountId: string, value: AccountRegistrationOverrides[string]) => void;
};

function accountName(accountId: string): string {
  return accountId === "" ? "Unknown account" : accountId;
}

const AccountTypeMarker = ({ accounts, overrides, onChange }: AccountTypeMarkerProps) => {
  const unknownAccounts = accounts.filter((account) => account.accountType === "");
  const knownAccounts = accounts.filter((account) => account.accountType !== "");

  return (
    <Stack gap="sm">
      <Title order={2} fz="lg">
        Account types
      </Title>
      <Text c="dimmed" size="sm">
        Registered accounts (RRSP/TFSA/FHSA) are excluded from ACB.
      </Text>
      {unknownAccounts.map((account) => (
        <Group key={account.accountId} justify="space-between" gap="md" wrap="wrap">
          <Text fw={600}>{accountName(account.accountId)}</Text>
          <SegmentedControl
            aria-label={`${accountName(account.accountId)} account type`}
            data={[
              { value: "nonRegistered", label: "Non-registered" },
              { value: "registered", label: "Registered" },
            ]}
            value={overrides[account.accountId] ?? "nonRegistered"}
            onChange={(value) =>
              onChange(account.accountId, value as AccountRegistrationOverrides[string])
            }
          />
        </Group>
      ))}
      {knownAccounts.map((account) => (
        <Group key={`${account.accountId}:${account.accountType}`} justify="space-between" gap="md">
          <Text c="dimmed">{accountName(account.accountId)}</Text>
          <Text c="dimmed" size="sm">
            {account.detectedRegistered ? "Registered" : "Non-registered"} (detected)
          </Text>
        </Group>
      ))}
    </Stack>
  );
};

export default AccountTypeMarker;
