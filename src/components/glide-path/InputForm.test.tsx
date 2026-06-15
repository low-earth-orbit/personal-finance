import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithMantine, screen } from "@/test-utils";
import { DEFAULTS } from "@/utils/glide-path/presets";
import type { GlidePathInput } from "@/utils/glide-path/types";
import InputForm from "./InputForm";

function renderForm(input: Partial<GlidePathInput> = {}) {
  return renderWithMantine(
    <InputForm
      input={{
        ...DEFAULTS,
        flexibility: 0.5,
        maxEquityPct: 150,
        ...input,
      }}
      errors={{}}
      returnMode="forward-block"
      onChange={vi.fn()}
      onReturnModeChange={vi.fn()}
      onReset={vi.fn()}
      onGenerate={vi.fn()}
      generating={false}
    />,
  );
}

describe("glide-path InputForm guidance", () => {
  it("shows unfamiliar model controls inline", () => {
    renderForm();

    expect(
      screen.getByRole("group", { name: "Risk aversion" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /The percentage of the current portfolio drawn each year/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Time preference (β)" }),
    ).toHaveValue("0.985");
  });

  it("keeps optional and advanced detail in helper popovers", async () => {
    renderForm();

    expect(
      screen.getByRole("button", {
        name: /more information about guaranteed income/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Simulation" }));

    expect(
      await screen.findByRole("button", {
        name: /more information about max equity/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /more information about glide step/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: /more information about monte carlo paths/i,
      }),
    ).toBeInTheDocument();
  });

  it("places a custom risk-aversion input in a selected popover", async () => {
    renderForm({ gamma: 4.5 });

    const custom = screen.getByRole("button", { name: "Custom" });
    expect(custom).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(custom);

    expect(
      await screen.findByRole("textbox", { name: "Custom risk aversion" }),
    ).toHaveValue("4.5");
  });

  it("disables the generate button and shows loading while computing", () => {
    renderWithMantine(
      <InputForm
        input={DEFAULTS}
        errors={{}}
        returnMode="iid-mc"
        onChange={vi.fn()}
        onReturnModeChange={vi.fn()}
        onReset={vi.fn()}
        onGenerate={vi.fn()}
        generating
      />,
    );

    const button = screen.getByRole("button", {
      name: "Generate allocation paths",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("data-loading", "true");
  });
});
