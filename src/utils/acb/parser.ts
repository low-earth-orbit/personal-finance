import { readSheetRows } from "./xlsx";

// Parser for brokerage account activity exports.
//
// Supports two formats:
// 1. The real Wealthsimple export with columns
//    `transaction_date,settlement_date,account_id,account_type,activity_type,
//     activity_sub_type,direction,symbol,name,currency,quantity,unit_price,
//     commission,net_cash_amount`, where transaction type is derived from
//    `activity_type` + `activity_sub_type` + `direction`.
// 2. A legacy format with a literal `Type` column (`buy`/`sell`/`dividend`).
//
// ACB semantics:
// - `buy` rows add the actual cash paid (`|net_cash_amount|` when present,
//   otherwise qty × price) to the symbol's cost basis pool and qty to its
//   share count (manual DRIP purchases are plain `buy` rows). Wealthsimple
//   rounds `unit_price` to 4 decimals, so qty × price can be off by a
//   fraction of a cent per row; `net_cash_amount` is the exact amount and
//   also includes any commission (CRA: ACB includes acquisition costs).
// - `sell` rows reduce the share count AND reduce the cost basis pool pro-rata
//   (CRA rule: pool × remaining_shares / shares_before_sell), so ACB/share is
//   unchanged by a sale but total cost basis decreases proportionally.
// - `dividend` rows do not contribute to ACB (the subsequent DRIP `buy` does).
// - `transfer` rows (SecurityTransfer) add shares with no cost basis; the user
//   supplies the opening lot ACB manually in the UI.

export type AcbTransaction = {
  symbol: string;
  quantity: number;
  price: number;
  type: "buy" | "sell" | "dividend" | "transfer" | "interest";
  /** ISO currency code from the optional Currency column; "CAD" when absent. */
  currency?: string;
  /** ISO date string from `transaction_date`; "" when the column is absent. */
  date?: string;
  /** Raw `activity_type` (or legacy `Type`) value as it appeared in the CSV. */
  rawActivityType?: string;
  /** Raw `account_id` column value; undefined when the column is absent. */
  accountId?: string;
  /** Raw `account_type` column value; undefined when the column is absent. */
  accountType?: string;
  /** Parsed `net_cash_amount` column value; undefined when absent. */
  netCashAmount?: number;
  /** Source brokerage parser that emitted this transaction. */
  broker?: "wealthsimple" | "questrade" | "ibkr";
};

/** One T3 slip's ACB-relevant amounts for a single tax year. */
export type T3Entry = {
  /** Tax year, e.g. 2024. */
  year: number;
  /**
   * Phantom / reinvested (non-cash) distributions. Adds to ACB.
   *
   * This is NOT the full T3 Box 21 amount: Box 21 lumps cash and
   * reinvested capital gains together, while only the reinvested
   * (phantom) portion — non-cash units you were taxed on but never
   * received — increases ACB. Get it from the fund's year-end
   * breakdown as reinvested $/unit × units held on record date.
   * For many equity ETFs Box 21 happens to equal phantom, but verify.
   */
  phantom: number;
  /** Box 42 — Amount Resulting in Cost Base Adjustment (ROC). Subtracts from ACB. */
  box42: number;
};

/** T3 entries keyed by symbol. */
export type T3Slips = Record<string, T3Entry[]>;

/** One transferred-in lot: its date and share count, from a `transfer` row. */
export type TransferLot = {
  /** ISO date string from the transfer row; "" when the column is absent. */
  date: string;
  /** Shares transferred in by this lot. */
  quantity: number;
};

/**
 * The transfer lots for one symbol, in chronological (CSV) order. Each lot is a
 * single `transfer` row the user must supply an opening ACB for. The user can't
 * aggregate multiple transfers themselves, so the UI shows one row per lot.
 *
 * Only positive-quantity (transfer-in) legs are lots: transfer-out legs from an
 * internal account-to-account move carry no opening cost of their own, and
 * prompting for one would double-count the cost entered against the in-leg.
 */
export function transferLotsForSymbol(
  transactions: AcbTransaction[],
  symbol: string,
): TransferLot[] {
  return transactions
    .filter((tx) => tx.symbol === symbol && tx.type === "transfer" && tx.quantity > 0)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .map((tx) => ({ date: tx.date ?? "", quantity: tx.quantity }));
}

/**
 * Per-lot opening ACB for each symbol's transferred-in shares, indexed in the
 * same order as `transferLotsForSymbol`. Entries default to 0 when the user
 * hasn't supplied an ACB for that lot yet.
 */
export type OpeningLotEntries = Record<string, number[]>;

/** Total opening-lot ACB across a symbol's transfer lots. */
export function sumOpeningLot(acbs: number[] | undefined): number {
  return (acbs ?? []).reduce((sum, acb) => sum + (acb || 0), 0);
}

export type AccountRegistrationOverrides = Record<string, "registered" | "nonRegistered">;

/** Collision-proof composite key (ids/types may contain spaces). */
function keyParts(...parts: (string | undefined)[]): string {
  return parts.map((part) => part ?? "").join("");
}

