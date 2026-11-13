import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, renderWithMantine, screen } from "@/test-utils";
import Main from "./Main";
import { KEY } from "@/utils/expected-return/storage";

describe("Expected return Main", () => {
  beforeEach(() => window.localStorage.clear());

  it("lists Canada first", () => {
    renderWithMantine(<Main />);
    const sections = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => /^\d\d/.test(text) || /^(Canada|US|International|Emerging)/.test(text));
    expect(sections[0]).toMatch(/Canada/);
    expect(sections[1]).toMatch(/US/);
  });

  it("recomputes as inputs change and saves them", () => {
    renderWithMantine(<Main />);
    expect(screen.getByRole("heading", { name: "4.4% a year" })).toBeInTheDocument();

    // A much slower reversion shrinks the CAPE drag, which raises the blend.
    fireEvent.change(screen.getByRole("textbox", { name: "Valuation half-life" }), {
      target: { value: "100" },
    });
    expect(screen.getByRole("heading", { name: "4.5% a year" })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(KEY)!).halfLife).toBe(100);
  });

  it("pauses on invalid weights and resumes once they add up", () => {
    renderWithMantine(<Main />);
    fireEvent.change(screen.getByLabelText("US: Portfolio weight"), { target: { value: "40" } });

    expect(screen.getByText("Update paused: fix the highlighted fields.")).toBeInTheDocument();
    expect(
      screen.getByText("Region weights add to 95%; they must add to 100%."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "4.4% a year" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("US: Portfolio weight"), { target: { value: "45" } });
    expect(screen.queryByText(/Update paused/)).not.toBeInTheDocument();
  });
});
