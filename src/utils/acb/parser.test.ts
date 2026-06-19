import { describe, expect, it } from "vitest";
import {
  applyAdjustments,
  applyT3Adjustment,
  computeHoldings,
  computeMarginInterest,
  computeYearlyACB,
  detectOverlappingFiles,
  groupByAccount,
  hasMixedCurrencies,
  parseActivityText,
  parseFiles,
  parseIbkrCsv,
  parseQuestradeRows,
  parseWealthsimpleCsv,
  resolveRegistered,
  sumOpeningLot,
  t3NetAdjustment,
  transferLotsForSymbol,
  type AcbTransaction,
} from "./parser";
import { readSheetRows } from "./xlsx";

const HEADER = "Date,Symbol,Quantity,Price,Type,Description";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

const WS_HEADER =
  "transaction_date,settlement_date,account_id,account_type,activity_type,activity_sub_type,direction,symbol,name,currency,quantity,unit_price,commission,net_cash_amount";

function wsCsv(...rows: string[]): string {
  return [WS_HEADER, ...rows].join("\n");
}

function storedXlsx(): ArrayBuffer {
  const encoder = new TextEncoder();
  const files = [
    {
      name: "xl/workbook.xml",
      text: '<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheets><x:sheet name="Sheet1" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>',
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet.xml" Id="rId1" /></Relationships>',
    },
    {
      name: "xl/worksheets/sheet.xml",
      text: '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row><x:c r="A1" t="str"><x:v>Symbol</x:v></x:c><x:c r="B1" t="str"><x:v>Name</x:v></x:c></x:row><x:row><x:c r="A2" t="str"><x:v>XSB.TO</x:v></x:c><x:c r="B2" t="str"><x:v>Bond &amp; Cash</x:v></x:c></x:row></x:sheetData></x:worksheet>',
    },
  ];
  const bytes: number[] = [];
  const central: number[] = [];
  const write16 = (target: number[], value: number) => {
    target.push(value & 0xff, (value >> 8) & 0xff);
  };
  const write32 = (target: number[], value: number) => {
    target.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
  };
  const append = (target: number[], data: Uint8Array) => {
    for (const byte of data) target.push(byte);
  };

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const localOffset = bytes.length;
    write32(bytes, 0x04034b50);
    write16(bytes, 20);
    write16(bytes, 0);
    write16(bytes, 0);
    write16(bytes, 0);
    write16(bytes, 0);
    write32(bytes, 0);
    write32(bytes, data.length);
    write32(bytes, data.length);
    write16(bytes, name.length);
    write16(bytes, 0);
    append(bytes, name);
    append(bytes, data);

    write32(central, 0x02014b50);
    write16(central, 20);
    write16(central, 20);
    write16(central, 0);
    write16(central, 0);
    write16(central, 0);
    write16(central, 0);
    write32(central, 0);
    write32(central, data.length);
    write32(central, data.length);
    write16(central, name.length);
    write16(central, 0);
    write16(central, 0);
    write16(central, 0);
    write16(central, 0);
    write32(central, 0);
    write32(central, localOffset);
    append(central, name);
  }

  const centralOffset = bytes.length;
  bytes.push(...central);
  write32(bytes, 0x06054b50);
  write16(bytes, 0);
  write16(bytes, 0);
  write16(bytes, files.length);
  write16(bytes, files.length);
  write32(bytes, central.length);
  write32(bytes, centralOffset);
  write16(bytes, 0);
  return new Uint8Array(bytes).buffer;
}

