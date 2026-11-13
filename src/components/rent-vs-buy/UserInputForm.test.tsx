import { describe, expect, it, vi } from "vitest";
import { renderWithMantine, screen } from "@/test-utils";
import UserInputForm from "./UserInputForm";
import { DEFAULTS } from "@/utils/presets";
import type { UserInput } from "@/types";

function renderForm(overrides: Partial<UserInput> = {}) {
  const userInput = { ...DEFAULTS, ...overrides } as UserInput;
  return renderWithMantine(
    <UserInputForm
      userInput={userInput}
      handleChange={vi.fn()}
      handleReset={vi.fn()}
      expandedFields={[]}
      toggleFieldExpanded={vi.fn()}
      errors={{}}
    />,
  );
}

describe("UserInputForm owner costs", () => {
  it("lists insurance on its own and one growth rate for every owner cost", () => {
    renderForm();
    expect(screen.getByText("Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Home insurance")).toBeInTheDocument();
    expect(screen.getByText("Owner cost growth")).toBeInTheDocument();
    expect(
      screen.getByText("Applies to property tax, condo fees, maintenance and insurance."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Building aging")).toBeNull();
    expect(screen.queryByText("Cost inflation")).toBeNull();
  });
});

describe("UserInputForm mortgage readout", () => {
  it("renders with valid defaults", () => {
    expect(() => renderForm()).not.toThrow();
  });

  // Regression: clearing the amortization field stores "" (see Main.handleChange).
  // This used to reach calculateMonthlyMortgagePayment and throw
  // "Amortization period must be greater than zero." during render, crashing the
  // app. The math now soft-fails and the readout guards against bad display.
  it("does not crash when amortization is cleared to empty", () => {
    expect(() => renderForm({ amortization: "" as unknown as number })).not.toThrow();
  });

  it("does not crash when amortization is zero", () => {
    expect(() => renderForm({ amortization: 0 })).not.toThrow();
  });

  it("does not crash when initial home price is cleared to empty", () => {
    expect(() => renderForm({ initialHomePrice: "" as unknown as number })).not.toThrow();
  });
});
