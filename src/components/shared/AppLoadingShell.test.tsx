import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithMantine } from "@/test-utils";

import AppLoadingShell from "./AppLoadingShell";

describe("AppLoadingShell", () => {
  it("renders a stable body placeholder while the calculator loads", () => {
    renderWithMantine(<AppLoadingShell />);

    expect(
      screen.getByRole("status", { name: "Loading calculator" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading calculator...")).toBeVisible();
  });
});
