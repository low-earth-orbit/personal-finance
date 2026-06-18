// Parser for Wealthsimple account activity CSV exports.
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
};

/** One T3 slip's ACB-relevant boxes for a single tax year. */
export type T3Entry = {
  /** Tax year, e.g. 2024. */
  year: number;
  /** Box 21 — Capital Gains Distributions. Adds to ACB. */
  box21: number;
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
 */
export function transferLotsForSymbol(
  transactions: AcbTransaction[],
  symbol: string,
): TransferLot[] {
  return transactions
    .filter((tx) => tx.symbol === symbol && tx.type === "transfer")
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

/** Net ACB adjustment across all years: sum(box21) − sum(box42). */
export function t3NetAdjustment(entries: T3Entry[]): number {
  return entries.reduce((sum, entry) => sum + entry.box21 - entry.box42, 0);
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

/**
 * True when transactions span more than one currency. A missing `currency`
 * field is treated as "CAD" (the column is absent from some exports).
 */
export function hasMixedCurrencies(transactions: AcbTransaction[]): boolean {
  const currencies = new Set(transactions.map((tx) => tx.currency ?? "CAD"));
  return currencies.size > 1;
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
      const key = `${tx.accountId ?? ""} ${tx.accountType ?? ""}`;
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
  for (const tx of transactions) {
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
      // ACB in the UI.
      entry.shares += tx.quantity;
      entry.transferredShares += tx.quantity;
    } else {
      // CRA rule: sell reduces pool pro-rata so ACB/share is unchanged.
      // remaining_pool = pool × (shares_before - sold) / shares_before
      const sharesAfter = entry.shares - tx.quantity;
      entry.costBasis = entry.shares > 0 ? entry.costBasis * (sharesAfter / entry.shares) : 0;
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
        acbPerShare: shares > 0 ? costBasis / shares : null,
        transferredShares,
      }),
    )
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
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
 * - `t3Net`: net T3 adjustment, `sum(box 21) − sum(box 42)` — positive adds
 *   to the pool, negative subtracts (combined result clamped at zero)
 */
export function applyAdjustments(holding: Holding, openingLot: number, t3Net: number): Holding {
  const costBasis = Math.max(0, holding.costBasis + openingLot + t3Net);
  return {
    ...holding,
    costBasis,
    acbPerShare: holding.shares > 0 ? costBasis / holding.shares : null,
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

/** Transactions belonging to one `(accountId, accountType)` pair. */
export type AccountGroup = {
  /** From the `account_id` column; "" for the legacy format. */
  accountId: string;
  /** From the `account_type` column; "" for the legacy format. */
  accountType: string;
  /** True when accountType contains "TFSA", "RRSP", or "FHSA". */
  isRegistered: boolean;
  transactions: AcbTransaction[];
};

/**
 * Group transactions by `(accountId, accountType)` composite key, preserving
 * each group's transaction order. Non-registered accounts sort before
 * registered ones (TFSA / RRSP / FHSA, case-insensitive).
 */
export function groupByAccount(transactions: AcbTransaction[]): AccountGroup[] {
  const groups = new Map<string, AccountGroup>();
  for (const tx of transactions) {
    const accountId = tx.accountId ?? "";
    const accountType = tx.accountType ?? "";
    const key = `${accountId} ${accountType}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        accountId,
        accountType,
        isRegistered: /tfsa|rrsp|fhsa/i.test(accountType),
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
 * calendar year with activity (years without transactions are skipped).
 * Rows without a parseable date are grouped under year 0 ("Unknown").
 */
export function computeYearlyACB(transactions: AcbTransaction[], symbol: string): YearlySnapshot[] {
  const relevant = transactions
    .filter(
      (tx) =>
        tx.symbol === symbol && (tx.type === "buy" || tx.type === "sell" || tx.type === "transfer"),
    )
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const snapshots: YearlySnapshot[] = [];
  let shares = 0;
  let costBasis = 0;
  let current: YearlySnapshot | null = null;

  for (const tx of relevant) {
    const parsedYear = Number((tx.date ?? "").slice(0, 4));
    const year = Number.isInteger(parsedYear) && parsedYear > 0 ? parsedYear : 0;
    if (current === null || current.year !== year) {
      if (current !== null) snapshots.push(current);
      current = {
        year,
        buyQty: 0,
        sellQty: 0,
        endShares: shares,
        costBasis,
        acbPerShare: shares > 0 ? costBasis / shares : null,
      };
    }
    if (tx.type === "buy") {
      shares += tx.quantity;
      costBasis += buyCost(tx);
      current.buyQty += tx.quantity;
    } else if (tx.type === "transfer") {
      // Same as computeHoldings: shares with no cost basis.
      shares += tx.quantity;
      current.buyQty += tx.quantity;
    } else {
      // CRA rule: sell reduces the pool pro-rata so ACB/share is unchanged.
      const sharesAfter = shares - tx.quantity;
      costBasis = shares > 0 ? costBasis * (sharesAfter / shares) : 0;
      shares = sharesAfter;
      current.sellQty += tx.quantity;
    }
    current.endShares = shares;
    current.costBasis = costBasis;
    // A transfer-only history leaves shares with no cost basis: ACB is
    // unknown (null), not $0.
    current.acbPerShare = shares > 0 && costBasis > 0 ? costBasis / shares : null;
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
    let text: string;
    try {
      text = await file.text();
    } catch {
      errors.push(`${file.name}: could not read the file.`);
      continue;
    }
    const result = parseWealthsimpleCsv(text);
    if (result.ok) {
      parsed.push({ name: file.name, transactions: result.transactions });
    } else {
      errors.push(`${file.name}: ${result.error}`);
    }
  }
  return { parsed, errors };
}