/**
 * Override-map key for one account: broker-scoped when the brokerage is known
 * so identical account IDs at different brokerages never share a marking,
 * plain `accountId` for brokerless (hand-built) rows.
 */
export function overrideKey(broker: AcbTransaction["broker"], accountId: string): string {
  return broker === undefined ? accountId : keyParts(broker, accountId);
}

/**
 * Resolve registered-account status from user override first, then parser
 * account type. Covers TFSA/RRSP/FHSA/RESP/RRIF/RDSP/LIRA-family/PRPP (and the
 * IBKR RRSP long name). Taxable labels such as Cash, Margin, Individual, or
 * Trust must not match — keep additions specific.
 */
export function resolveRegistered(
  accountId: string,
  accountType: string,
  overrides?: AccountRegistrationOverrides,
  broker?: AcbTransaction["broker"],
): boolean {
  if (overrides && overrideKey(broker, accountId) in overrides) {
    return overrides[overrideKey(broker, accountId)] === "registered";
  }
  return /tfsa|rrsp|fhsa|rrif|resp|rdsp|lira|lif|lrsp|rlsp|locked[ -]?in|prpp|registered retirement savings plan/i.test(
    accountType,
  );
}

/** Net ACB adjustment across all years: sum(phantom) − sum(box42). */
export function t3NetAdjustment(entries: T3Entry[]): number {
  return entries.reduce((sum, entry) => sum + entry.phantom - entry.box42, 0);
}

export type Holding = {
  symbol: string;
  /** Net shares: total bought plus transferred minus total sold. */
  shares: number;
  /** Remaining cost basis pool after pro-rata reductions on sells. */
  costBasis: number;
  /** costBasis / shares, or null when no shares remain (division by zero). */
  acbPerShare: number | null;
  /** Shares transferred in with no purchase history (no cost basis). */
  transferredShares: number;
};

export type ParseResult =
  | { ok: true; transactions: AcbTransaction[] }
  | { ok: false; error: string };

/** Split one CSV line into fields, honouring double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** Parse a numeric CSV field, tolerating `$` and thousands separators. */
function parseNumber(field: string | undefined): number {
  const cleaned = (field ?? "").trim().replace(/[$,]/g, "");
  return cleaned === "" ? 0 : Number(cleaned);
}

function normalizedHeader(field: string): string {
  return field.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Derive the transaction type from the Wealthsimple activity columns.
 * Returns null for activity types that don't affect holdings (deposits,
 * interest, fees, etc.).
 */
function mapActivityType(
  activityType: string,
  activitySubType: string,
  direction: string,
): AcbTransaction["type"] | null {
  const type = activityType.trim().toLowerCase();
  if (type === "trade") {
    const sub = activitySubType.trim().toLowerCase();
    const dir = direction.trim().toLowerCase();
    if (sub === "buy" && dir === "long") return "buy";
    if (sub === "sell" && dir === "short") return "sell";
    return null;
  }
  if (type === "dividend") return "dividend";
  if (type === "securitytransfer") return "transfer";
  if (type === "interestcharged") return "interest";
  return null;
}

export function parseWealthsimpleCsv(text: string): ParseResult {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { ok: false, error: "No transactions found" };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name);

  // Symbol / quantity / price columns differ between the two formats.
  const symbolIdx = col("symbol");
  const quantityIdx = col("quantity");
  const priceIdx = col("unit_price") !== -1 ? col("unit_price") : col("price");
  const typeIdx = col("type");
  const activityTypeIdx = col("activity_type");
  const activitySubTypeIdx = col("activity_sub_type");
  const directionIdx = col("direction");
  const currencyIdx = col("currency");
  const dateIdx = col("transaction_date");
  const accountIdIdx = col("account_id");
  const accountTypeIdx = col("account_type");
  const netCashAmountIdx = col("net_cash_amount");

  // The legacy `Type` column wins when present; otherwise require the
  // Wealthsimple activity columns.
  const hasLegacyType = typeIdx !== -1;
  const missing: string[] = [];
  if (symbolIdx === -1) missing.push(hasLegacyType ? "Symbol" : "symbol");
  if (quantityIdx === -1) {
    missing.push(hasLegacyType ? "Quantity" : "quantity");
  }
  if (priceIdx === -1) missing.push(hasLegacyType ? "Price" : "unit_price");
  if (!hasLegacyType && activityTypeIdx === -1) {
    missing.push("activity_type (or Type)");
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    };
  }

  const transactions: AcbTransaction[] = [];
  for (const line of lines.slice(1)) {
    const fields = splitCsvLine(line);
    const field = (idx: number): string => (idx === -1 ? "" : (fields[idx] ?? "").trim());

    let type: AcbTransaction["type"] | null;
    let rawActivityType: string;
    if (hasLegacyType) {
      rawActivityType = field(typeIdx);
      const legacy = rawActivityType.toLowerCase();
      type =
        legacy === "buy" || legacy === "sell" || legacy === "dividend" || legacy === "transfer"
          ? legacy
          : null;
    } else {
      rawActivityType = field(activityTypeIdx);
      type = mapActivityType(rawActivityType, field(activitySubTypeIdx), field(directionIdx));
    }
    if (type === null) continue; // ignore deposits, deposit interest, fees, etc.

    const symbol = field(symbolIdx);
    // Interest-charged rows have no symbol; everything else requires one.
    if (!symbol && type !== "interest") continue;
    const quantity = parseNumber(fields[quantityIdx]);
    const price = parseNumber(fields[priceIdx]);
    const rawCurrency = field(currencyIdx);
    const accountId = field(accountIdIdx);
    const accountType = field(accountTypeIdx);
    const rawNetCash = field(netCashAmountIdx);
    transactions.push({
      symbol,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      price: Number.isFinite(price) ? price : 0,
      type,
      broker: "wealthsimple",
      currency: rawCurrency === "" ? "CAD" : rawCurrency.toUpperCase(),
      date: field(dateIdx),
      rawActivityType,
      ...(accountId !== "" ? { accountId } : {}),
      ...(accountType !== "" ? { accountType } : {}),
      ...(rawNetCash !== "" ? { netCashAmount: parseNumber(rawNetCash) } : {}),
    });
  }

  if (transactions.length === 0) {
    return { ok: false, error: "No transactions found" };
  }

  return { ok: true, transactions };
}

