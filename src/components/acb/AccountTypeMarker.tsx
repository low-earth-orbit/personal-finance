import { Group, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import {
  overrideKey,
  type AccountRegistrationOverrides,
  type AcbTransaction,
} from "@/utils/acb/parser";

type AccountTypeMarkerAccount = {
  accountId: string;
  accountType: string;
  broker?: AcbTransaction["broker"];
  detectedRegistered: boolean;
};

type AccountTypeMarkerProps = {
  accounts: AccountTypeMarkerAccount[];
  overrides: AccountRegistrationOverrides;
  onChange: (overrideId: string, value: AccountRegistrationOverrides[string]) => void;
  /** Prefix rows with the brokerage when uploads span more than one. */
  showBroker?: boolean;
  brokerLabels?: Record<string, string>;
};

function accountName(accountId: string): string {
  return accountId === "" ? "Unknown account" : accountId;
}

function rowLabel(
  account: AccountTypeMarkerAccount,
  showBroker: boolean,
  brokerLabels: Record<string, string>,
): string {
  const name = accountName(account.accountId);
  if (!showBroker || account.broker === undefined) return name;
  return `${brokerLabels[account.broker] ?? account.broker} · ${name}`;
}

const AccountTypeMarker = ({
  accounts,
  overrides,
  onChange,
  showBroker = false,
  brokerLabels = {},
}: AccountTypeMarkerProps) => {
  const unknownAccounts = accounts.filter((account) => account.accountType === "");
  const knownAccounts = accounts.filter((account) => account.accountType !== "");

  return (
    <Stack gap="sm">
      <Title order={2} fz="lg">
        Account types
      </Title>
      <Text c="dimmed" size="sm">
        Registered accounts are excluded from ACB.
      </Text>
      {unknownAccounts.map((account) => {
        const key = overrideKey(account.broker, account.accountId);
        const label = rowLabel(account, showBroker, brokerLabels);
        return (
          <Group key={key} justify="space-between" gap="md" wrap="wrap">
            <Text fw={600}>{label}</Text>
            <SegmentedControl
              aria-label={`${label} account type`}
              data={[
                { value: "nonRegistered", label: "Non-registered" },
                { value: "registered", label: "Registered" },
              ]}
              value={overrides[key] ?? "nonRegistered"}
              onChange={(value) => onChange(key, value as AccountRegistrationOverrides[string])}
            />
          </Group>
        );
      })}
      {knownAccounts.map((account) => (
        <Group
          key={`${account.broker ?? ""}|${account.accountId}|${account.accountType}`}
          justify="space-between"
          gap="md"
        >
          <Text c="dimmed">{rowLabel(account, showBroker, brokerLabels)}</Text>
          <Text c="dimmed" size="sm">
            {account.detectedRegistered ? "Registered" : "Non-registered"} (detected)
          </Text>
        </Group>
      ))}
    </Stack>
  );
};

export default AccountTypeMarker;
