import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithMantine } from "@/test-utils";
import PresetBar from "./PresetBar";
import { DEFAULTS, PRESETS } from "@/utils/presets";
import type { Preset } from "@/types";

const mine: Preset = { id: "c1", label: "My place", values: DEFAULTS, custom: true };

function renderBar(props: Partial<Parameters<typeof PresetBar>[0]> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onSave: vi.fn(),
    onUpdate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onUndoDelete: vi.fn(),
    onRestoreBuiltins: vi.fn(),
  };
  renderWithMantine(
    <PresetBar
      presets={[...PRESETS, mine]}
      activePreset={null}
      basePreset={null}
      hiddenBuiltinCount={0}
      recentlyDeleted={null}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("PresetBar", () => {
  it("offers update and revert after editing a saved preset", () => {
    const h = renderBar({ basePreset: mine });
    expect(screen.getByRole("button", { name: "My place (edited)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Update My place" }));
    expect(h.onUpdate).toHaveBeenCalledWith(mine);

    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(h.onSelect).toHaveBeenCalledWith(mine);
  });

  it("offers revert but not update after editing a built-in scenario", () => {
    renderBar({ basePreset: PRESETS[1] });
    expect(screen.getByText(`Edited from ${PRESETS[1].label}.`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Update/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Revert" })).toBeInTheDocument();
  });

  it("shows no edited state while the inputs match the base preset", () => {
    renderBar({ basePreset: mine, activePreset: mine });
    expect(screen.queryByText(/Edited from/)).toBeNull();
    expect(screen.getByRole("button", { name: "My place" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("replaces a saved preset with the same name instead of duplicating it", async () => {
    const h = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Save as preset" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Name" }), {
      target: { value: "my place" },
    });
    expect(screen.getByText(/Replaces your saved preset/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(h.onUpdate).toHaveBeenCalledWith(mine);
    expect(h.onSave).not.toHaveBeenCalled();
  });

  it("rejects a built-in scenario's name", async () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Save as preset" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Name" }), {
      target: { value: PRESETS[0].label },
    });
    expect(screen.getByText(/built-in scenario already uses this name/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("offers undo after a delete and restore for hidden scenarios", () => {
    const h = renderBar({ recentlyDeleted: mine });
    expect(screen.getByText("Deleted My place.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(h.onUndoDelete).toHaveBeenCalled();
  });

  it("renames a saved preset, but only to an unused name", async () => {
    const h = renderBar();
    expect(screen.queryByRole("button", { name: `Rename ${PRESETS[0].label}` })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rename My place" }));
    const input = await screen.findByRole("textbox", { name: "Name" });
    expect(input).toHaveValue("My place");
    expect(screen.getByRole("button", { name: "Rename" })).toBeDisabled();

    fireEvent.change(input, { target: { value: PRESETS[1].label.toUpperCase() } });
    expect(screen.getByText("Another preset already uses this name.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "  Downtown condo " } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(h.onRename).toHaveBeenCalledWith(mine, "Downtown condo");
  });

  it("shows how many built-in scenarios are hidden", () => {
    const h = renderBar({ hiddenBuiltinCount: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Show 2 hidden scenarios" }));
    expect(h.onRestoreBuiltins).toHaveBeenCalled();
  });
});