export function parseQuestradeRows(rows: string[][]): ParseResult {
  if (rows.length === 0) {
    return { ok: false, error: "No transactions found" };
  }

  const header = rows[0].map(normalizedHeader);
  const col = (name: string): number => header.indexOf(normalizedHeader(name));
  const symbolIdx = col("Symbol");
  const quantityIdx = col("Quantity");
  const priceIdx = col("Price");
  const actionIdx = col("Action");
  const activityTypeIdx = col("Activity Type");
  const currencyIdx = col("Currency");
  const dateIdx = col("Transaction Date");
  const accountIdIdx = col("Account #");
  const accountTypeIdx = col("Account Type");
  const netAmountIdx = col("Net Amount");

  const missing: string[] = [];
  if (symbolIdx === -1) missing.push("Symbol");
  if (quantityIdx === -1) missing.push("Quantity");
  if (priceIdx === -1) missing.push("Price");
  if (actionIdx === -1) missing.push("Action");
  if (activityTypeIdx === -1) missing.push("Activity Type");
  if (netAmountIdx === -1) missing.push("Net Amount");
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    };
  }

  const transactions: AcbTransaction[] = [];
  for (const row of rows.slice(1)) {
    const field = (idx: number): string => (idx === -1 ? "" : (row[idx] ?? "").trim());
    const rawActivityType = field(activityTypeIdx);
    const action = field(actionIdx).toLowerCase();
    let type: AcbTransaction["type"] | null = null;
    if (action === "buy") type = "buy";
    else if (action === "sell") type = "sell";
    else if (rawActivityType.toLowerCase() === "dividends") type = "dividend";
    if (type === null) continue;

    const symbol = field(symbolIdx);
    if (!symbol) continue;
    const quantity = parseNumber(field(quantityIdx));
    const price = parseNumber(field(priceIdx));
    const accountId = field(accountIdIdx);
    const accountType = field(accountTypeIdx);
    transactions.push({
      symbol,
      quantity: Number.isFinite(quantity) ? Math.abs(quantity) : 0,
      price: Number.isFinite(price) ? price : 0,
      type,
      broker: "questrade",
      currency: field(currencyIdx) === "" ? "CAD" : field(currencyIdx).toUpperCase(),
      date: field(dateIdx).slice(0, 10),
      rawActivityType,
      ...(accountId !== "" ? { accountId } : {}),
      ...(accountType !== "" ? { accountType } : {}),
      netCashAmount: parseNumber(field(netAmountIdx)),
    });
  }

  if (transactions.length === 0) {
    return { ok: false, error: "No transactions found" };
  }

  return { ok: true, transactions };
}

export function parseIbkrCsv(text: string): ParseResult {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  let statementAccountType = "";
  let statementCustomerType = "";
  let isConsolidated = false;
  const transactions: AcbTransaction[] = [];

  for (const line of lines) {
    const fields = splitCsvLine(line);
    if (fields[0] === "Account Information" && fields[1] === "Data") {
      const name = (fields[2] ?? "").trim();
      const value = fields.slice(3).join(",").trim();
      if (name === "Account Type" && value !== "") {
        statementAccountType = value;
      } else if (name === "Customer Type" && value !== "") {
        statementCustomerType = value;
      } else if (name === "Account" && /consolidated/i.test(value)) {
        isConsolidated = true;
      } else if (
        name === "Accounts Included" &&
        value
          .split(",")
          .map((account) => account.trim())
          .filter(Boolean).length > 1
      ) {
        isConsolidated = true;
      }
    }
  }

  const accountType = isConsolidated
    ? ""
    : statementCustomerType !== ""
      ? statementCustomerType
      : statementAccountType;

  for (const line of lines) {
    const fields = splitCsvLine(line);
    if (
      fields[0] !== "Trades" ||
      fields[1] !== "Data" ||
      fields[2] !== "Order" ||
      fields[3] !== "Stocks"
    ) {
      continue;
    }

    const quantity = parseNumber(fields[8]);
    const basis = parseNumber(fields[13]);
    transactions.push({
      symbol: (fields[6] ?? "").trim(),
      quantity: Number.isFinite(quantity) ? Math.abs(quantity) : 0,
      price: parseNumber(fields[9]),
      type: quantity >= 0 ? "buy" : "sell",
      broker: "ibkr",
      currency: ((fields[4] ?? "").trim() || "CAD").toUpperCase(),
      accountId: (fields[5] ?? "").trim(),
      date: (fields[7] ?? "").trim().slice(0, 10),
      rawActivityType: "Trades",
      ...(accountType !== "" ? { accountType } : {}),
      netCashAmount: Number.isFinite(basis) ? Math.abs(basis) : 0,
    });
  }

  if (transactions.length === 0) {
    return { ok: false, error: "No transactions found" };
  }

  return { ok: true, transactions };
}

