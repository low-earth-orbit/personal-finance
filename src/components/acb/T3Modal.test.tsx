import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, screen } from "@/test-utils";
import T3Modal from "./T3Modal";
import type { T3Entry } from "@/utils/acb/parser";

const noop = () => {};

const ENTRIES: T3Entry[] = [
  { year: 2023, box21: 120, box42: 0 },
  { year: 2024, box21: 0, box42: 50 },
];

describe("T3Modal", () => {
  it("renders nothing when symbol is null", () => {
    renderWithMantine(<T3Modal symbol={null} entries={[]} onChange={noop} onClose={noop} />);
    expect(screen.queryByText(/T3 Slips/)).not.toBeInTheDocument();
  });

  it("shows the symbol in the title and one row per entry", () => {
    renderWithMantine(<T3Modal symbol="VEQT" entries={ENTRIES} onChange={noop} onClose={noop} />);
    expect(screen.getByText("T3 Slips — VEQT")).toBeInTheDocument();
    expect(screen.getByLabelText("Box 21 for row 1")).toHaveValue("$120");
    expect(screen.getByLabelText("Box 42 for row 2")).toHaveValue("$50");
  });

  it("shows the live net ACB adjustment", () => {
    renderWithMantine(<T3Modal symbol="VEQT" entries={ENTRIES} onChange={noop} onClose={noop} />);
    // 120 − 50 = +70
    expect(screen.getByText(/Net ACB adjustment:/)).toHaveTextContent("+$70.00");
  });

  it("adds a new row with the current year on + Add year", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(
      <T3Modal symbol="VEQT" entries={ENTRIES} onChange={onChange} onClose={noop} />,
    );
    await user.click(screen.getByRole("button", { name: "+ Add year" }));
    expect(onChange).toHaveBeenCalledWith([
      ...ENTRIES,
      { year: new Date().getFullYear() - 1, box21: 0, box42: 0 },
    ]);
  });

  it("deletes a row", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(
      <T3Modal symbol="VEQT" entries={ENTRIES} onChange={onChange} onClose={noop} />,
    );
    await user.click(screen.getByRole("button", { name: "Delete row 1" }));
    expect(onChange).toHaveBeenCalledWith([ENTRIES[1]]);
  });

  it("propagates box edits immediately", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(
      <T3Modal
        symbol="VEQT"
        entries={[{ year: 2024, box21: 0, box42: 0 }]}
        onChange={onChange}
        onClose={noop}
      />,
    );
    await user.type(screen.getByLabelText("Box 21 for row 1"), "5");
    expect(onChange).toHaveBeenLastCalledWith([{ year: 2024, box21: 5, box42: 0 }]);
  });

  it("calls onClose from the Close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithMantine(<T3Modal symbol="VEQT" entries={[]} onChange={noop} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
