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

/** "Spending & risk" starts collapsed; open it to reach its controls. */
function openSpendingAndRisk() {
  fireEvent.click(screen.getByRole("button", { name: "Spending & risk" }));
}

describe("glide-path InputForm guidance", () => {
  it("starts with Spending & risk collapsed", () => {
    renderForm();

    expect(screen.getByRole("button", { name: "Spending & risk" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("group", { name: "Risk aversion" })).toBeNull();
  });

  it("shows unfamiliar model controls inline", async () => {
    renderForm();
    openSpendingAndRisk();

    expect(await screen.findByRole("group", { name: "Risk aversion" })).toBeInTheDocument();
    expect(
      screen.getByText(/The percentage of the current portfolio drawn each year/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Time preference (β)" })).toHaveValue("0.985");
  });

  it("explains that gamma is nearly inert for constant-dollar spending", () => {
    renderForm({ flexibility: 0 });

    expect(screen.getByText(/γ barely changes the allocation/i)).toBeInTheDocument();
  });

  it("keeps optional and advanced detail in helper popovers", async () => {
    renderForm();

    expect(
      screen.getByRole("button", {
        name: /more information about guaranteed income$/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /more information about guaranteed income starts at/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Simulation" }));

    expect(
      await screen.findByRole("button", {
        name: /more information about max equity/i,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: /more information about monte carlo paths/i,
      }),
    ).toBeInTheDocument();
  });

  it("places a custom risk-aversion input in a selected popover", async () => {
    renderForm({ gamma: 4.5 });
    openSpendingAndRisk();

    const custom = await screen.findByRole("button", { name: "Custom" });
    expect(custom).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(custom);

    expect(await screen.findByRole("textbox", { name: "Custom risk aversion" })).toHaveValue("4.5");
  });

  it("has no heirs, retirement max equity or glide-step controls", () => {
    renderForm({});
    fireEvent.click(screen.getByRole("button", { name: "Simulation" }));

    expect(screen.queryByText("Leave money to heirs")).toBeNull();
    expect(screen.queryByText("Retirement max equity")).toBeNull();
    expect(screen.queryByText("Glide-step interval")).toBeNull();
    expect(screen.getByText("Max equity")).toBeInTheDocument();
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
