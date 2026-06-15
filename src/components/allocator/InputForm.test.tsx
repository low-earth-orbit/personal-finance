import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test-utils";
import { DEFAULTS } from "@/utils/allocator/presets";
import InputForm from "./InputForm";

describe("allocator InputForm", () => {
  it("shows editable income terms only for the custom curve", () => {
    const props = {
      errors: {},
      started: false,
      loading: false,
      onChange: vi.fn(),
      onReset: vi.fn(),
      onShowRecommendation: vi.fn(),
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

  it("hides preset return details until Custom return is selected", async () => {
    const user = userEvent.setup();
    const props = {
      errors: {},
      started: false,
      loading: false,
      onChange: vi.fn(),
      onReset: vi.fn(),
      onShowRecommendation: vi.fn(),
    };
    const { rerender } = renderWithMantine(
      <InputForm input={DEFAULTS} {...props} />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Investment assumptions",
      }),
    );
    expect(screen.queryByLabelText("Nominal return")).not.toBeInTheDocument();

    rerender(
      <InputForm
        input={{ ...DEFAULTS, portfolioPresetId: "custom" }}
        {...props}
      />,
    );
    expect(screen.getByLabelText("Nominal return")).toBeInTheDocument();
  });

  it("generates only after the user reviews the example inputs", async () => {
    const user = userEvent.setup();
    const onShowRecommendation = vi.fn();
    renderWithMantine(
      <InputForm
        input={DEFAULTS}
        errors={{}}
        started={false}
        loading={false}
        onChange={vi.fn()}
        onReset={vi.fn()}
        onShowRecommendation={onShowRecommendation}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Show recommendation" }),
    );
    expect(onShowRecommendation).toHaveBeenCalledOnce();
  });

  it("replaces the button with the auto-update notice once started", () => {
    renderWithMantine(
      <InputForm
        input={DEFAULTS}
        errors={{}}
        started
        loading
        onChange={vi.fn()}
        onReset={vi.fn()}
        onShowRecommendation={vi.fn()}
      />,
    );

    // Once started, the recommendation recomputes automatically: no Show button,
    // just the notice — including while a recompute is in flight (loading).
    expect(
      screen.queryByRole("button", { name: "Show recommendation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Recommendation updates automatically/i),
    ).toBeInTheDocument();
  });

  it("uses one explicit RRSP withdrawal tax-rate input", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <InputForm
        input={DEFAULTS}
        errors={{}}
        started={false}
        loading={false}
        onChange={vi.fn()}
        onReset={vi.fn()}
        onShowRecommendation={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Retirement tax assumptions",
      }),
    );

    expect(
      screen.getByLabelText("Effective RRSP withdrawal tax rate"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Capital gains tax rate at retirement"),
    ).toHaveValue("15%");
    expect(screen.queryByText("Derive from income")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Expected annual taxable retirement income"),
    ).not.toBeInTheDocument();
  });
});
