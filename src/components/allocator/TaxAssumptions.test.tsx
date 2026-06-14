import { describe, expect, it } from "vitest";
import { fireEvent, renderWithMantine, screen } from "@/test-utils";
import TaxAssumptions from "./TaxAssumptions";

describe("TaxAssumptions", () => {
  it("opens when linked with the model-assumptions hash", () => {
    window.history.replaceState(null, "", "#model-assumptions");
    renderWithMantine(<TaxAssumptions />);

    fireEvent(window, new HashChangeEvent("hashchange"));

    expect(
      screen.getByText("Detailed model assumptions").closest("details"),
    ).toHaveAttribute("open");
  });
});
