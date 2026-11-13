import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test-utils";
import { DEFAULTS } from "@/utils/swr/presets";
import type { DynamicsMode } from "@/utils/swr/types";
import InputForm from "./InputForm";

const renderForm = (mode: DynamicsMode) =>
  renderWithMantine(
    <InputForm
      input={{ ...DEFAULTS }}
      mode={mode}
      errors={{}}
      onChange={vi.fn()}
      onModeChange={vi.fn()}
      onReset={vi.fn()}
    />,
  );

describe("swr InputForm", () => {
  it("hides the VR fields unless dynamics is Custom", () => {
    renderForm("independent");
    expect(screen.queryByLabelText("Stock VR(10)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Bond VR(10)")).not.toBeInTheDocument();
  });

  it("reveals the VR fields for Custom", () => {
    renderForm("custom");
    expect(screen.getByLabelText("Stock VR(10)")).toBeInTheDocument();
    expect(screen.getByLabelText("Bond VR(10)")).toBeInTheDocument();
  });

  it("offers the three dynamics modes", () => {
    renderForm("independent");
    for (const name of ["Independent", "Historical", "Custom"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
  });
});
