import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, screen } from "@/test-utils";
import AccountTypeMarker from "./AccountTypeMarker";

describe("AccountTypeMarker", () => {
  it("renders an editable control for an unknown account type", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithMantine(
      <AccountTypeMarker
        accounts={[{ accountId: "U123", accountType: "", detectedRegistered: false }]}
        overrides={{}}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText("Registered"));

    expect(onChange).toHaveBeenCalledWith("U123", "registered");
  });

  it("renders known account types read-only", () => {
    renderWithMantine(
      <AccountTypeMarker
        accounts={[{ accountId: "RSP1", accountType: "RRSP", detectedRegistered: true }]}
        overrides={{}}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("RSP1")).toBeInTheDocument();
    expect(screen.getByText("Registered (detected)")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Registered" })).toBeNull();
  });
});
