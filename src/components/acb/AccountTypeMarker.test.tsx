import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, screen, within } from "@/test-utils";
import { overrideKey } from "@/utils/acb/parser";
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

  it("scopes override markings by brokerage and labels the broker", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithMantine(
      <AccountTypeMarker
        accounts={[
          { accountId: "U123", accountType: "", broker: "ibkr", detectedRegistered: false },
        ]}
        overrides={{}}
        onChange={onChange}
        showBroker
        brokerLabels={{ ibkr: "IBKR" }}
      />,
    );

    expect(screen.getByText("IBKR · U123")).toBeInTheDocument();
    await user.click(screen.getByText("Registered"));

    expect(onChange).toHaveBeenCalledWith(overrideKey("ibkr", "U123"), "registered");
  });

  it("keeps two unknown selectors independent", () => {
    const { rerender } = renderWithMantine(
      <AccountTypeMarker
        accounts={[
          { accountId: "U123", accountType: "", broker: "ibkr", detectedRegistered: false },
          { accountId: "U456", accountType: "", broker: "ibkr", detectedRegistered: false },
        ]}
        overrides={{}}
        onChange={vi.fn()}
        showBroker
        brokerLabels={{ ibkr: "IBKR" }}
      />,
    );

    expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
    // Mark only the first account registered: the second control must not follow.
    rerender(
      <AccountTypeMarker
        accounts={[
          { accountId: "U123", accountType: "", broker: "ibkr", detectedRegistered: true },
          { accountId: "U456", accountType: "", broker: "ibkr", detectedRegistered: false },
        ]}
        overrides={{ [overrideKey("ibkr", "U123")]: "registered" }}
        onChange={vi.fn()}
        showBroker
        brokerLabels={{ ibkr: "IBKR" }}
      />,
    );
    const controls = screen.getAllByRole("radiogroup");
    expect(
      within(controls[0] as HTMLElement).getByRole("radio", { name: "Registered" }),
    ).toBeChecked();
    expect(
      within(controls[1] as HTMLElement).getByRole("radio", { name: "Non-registered" }),
    ).toBeChecked();
  });
});
