import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test-utils";
import { DEFAULTS } from "@/utils/allocator/presets";
import InputForm from "./InputForm";

describe("allocator InputForm", () => {
  it("shows editable income terms only for the custom curve", () => {
    const props = {
      errors: {},
      onChange: vi.fn(),
      onReset: vi.fn(),
    };
    const { rerender } = renderWithMantine(
      <InputForm input={DEFAULTS} {...props} />,
    );

    expect(
      screen.queryByLabelText("Real income growth"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Growth period")).not.toBeInTheDocument();

    rerender(
      <InputForm input={{ ...DEFAULTS, salaryCurve: "custom" }} {...props} />,
    );

    expect(screen.getByLabelText("Real income growth")).toBeInTheDocument();
    expect(screen.getByLabelText("Growth period")).toBeInTheDocument();
  });
});
