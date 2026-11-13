import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithMantine, screen, waitFor, within } from "@/test-utils";
import FormResetButton from "./FormResetButton";

describe("FormResetButton", () => {
  it("asks for confirmation in a dialog before resetting", async () => {
    const onReset = vi.fn();
    renderWithMantine(<FormResetButton onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    const dialog = await screen.findByRole("dialog", { name: "Reset to defaults?" });
    expect(onReset).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Reset to defaults" }));
    expect(onReset).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does nothing when the dialog is cancelled", async () => {
    const onReset = vi.fn();
    renderWithMantine(<FormResetButton onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onReset).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
