import { describe, it, expect } from "vitest";
import { renderWithMantine, screen } from "@/test-utils";
import FieldLabel from "./FieldLabel";

describe("FieldLabel", () => {
  it("renders just the label when there is no helper text", () => {
    renderWithMantine(<FieldLabel label="Monthly Rent" />);
    expect(screen.getByText("Monthly Rent")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more information/i })).not.toBeInTheDocument();
  });

  it("shows an info button when helper text is provided", () => {
    renderWithMantine(<FieldLabel label="Mortgage Rate" helperText="Annual interest rate." />);
    expect(screen.getByText("Mortgage Rate")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /more information about mortgage rate/i,
      }),
    ).toBeInTheDocument();
  });
});