describe("parseWealthsimpleCsv (legacy Type column)", () => {
  it("parses buy, sell, and dividend rows", () => {
    const result = parseWealthsimpleCsv(
      csv(
        "2025-01-02,VEQT,10,40.00,buy,Bought 10 VEQT",
        "2025-02-01,VEQT,,0,dividend,Dividend",
        "2025-02-02,VEQT,1,41.00,buy,DRIP",
        "2025-03-01,VEQT,4,45.00,sell,Sold 4 VEQT",
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toHaveLength(4);
    expect(result.transactions[0]).toEqual({
      symbol: "VEQT",
      quantity: 10,
      price: 40,
      type: "buy",
      broker: "wealthsimple",
      currency: "CAD",
      date: "",
      rawActivityType: "buy",
    });
    expect(result.transactions[1].type).toBe("dividend");
    expect(result.transactions[3].type).toBe("sell");
  });

  it("ignores irrelevant transaction types", () => {
    const result = parseWealthsimpleCsv(
      csv(
        "2025-01-01,,0,0,deposit,Deposit",
        "2025-01-02,XEQT,5,30.00,buy,Bought",
        "2025-01-03,,0,0,withdrawal,Withdrawal",
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].symbol).toBe("XEQT");
  });

  it("matches column headers case-insensitively and in any order", () => {
    const result = parseWealthsimpleCsv(
      ["type,price,quantity,symbol", "buy,25.50,2,XGRO"].join("\n"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions[0]).toEqual({
      symbol: "XGRO",
      quantity: 2,
      price: 25.5,
      type: "buy",
      broker: "wealthsimple",
      currency: "CAD",
      date: "",
      rawActivityType: "buy",
    });
  });

  it("parses the Currency column case-insensitively and uppercases values", () => {
    const result = parseWealthsimpleCsv(
      [
        "Date,Symbol,Quantity,Price,Type,currency",
        "2025-01-02,VEQT,10,40.00,buy,cad",
        "2025-01-03,VTI,5,200.00,buy,usd",
        "2025-01-04,XEQT,3,30.00,buy,",
      ].join("\n"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions.map((tx) => tx.currency)).toEqual([
      "CAD",
      "USD",
      "CAD", // empty field defaults to CAD
    ]);
  });

  it("defaults currency to CAD when the column is absent", () => {
    const result = parseWealthsimpleCsv(csv("2025-01-02,VEQT,10,40.00,buy,Bought"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions[0].currency).toBe("CAD");
  });

  it("handles quoted fields containing commas and formatted numbers", () => {
    const result = parseWealthsimpleCsv(
      csv('2025-01-02,VEQT,10,"$1,000.00",buy,"Bought, with comma"'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions[0].price).toBe(1000);
    expect(result.transactions[0].quantity).toBe(10);
  });

  it("reports missing required columns", () => {
    const result = parseWealthsimpleCsv(["Date,Symbol,Type", "2025-01-02,VEQT,buy"].join("\n"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Quantity");
    expect(result.error).toContain("Price");
    expect(result.error).not.toContain("Symbol");
  });

  it("returns an error for an empty file", () => {
    const result = parseWealthsimpleCsv("");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("No transactions found");
  });

  it("returns an error when there are no relevant transactions", () => {
    const result = parseWealthsimpleCsv(csv("2025-01-01,,0,0,deposit,Cash"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("No transactions found");
  });

  it("parses legacy transfer rows", () => {
    const result = parseWealthsimpleCsv(csv("2025-01-02,VEQT,10,0,transfer,Transferred in"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions[0].type).toBe("transfer");
  });
});

describe("parseWealthsimpleCsv (Wealthsimple activity columns)", () => {
  it("maps activity_type/activity_sub_type/direction to transaction types", () => {
    const result = parseWealthsimpleCsv(
      wsCsv(
        "2025-01-02,2025-01-03,acc1,non-registered,Trade,BUY,LONG,VEQT,Vanguard All-Equity,CAD,10,40.00,0,-400.00",
        "2025-02-01,2025-02-01,acc1,non-registered,Dividend,,,VEQT,Vanguard All-Equity,CAD,,,0,12.34",
        "2025-03-01,2025-03-02,acc1,non-registered,Trade,SELL,SHORT,VEQT,Vanguard All-Equity,CAD,4,45.00,0,180.00",
        "2025-04-01,2025-04-01,acc1,non-registered,SecurityTransfer,,,XEQT,iShares All-Equity,CAD,5,,0,0",
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions.map((tx) => tx.type)).toEqual([
      "buy",
      "dividend",
      "sell",
      "transfer",
    ]);
    expect(result.transactions[0]).toEqual({
      symbol: "VEQT",
      quantity: 10,
      price: 40,
      type: "buy",
      broker: "wealthsimple",
      currency: "CAD",
      date: "2025-01-02",
      rawActivityType: "Trade",
      accountId: "acc1",
      accountType: "non-registered",
      netCashAmount: -400,
    });
  });

  it("skips non-trade activity types but keeps interest charges", () => {
    const result = parseWealthsimpleCsv(
      wsCsv(
        "2025-01-01,2025-01-01,acc1,non-registered,MoneyMovement,DEPOSIT,,,,CAD,,,0,1000.00",
        "2025-01-02,2025-01-03,acc1,non-registered,Trade,BUY,LONG,XEQT,iShares,CAD,5,30.00,0,-150.00",
        "2025-01-31,2025-01-31,acc1,non-registered,Interest,,,,,CAD,,,0,1.23",
        "2025-02-01,2025-02-01,acc1,margin,InterestCharged,,,,,CAD,,,0,-0.50",
        "2025-02-15,2025-02-15,acc1,non-registered,AdministrativePayment,,,,,CAD,,,0,-5.00",
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions.map((tx) => tx.type)).toEqual(["buy", "interest"]);
    expect(result.transactions[0].symbol).toBe("XEQT");
    expect(result.transactions[1]).toMatchObject({
      type: "interest",
      rawActivityType: "InterestCharged",
      accountType: "margin",
      netCashAmount: -0.5,
      date: "2025-02-01",
    });
  });

  it("parses account_type and net_cash_amount on trade rows", () => {
    const result = parseWealthsimpleCsv(
      wsCsv(
        "2025-01-02,2025-01-03,acc1,Margin Account,Trade,BUY,LONG,XEQT,iShares,CAD,5,30.00,0,-150.00",
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions[0].accountType).toBe("Margin Account");
    expect(result.transactions[0].netCashAmount).toBe(-150);
  });

  it("skips Trade rows with unexpected sub-type/direction combinations", () => {
    const result = parseWealthsimpleCsv(
      wsCsv(
        "2025-01-02,2025-01-03,acc1,non-registered,Trade,BUY,SHORT,XEQT,iShares,CAD,5,30.00,0,-150.00",
        "2025-01-03,2025-01-04,acc1,non-registered,Trade,BUY,LONG,XEQT,iShares,CAD,5,30.00,0,-150.00",
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toHaveLength(1);
  });

  it("reports missing required columns using the new names", () => {
    const result = parseWealthsimpleCsv(
      ["transaction_date,symbol,quantity", "2025-01-02,VEQT,10"].join("\n"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("unit_price");
    expect(result.error).toContain("activity_type");
  });
});

describe("parseQuestradeRows", () => {
  const rows = [
    [
      "Transaction Date",
      "Settlement Date",
      "Action",
      "Symbol",
      "Description",
      "Quantity",
      "Price",
      "Gross Amount",
      "Commission",
      "Net Amount",
      "Currency",
      "Account #",
      "Activity Type",
      "Account Type",
    ],
    [
      "2026-06-01 12:00:00 AM",
      "2026-06-01 12:00:00 AM",
      "",
      "XSB.TO",
      "Distribution",
      "0.00000",
      "0.06000000",
      "0.00",
      "0.00",
      "25.60",
      "CAD",
      "40148448",
      "Dividends",
      "Individual cash",
    ],
    [
      "2026-04-17 12:00:00 AM",
      "2026-04-17 12:00:00 AM",
      "DEP",
      "",
      "TD DIR DEP",
      "0.00000",
      "0.00000000",
      "0.00",
      "0.00",
      "10000.00",
      "CAD",
      "40148448",
      "Deposits",
      "Individual cash",
    ],
    [
      "2026-04-17 12:00:00 AM",
      "2026-04-20 12:00:00 AM",
      "Buy",
      "XSB.TO",
      "ISHARES CORE CANADIAN SHORT TERM BOND INDEX ETF",
      "71.00000",
      "26.95000000",
      "-1913.45",
      "0.00",
      "-1913.45",
      "CAD",
      "40148448",
      "Trades",
      "Individual cash",
    ],
    [
      "2026-04-17 12:00:00 AM",
      "2026-04-20 12:00:00 AM",
      "Buy",
      "XSB.TO",
      "ISHARES CORE CANADIAN SHORT TERM BOND INDEX ETF",
      "300.00000",
      "26.95000000",
      "-8085.00",
      "0.00",
      "-8085.00",
      "CAD",
      "40148448",
      "Trades",
      "Individual cash",
    ],
    [
      "2026-03-13 12:00:00 AM",
      "2026-03-16 12:00:00 AM",
      "Buy",
      "XEF.TO",
      "ISHARES CORE MSCI EAFE IMI INDEX ETF",
      "19.00000",
      "46.59000000",
      "-885.21",
      "0.00",
      "-885.21",
      "CAD",
      "53670632",
      "Trades",
      "Individual FHSA",
    ],
    [
      "2026-04-01 12:00:00 AM",
      "2026-04-02 12:00:00 AM",
      "Buy",
      "XEF.TO",
      "ISHARES CORE MSCI EAFE IMI INDEX ETF",
      "63.00000",
      "48.16000000",
      "-3034.08",
      "0.00",
      "-3034.08",
      "CAD",
      "53670632",
      "Trades",
      "Individual FHSA",
    ],
    [
      "2026-04-09 12:00:00 AM",
      "2026-04-10 12:00:00 AM",
      "Buy",
      "XEF.TO",
      "ISHARES CORE MSCI EAFE IMI INDEX ETF",
      "61.00000",
      "49.12000000",
      "-2996.32",
      "0.00",
      "-2996.32",
      "CAD",
      "53670632",
      "Trades",
      "Individual FHSA",
    ],
    [
      "2026-04-10 12:00:00 AM",
      "2026-04-13 12:00:00 AM",
      "Buy",
      "XEF.TO",
      "ISHARES CORE MSCI EAFE IMI INDEX ETF",
      "75.00000",
      "49.82000000",
      "-3736.50",
      "0.00",
      "-3736.50",
      "CAD",
      "53670632",
      "Trades",
      "Individual FHSA",
    ],
  ];

  it("parses Questrade activity rows and keeps raw symbols", () => {
    const result = parseQuestradeRows(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const holdings = computeHoldings(result.transactions);
    expect(holdings.find((holding) => holding.symbol === "XSB.TO")).toMatchObject({
      shares: 371,
      costBasis: 1913.45 + 8085,
    });
    expect(holdings.find((holding) => holding.symbol === "XEF.TO")?.shares).toBe(218);
    expect(holdings.find((holding) => holding.symbol === "")).toBeUndefined();
    expect(result.transactions.some((tx) => tx.type === "dividend")).toBe(true);
    expect(result.transactions.every((tx) => tx.broker === "questrade")).toBe(true);
  });

  it("tags Questrade FHSA rows as registered", () => {
    const result = parseQuestradeRows(rows);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const groups = groupByAccount(result.transactions);
    const fhsa = groups.find((group) => group.accountType === "Individual FHSA");
    expect(fhsa?.isRegistered).toBe(true);
  });
});

describe("parseIbkrCsv", () => {
  const ibkrText = [
    "Statement,Data,BrokerName,Interactive Brokers Canada Inc.",
    "Account Information,Header,Field Name,Field Value",
    'Account Information,Data,Account,"U23432652 (Custom Consolidated)"',
    'Account Information,Data,Accounts Included,"U23432652, U23432845"',
    "Account Information,Data,Account Type,Individual",
    "Account Information,Data,Customer Type,Registered Retirement Savings Plan",
    "Trades,Header,DataDiscriminator,Asset Category,Currency,Account,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code",
    'Trades,Data,Order,Stocks,CAD,U23432845,VCN,"2026-04-17, 11:23:59",836,69.78,69.87,-58336.08,-8.36,58344.44,0,75.24,O;P',
    "Trades,SubTotal,,Stocks,CAD,VCN,,,836,,,-58336.08,-8.36,58344.44,0,75.24,",
    'Trades,Data,Order,Stocks,CAD,U23432845,VEQT,"2026-04-17, 11:08:43",109,57.71,57.71,-6290.39,-1.09,6291.48,0,0,O;P',
    'Trades,Data,Order,Stocks,USD,U23432652,VT,"2026-04-16, 11:20:06",70.2835,148.839994756,148.79,-10460.99577145,-1,10461.99577145,0,-3.5138,O;P;RPA',
    'Trades,Data,Order,Forex,CAD,U23432652,USD.CAD,"2026-04-16, 09:16:28","10,462.66",1.37195,,-14354.246387,-2.7484,,,-16.217123,',
  ].join("\n");

  it("parses IBKR stock trades and uses Basis as cost", () => {
    const result = parseIbkrCsv(ibkrText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const holdings = computeHoldings(result.transactions);
    expect(holdings.find((holding) => holding.symbol === "VCN")).toMatchObject({
      shares: 836,
      costBasis: 58344.44,
    });
    expect(holdings.find((holding) => holding.symbol === "VEQT")).toMatchObject({
      shares: 109,
      costBasis: 6291.48,
    });
    expect(holdings.find((holding) => holding.symbol === "VT")).toMatchObject({
      shares: 70.2835,
      costBasis: 10461.99577145,
    });
    expect(holdings.find((holding) => holding.symbol === "USD.CAD")).toBeUndefined();
    expect(result.transactions.every((tx) => tx.broker === "ibkr")).toBe(true);
  });

  it("keeps consolidated account registration unknown per trade", () => {
    const result = parseIbkrCsv(ibkrText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions.find((tx) => tx.symbol === "VCN")?.accountId).toBe("U23432845");
    expect(result.transactions.find((tx) => tx.symbol === "VEQT")?.accountId).toBe("U23432845");
    const vt = result.transactions.find((tx) => tx.symbol === "VT");
    expect(vt?.accountId).toBe("U23432652");
    expect(vt?.currency).toBe("USD");
    expect(hasMixedCurrencies(result.transactions)).toBe(true);
    expect(result.transactions.every((tx) => (tx.accountType ?? "") === "")).toBe(true);
    const groups = groupByAccount(result.transactions);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.accountId).sort()).toEqual(["U23432652", "U23432845"]);
    expect(groups.every((group) => group.accountType === "")).toBe(true);
    expect(groups.every((group) => group.isRegistered === false)).toBe(true);
  });

  it("applies statement account type for single-account IBKR exports", () => {
    const result = parseIbkrCsv(
      [
        "Statement,Data,BrokerName,Interactive Brokers Canada Inc.",
        "Account Information,Header,Field Name,Field Value",
        "Account Information,Data,Account,U23432652",
        "Account Information,Data,Accounts Included,U23432652",
        "Account Information,Data,Account Type,Individual",
        "Account Information,Data,Customer Type,Registered Retirement Savings Plan",
        "Trades,Header,DataDiscriminator,Asset Category,Currency,Account,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code",
        'Trades,Data,Order,Stocks,USD,U23432652,VT,"2026-04-16, 11:20:06",70.2835,148.839994756,148.79,-10460.99577145,-1,10461.99577145,0,-3.5138,O;P;RPA',
      ].join("\n"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions[0]).toMatchObject({
      accountId: "U23432652",
      accountType: "Registered Retirement Savings Plan",
      broker: "ibkr",
    });
    const groups = groupByAccount(result.transactions);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      accountId: "U23432652",
      accountType: "Registered Retirement Savings Plan",
      isRegistered: true,
    });
  });
});

describe("parseActivityText", () => {
  it("sniffs IBKR statements", () => {
    const result = parseActivityText(
      [
        "Statement,Data,Title,Activity Statement",
        "Account Information,Data,Customer Type,Registered Retirement Savings Plan",
        "Trades,Header,DataDiscriminator,Asset Category,Currency,Account,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code",
        'Trades,Data,Order,Stocks,CAD,U1,VCN,"2026-04-17, 11:23:59",1,69.78,69.87,-69.78,-1,70.78,0,0,O;P',
      ].join("\n"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions[0].symbol).toBe("VCN");
  });

  it("leaves Wealthsimple parsing unchanged", () => {
    const text = wsCsv(
      "2025-01-02,2025-01-03,acc1,non-registered,Trade,BUY,LONG,VEQT,Vanguard All-Equity,CAD,10,40.00,0,-400.00",
    );
    const result = parseActivityText(text);
    const expected = parseWealthsimpleCsv(text);
    expect(result).toEqual(expected);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions[0]).toMatchObject({
      symbol: "VEQT",
      quantity: 10,
      netCashAmount: -400,
    });
  });
});

describe("readSheetRows", () => {
  it.skipIf(typeof DecompressionStream === "undefined")(
    "reads a stored XLSX worksheet",
    async () => {
      const rows = await readSheetRows(storedXlsx());
      expect(rows).toEqual([
        ["Symbol", "Name"],
        ["XSB.TO", "Bond & Cash"],
      ]);
    },
  );
});

describe("hasMixedCurrencies", () => {
  const tx = (currency?: string): AcbTransaction => ({
    symbol: "VEQT",
    quantity: 1,
    price: 10,
    type: "buy",
    ...(currency !== undefined ? { currency } : {}),
  });

  it("returns false for an empty list", () => {
    expect(hasMixedCurrencies([])).toBe(false);
  });

  it("returns false when all transactions share one currency", () => {
    expect(hasMixedCurrencies([tx("CAD"), tx("CAD")])).toBe(false);
    expect(hasMixedCurrencies([tx("USD"), tx("USD")])).toBe(false);
  });

  it("returns true when currencies differ", () => {
    expect(hasMixedCurrencies([tx("CAD"), tx("USD")])).toBe(true);
  });

  it("treats a missing currency field as CAD", () => {
    expect(hasMixedCurrencies([tx(), tx("CAD")])).toBe(false);
    expect(hasMixedCurrencies([tx(), tx("USD")])).toBe(true);
  });
});

describe("detectOverlappingFiles", () => {
  const tx = (date: string, accountId?: string, accountType?: string): AcbTransaction => ({
    symbol: "VEQT",
    quantity: 1,
    price: 10,
    type: "buy",
    date,
    ...(accountId !== undefined ? { accountId } : {}),
    ...(accountType !== undefined ? { accountType } : {}),
  });

  it("returns false for zero or one file", () => {
    expect(detectOverlappingFiles([])).toBe(false);
    expect(detectOverlappingFiles([[tx("2025-01-01")]])).toBe(false);
  });

  it("returns false for disjoint date ranges", () => {
    expect(
      detectOverlappingFiles([
        [tx("2024-01-01"), tx("2024-12-31")],
        [tx("2025-01-01"), tx("2025-12-31")],
      ]),
    ).toBe(false);
  });

  it("returns true for overlapping date ranges", () => {
    expect(
      detectOverlappingFiles([
        [tx("2024-01-01"), tx("2024-06-30")],
        [tx("2024-06-30"), tx("2024-12-31")],
      ]),
    ).toBe(true);
  });

  it("returns true when one range contains another", () => {
    expect(
      detectOverlappingFiles([
        [tx("2024-01-01"), tx("2025-12-31")],
        [tx("2024-06-01"), tx("2024-07-01")],
      ]),
    ).toBe(true);
  });

  it("ignores files with no dated transactions", () => {
    expect(
      detectOverlappingFiles([
        [{ symbol: "VEQT", quantity: 1, price: 10, type: "buy" }],
        [tx("2024-01-01"), tx("2024-12-31")],
      ]),
    ).toBe(false);
  });

  it("does not flag overlapping date ranges in different accounts", () => {
    // One file is non-registered only, the other TFSA only: same dates, but
    // no account appears in both files, so there is no real overlap.
    expect(
      detectOverlappingFiles([
        [tx("2024-01-01", "acc1", "non-registered"), tx("2024-12-31", "acc1", "non-registered")],
        [tx("2024-03-01", "acc2", "tfsa"), tx("2024-09-01", "acc2", "tfsa")],
      ]),
    ).toBe(false);
  });

  it("flags overlapping date ranges for the same account across files", () => {
    expect(
      detectOverlappingFiles([
        [tx("2024-01-01", "acc1", "non-registered"), tx("2024-06-30", "acc1", "non-registered")],
        [tx("2024-06-01", "acc1", "non-registered"), tx("2024-12-31", "acc1", "non-registered")],
      ]),
    ).toBe(true);
  });

  it("compares per account within multi-account files", () => {
    // File A: non-registered Jan–Jun, TFSA Jul–Dec.
    // File B: non-registered Jul–Dec — overlaps A's TFSA dates, but not A's
    // non-registered dates, so there is no overlap.
    expect(
      detectOverlappingFiles([
        [
          tx("2024-01-01", "acc1", "non-registered"),
          tx("2024-06-30", "acc1", "non-registered"),
          tx("2024-07-01", "acc2", "tfsa"),
          tx("2024-12-31", "acc2", "tfsa"),
        ],
        [tx("2024-07-01", "acc1", "non-registered"), tx("2024-12-31", "acc1", "non-registered")],
      ]),
    ).toBe(false);
  });
});

describe("computeHoldings", () => {
  const tx = (
    symbol: string,
    quantity: number,
    price: number,
    type: AcbTransaction["type"],
  ): AcbTransaction => ({ symbol, quantity, price, type });

  it("accumulates buys into the cost basis pool", () => {
    const holdings = computeHoldings([tx("VEQT", 10, 40, "buy"), tx("VEQT", 10, 50, "buy")]);
    expect(holdings).toEqual([
      {
        symbol: "VEQT",
        shares: 20,
        costBasis: 900,
        acbPerShare: 45,
        transferredShares: 0,
      },
    ]);
  });

  it("sells reduce shares and cost basis pool pro-rata (CRA rule)", () => {
    // Buy 10 @ $40 → pool = $400, ACB/share = $40
    // Sell 4 → remaining 6 shares; pool = 400 × (6/10) = $240, ACB/share still $40
    const holdings = computeHoldings([tx("VEQT", 10, 40, "buy"), tx("VEQT", 4, 60, "sell")]);
    expect(holdings).toEqual([
      {
        symbol: "VEQT",
        shares: 6,
        costBasis: 240,
        acbPerShare: 40,
        transferredShares: 0,
      },
    ]);
  });

  it("dividend rows do not contribute to ACB", () => {
    const holdings = computeHoldings([
      tx("VEQT", 10, 40, "buy"),
      tx("VEQT", 5, 40, "dividend"),
      tx("VEQT", 1, 41, "buy"), // the DRIP buy that follows
    ]);
    expect(holdings).toEqual([
      {
        symbol: "VEQT",
        shares: 11,
        costBasis: 441,
        acbPerShare: 441 / 11,
        transferredShares: 0,
      },
    ]);
  });

  it("transfer rows add shares but no cost basis", () => {
    const holdings = computeHoldings([tx("VEQT", 5, 0, "transfer"), tx("VEQT", 10, 40, "buy")]);
    expect(holdings).toEqual([
      {
        symbol: "VEQT",
        shares: 15,
        costBasis: 400,
        acbPerShare: 400 / 15,
        transferredShares: 5,
      },
    ]);
  });

  it("returns null ACB when all shares are sold (division by zero)", () => {
    // Pool fully zeroed out pro-rata when all shares sold
    const holdings = computeHoldings([tx("VEQT", 10, 40, "buy"), tx("VEQT", 10, 60, "sell")]);
    expect(holdings).toEqual([
      {
        symbol: "VEQT",
        shares: 0,
        costBasis: 0,
        acbPerShare: null,
        transferredShares: 0,
      },
    ]);
  });

  it("uses |net_cash_amount| as the buy cost when present", () => {
    // Wealthsimple rounds unit_price to 4 decimals: 208.0507 × 48.0652 =
    // 9999.9985, but the actual cash paid was exactly $10,000.
    const holdings = computeHoldings([
      {
        symbol: "XIC",
        quantity: 208.0507,
        price: 48.0652,
        type: "buy",
        netCashAmount: -10000,
      },
    ]);
    expect(holdings[0].costBasis).toBe(10000);
  });

  it("falls back to qty × price when net_cash_amount is absent or zero", () => {
    const holdings = computeHoldings([
      { symbol: "XIC", quantity: 10, price: 40, type: "buy" },
      { symbol: "XIC", quantity: 5, price: 40, type: "buy", netCashAmount: 0 },
    ]);
    expect(holdings[0].costBasis).toBe(600);
  });

  it("accumulates buy products at full IEEE 754 precision", () => {
    // 3 × 0.1 = 0.30000000000000004 in IEEE 754; we keep full precision and
    // only round at display time.
    const holdings = computeHoldings([tx("VEQT", 3, 0.1, "buy")]);
    expect(holdings[0].costBasis).toBeCloseTo(0.3, 10);
  });

  it("sum of many small purchases matches the expected total", () => {
    // 200 buys of 3 shares @ $0.10 → pool should be 200 × $0.30 = $60.
    const txs = Array.from({ length: 200 }, () => tx("VEQT", 3, 0.1, "buy"));
    const holdings = computeHoldings(txs);
    expect(holdings[0].shares).toBe(600);
    expect(holdings[0].costBasis).toBeCloseTo(60, 8);
  });

  it("pro-rata sell reduction preserves full precision (no 4dp truncation)", () => {
    // Pool $100, sell 1 of 3 shares → 100 × (2/3) = 66.666… kept in full.
    const holdings = computeHoldings([tx("VEQT", 3, 100 / 3, "buy"), tx("VEQT", 1, 50, "sell")]);
    expect(holdings[0].shares).toBe(2);
    expect(holdings[0].costBasis).toBeCloseTo(66.6667, 4);
  });

  it("groups by symbol and sorts alphabetically", () => {
    const holdings = computeHoldings([tx("XEQT", 5, 30, "buy"), tx("VEQT", 10, 40, "buy")]);
    expect(holdings.map((h) => h.symbol)).toEqual(["VEQT", "XEQT"]);
  });

  it("produces the same result from a merged multi-file list sorted by date", () => {
    // Simulates Main.tsx merging two files and sorting chronologically.
    const fileA: AcbTransaction[] = [
      { ...tx("VEQT", 10, 40, "buy"), date: "2024-01-02" },
      { ...tx("VEQT", 4, 60, "sell"), date: "2024-06-01" },
    ];
    const fileB: AcbTransaction[] = [{ ...tx("VEQT", 5, 50, "buy"), date: "2025-01-02" }];
    const merged = [...fileB, ...fileA].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    expect(merged.map((t) => t.date)).toEqual(["2024-01-02", "2024-06-01", "2025-01-02"]);
    // Buy 10 @ 40 → 400; sell 4 → 6 shares, 240; buy 5 @ 50 → 11 shares, 490
    expect(computeHoldings(merged)).toEqual([
      {
        symbol: "VEQT",
        shares: 11,
        costBasis: 490,
        acbPerShare: 490 / 11,
        transferredShares: 0,
      },
    ]);
  });
});

describe("applyT3Adjustment", () => {
  it("subtracts ROC from cost basis and recalculates ACB", () => {
    // 10 shares @ $40 = $400 pool. ROC of $100 → pool = $300, ACB/share = $30.
    const holding = computeHoldings([{ symbol: "VEQT", quantity: 10, price: 40, type: "buy" }])[0];
    const adjusted = applyT3Adjustment(holding, 100);
    expect(adjusted.costBasis).toBe(300);
    expect(adjusted.acbPerShare).toBe(30);
  });

  it("clamps cost basis to zero (ROC cannot create negative ACB)", () => {
    const holding = computeHoldings([{ symbol: "VEQT", quantity: 10, price: 40, type: "buy" }])[0];
    const adjusted = applyT3Adjustment(holding, 9999);
    expect(adjusted.costBasis).toBe(0);
    expect(adjusted.acbPerShare).toBe(0);
  });

  it("keeps ACB null when no shares remain", () => {
    const adjusted = applyT3Adjustment(
      {
        symbol: "VEQT",
        shares: 0,
        costBasis: 0,
        acbPerShare: null,
        transferredShares: 0,
      },
      100,
    );
    expect(adjusted.costBasis).toBe(0);
    expect(adjusted.acbPerShare).toBeNull();
  });
});

describe("applyAdjustments", () => {
  it("adds the opening lot and a negative T3 net (box 42 ROC)", () => {
    // 5 transferred shares + buy 10 @ $40 = 15 shares, $400 pool.
    // Opening lot $150 → $550; net T3 −$50 → $500; ACB/share = 500/15.
    const holding = computeHoldings([
      { symbol: "VEQT", quantity: 5, price: 0, type: "transfer" },
      { symbol: "VEQT", quantity: 10, price: 40, type: "buy" },
    ])[0];
    const adjusted = applyAdjustments(holding, 150, -50);
    expect(adjusted.costBasis).toBe(500);
    expect(adjusted.acbPerShare).toBeCloseTo(500 / 15);
  });

  it("adds a positive T3 net (box 21 capital gains distributions)", () => {
    // 10 shares @ $40 = $400. Net T3 +$100 → $500, ACB/share = $50.
    const holding = computeHoldings([{ symbol: "VEQT", quantity: 10, price: 40, type: "buy" }])[0];
    const adjusted = applyAdjustments(holding, 0, 100);
    expect(adjusted.costBasis).toBe(500);
    expect(adjusted.acbPerShare).toBe(50);
  });

  it("clamps the combined adjustment at zero", () => {
    const holding = computeHoldings([{ symbol: "VEQT", quantity: 10, price: 40, type: "buy" }])[0];
    const adjusted = applyAdjustments(holding, 100, -9999);
    expect(adjusted.costBasis).toBe(0);
  });
});

describe("t3NetAdjustment", () => {
  it("returns zero for no entries", () => {
    expect(t3NetAdjustment([])).toBe(0);
  });

  it("sums box 21 minus box 42 across years", () => {
    expect(
      t3NetAdjustment([
        { year: 2023, box21: 120, box42: 30 },
        { year: 2024, box21: 0, box42: 50 },
      ]),
    ).toBe(40);
  });

  it("can be negative when ROC dominates", () => {
    expect(t3NetAdjustment([{ year: 2024, box21: 10, box42: 60 }])).toBe(-50);
  });
});

describe("computeMarginInterest", () => {
  const interest = (
    date: string | undefined,
    netCashAmount: number | undefined,
    accountType: string | undefined,
  ): AcbTransaction => ({
    symbol: "",
    quantity: 0,
    price: 0,
    type: "interest",
    rawActivityType: "InterestCharged",
    ...(date !== undefined ? { date } : {}),
    ...(netCashAmount !== undefined ? { netCashAmount } : {}),
    ...(accountType !== undefined ? { accountType } : {}),
  });

  it("groups absolute interest amounts by calendar year", () => {
    const result = computeMarginInterest([
      interest("2025-03-31", -57.33, "margin"),
      interest("2025-04-30", -42.67, "margin"),
      interest("2026-01-31", -102.14, "margin"),
    ]);
    expect(result).toEqual({ 2025: 100, 2026: 102.14 });
  });

  it("matches account types containing 'margin' case-insensitively", () => {
    const result = computeMarginInterest([
      interest("2025-01-31", -10, "Margin Account"),
      interest("2025-02-28", -20, "NON-REGISTERED-MARGIN"),
      interest("2025-03-31", -99, "tfsa"),
    ]);
    expect(result).toEqual({ 2025: 30 });
  });

  it("skips rows with a missing date or accountType", () => {
    const result = computeMarginInterest([
      interest(undefined, -10, "margin"),
      interest("", -10, "margin"),
      interest("2025-01-31", -10, undefined),
      interest("2025-02-28", -10, "margin"),
    ]);
    expect(result).toEqual({ 2025: 10 });
  });

  it("ignores non-interest activity types", () => {
    const buy: AcbTransaction = {
      symbol: "XEQT",
      quantity: 5,
      price: 30,
      type: "buy",
      rawActivityType: "Trade",
      accountType: "margin",
      date: "2025-01-02",
      netCashAmount: -150,
    };
    expect(computeMarginInterest([buy])).toEqual({});
  });

  it("falls back to |quantity × price| when net_cash_amount is absent", () => {
    const tx = interest("2025-01-31", undefined, "margin");
    expect(computeMarginInterest([{ ...tx, quantity: 1, price: 12.5 }])).toEqual({ 2025: 12.5 });
  });

  it("computes from a parsed Wealthsimple export end to end", () => {
    const result = parseWealthsimpleCsv(
      wsCsv(
        "2025-01-02,2025-01-03,acc1,margin,Trade,BUY,LONG,XEQT,iShares,CAD,5,30.00,0,-150.00",
        "2025-03-31,2025-03-31,acc1,margin,InterestCharged,,,,,CAD,,,0,-57.33",
        "2026-01-31,2026-01-31,acc1,margin,InterestCharged,,,,,CAD,,,0,-102.14",
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(computeMarginInterest(result.transactions)).toEqual({
      2025: 57.33,
      2026: 102.14,
    });
  });
});

describe("groupByAccount", () => {
  const tx = (
    accountId: string | undefined,
    accountType: string | undefined,
    symbol = "VEQT",
  ): AcbTransaction => ({
    symbol,
    quantity: 1,
    price: 10,
    type: "buy",
    ...(accountId !== undefined ? { accountId } : {}),
    ...(accountType !== undefined ? { accountType } : {}),
  });

  it("returns an empty list for no transactions", () => {
    expect(groupByAccount([])).toEqual([]);
  });

  it("groups by (accountId, accountType) composite key", () => {
    const a1 = tx("acc1", "non-registered");
    const a2 = tx("acc1", "non-registered", "XEQT");
    const b1 = tx("acc2", "non-registered");
    const c1 = tx("acc1", "margin");
    const groups = groupByAccount([a1, b1, a2, c1]);
    expect(groups).toHaveLength(3);
    const accA = groups.find((g) => g.accountId === "acc1" && g.accountType === "non-registered");
    expect(accA?.transactions).toEqual([a1, a2]);
    const accB = groups.find((g) => g.accountId === "acc2");
    expect(accB?.transactions).toEqual([b1]);
    const accC = groups.find((g) => g.accountType === "margin");
    expect(accC?.transactions).toEqual([c1]);
  });

  it("uses empty strings for the legacy format (no account columns)", () => {
    const legacy = tx(undefined, undefined);
    const groups = groupByAccount([legacy]);
    expect(groups).toEqual([
      {
        accountId: "",
        accountType: "",
        isRegistered: false,
        transactions: [legacy],
      },
    ]);
  });

  it("detects registered accounts case-insensitively (TFSA/RRSP/FHSA)", () => {
    const groups = groupByAccount([
      tx("a", "tfsa"),
      tx("b", "RRSP Savings"),
      tx("c", "My fhsa account"),
      tx("d", "Margin Account"),
      tx("e", "non-registered"),
    ]);
    const registeredById = new Map(groups.map((g) => [g.accountId, g.isRegistered]));
    expect(registeredById.get("a")).toBe(true);
    expect(registeredById.get("b")).toBe(true);
    expect(registeredById.get("c")).toBe(true);
    expect(registeredById.get("d")).toBe(false);
    expect(registeredById.get("e")).toBe(false);
  });

  it("sorts non-registered accounts before registered ones", () => {
    const groups = groupByAccount([
      tx("a", "TFSA"),
      tx("b", "margin"),
      tx("c", "RRSP"),
      tx("d", "non-registered"),
    ]);
    expect(groups.map((g) => g.accountId)).toEqual(["b", "d", "a", "c"]);
  });

  it("uses overrides when grouping consolidated IBKR accounts", () => {
    const groups = groupByAccount([tx("U123", "", "VT"), tx("U456", "", "VCN")], {
      U123: "registered",
    });
    const registeredById = new Map(groups.map((g) => [g.accountId, g.isRegistered]));
    expect(registeredById.get("U123")).toBe(true);
    expect(registeredById.get("U456")).toBe(false);
  });
});

describe("resolveRegistered", () => {
  it("lets a non-registered override win over RRSP account type", () => {
    expect(resolveRegistered("acc1", "RRSP", { acc1: "nonRegistered" })).toBe(false);
  });

  it("lets a registered override mark an empty account type", () => {
    expect(resolveRegistered("acc1", "", { acc1: "registered" })).toBe(true);
  });

  it("falls back to account type regex without an override", () => {
    expect(resolveRegistered("acc1", "Registered Retirement Savings Plan")).toBe(true);
    expect(resolveRegistered("acc2", "")).toBe(false);
  });
});

describe("computeYearlyACB", () => {
  const tx = (
    date: string | undefined,
    quantity: number,
    price: number,
    type: AcbTransaction["type"],
    symbol = "VEQT",
  ): AcbTransaction => ({
    symbol,
    quantity,
    price,
    type,
    ...(date !== undefined ? { date } : {}),
  });

  it("returns an empty list when the symbol has no transactions", () => {
    expect(computeYearlyACB([tx("2024-01-02", 10, 40, "buy")], "XEQT")).toEqual([]);
  });

  it("accumulates buys year by year with a running pool", () => {
    const snapshots = computeYearlyACB(
      [
        tx("2024-01-02", 10, 40, "buy"),
        tx("2024-06-01", 10, 50, "buy"),
        tx("2025-03-01", 5, 60, "buy"),
      ],
      "VEQT",
    );
    expect(snapshots).toEqual([
      {
        year: 2024,
        buyQty: 20,
        sellQty: 0,
        endShares: 20,
        costBasis: 900,
        acbPerShare: 45,
      },
      {
        year: 2025,
        buyQty: 5,
        sellQty: 0,
        endShares: 25,
        costBasis: 1200,
        acbPerShare: 48,
      },
    ]);
  });

  it("applies pro-rata pool reduction on sells (ACB/share unchanged)", () => {
    const snapshots = computeYearlyACB(
      [tx("2024-01-02", 10, 40, "buy"), tx("2025-06-01", 4, 90, "sell")],
      "VEQT",
    );
    expect(snapshots).toEqual([
      {
        year: 2024,
        buyQty: 10,
        sellQty: 0,
        endShares: 10,
        costBasis: 400,
        acbPerShare: 40,
      },
      {
        year: 2025,
        buyQty: 0,
        sellQty: 4,
        endShares: 6,
        costBasis: 240,
        acbPerShare: 40,
      },
    ]);
  });

  it("skips years with no activity for the symbol", () => {
    const snapshots = computeYearlyACB(
      [tx("2022-01-02", 10, 40, "buy"), tx("2025-01-02", 5, 50, "buy")],
      "VEQT",
    );
    expect(snapshots.map((s) => s.year)).toEqual([2022, 2025]);
  });

  it("sorts out-of-order transactions by date before accumulating", () => {
    const snapshots = computeYearlyACB(
      [tx("2025-01-02", 5, 50, "buy"), tx("2024-01-02", 10, 40, "buy")],
      "VEQT",
    );
    expect(snapshots.map((s) => s.year)).toEqual([2024, 2025]);
    expect(snapshots[1].endShares).toBe(15);
    expect(snapshots[1].costBasis).toBe(650);
  });

  it("ignores dividend and interest rows", () => {
    const snapshots = computeYearlyACB(
      [
        tx("2024-01-02", 10, 40, "buy"),
        tx("2024-02-01", 5, 40, "dividend"),
        tx("2024-03-01", 0, 0, "interest"),
      ],
      "VEQT",
    );
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ buyQty: 10, endShares: 10 });
  });

  it("counts transferred shares without adding cost basis", () => {
    const snapshots = computeYearlyACB(
      [tx("2024-01-02", 5, 0, "transfer"), tx("2024-06-01", 10, 40, "buy")],
      "VEQT",
    );
    expect(snapshots[0]).toMatchObject({
      endShares: 15,
      costBasis: 400,
      acbPerShare: 400 / 15,
    });
  });

  it("groups rows without a parseable date under year 0 (Unknown)", () => {
    const snapshots = computeYearlyACB(
      [tx(undefined, 10, 40, "buy"), tx("", 5, 50, "buy"), tx("2025-01-02", 5, 60, "buy")],
      "VEQT",
    );
    expect(snapshots.map((s) => s.year)).toEqual([0, 2025]);
    expect(snapshots[0]).toMatchObject({
      buyQty: 15,
      endShares: 15,
      costBasis: 650,
    });
    expect(snapshots[1]).toMatchObject({ endShares: 20, costBasis: 950 });
  });

  it("returns null ACB for a year with only transfer rows (no purchase history)", () => {
    const txs: AcbTransaction[] = [
      {
        symbol: "XIC",
        quantity: 100,
        price: 0,
        type: "transfer",
        date: "2025-03-01",
      },
    ];
    const snapshots = computeYearlyACB(txs, "XIC");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].acbPerShare).toBeNull();
    expect(snapshots[0].endShares).toBe(100);
    expect(snapshots[0].costBasis).toBe(0);
  });

  it("returns null ACB/share for a year ending with zero shares", () => {
    const snapshots = computeYearlyACB(
      [tx("2024-01-02", 10, 40, "buy"), tx("2024-06-01", 10, 60, "sell")],
      "VEQT",
    );
    expect(snapshots).toEqual([
      {
        year: 2024,
        buyQty: 10,
        sellQty: 10,
        endShares: 0,
        costBasis: 0,
        acbPerShare: null,
      },
    ]);
  });
});

describe("parseFiles", () => {
  const fakeFile = (name: string, content: string): File =>
    ({ name, text: () => Promise.resolve(content) }) as unknown as File;

  it("parses each file and keeps results separate, in order", async () => {
    const { parsed, errors } = await parseFiles([
      fakeFile("a.csv", csv("2024-01-02,VEQT,10,40.00,buy,Bought")),
      fakeFile("b.csv", csv("2025-01-02,VEQT,5,50.00,buy,Bought")),
    ]);
    expect(errors).toEqual([]);
    expect(parsed.map((file) => file.name)).toEqual(["a.csv", "b.csv"]);
    expect(parsed[0].transactions).toHaveLength(1);
    expect(parsed[1].transactions).toHaveLength(1);
  });

  it("collects per-file errors and still returns the valid files", async () => {
    const { parsed, errors } = await parseFiles([
      fakeFile("bad.csv", ""),
      fakeFile("good.csv", csv("2025-01-02,VEQT,10,40.00,buy,Bought")),
    ]);
    expect(errors).toEqual(["bad.csv: No transactions found"]);
    expect(parsed.map((file) => file.name)).toEqual(["good.csv"]);
  });

  it("reports unreadable files", async () => {
    const unreadable = {
      name: "broken.csv",
      text: () => Promise.reject(new Error("nope")),
    } as unknown as File;
    const { parsed, errors } = await parseFiles([unreadable]);
    expect(parsed).toEqual([]);
    expect(errors).toEqual(["broken.csv: could not read the file."]);
  });

  it("supports additive uploads: appending preserves earlier files", async () => {
    // Simulates Main.tsx adding files across two picker opens.
    const first = await parseFiles([
      fakeFile("2024.csv", csv("2024-01-02,VEQT,10,40.00,buy,Bought")),
    ]);
    const second = await parseFiles([
      fakeFile("2025.csv", csv("2025-01-02,VEQT,5,50.00,buy,Bought")),
    ]);
    const all = [...first.parsed, ...second.parsed];
    expect(all.map((file) => file.name)).toEqual(["2024.csv", "2025.csv"]);
    const merged = all
      .flatMap((file) => file.transactions)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    expect(computeHoldings(merged)[0]).toMatchObject({
      symbol: "VEQT",
      shares: 15,
      costBasis: 650,
    });
  });
});

describe("transferLotsForSymbol", () => {
  const tx = (
    symbol: string,
    quantity: number,
    type: AcbTransaction["type"],
    date?: string,
  ): AcbTransaction => ({ symbol, quantity, price: 0, type, date });

  it("returns one lot per transfer row for the symbol, in date order", () => {
    const lots = transferLotsForSymbol(
      [
        tx("XEQT", 50, "transfer", "2024-03-02"),
        tx("XEQT", 100, "transfer", "2023-01-15"),
        tx("XEQT", 10, "buy", "2023-06-01"),
        tx("VEQT", 5, "transfer", "2023-02-01"),
      ],
      "XEQT",
    );
    expect(lots).toEqual([
      { date: "2023-01-15", quantity: 100 },
      { date: "2024-03-02", quantity: 50 },
    ]);
  });

  it("returns an empty list when the symbol has no transfers", () => {
    expect(transferLotsForSymbol([tx("XEQT", 10, "buy")], "XEQT")).toEqual([]);
  });

  it("uses an empty date string for transfers with no date", () => {
    expect(transferLotsForSymbol([tx("XEQT", 7, "transfer")], "XEQT")).toEqual([
      { date: "", quantity: 7 },
    ]);
  });
});

describe("sumOpeningLot", () => {
  it("sums per-lot ACBs", () => {
    expect(sumOpeningLot([9000, 3500])).toBe(12500);
  });

  it("treats undefined and sparse entries as zero", () => {
    expect(sumOpeningLot(undefined)).toBe(0);
    expect(sumOpeningLot([1000, 0, 500])).toBe(1500);
  });
});
