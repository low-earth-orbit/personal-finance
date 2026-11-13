import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithMantine } from "@/test-utils";
import { computeSwrTable } from "@/utils/swr/engine";
import { DEFAULTS } from "@/utils/swr/presets";
import Result from "./Result";

const input = { ...DEFAULTS };
const result = computeSwrTable(input, "independent", { paths: 500 });

describe("swr Result", () => {
  it("renders 11 allocation rows by 7 horizons", () => {
    renderWithMantine(<Result input={input} result={result} />);
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(12); // header + 11
    expect(screen.getByText("60/40")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(8);
    expect(within(rows[5]).getByRole("rowheader")).toHaveTextContent("60/40");
    expect(within(rows[5]).getAllByRole("cell")).toHaveLength(7);
  });

  it("marks the highest rate in each horizon column", () => {
    const { container } = renderWithMantine(<Result input={input} result={result} />);
    // One highlighted cell per horizon column (ties aside).
    expect(container.querySelectorAll("td[data-best]").length).toBeGreaterThanOrEqual(7);
    const bestRows = result.horizons.map((_, h) => {
      const column = result.rates.map((row) => row[h]);
      return column.indexOf(Math.max(...column));
    });
    const rows = screen.getAllByRole("row").slice(1);
    bestRows.forEach((rowIndex, h) => {
      expect(rows[rowIndex].querySelectorAll("td:not([role=rowheader])")[h]).toHaveAttribute(
        "data-best",
      );
    });
  });

  it("shows the loader while the first result is pending", () => {
    renderWithMantine(<Result input={input} result={null} loading />);
    expect(screen.getByLabelText("Calculating")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("warns when the correlation was clamped", () => {
    renderWithMantine(<Result input={input} result={{ ...result, correlationClamped: true }} />);
    expect(screen.getByText("Correlation adjusted")).toBeInTheDocument();
  });
});
