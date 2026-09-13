import { useState } from "react";
import { Alert, Container, List, Paper, Stack, Table, Tabs, Text, Title } from "@mantine/core";
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
  buildAllDatedAdjustments,
  computeAdjustedHoldings,
  computeMarginInterest,
  detectOverlappingFiles,
  groupByAccount,
  parseFiles,
  overrideKey,
  resolveRegistered,
  sumOpeningLot,
  symbolsWithMixedCurrencies,
  transferLotsForSymbol,
  type AccountRegistrationOverrides,
  type AcbTransaction,
  type AccountGroup,
  type OpeningLotEntries,
  type ParsedFile,
  type T3Entry,
  type T3Slips,
} from "@/utils/acb/parser";

const BROKER_LABELS: Record<string, string> = {
  wealthsimple: "Wealthsimple",
  questrade: "Questrade",
  ibkr: "IBKR",
};

function fileBroker(file: ParsedFile): string {
  return file.transactions[0]?.broker ?? "unknown";
}

/** "TYPE · ID" label for an account group, or "Unknown account". */
function accountLabel(group: AccountGroup, showBroker: boolean): string {
  const base =
    [group.accountType, group.accountId].filter(Boolean).join(" · ") || "Unknown account";
  if (!showBroker) return base;
  const brokerLabel =
    group.broker !== undefined ? (BROKER_LABELS[group.broker] ?? group.broker) : "Unknown broker";
  return `${brokerLabel} · ${base}`;
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
  const showBroker = new Set(loadedFiles.map(fileBroker)).size > 1;

  function isRegisteredTransaction(tx: AcbTransaction): boolean {
    return resolveRegistered(tx.accountId ?? "", tx.accountType ?? "", accountOverrides);
  }

  // Pool across ALL uploaded brokerages and accounts: the CRA identical-property
  // rule averages each symbol over every non-registered account the taxpayer
  // holds, wherever it is. Per-broker figures would each be wrong when a ticker
  // is held in more than one place.
  const transactions = loadedFiles
    .flatMap((file) => file.transactions)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  // The Holdings tab combines non-registered accounts and excludes
  // TFSA/RRSP/FHSA. The By account tab still receives every account for
  // reconciliation.
  const nonRegisteredTransactions = transactions.filter((tx) => !isRegisteredTransaction(tx));
  // Time-ordered ledger: transfer opening costs and T3 nets join the pool on
  // their dates so later sells allocate over the adjusted pool.
  const datedBySymbol = buildAllDatedAdjustments(
    nonRegisteredTransactions,
    openingLotEntries,
    t3Slips,
  );
  // Symbols with transfer lots whose opening ACB is still unentered ($0 or
  // missing): the pool is incomplete, so ROC shortfalls clamp without
  // reporting a deemed gain that full basis might erase.
  const incompleteSymbols = new Set<string>();
  for (const symbol of new Set(nonRegisteredTransactions.map((tx) => tx.symbol))) {
    if (!symbol) continue;
    const lots = transferLotsForSymbol(nonRegisteredTransactions, symbol);
    if (lots.length === 0) continue;
    const acbs = openingLotEntries[symbol] ?? [];
    if (lots.some((_, index) => !(acbs[index] > 0))) incompleteSymbols.add(symbol);
  }
  const holdings = computeAdjustedHoldings(nonRegisteredTransactions, datedBySymbol, {
    incompleteSymbols,
  });
  const visibleHoldings = holdings.filter((h) => h.shares > 0);
  const mixedCurrencySymbols = symbolsWithMixedCurrencies(nonRegisteredTransactions);
  // Overlap is checked within each brokerage: identical account keys across
  // brokerages are different accounts, not duplicate uploads.
  const overlappingFiles = (() => {
    const byBroker = new Map<string, AcbTransaction[][]>();
    for (const file of loadedFiles) {
      const key = fileBroker(file);
      const list = byBroker.get(key) ?? [];
      list.push(file.transactions);
      byBroker.set(key, list);
    }
    return [...byBroker.values()].some(
      (fileTransactions) => fileTransactions.length > 1 && detectOverlappingFiles(fileTransactions),
    );
  })();
  const marginInterest = computeMarginInterest(nonRegisteredTransactions);
  const marginYears = Object.keys(marginInterest)
    .map(Number)
    .sort((a, b) => a - b);
  const accountGroups = groupByAccount(transactions, accountOverrides);
  const accountTypeMarkerAccounts = accountGroups.map((group) => ({
    accountId: group.accountId,
    accountType: group.accountType,
    broker: group.broker,
    detectedRegistered: group.isRegistered,
  }));
  const hasUnknownAccountTypes = accountTypeMarkerAccounts.some(
    (account) => account.accountType === "",
  );
  const showAccountTypeMarker = hasUnknownAccountTypes;
  const hasDefaultedUnknownAccountTypes = accountTypeMarkerAccounts.some(
    (account) =>
      account.accountType === "" &&
      accountOverrides[overrideKey(account.broker, account.accountId)] === undefined,
  );
  // Total opening-lot ACB per symbol, summed across its transfer lots — shown
  // as badges next to the transfer controls (the pool itself already includes
  // each lot on its date via the time-ordered ledger).
  const openingLotTotals: Record<string, number> = {};
  for (const symbol of Object.keys(openingLotEntries)) {
    openingLotTotals[symbol] = sumOpeningLot(openingLotEntries[symbol]);
  }
  const totalCostBasis = visibleHoldings.reduce((sum, holding) => sum + holding.costBasis, 0);
  // Deemed gains (ROC exceeding ACB) are current-year income on top of the pool.
  const deemedGains: { symbol: string; year: number; amount: number }[] = [];
  for (const holding of holdings) {
    for (const [year, amount] of Object.entries(holding.deemedGainByYear)) {
      deemedGains.push({ symbol: holding.symbol, year: Number(year), amount });
    }
  }
  deemedGains.sort((a, b) => a.year - b.year || a.symbol.localeCompare(b.symbol));
  const oversoldSymbols = holdings.filter((h) => h.oversold).map((h) => h.symbol);
  const fileSummaries: UploadedFileSummary[] = loadedFiles.map((file) => {
    const fileRegisteredAccounts = groupByAccount(file.transactions, accountOverrides).filter(
      (g) => g.isRegistered,
    );
    const excludedLabels = fileRegisteredAccounts
      .filter((group) => group.accountId !== "" || group.accountType !== "")
      .map((group) => accountLabel(group, showBroker));
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
            Pooled across all non-registered accounts and brokerages (CRA identical-property rule).
            ACB per share = total cost basis ÷ shares held. Sells reduce both shares and the cost
            basis pool pro-rata, so ACB/share stays constant after a sale. Phantom/reinvested
            distributions (Edit T3) and transfer opening costs (Edit transfers) join the pool on
            their dates, so later sells allocate over the adjusted pool — the year-by-year breakdown
            includes them too.
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
                dated: datedBySymbol,
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
                <List.Item>
                  Export your account activity (Wealthsimple CSV, Questrade spreadsheet, or IBKR
                  activity statement). You can combine brokerages — holdings pool across all of
                  them.
                </List.Item>
                <List.Item>
                  Upload one or more files. Everything is parsed locally in your browser — nothing
                  is uploaded.
                </List.Item>
                <List.Item>
                  Review your pooled ACB. Enter phantom/reinvested amounts (non-cash only, not full
                  Box 21) plus Box 42, and the opening-lot ACB for any transferred-in shares.
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
        {mixedCurrencySymbols.length > 0 && (
          <Alert color="yellow" title="Mixed currencies detected">
            <Text size="sm">
              {mixedCurrencySymbols.join(", ")}: transactions span more than one currency. ACB
              assumes a single currency per holding — convert each transaction to CAD using the
              exchange rate at the time before relying on these figures. The pooled total below also
              mixes currencies.
            </Text>
          </Alert>
        )}
        {oversoldSymbols.length > 0 && (
          <Alert color="yellow" title="Sales exceed recorded purchases">
            <Text size="sm">
              {oversoldSymbols.join(", ")}: more shares were sold than the uploads account for —
              purchase history is missing (an older file, or a transfer whose opening ACB was never
              entered). The pool was reset to $0, so ACB is understated until the history is added.
            </Text>
          </Alert>
        )}
        {deemedGains.length > 0 && (
          <Alert color="red" title="Deemed capital gains (ROC exceeded ACB)">
            <Text size="sm">
              Return of capital drove the pool below zero, which the CRA deems a capital gain in
              that year (pool reset to $0):{" "}
              {deemedGains
                .map((g) => `${g.symbol} ${g.year}: ${formatCADDecimal(g.amount)}`)
                .join("; ")}
              . Report these on Schedule 3 — they are not included in the cost basis total.
            </Text>
          </Alert>
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
                    Some uploaded accounts do not say whether they are registered. Mark each unknown
                    account so registered accounts are excluded from ACB.
                  </Text>
                </Alert>
              )}
              <AccountTypeMarker
                accounts={accountTypeMarkerAccounts}
                overrides={accountOverrides}
                onChange={(overrideId, value) =>
                  setAccountOverrides((prev) => ({ ...prev, [overrideId]: value }))
                }
                showBroker={showBroker}
                brokerLabels={BROKER_LABELS}
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
                    pooled across all non-registered accounts and brokerages; use the Holdings tab
                    for tax figures.
                  </Text>
                </Alert>
                <AccountView
                  groups={accountGroups}
                  accountLabel={(group) => accountLabel(group, showBroker)}
                />
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