export function parseActivityText(text: string): ParseResult {
  const isIbkr =
    text.split(/\r\n|\r|\n/).some((line) => line.startsWith("Statement,")) ||
    text.includes(",DataDiscriminator,");
  return isIbkr ? parseIbkrCsv(text) : parseWealthsimpleCsv(text);
}

/**
 * True when transactions span more than one currency. A missing `currency`
 * field is treated as "CAD" (the column is absent from some exports).
 */
export function hasMixedCurrencies(transactions: AcbTransaction[]): boolean {
  const currencies = new Set(transactions.map((tx) => tx.currency ?? "CAD"));
  return currencies.size > 1;
}

/**
 * Symbols whose transactions span more than one currency (missing = CAD),
 * sorted alphabetically. Pooling those holdings without per-transaction FX
 * conversion is wrong, so callers should warn per symbol. Empty when every
 * symbol is single-currency (even if different symbols use different
 * currencies — that is fine, each pool is single-currency).
 */
export function symbolsWithMixedCurrencies(transactions: AcbTransaction[]): string[] {
  const bySymbol = new Map<string, Set<string>>();
  for (const tx of transactions) {
    if (!tx.symbol) continue;
    let currencies = bySymbol.get(tx.symbol);
    if (!currencies) {
      currencies = new Set<string>();
      bySymbol.set(tx.symbol, currencies);
    }
    currencies.add(tx.currency ?? "CAD");
  }
  return [...bySymbol.entries()]
    .filter(([, currencies]) => currencies.size > 1)
    .map(([symbol]) => symbol)
    .sort((a, b) => a.localeCompare(b));
}

