import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, screen } from "@/test-utils";
import TransferModal from "./TransferModal";
import type { TransferLot } from "@/utils/acb/parser";

const noop = () => {};

const LOTS: TransferLot[] = [
  { date: "2023-01-15", quantity: 100 },
  { date: "2024-03-02", quantity: 50 },
];

describe("TransferModal", () => {
  it("renders nothing when symbol is null", () => {
    renderWithMantine(
      <TransferModal symbol={null} lots={[]} acbs={[]} onChange={noop} onClose={noop} />,
    );
    expect(screen.queryByText(/Transfer lots/)).not.toBeInTheDocument();
  });

  it("shows the symbol in the title and one row per transfer lot", () => {
    renderWithMantine(
      <TransferModal
        symbol="XEQT"
        lots={LOTS}
        acbs={[9000, 3500]}
        onChange={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText("Transfer lots — XEQT")).toBeInTheDocument();
    expect(screen.getByText("2023-01-15")).toBeInTheDocument();
    expect(screen.getByText("2024-03-02")).toBeInTheDocument();
    expect(screen.getByLabelText("Opening lot ACB for XEQT lot 1")).toHaveValue("$9000");
    expect(screen.getByLabelText("Opening lot ACB for XEQT lot 2")).toHaveValue("$3500");
  });

  it("shows the live opening lot total across all lots", () => {
    renderWithMantine(
      <TransferModal
        symbol="XEQT"
        lots={LOTS}
        acbs={[9000, 3500]}
        onChange={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText(/Total opening lot ACB:/)).toHaveTextContent("$12,500.00");
  });

  it("propagates a per-lot ACB edit without dropping other lots", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(
      <TransferModal
        symbol="XEQT"
        lots={LOTS}
        acbs={[9000, 0]}
        onChange={onChange}
        onClose={noop}
      />,
    );
    await user.type(screen.getByLabelText("Opening lot ACB for XEQT lot 2"), "5");
    expect(onChange).toHaveBeenLastCalledWith([9000, 5]);
  });

  it("falls back to Unknown date for transfers with no date", () => {
    renderWithMantine(
      <TransferModal
        symbol="XEQT"
        lots={[{ date: "", quantity: 7 }]}
        acbs={[]}
        onChange={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText("Unknown date")).toBeInTheDocument();
  });

  it("calls onClose from the Close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithMantine(
      <TransferModal symbol="XEQT" lots={LOTS} acbs={[]} onChange={noop} onClose={onClose} />,
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
