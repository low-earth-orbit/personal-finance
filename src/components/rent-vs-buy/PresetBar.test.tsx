import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithMantine } from "@/test-utils";
import PresetBar from "./PresetBar";
import { DEFAULTS, PRESETS } from "@/utils/presets";
import { serializePresets } from "@/utils/presetFile";
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
    onShowBuiltin: vi.fn(),
    onImport: vi.fn(() => ({ added: 1, replaced: 0 })),
  };
  renderWithMantine(
    <PresetBar
      presets={[...PRESETS, mine]}
      hiddenBuiltins={[]}
      activePreset={null}
      basePreset={null}
      recentlyDeleted={null}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const openManage = () => fireEvent.click(screen.getByRole("button", { name: "Manage" }));

describe("PresetBar", () => {
  it("saves edits back to a saved preset, or reverts", () => {
    const h = renderBar({ basePreset: mine });
    expect(screen.getByRole("button", { name: "My place (edited)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save to My place" }));
    expect(h.onUpdate).toHaveBeenCalledWith(mine);

    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(h.onSelect).toHaveBeenCalledWith(mine);
  });

  it("offers to save edits to a built-in scenario as a new preset", async () => {
    const h = renderBar({ basePreset: PRESETS[1] });
    expect(screen.getByText(`Edited from ${PRESETS[1].label}.`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save to/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save as new preset" }));
    const input = await screen.findByRole("textbox", { name: "Name" });
    expect(input).toHaveValue(`${PRESETS[1].label} (my version)`);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(h.onSave).toHaveBeenCalledWith(`${PRESETS[1].label} (my version)`);
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

  it("offers undo after a delete", () => {
    const h = renderBar({ recentlyDeleted: mine });
    expect(screen.getByText("Deleted My place.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(h.onUndoDelete).toHaveBeenCalled();
  });
});

describe("Manage presets", () => {
  it("renames a saved preset, but only to an unused name", async () => {
    const h = renderBar();
    openManage();
    expect(await screen.findByText("Your presets")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Rename ${PRESETS[0].label}` })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rename My place" }));
    const input = screen.getByRole("textbox", { name: "New name for My place" });
    expect(input).toHaveValue("My place");
    expect(screen.getByRole("button", { name: "Save name" })).toBeDisabled();

    fireEvent.change(input, { target: { value: PRESETS[1].label.toUpperCase() } });
    expect(screen.getByText("Another preset already uses this name.")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "  Downtown condo " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(h.onRename).toHaveBeenCalledWith(mine, "Downtown condo");
  });

  it("deletes saved presets, hides built-ins and shows hidden ones again", async () => {
    const h = renderBar({ presets: [PRESETS[0], mine], hiddenBuiltins: [PRESETS[1]] });
    openManage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete My place" }));
    expect(h.onDelete).toHaveBeenCalledWith(mine);

    fireEvent.click(screen.getByRole("button", { name: `Hide ${PRESETS[0].label}` }));
    expect(h.onDelete).toHaveBeenCalledWith(PRESETS[0]);

    fireEvent.click(screen.getByRole("button", { name: `Show ${PRESETS[1].label}` }));
    expect(h.onShowBuiltin).toHaveBeenCalledWith(PRESETS[1]);
  });

  it("disables export with no saved presets", async () => {
    renderBar({ presets: PRESETS });
    openManage();
    expect(await screen.findByRole("button", { name: "Export to file" })).toBeDisabled();
  });

  it("imports presets from a file and reports the result", async () => {
    const onImport = vi.fn(() => ({ added: 1, replaced: 1 }));
    renderBar({ onImport });
    openManage();
    await screen.findByText("Your presets");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([serializePresets([mine, { ...mine, label: "Other" }])], "p.json", {
      type: "application/json",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onImport).toHaveBeenCalled());
    const calls = onImport.mock.calls as unknown as [{ label: string }[]][];
    expect(calls[0][0].map((e) => e.label)).toEqual(["My place", "Other"]);
    expect(await screen.findByText(/Imported 2 presets; 1 replaced/)).toBeInTheDocument();
  });

  it("reports an unreadable file without importing", async () => {
    const h = renderBar();
    openManage();
    await screen.findByText("Your presets");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["not json"], "p.json")] } });
    expect(await screen.findByText("The file isn't valid JSON.")).toBeInTheDocument();
    expect(h.onImport).not.toHaveBeenCalled();
  });
});
