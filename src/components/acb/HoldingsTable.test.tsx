import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, screen, within } from "@/test-utils";
import HoldingsTable, { type AcbAdjustments } from "./HoldingsTable";
import { computeAdjustedHoldings } from "@/utils/acb/parser";
import type { AcbTransaction, Holding } from "@/utils/acb/parser";

const HOLDINGS: Holding[] = [
  {
    symbol: "VEQT",
    shares: 10,
    costBasis: 400,
    acbPerShare: 40,
    transferredShares: 0,
  },
  {
    symbol: "XEQT",
    shares: 0,
    costBasis: 0,
    acbPerShare: null,
    transferredShares: 0,
  },
];

const HOLDINGS_WITH_TRANSFER: Holding[] = [
  {
    symbol: "VEQT",
    shares: 10,
    costBasis: 400,
    acbPerShare: 40,
    transferredShares: 0,
  },
  {
    symbol: "XEQT",
    shares: 15,
    costBasis: 300,
    acbPerShare: 20,
    transferredShares: 5,
  },
];

const noop = () => {};

/** Adjustments prop with no T3 entries or opening lots. */
function emptyAdjustments(overrides: Partial<AcbAdjustments> = {}): AcbAdjustments {
  return {
    t3Slips: {},
    onEditT3: noop,
    openingLots: {},
    onEditTransfers: noop,
    dated: {},
    ...overrides,
  };
}

