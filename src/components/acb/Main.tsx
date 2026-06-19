import { useState } from "react";
import {
  Alert,
  Container,
  List,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import AccountTypeMarker from "./AccountTypeMarker";
import AccountView from "./AccountView";
import FilePreviewModal from "./FilePreviewModal";
import FileUpload, { type UploadedFileSummary } from "./FileUpload";
import HoldingsTable from "./HoldingsTable";
import SummaryBar from "./SummaryBar";
import T3Modal from "./T3Modal";
import TransferModal from "./TransferModal";
import { formatCADDecimal } from "@/utils/format";
import {
  applyAdjustments,
  computeHoldings,
  computeMarginInterest,
  detectOverlappingFiles,
  groupByAccount,
  hasMixedCurrencies,
  parseFiles,
  resolveRegistered,
  sumOpeningLot,
  t3NetAdjustment,
  transferLotsForSymbol,
  type AccountRegistrationOverrides,
  type AcbTransaction,
  type AccountGroup,
  type OpeningLotEntries,
  type ParsedFile,
  type T3Entry,
  type T3Slips,
} from "@/utils/acb/parser";

type BrokerKey = NonNullable<AcbTransaction["broker"]>;
type FileBroker = BrokerKey | "unknown";

const BROKER_ORDER: BrokerKey[] = ["wealthsimple", "questrade", "ibkr"];

const BROKER_LABELS: Record<BrokerKey, string> = {
  wealthsimple: "Wealthsimple",
  questrade: "Questrade",
  ibkr: "IBKR",
};

function fileBroker(file: ParsedFile): FileBroker {
  return file.transactions[0]?.broker ?? "unknown";
}

/** "TYPE · ID" label for an account group, or "Unknown account". */
function accountLabel(group: AccountGroup): string {
  return [group.accountType, group.accountId].filter(Boolean).join(" · ") || "Unknown account";
}

/** `{ min, max }` over dated transactions; null when none carry a date. */
function dateRangeOf(transactions: AcbTransaction[]): { min: string; max: string } | null {
  let min = "";
  let max = "";
  for (const tx of transactions) {
    const date = tx.date ?? "";
    if (date === "") continue;
    if (min === "" || date < min) min = date;
    if (date > max) max = date;
  }
  return min === "" ? null : { min, max };
}

/** "142 transactions · 2023-01-03 – 2024-12-30" summary line for one file. */
function fileDetail(file: ParsedFile): string {
  const count = file.transactions.length;
  const countLabel = `${count} transaction${count === 1 ? "" : "s"}`;
  const range = dateRangeOf(file.transactions);
  return range ? `${countLabel} · ${range.min} – ${range.max}` : countLabel;
}

const Main = () => {
  const [loadedFiles, setLoadedFiles] = useState<ParsedFile[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [t3Slips, setT3Slips] = useState<T3Slips>({});
  const [t3ModalSymbol, setT3ModalSymbol] = useState<string | null>(null);
  const [openingLotEntries, setOpeningLotEntries] = useState<OpeningLotEntries>({});
  const [transferModalSymbol, setTransferModalSymbol] = useState<string | null>(null);
  const [previewFileIndex, setPreviewFileIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>("holdings");
  const [activeBroker, setActiveBroker] = useState<string | null>(null);
  const [accountOverrides, setAccountOverrides] = useState<AccountRegistrationOverrides>({});

  async function handleFilesAdded(newFiles: File[]) {
    const { parsed, errors } = await parseFiles(newFiles);
    setParseErrors(errors);
    if (parsed.length > 0) {
      setLoadedFiles((prev) => [...prev, ...parsed]);
    }
  }

  function handleRemoveFile(index: number) {
    setLoadedFiles((prev) => prev.filter((_, i) => i !== index));
    // Keep the preview pointing at the same file (or close it if removed).
    setPreviewFileIndex((prev) => {
      if (prev === null || prev < index) return prev;
      if (prev === index) return null;
      return prev - 1;
    });
  }

  function handleUpdateTransaction(
    fileIndex: number,
    rowIndex: number,
    patch: Partial<AcbTransaction>,
  ) {
    // Holdings, overlap detection, and margin interest derive from loadedFiles
    // below, so they recompute automatically on this update.
    setLoadedFiles((prev) =>
      prev.map((file, i) =>
        i === fileIndex
          ? {
              ...file,
              transactions: file.transactions.map((tx, j) =>
                j === rowIndex ? { ...tx, ...patch } : tx,
              ),
            }
          : file,
      ),
    );
  }

  function handleDeleteTransaction(fileIndex: number, rowIndex: number) {
    setLoadedFiles((prev) =>
      prev.map((file, i) =>
        i === fileIndex
          ? {
              ...file,
              transactions: file.transactions.filter((_, j) => j !== rowIndex),
            }
          : file,
      ),
    );
  }

  function handleEditT3(symbol: string) {
    setT3ModalSymbol(symbol);
  }

  function handleT3EntriesChange(entries: T3Entry[]) {
    if (t3ModalSymbol === null) return;
    const symbol = t3ModalSymbol;
    setT3Slips((prev) => ({ ...prev, [symbol]: entries }));
  }

  function handleEditTransfers(symbol: string) {
    setTransferModalSymbol(symbol);
  }

  function handleOpeningLotEntriesChange(acbs: number[]) {
    if (transferModalSymbol === null) return;
    const symbol = transferModalSymbol;
    setOpeningLotEntries((prev) => ({ ...prev, [symbol]: acbs }));
  }

  const hasFiles = loadedFiles.length > 0;
  const presentBrokers = new Set(loadedFiles.map(fileBroker));
  const availableBrokers = BROKER_ORDER.filter((broker) => presentBrokers.has(broker));
  const effectiveBroker =
    activeBroker !== null && availableBrokers.includes(activeBroker as BrokerKey)
      ? activeBroker
      : (availableBrokers[0] ?? null);
  const activeFiles =
    effectiveBroker === null
      ? []
      : loadedFiles.filter((file) => fileBroker(file) === effectiveBroker);

  function isRegisteredTransaction(tx: AcbTransaction): boolean {
    return resolveRegistered(tx.accountId ?? "", tx.accountType ?? "", accountOverrides);
  }

  // Merge active brokerage files into one chronologically sorted transaction list.
  const transactions = activeFiles
    .flatMap((file) => file.transactions)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  // ACB pools across all of a taxpayer's non-registered accounts (CRA rule),
  // so the Holdings tab combines them and excludes TFSA/RRSP/FHSA. The By
  // account tab still receives every account for reconciliation.
  const nonRegisteredTransactions = transactions.filter((tx) => !isRegisteredTransaction(tx));
  const holdings = computeHoldings(nonRegisteredTransactions);
  const visibleHoldings = holdings.filter((h) => h.shares > 0);
  const mixedCurrencies = hasMixedCurrencies(transactions);
  const overlappingFiles = detectOverlappingFiles(activeFiles.map((file) => file.transactions));
  const marginInterest = computeMarginInterest(nonRegisteredTransactions);
  const marginYears = Object.keys(marginInterest)
    .map(Number)
    .sort((a, b) => a - b);
  const accountGroups = groupByAccount(transactions, accountOverrides);
  const accountTypeMarkerAccounts = accountGroups.map((group) => ({
    accountId: group.accountId,
    accountType: group.accountType,
    detectedRegistered: group.isRegistered,
  }));
  const hasUnknownAccountTypes = accountTypeMarkerAccounts.some(
    (account) => account.accountType === "",
  );
  const showAccountTypeMarker = effectiveBroker === "ibkr" && hasUnknownAccountTypes;
  const hasDefaultedUnknownAccountTypes = accountTypeMarkerAccounts.some(
    (account) => account.accountType === "" && accountOverrides[account.accountId] === undefined,
  );
  // Total opening-lot ACB per symbol, summed across its transfer lots — the
  // single number `applyAdjustments` and HoldingsTable consume.
  const openingLotTotals: Record<string, number> = {};
  for (const symbol of Object.keys(openingLotEntries)) {
    openingLotTotals[symbol] = sumOpeningLot(openingLotEntries[symbol]);
  }
  const totalCostBasis = visibleHoldings.reduce(
    (sum, holding) =>
      sum +
      applyAdjustments(
        holding,
        openingLotTotals[holding.symbol] ?? 0,
        t3NetAdjustment(t3Slips[holding.symbol] ?? []),
      ).costBasis,
    0,
  );
  const fileSummaries: UploadedFileSummary[] = loadedFiles.map((file) => {
    const fileRegisteredAccounts = groupByAccount(file.transactions, accountOverrides).filter(
      (g) => g.isRegistered,
    );
    const excludedLabels = fileRegisteredAccounts
      .map(accountLabel)
      .filter((label) => label !== "Unknown account");
    const excludedTxCount = fileRegisteredAccounts.reduce(
      (sum, group) => sum + group.transactions.length,
      0,
    );
    return {
      name: file.name,
      detail: fileDetail(file),
      excludedAccounts: excludedLabels.length > 0 ? excludedLabels : undefined,
      excludedTransactionCount: excludedTxCount > 0 ? excludedTxCount : undefined,
    };
  });
  const previewFile = previewFileIndex !== null ? (loadedFiles[previewFileIndex] ?? null) : null;
  const modalEntries = t3ModalSymbol !== null ? (t3Slips[t3ModalSymbol] ?? []) : [];
  const transferLots =
    transferModalSymbol !== null
      ? transferLotsForSymbol(nonRegisteredTransactions, transferModalSymbol)
      : [];
  const transferAcbs =
    transferModalSymbol !== null ? (openingLotEntries[transferModalSymbol] ?? []) : [];

  // Shared between the gated Tabs layout and the no-tabs layout below.
  const holdingsPanel = (
    <Stack gap="lg">
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Title order={2} fz="lg">
            Holdings
          </Title>
          <Text c="dimmed" size="sm">
            Pooled across all non-registered accounts (CRA rule). ACB per share = total cost basis ÷
            shares held. Sells reduce both shares and the cost basis pool pro-rata, so ACB/share
            stays constant after a sale. Expand a row for its year-by-year ACB history. Click{" "}
            <strong>Edit T3</strong> to enter capital gains distributions (box 21, adds to ACB) and
            return of capital (box 42, reduces ACB) from your T3 slips, per tax year. For holdings
            with transferred-in shares, click <strong>Edit transfers</strong> to enter the opening
            lot ACB (total cost basis) for each transferred lot, so the ACB is complete.
          </Text>
          {visibleHoldings.length > 0 ? (
            <HoldingsTable
              holdings={holdings}
              transactions={nonRegisteredTransactions}
              adjustments={{
                t3Slips,
                onEditT3: handleEditT3,
                openingLots: openingLotTotals,
                onEditTransfers: handleEditTransfers,
              }}
            />
          ) : (
            <Text c="dimmed" size="sm">
              No non-registered holdings found.
            </Text>
          )}
        </Stack>
      </Paper>
      {marginYears.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Title order={2} fz="lg">
              Margin Interest Paid
            </Title>
            <Text c="dimmed" size="sm">
              Potentially deductible against taxable income (line 22100)
            </Text>
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
        </Paper>
      )}
    </Stack>
  );

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <Paper withBorder p="md" radius="md">
          <FileUpload
            files={fileSummaries}
            onFilesAdded={handleFilesAdded}
            onRemoveFile={handleRemoveFile}
            onPreview={setPreviewFileIndex}
          />
        </Paper>
        {parseErrors.length > 0 && (
          <Alert color="red" title="Could not read file(s)">
            <List size="sm">
              {parseErrors.map((error) => (
                <List.Item key={error}>{error}</List.Item>
              ))}
            </List>
          </Alert>
        )}
        {!hasFiles && (
          <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
              <Title order={2} fz="lg">
                How it works
              </Title>
              <List type="ordered" size="sm" spacing="xs">
                <List.Item>Export your account activity as a CSV from Wealthsimple.</List.Item>
                <List.Item>
                  Upload one or more files. Everything is parsed locally in your browser — nothing
                  is uploaded.
                </List.Item>
                <List.Item>
                  Review your pooled ACB. Enter T3 amounts (box 21 / box 42) and the opening-lot ACB
                  for any transferred-in shares.
                </List.Item>
              </List>
            </Stack>
          </Paper>
        )}
        {overlappingFiles && (
          <Alert color="yellow" title="Overlapping date ranges detected">
            <Text size="sm">
              Overlapping date ranges detected across files — transactions may be duplicated. Check
              that each file covers a distinct date range.
            </Text>
          </Alert>
        )}
        {mixedCurrencies && (
          <Alert color="yellow" title="Mixed currencies detected">
            <Text size="sm">
              This export contains both CAD and USD holdings. ACB calculations assume a single
              currency. USD holdings will need separate ACB tracking in CAD using the exchange rate
              at the time of each transaction.
            </Text>
          </Alert>
        )}
        {hasFiles && effectiveBroker !== null && availableBrokers.length > 1 && (
          <SegmentedControl
            aria-label="Brokerage"
            data={availableBrokers.map((broker) => ({
              value: broker,
              label: BROKER_LABELS[broker],
            }))}
            value={effectiveBroker}
            onChange={setActiveBroker}
          />
        )}
        {hasFiles && (
          <SummaryBar
            totalCostBasis={totalCostBasis}
            holdingsCount={visibleHoldings.length}
            transactionCount={nonRegisteredTransactions.length}
            dateRange={dateRangeOf(nonRegisteredTransactions)}
          />
        )}
        {hasFiles && showAccountTypeMarker && (
          <Paper withBorder p="md" radius="md">
            <Stack gap="md">
              {hasDefaultedUnknownAccountTypes && (
                <Alert color="yellow" title="Mark account types">
                  <Text size="sm">
                    IBKR consolidated statements do not say which sub-account is registered. Mark
                    each account so RRSP/TFSA/FHSA accounts are excluded from ACB.
                  </Text>
                </Alert>
              )}
              <AccountTypeMarker
                accounts={accountTypeMarkerAccounts}
                overrides={accountOverrides}
                onChange={(accountId, value) =>
                  setAccountOverrides((prev) => ({ ...prev, [accountId]: value }))
                }
              />
            </Stack>
          </Paper>
        )}
        {hasFiles && (
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="holdings">Holdings</Tabs.Tab>
              <Tabs.Tab value="byAccount">By account</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="holdings" pt="lg">
              {holdingsPanel}
            </Tabs.Panel>
            <Tabs.Panel value="byAccount" pt="lg">
              <Stack gap="lg">
                <Alert color="yellow" title="For reconciliation only">
                  <Text size="sm">
                    Book costs below are per account and unadjusted — no T3 or opening-lot
                    adjustments — matching what your account statements show. The CRA requires ACB
                    pooled across all non-registered accounts; use the Holdings tab for tax figures.
                  </Text>
                </Alert>
                <AccountView groups={accountGroups} />
              </Stack>
            </Tabs.Panel>
          </Tabs>
        )}
        <FilePreviewModal
          file={previewFile}
          fileIndex={previewFileIndex}
          onUpdateTransaction={handleUpdateTransaction}
          onDeleteTransaction={handleDeleteTransaction}
          onClose={() => setPreviewFileIndex(null)}
        />
        <T3Modal
          symbol={t3ModalSymbol}
          entries={modalEntries}
          onChange={handleT3EntriesChange}
          onClose={() => setT3ModalSymbol(null)}
        />
        <TransferModal
          symbol={transferModalSymbol}
          lots={transferLots}
          acbs={transferAcbs}
          onChange={handleOpeningLotEntriesChange}
          onClose={() => setTransferModalSymbol(null)}
        />
      </Stack>
    </Container>
  );
};

export default Main;
