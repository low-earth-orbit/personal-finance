import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Result from "./Result";
import { DEFAULTS } from "@/utils/allocator/presets";
import { allocateLumpSum } from "@/utils/allocator/allocate";
import { renderWithMantine } from "@/test-utils";

describe("Allocator Result", () => {
  it("guards incomplete inputs", () => {
    renderWithMantine(
      <Result allocation={null} input={DEFAULTS} status="invalid" />,
    );
    expect(screen.getByText("Complete the inputs")).toBeInTheDocument();
  });

  it("shows the optimized one-time allocation", () => {
    const input = { ...DEFAULTS, lumpSum: 20_000 };
    const allocation = allocateLumpSum(input, input.lumpSum);
    renderWithMantine(
      <Result allocation={allocation} input={input} status="ready" />,
    );

    expect(
      screen.getByRole("heading", { name: "Invest $20,000" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Refunds of .* are additional invested cash/),
    ).toBeInTheDocument();
  });

  it("shows calculation progress instead of an input error", () => {
    renderWithMantine(
      <Result allocation={null} input={DEFAULTS} status="loading" />,
    );
    expect(screen.getByText("Calculating recommendation")).toBeInTheDocument();
  });
});