describe("HoldingsTable", () => {
  it("renders one row per holding with shares, ACB, and cost basis", () => {
    renderWithMantine(<HoldingsTable holdings={HOLDINGS} adjustments={emptyAdjustments()} />);

    const veqtRow = screen.getByText("VEQT").closest("tr")!;
    expect(within(veqtRow).getByText("10")).toBeInTheDocument();
    expect(within(veqtRow).getByText("$40.00")).toBeInTheDocument();
    expect(within(veqtRow).getByText("$400.00")).toBeInTheDocument();
  });

  it("hides ghost rows: holdings with zero shares are not rendered", () => {
    renderWithMantine(<HoldingsTable holdings={HOLDINGS} adjustments={emptyAdjustments()} />);

    // XEQT was fully sold (0 shares): no row for it.
    expect(screen.queryByText("XEQT")).not.toBeInTheDocument();
    expect(screen.getByText("VEQT")).toBeInTheDocument();
  });

  it("renders time-ordered adjusted holdings (T3 applied on its date)", () => {
    const txs: AcbTransaction[] = [
      { symbol: "VEQT", quantity: 10, price: 40, type: "buy", date: "2023-01-01" },
    ];
    const dated = { VEQT: [{ date: "2024-12-31", amount: -100 }] };
    renderWithMantine(
      <HoldingsTable
        holdings={computeAdjustedHoldings(txs, dated)}
        transactions={txs}
        adjustments={emptyAdjustments({
          t3Slips: { VEQT: [{ year: 2024, phantom: 0, box42: 100 }] },
          dated,
        })}
      />,
    );

    // ROC of $100 reduces pool: $400 - $100 = $300, ACB/share = $30
    const veqtRow = screen.getByText("VEQT").closest("tr")!;
    expect(within(veqtRow).getByText("$300.00")).toBeInTheDocument();
    expect(within(veqtRow).getByText("$30.00")).toBeInTheDocument();
  });

  it("nets phantom against box 42 across years", () => {
    const txs: AcbTransaction[] = [
      { symbol: "VEQT", quantity: 10, price: 40, type: "buy", date: "2023-01-01" },
    ];
    const dated = {
      VEQT: [
        { date: "2023-12-31", amount: 150 },
        { date: "2024-12-31", amount: -50 },
      ],
    };
    renderWithMantine(
      <HoldingsTable
        holdings={computeAdjustedHoldings(txs, dated)}
        transactions={txs}
        adjustments={emptyAdjustments({
          t3Slips: {
            VEQT: [
              { year: 2023, phantom: 150, box42: 0 },
              { year: 2024, phantom: 0, box42: 50 },
            ],
          },
          dated,
        })}
      />,
    );

    // Net +$100 raises pool: $400 + $100 = $500, ACB/share = $50
    const veqtRow = screen.getByText("VEQT").closest("tr")!;
    expect(within(veqtRow).getByText("$500.00")).toBeInTheDocument();
    expect(within(veqtRow).getByText("$50.00")).toBeInTheDocument();
  });

  it("shows a signed badge next to Edit T3 when the net is non-zero", () => {
    renderWithMantine(
      <HoldingsTable
        holdings={HOLDINGS_WITH_TRANSFER}
        adjustments={emptyAdjustments({
          t3Slips: {
            VEQT: [{ year: 2024, phantom: 0, box42: 50 }],
            XEQT: [{ year: 2024, phantom: 120, box42: 0 }],
          },
        })}
      />,
    );

    const veqtRow = screen.getByText("VEQT").closest("tr")!;
    expect(within(veqtRow).getByText("−$50.00")).toBeInTheDocument();
    const xeqtRow = screen.getByText("XEQT").closest("tr")!;
    expect(within(xeqtRow).getByText("+$120.00")).toBeInTheDocument();
  });

  it("shows no badge when there are no T3 entries or the net is zero", () => {
    renderWithMantine(
      <HoldingsTable
        holdings={HOLDINGS}
        adjustments={emptyAdjustments({
          t3Slips: { VEQT: [{ year: 2024, phantom: 25, box42: 25 }] },
        })}
      />,
    );

    expect(screen.queryByText(/^[+−]\$/)).not.toBeInTheDocument();
  });

  it("calls onEditT3 with the symbol when Edit T3 is clicked", async () => {
    const user = userEvent.setup();
    const onEditT3 = vi.fn();
    renderWithMantine(
      <HoldingsTable holdings={HOLDINGS} adjustments={emptyAdjustments({ onEditT3 })} />,
    );

    const veqtRow = screen.getByText("VEQT").closest("tr")!;
    await user.click(within(veqtRow).getByRole("button", { name: "Edit T3" }));
    expect(onEditT3).toHaveBeenCalledWith("VEQT");
  });

  it("hides the transfer lots column when no holding has transferred shares", () => {
    renderWithMantine(<HoldingsTable holdings={HOLDINGS} adjustments={emptyAdjustments()} />);

    expect(screen.queryByText("Transfer lots")).not.toBeInTheDocument();
  });

  it("flags holdings with transferred shares and shows the Edit transfers button", () => {
    renderWithMantine(
      <HoldingsTable holdings={HOLDINGS_WITH_TRANSFER} adjustments={emptyAdjustments()} />,
    );

    expect(screen.getByText("Transfer lots")).toBeInTheDocument();
    const xeqtRow = screen.getByText("XEQT").closest("tr")!;
    expect(within(xeqtRow).getByText("5 transferred")).toBeInTheDocument();
    expect(within(xeqtRow).getByRole("button", { name: "Edit transfers" })).toBeInTheDocument();
    // VEQT has no transfers: dash in its transfer lots cell, no button.
    const veqtRow = screen.getByText("VEQT").closest("tr")!;
    expect(
      within(veqtRow).queryByRole("button", { name: "Edit transfers" }),
    ).not.toBeInTheDocument();
  });

  it("adds the opening lot on its date before the T3 net", () => {
    const txs: AcbTransaction[] = [
      { symbol: "XEQT", quantity: 5, price: 0, type: "transfer", date: "2023-01-01" },
      { symbol: "XEQT", quantity: 10, price: 30, type: "buy", date: "2024-01-01" },
    ];
    const dated = {
      XEQT: [
        { date: "2023-01-01", amount: 200 },
        { date: "2024-12-31", amount: -50 },
      ],
    };
    renderWithMantine(
      <HoldingsTable
        holdings={computeAdjustedHoldings(txs, dated)}
        transactions={txs}
        adjustments={emptyAdjustments({
          t3Slips: { XEQT: [{ year: 2024, phantom: 0, box42: 50 }] },
          openingLots: { XEQT: 200 },
          dated,
        })}
      />,
    );

    // $200 opening lot + $300 of buys - $50 ROC = $450; ACB/share = 450/15 = $30
    const xeqtRow = screen.getByText("XEQT").closest("tr")!;
    expect(within(xeqtRow).getByText("$450.00")).toBeInTheDocument();
    expect(within(xeqtRow).getByText("$30.00")).toBeInTheDocument();
    // The opening-lot total shows as a badge next to the button.
    expect(within(xeqtRow).getByText("+$200.00")).toBeInTheDocument();
  });

  it("flags a deemed gain badge when ROC exceeds the pool", () => {
    const txs: AcbTransaction[] = [
      { symbol: "VEQT", quantity: 10, price: 40, type: "buy", date: "2023-01-01" },
    ];
    const dated = { VEQT: [{ date: "2024-12-31", amount: -500 }] };
    renderWithMantine(
      <HoldingsTable
        holdings={computeAdjustedHoldings(txs, dated)}
        transactions={txs}
        adjustments={emptyAdjustments({
          t3Slips: { VEQT: [{ year: 2024, phantom: 0, box42: 500 }] },
          dated,
        })}
      />,
    );

    const veqtRow = screen.getByText("VEQT").closest("tr")!;
    expect(within(veqtRow).getByText("+$100.00 deemed gain")).toBeInTheDocument();
  });

  it("flags missing history when sales exceeded recorded purchases", () => {
    const txs: AcbTransaction[] = [
      { symbol: "VEQT", quantity: 10, price: 40, type: "buy", date: "2023-01-01" },
      { symbol: "VEQT", quantity: 15, price: 50, type: "sell", date: "2023-02-01" },
      { symbol: "VEQT", quantity: 10, price: 40, type: "buy", date: "2023-03-01" },
    ];
    renderWithMantine(
      <HoldingsTable
        holdings={computeAdjustedHoldings(txs)}
        transactions={txs}
        adjustments={emptyAdjustments()}
      />,
    );

    const veqtRow = screen.getByText("VEQT").closest("tr")!;
    expect(within(veqtRow).getByText("missing history")).toBeInTheDocument();
  });

  it("calls onEditTransfers with the symbol when Edit transfers is clicked", async () => {
    const user = userEvent.setup();
    const onEditTransfers = vi.fn();
    renderWithMantine(
      <HoldingsTable
        holdings={HOLDINGS_WITH_TRANSFER}
        adjustments={emptyAdjustments({ onEditTransfers })}
      />,
    );

    const xeqtRow = screen.getByText("XEQT").closest("tr")!;
    await user.click(within(xeqtRow).getByRole("button", { name: "Edit transfers" }));
    expect(onEditTransfers).toHaveBeenCalledWith("XEQT");
  });

  it("shows raw book cost with no edit controls when adjustments are omitted", () => {
    renderWithMantine(<HoldingsTable holdings={HOLDINGS_WITH_TRANSFER} />);

    // Raw mode: no T3 column, no Edit T3 buttons, no opening lot column even
    // with transferred shares present.
    expect(screen.queryByText("T3 slips")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit T3" })).not.toBeInTheDocument();
    expect(screen.queryByText("Transfer lots")).not.toBeInTheDocument();
    // Unadjusted figures straight from the holding.
    const veqtRow = screen.getByText("VEQT").closest("tr")!;
    expect(within(veqtRow).getByText("$400.00")).toBeInTheDocument();
    expect(within(veqtRow).getByText("$40.00")).toBeInTheDocument();
  });

  it("shows no row-expansion toggles when transactions are not provided", () => {
    renderWithMantine(<HoldingsTable holdings={HOLDINGS} adjustments={emptyAdjustments()} />);

    expect(
      screen.queryByRole("button", { name: /Toggle year-by-year ACB/ }),
    ).not.toBeInTheDocument();
  });

  it("expands a row to its year-by-year ACB breakdown when transactions are provided", async () => {
    const user = userEvent.setup();
    const transactions: AcbTransaction[] = [
      {
        symbol: "VEQT",
        quantity: 10,
        price: 40,
        type: "buy",
        date: "2023-03-01",
      },
    ];
    renderWithMantine(
      <HoldingsTable
        holdings={HOLDINGS}
        adjustments={emptyAdjustments()}
        transactions={transactions}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "Toggle year-by-year ACB for VEQT",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("2023")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("2023")).toBeInTheDocument();
    expect(screen.getByText("Cost Basis")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("2023")).not.toBeInTheDocument();
  });

  it("includes dated adjustments in the expanded year-by-year breakdown", async () => {
    const user = userEvent.setup();
    const transactions: AcbTransaction[] = [
      { symbol: "VEQT", quantity: 10, price: 40, type: "buy", date: "2023-03-01" },
    ];
    const dated = { VEQT: [{ date: "2023-12-31", amount: 100 }] };
    renderWithMantine(
      <HoldingsTable
        holdings={computeAdjustedHoldings(transactions, dated)}
        adjustments={emptyAdjustments({ dated })}
        transactions={transactions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Toggle year-by-year ACB for VEQT" }));
    // $400 of buys + $100 phantom all in 2023: once in the holdings row, once
    // in the year-by-year breakdown.
    expect(screen.getAllByText("$500.00")).toHaveLength(2);
  });
});
