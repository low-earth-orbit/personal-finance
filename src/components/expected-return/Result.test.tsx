import { describe, expect, it } from "vitest";
import { renderWithMantine, screen, within } from "@/test-utils";
import Result from "./Result";
import { computeExpectedReturn } from "@/utils/expected-return/engine";
import { DEFAULTS } from "@/utils/expected-return/presets";

describe("Expected return Result", () => {
  it("asks for valid inputs when there is no result", () => {
    renderWithMantine(<Result result={null} input={DEFAULTS} paused={false} />);
    expect(screen.getByText("Complete the inputs")).toBeInTheDocument();
  });

  it("shows the headline, range, figures and region breakdown", () => {
    renderWithMantine(
      <Result result={computeExpectedReturn(DEFAULTS)} input={DEFAULTS} paused={false} />,
    );

    expect(screen.getByRole("heading", { name: "4.2% a year" })).toBeInTheDocument();
    expect(
      screen.getByText(/five views range from 3\.2% to 5\.7% after costs/),
    ).toBeInTheDocument();
    const figure = (label: string) => within(screen.getByText(label).closest("div")!);
    expect(figure("Nominal, compound").getByText("6.4%")).toBeInTheDocument();
    expect(figure("Nominal, arithmetic").getByText("7.2%")).toBeInTheDocument();

    const table = screen.getByRole("table", { name: /By region and view/ });
    const usRow = within(table).getByText("US").closest("tr")!;
    expect(within(usRow).getByText(/CAPE 40 → 26\.5 · −1\.36%\/yr/)).toBeInTheDocument();
    // CAPE reversion and earnings yield (1.075 / 40) both round to 2.7%; bond + premium is 2.0% + 4.0%.
    expect(within(usRow).getAllByText("2.7%")).toHaveLength(2);
    expect(within(usRow).getByText("6.0%")).toBeInTheDocument();
    expect(within(table).getByText("Portfolio")).toBeInTheDocument();
    expect(screen.queryByText(/Update paused/)).not.toBeInTheDocument();
  });

  it("flags a paused result while keeping it visible", () => {
    renderWithMantine(<Result result={computeExpectedReturn(DEFAULTS)} input={DEFAULTS} paused />);
    expect(screen.getByText("Update paused: fix the highlighted fields.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "4.2% a year" })).toBeInTheDocument();
  });
});