/** Calendar year parsed from an ISO date string; 0 when absent or unparseable. */
function parseYear(date: string | undefined): number {
  const year = Number((date ?? "").slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : 0;
}

/** Stable chronological sort by ISO date; "" (unknown) sorts first. */
function sortByDate<T extends { date?: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

/**
 * True when any two files have overlapping transaction date ranges for the
 * same `(accountId, accountType)` account — a sign the same transactions may
 * appear in more than one upload. Files covering different accounts never
 * overlap, even when their date ranges intersect. Transactions with no date
 * are skipped.
 */
export function detectOverlappingFiles(fileTransactions: AcbTransaction[][]): boolean {
  // Per file: accountKey → [minDate, maxDate] over that account's dated rows.
  const fileRanges: Map<string, { min: string; max: string }>[] = [];
  for (const transactions of fileTransactions) {
    const ranges = new Map<string, { min: string; max: string }>();
    for (const tx of transactions) {
      const date = tx.date ?? "";
      if (date === "") continue;
      const key = keyParts(tx.accountId ?? "", tx.accountType ?? "");
      const range = ranges.get(key);
      if (!range) {
        ranges.set(key, { min: date, max: date });
      } else {
        if (date < range.min) range.min = date;
        if (date > range.max) range.max = date;
      }
    }
    fileRanges.push(ranges);
  }
  for (let i = 0; i < fileRanges.length; i++) {
    for (let j = i + 1; j < fileRanges.length; j++) {
      for (const [key, a] of fileRanges[i]) {
        const b = fileRanges[j].get(key);
        if (b && a.min <= b.max && b.min <= a.max) return true;
      }
    }
  }
  return false;
}

/**
 * Actual cost of a buy: the exact cash paid (`|net_cash_amount|`) when the
 * export provides it, otherwise qty × price. `unit_price` is rounded in
 * Wealthsimple exports, so the product can drift cents from the real cost.
 */
function buyCost(tx: AcbTransaction): number {
  return tx.netCashAmount !== undefined && tx.netCashAmount !== 0
    ? Math.abs(tx.netCashAmount)
    : tx.quantity * tx.price;
}

/** Aggregate transactions into per-symbol holdings with ACB. */
export function computeHoldings(transactions: AcbTransaction[]): Holding[] {
  const bySymbol = new Map<
    string,
    { shares: number; costBasis: number; transferredShares: number }
  >();
  // Order matters (interim sells lock in the average of earlier buys), so sort
  // here rather than relying on callers.
  for (const tx of sortByDate(transactions)) {
    // Dividends never touch ACB; interest charges never touch holdings.
    if (tx.type === "dividend" || tx.type === "interest") continue;
    const entry = bySymbol.get(tx.symbol) ?? {
      shares: 0,
      costBasis: 0,
      transferredShares: 0,
    };
    if (tx.type === "buy") {
      entry.shares += tx.quantity;
      entry.costBasis += buyCost(tx);
    } else if (tx.type === "transfer") {
      // Transferred-in shares carry no purchase history: count the shares but
      // leave the cost basis pool unchanged. The user supplies an opening lot
      // ACB in the UI. Transfer-out legs (negative qty) only reduce shares;
      // the pool is left alone — see the time-ordered ledger for why
      // pro-rata removal is not inferred — and clamped at zero.
      entry.shares = Math.max(0, entry.shares + tx.quantity);
      entry.transferredShares += tx.quantity;
    } else if (entry.shares <= 0 || tx.quantity >= entry.shares) {
      // Selling everything empties the pool; selling more than recorded means
      // purchase history is missing. Clamp at zero instead of letting shares
      // or the pool go negative.
      entry.shares = Math.max(0, entry.shares - tx.quantity);
      entry.costBasis = 0;
    } else {
      // CRA rule: sell reduces pool pro-rata so ACB/share is unchanged.
      // remaining_pool = pool × (shares_before - sold) / shares_before
      const sharesAfter = entry.shares - tx.quantity;
      entry.costBasis = entry.costBasis * (sharesAfter / entry.shares);
      entry.shares = sharesAfter;
    }
    bySymbol.set(tx.symbol, entry);
  }

  return [...bySymbol.entries()]
    .map(
      ([symbol, { shares, costBasis, transferredShares }]): Holding => ({
        symbol,
        shares,
        costBasis,
        acbPerShare: acbPerShare(shares, costBasis, transferredShares),
        transferredShares,
      }),
    )
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * ACB per share for a finished pool: null when no shares remain. A pool at
 * zero with uncosted transferred shares is unknown (null), not $0 — the user
 * hasn't entered the opening-lot ACB yet. A zero pool with no transfers (ROC
 * exactly offsetting cost) is genuinely $0/share.
 */
function acbPerShare(shares: number, costBasis: number, transferredShares: number): number | null {
  if (shares <= 0) return null;
  if (costBasis > 0) return costBasis / shares;
  return transferredShares > 0 ? null : 0;
}

/**
 * @deprecated Use `applyAdjustments(holding, 0, -roc)` instead.
 * Apply a T3 return-of-capital (ROC) reduction to a holding's cost basis.
 * ROC reduces ACB: costBasis -= roc. Pass the ROC amount from box 42 of the T3.
 */
export function applyT3Adjustment(holding: Holding, roc: number): Holding {
  return applyAdjustments(holding, 0, -roc);
}

/**
 * Apply UI-layer cost basis adjustments to a holding:
 * - `openingLot`: total cost basis for transferred-in shares (added first)
 * - `t3Net`: net T3 adjustment, `sum(phantom) − sum(box 42)` — positive adds
 *   to the pool, negative subtracts (combined result clamped at zero)
 */
export function applyAdjustments(holding: Holding, openingLot: number, t3Net: number): Holding {
  const costBasis = Math.max(0, holding.costBasis + openingLot + t3Net);
  return {
    ...holding,
    costBasis,
    acbPerShare: acbPerShare(holding.shares, costBasis, holding.transferredShares),
  };
}

/** One dated ACB adjustment: an opening-lot cost or a T3 net amount. */
export type DatedAdjustment = {
  /** ISO date the adjustment takes effect (T3 entries: Dec 31 of the tax year). */
  date: string;
  /** Signed amount: positive adds to the pool (phantom/opening), negative subtracts (ROC). */
  amount: number;
};

/** Dated adjustments keyed by symbol, for `computeAdjustedHoldings`. */
export type SymbolAdjustments = Record<string, DatedAdjustment[]>;

/** A holding with time-ordered adjustments applied, plus data-quality flags. */
export type AdjustedHolding = Holding & {
  /** True when sales exceeded recorded purchases (missing history); pool reset to zero. */
  oversold: boolean;
  /** Total deemed capital gains from ROC driving the pool below zero (CRA rule). */
  deemedGain: number;
  /** Deemed gains attributed by calendar year. */
  deemedGainByYear: Record<number, number>;
};

/** Sub-cent tolerance: smaller negative pools are float dust, not deemed gains. */
const DEEMED_GAIN_EPSILON = 1e-6;

/**
 * Pair transfer lots with their per-lot opening ACBs and fold T3 nets in as
 * Dec-31 adjustments of `phantom − box42`, sorted chronologically. Lots pair
 * positionally with `openingAcbs` (same order as `transferLotsForSymbol`);
 * missing entries count as zero and zero amounts emit no event.
 */
export function buildDatedAdjustments(
  lots: TransferLot[],
  openingAcbs: number[] | undefined,
  t3Entries: T3Entry[] | undefined,
): DatedAdjustment[] {
  const dated: DatedAdjustment[] = [];
  lots.forEach((lot, index) => {
    const amount = openingAcbs?.[index] ?? 0;
    if (amount !== 0) dated.push({ date: lot.date, amount });
  });
  for (const entry of t3Entries ?? []) {
    const net = entry.phantom - entry.box42;
    if (net !== 0) dated.push({ date: `${entry.year}-12-31`, amount: net });
  }
  return dated.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Dated adjustments for every symbol touched by `transactions`,
 * `openingLotEntries`, or `t3Slips`. Pure helper so the UI builds the exact
 * same inputs it passes to `computeAdjustedHoldings`.
 */
export function buildAllDatedAdjustments(
  transactions: AcbTransaction[],
  openingLotEntries: OpeningLotEntries,
  t3Slips: T3Slips,
): SymbolAdjustments {
  const symbols = new Set<string>();
  for (const tx of transactions) {
    if (tx.symbol) symbols.add(tx.symbol);
  }
  for (const symbol of Object.keys(openingLotEntries)) symbols.add(symbol);
  for (const symbol of Object.keys(t3Slips)) symbols.add(symbol);
  const bySymbol: SymbolAdjustments = {};
  for (const symbol of symbols) {
    const dated = buildDatedAdjustments(
      transferLotsForSymbol(transactions, symbol),
      openingLotEntries[symbol],
      t3Slips[symbol],
    );
    if (dated.length > 0) bySymbol[symbol] = dated;
  }
  return bySymbol;
}

/**
 * Per-symbol holdings with dated adjustments interleaved chronologically:
 * transfer opening costs join the pool on the lot date, T3 nets on Dec 31 of
 * their year — so later sells allocate pro-rata over the adjusted pool (CRA
 * Chart 1 order). Without this, adding adjustments as an end lump sum
 * overstates the pool whenever shares were sold after the adjustment year.
 *
 * Two CRA edge rules live here, not in `computeHoldings`:
 * - ROC driving the pool below zero deems the shortfall a capital gain that
 *   year (pool reset to zero); totals surface via `deemedGainByYear`. No gain
 *   is recorded when shares are zero (nothing held) or when transfer opening
 *   costs are still unentered — the pool simply clamps, since a negative ACB
 *   cannot be determined yet.
 * - Sales exceeding recorded purchases flag `oversold` (missing history) and
 *   reset the pool to zero instead of going negative. Transfer-out legs that
 *   would drive shares negative flag `oversold` the same way.
 */
export function computeAdjustedHoldings(
  transactions: AcbTransaction[],
  adjustmentsBySymbol?: SymbolAdjustments,
  options?: { incompleteSymbols?: ReadonlySet<string> },
): AdjustedHolding[] {
  const txsBySymbol = new Map<string, AcbTransaction[]>();
  for (const tx of transactions) {
    if (tx.type === "dividend" || tx.type === "interest") continue;
    if (!tx.symbol) continue;
    const list = txsBySymbol.get(tx.symbol) ?? [];
    list.push(tx);
    txsBySymbol.set(tx.symbol, list);
  }

  const holdings: AdjustedHolding[] = [];
  for (const [symbol, txs] of txsBySymbol) {
    type LedgerEvent = {
      date: string;
      txFirst: boolean;
      tx?: AcbTransaction;
      adj?: DatedAdjustment;
    };
    const events: LedgerEvent[] = [
      ...txs.map((tx): LedgerEvent => ({ date: tx.date ?? "", txFirst: true, tx })),
      ...(adjustmentsBySymbol?.[symbol] ?? []).map(
        (adj): LedgerEvent => ({
          date: adj.date,
          txFirst: false,
          adj,
        }),
      ),
    ];
    // Transactions settle before same-day adjustments (year-end T3 lands after
    // any Dec-31 sale), matching CRA Chart 1 ordering.
    events.sort((a, b) => a.date.localeCompare(b.date) || Number(!a.txFirst) - Number(!b.txFirst));

    let shares = 0;
    let costBasis = 0;
    let transferredShares = 0;
    let oversold = false;
    let deemedGain = 0;
    const deemedGainByYear: Record<number, number> = {};
    const incomplete = options?.incompleteSymbols?.has(symbol) ?? false;
    for (const event of events) {
      if (event.tx) {
        const tx = event.tx;
        if (tx.type === "buy") {
          shares += tx.quantity;
          costBasis += buyCost(tx);
        } else if (tx.type === "transfer") {
          // No pool change (opening costs arrive as dated adjustments), but a
          // leg that would drive shares negative signals missing history.
          shares += tx.quantity;
          transferredShares += tx.quantity;
          if (shares < 0) {
            oversold = true;
            shares = 0;
          }
        } else if (shares <= 0 || tx.quantity > shares) {
          oversold = true;
          shares = 0;
          costBasis = 0;
        } else {
          // CRA rule: sell reduces pool pro-rata so ACB/share is unchanged.
          const sharesAfter = shares - tx.quantity;
          costBasis = sharesAfter === 0 ? 0 : costBasis * (sharesAfter / shares);
          shares = sharesAfter;
        }
      } else if (event.adj) {
        costBasis += event.adj.amount;
        if (costBasis < -DEEMED_GAIN_EPSILON) {
          // A negative ACB is deemed a capital gain that year — but only when
          // something is actually held and the basis is fully known. With zero
          // shares (stale entry on a sold-out position) or unentered transfer
          // costs, the shortfall proves nothing, so clamp without recording.
          if (shares > 0 && !incomplete) {
            const year = parseYear(event.adj.date);
            deemedGain += -costBasis;
            deemedGainByYear[year] = (deemedGainByYear[year] ?? 0) + -costBasis;
          }
          costBasis = 0;
        } else if (costBasis < 0) {
          costBasis = 0;
        }
      }
    }
    holdings.push({
      symbol,
      shares,
      costBasis,
      acbPerShare: acbPerShare(shares, costBasis, transferredShares),
      transferredShares,
      oversold,
      deemedGain,
      deemedGainByYear,
    });
  }
  return holdings.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * Read time-ordered metadata off a holding: full values when it came from
 * `computeAdjustedHoldings`, zeros when it came from `computeHoldings` (raw
 * per-account view). Isolates the cast so components stay clean.
 */
export function adjustedMeta(holding: Holding): {
  oversold: boolean;
  deemedGain: number;
  deemedGainByYear: Record<number, number>;
} {
  const meta = holding as Partial<AdjustedHolding>;
  return {
    oversold: meta.oversold ?? false,
    deemedGain: meta.deemedGain ?? 0,
    deemedGainByYear: meta.deemedGainByYear ?? {},
  };
}

/** Total margin interest paid (absolute value) keyed by calendar year. */
export type MarginInterestByYear = Record<number, number>;

/**
 * Sum interest charged on margin accounts by calendar year. Only rows whose
 * raw activity type is `InterestCharged` and whose account type contains
 * "margin" (case-insensitive) count; rows without a parseable date are
 * skipped. Uses `net_cash_amount` (negative for charges) when present,
 * falling back to quantity × price.
 */
export function computeMarginInterest(transactions: AcbTransaction[]): MarginInterestByYear {
  const byYear: MarginInterestByYear = {};
  for (const tx of transactions) {
    const activity = (tx.rawActivityType ?? "").trim().toLowerCase();
    if (activity !== "interestcharged") continue;
    if (!(tx.accountType ?? "").toLowerCase().includes("margin")) continue;
    const year = Number((tx.date ?? "").slice(0, 4));
    if (!Number.isInteger(year) || year <= 0) continue;
    const amount =
      tx.netCashAmount !== undefined && tx.netCashAmount !== 0
        ? Math.abs(tx.netCashAmount)
        : Math.abs(tx.quantity * tx.price);
    if (amount === 0) continue;
    byYear[year] = (byYear[year] ?? 0) + amount;
  }
  return byYear;
}

/** Transactions belonging to one `(broker, accountId, accountType)` group. */
export type AccountGroup = {
  /** From the `account_id` column; "" for the legacy format. */
  accountId: string;
  /** From the `account_type` column; "" for the legacy format. */
  accountType: string;
  /** Source brokerage of the group's transactions; undefined for hand-built rows. */
  broker?: AcbTransaction["broker"];
  /**
   * True for registered plan types (TFSA/RRSP/FHSA/RESP/RRIF/RDSP/LIRA-family/
   * PRPP). See `resolveRegistered`.
   */
  isRegistered: boolean;
  transactions: AcbTransaction[];
};

/**
 * Group transactions by `(broker, accountId, accountType)` composite key,
 * preserving each group's transaction order. Broker is part of the key so two
 * brokerages' same-numbered (or legacy unknown) accounts never merge.
 * Non-registered accounts sort before registered ones (TFSA / RRSP / FHSA,
 * case-insensitive).
 */
export function groupByAccount(
  transactions: AcbTransaction[],
  overrides?: AccountRegistrationOverrides,
): AccountGroup[] {
  const groups = new Map<string, AccountGroup>();
  for (const tx of transactions) {
    const accountId = tx.accountId ?? "";
    const accountType = tx.accountType ?? "";
    const key = keyParts(tx.broker, accountId, accountType);
    let group = groups.get(key);
    if (!group) {
      group = {
        accountId,
        accountType,
        ...(tx.broker !== undefined ? { broker: tx.broker } : {}),
        isRegistered: resolveRegistered(accountId, accountType, overrides, tx.broker),
        transactions: [],
      };
      groups.set(key, group);
    }
    group.transactions.push(tx);
  }
  // Stable sort: non-registered first, registered after, otherwise keeping
  // first-seen order.
  return [...groups.values()].sort((a, b) => Number(a.isRegistered) - Number(b.isRegistered));
}

/** Running ACB state for one symbol at the end of one calendar year. */
export type YearlySnapshot = {
  /** Calendar year; 0 when the transactions carry no parseable date. */
  year: number;
  /** Shares bought during the year. */
  buyQty: number;
  /** Shares sold during the year. */
  sellQty: number;
  /** Net shares held at year end. */
  endShares: number;
  /** Running cost basis pool at year end. */
  costBasis: number;
  /** costBasis / endShares, or null when no shares remain. */
  acbPerShare: number | null;
};

/**
 * Year-by-year ACB for one symbol. Applies the same buy / sell / transfer
 * rules as `computeHoldings` in date order and emits one snapshot per
 * calendar year with activity (years without transactions are skipped, unless
 * a dated adjustment lands in them). Rows without a parseable date are
 * grouped under year 0 ("Unknown").
 *
 * Dated adjustments (transfer opening costs, T3 nets) are folded in on their
 * dates — same time-ordered math as `computeAdjustedHoldings` — so the final
 * snapshot ties to the Holdings total. Deemed gains are not tracked here;
 * like the holdings view, the pool simply clamps at zero.
 */
export function computeYearlyACB(
  transactions: AcbTransaction[],
  symbol: string,
  datedAdjustments: DatedAdjustment[] = [],
): YearlySnapshot[] {
  type YearEvent = {
    date: string;
    txFirst: boolean;
    tx?: AcbTransaction;
    adj?: DatedAdjustment;
  };
  const events: YearEvent[] = [
    ...transactions
      .filter(
        (tx) =>
          tx.symbol === symbol &&
          (tx.type === "buy" || tx.type === "sell" || tx.type === "transfer"),
      )
      .map((tx): YearEvent => ({ date: tx.date ?? "", txFirst: true, tx })),
    ...datedAdjustments.map((adj): YearEvent => ({ date: adj.date, txFirst: false, adj })),
  ];
  events.sort((a, b) => a.date.localeCompare(b.date) || Number(!a.txFirst) - Number(!b.txFirst));

  const snapshots: YearlySnapshot[] = [];
  let shares = 0;
  let costBasis = 0;
  let transferredShares = 0;
  let current: YearlySnapshot | null = null;

  for (const event of events) {
    const year = parseYear(event.date);
    if (current === null || current.year !== year) {
      if (current !== null) snapshots.push(current);
      current = {
        year,
        buyQty: 0,
        sellQty: 0,
        endShares: shares,
        costBasis,
        acbPerShare: acbPerShare(shares, costBasis, transferredShares),
      };
    }
    if (event.tx) {
      const tx = event.tx;
      if (tx.type === "buy") {
        shares += tx.quantity;
        costBasis += buyCost(tx);
        current.buyQty += tx.quantity;
      } else if (tx.type === "transfer") {
        // Same as computeHoldings: shares with no cost basis, clamped at zero.
        shares = Math.max(0, shares + tx.quantity);
        transferredShares += tx.quantity;
        current.buyQty += tx.quantity;
      } else if (shares <= 0 || tx.quantity >= shares) {
        // Sold everything (or more than recorded): pool empties, clamped.
        shares = Math.max(0, shares - tx.quantity);
        costBasis = 0;
        current.sellQty += tx.quantity;
      } else {
        // CRA rule: sell reduces the pool pro-rata so ACB/share is unchanged.
        const sharesAfter = shares - tx.quantity;
        costBasis = costBasis * (sharesAfter / shares);
        shares = sharesAfter;
        current.sellQty += tx.quantity;
      }
    } else if (event.adj) {
      costBasis += event.adj.amount;
      if (costBasis < 0) costBasis = 0;
    }
    current.endShares = shares;
    current.costBasis = costBasis;
    current.acbPerShare = acbPerShare(shares, costBasis, transferredShares);
  }
  if (current !== null) snapshots.push(current);

  return snapshots;
}

/** One successfully parsed upload: the file's name and its transactions. */
export type ParsedFile = {
  name: string;
  transactions: AcbTransaction[];
};

/**
 * Parse a batch of uploaded files. Successfully parsed files are returned in
 * order; unreadable or invalid files contribute a `"name: reason"` error
 * string instead. Designed for additive uploads: callers append `parsed` to
 * their existing file list.
 */
export async function parseFiles(
  files: File[],
): Promise<{ parsed: ParsedFile[]; errors: string[] }> {
  const parsed: ParsedFile[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const isSpreadsheet =
      /\.xlsx$/i.test(file.name) ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const result = isSpreadsheet
      ? await (async (): Promise<ParseResult> => {
          try {
            return parseQuestradeRows(await readSheetRows(await file.arrayBuffer()));
          } catch {
            return { ok: false, error: "could not read the spreadsheet." };
          }
        })()
      : await (async (): Promise<ParseResult> => {
          try {
            return parseActivityText(await file.text());
          } catch {
            return { ok: false, error: "could not read the file." };
          }
        })();
    if (result.ok) {
      parsed.push({ name: file.name, transactions: result.transactions });
    } else {
      errors.push(`${file.name}: ${result.error}`);
    }
  }
  return { parsed, errors };
}
