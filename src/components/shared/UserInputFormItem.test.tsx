import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithMantine, screen } from "@/test-utils";
import UserInputFormItem from "./UserInputFormItem";

describe("UserInputFormItem", () => {
  it("only reserves space for additional text when it is present", () => {
    const { container, rerender } = renderWithMantine(
      <UserInputFormItem id="amount" label="Amount" value={100} onChange={vi.fn()} />,
    );

    expect(container.querySelector("[aria-live='polite']")).toBeNull();

    rerender(
      <UserInputFormItem
        id="amount"
        label="Amount"
        additionalText="Calculated detail"
        value={100}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Calculated detail")).toHaveAttribute("aria-live", "polite");
  });

  it("keeps the field label associated with the input when switching units", () => {
    const onChange = vi.fn();

    renderWithMantine(
      <UserInputFormItem
        id="annualSavings"
        label="Annual savings"
        labelHelperText="Amount saved each year."
        value={20}
        onChange={onChange}
        percentToggle={{
          base: 100_000,
          defaultUnit: "%",
          unitAriaLabel: "Annual savings input unit",
        }}
      />,
    );

    expect(screen.getByLabelText("Annual savings", { selector: "input" })).toHaveValue("20%");

    fireEvent.click(screen.getByRole("radio", { name: "$" }));

    expect(screen.getByLabelText("Annual savings", { selector: "input" })).toHaveValue(
      "$20,000 /yr",
    );
  });
});
