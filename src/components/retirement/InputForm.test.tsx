import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test-utils";
import { DEFAULTS } from "@/utils/retirement/presets";
import type { RetirementInput } from "@/utils/retirement/types";
import InputForm from "./InputForm";

const renderForm = (overrides: Partial<RetirementInput> = {}) =>
  renderWithMantine(
    <InputForm
      input={{ ...DEFAULTS, ...overrides }}
      errors={{}}
      onChange={vi.fn()}
      onReset={vi.fn()}
    />,
  );

describe("retirement InputForm CPP and OAS start ages", () => {
  it("labels the amounts as the age-65 figures", () => {
    renderForm();
    expect(screen.getAllByText("CPP at 65").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OAS at 65").length).toBeGreaterThan(0);
  });

  it("shows no adjustment note while both pensions start at 65", () => {
    renderForm();
    expect(screen.queryByText(/Adjusted for starting at/)).not.toBeInTheDocument();
  });

  it("shows the adjusted CPP amount when the start age is later than 65", () => {
    renderForm({ cppAt65: 20000, cppStartAge: 70 });
    expect(screen.getByText("Adjusted for starting at 70 (+42%): $28,400 /yr")).toBeInTheDocument();
  });

  it("shows the reduced CPP amount when the start age is earlier than 65", () => {
    renderForm({ cppAt65: 20000, cppStartAge: 60 });
    expect(screen.getByText("Adjusted for starting at 60 (−36%): $12,800 /yr")).toBeInTheDocument();
  });

  it("shows the adjusted OAS amount when it is deferred", () => {
    renderForm({ oasAt65: 8900, oasStartAge: 70 });
    expect(screen.getByText("Adjusted for starting at 70 (+36%): $12,104 /yr")).toBeInTheDocument();
  });

  it("stays quiet for an out-of-range start age", () => {
    renderForm({ cppAt65: 20000, cppStartAge: 75 });
    expect(screen.queryByText(/Adjusted for starting at/)).not.toBeInTheDocument();
  });
});
