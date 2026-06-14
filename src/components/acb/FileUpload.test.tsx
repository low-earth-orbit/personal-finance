import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, screen } from "@/test-utils";
import FileUpload from "./FileUpload";

const noop = () => {};

const FILES = [
  { name: "2024.csv", detail: "12 transactions · 2024-01-02 – 2024-12-30" },
  { name: "2025.csv", detail: "1 transaction" },
];

describe("FileUpload", () => {
  it("lists each uploaded file with its detail, preview, and remove buttons", () => {
    renderWithMantine(
      <FileUpload
        files={FILES}
        onFilesAdded={noop}
        onRemoveFile={noop}
        onPreview={noop}
      />,
    );

    expect(screen.getByText("2024.csv")).toBeInTheDocument();
    expect(screen.getByText("2025.csv")).toBeInTheDocument();
    expect(
      screen.getByText("12 transactions · 2024-01-02 – 2024-12-30"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 transaction")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Edit transactions" }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Remove 2024.csv" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove 2025.csv" }),
    ).toBeInTheDocument();
  });

  it("shows no file list when nothing is uploaded", () => {
    renderWithMantine(
      <FileUpload
        files={[]}
        onFilesAdded={noop}
        onRemoveFile={noop}
        onPreview={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
  });

  it("calls onRemoveFile with the index of the deleted file", async () => {
    const user = userEvent.setup();
    const onRemoveFile = vi.fn();
    renderWithMantine(
      <FileUpload
        files={FILES}
        onFilesAdded={noop}
        onRemoveFile={onRemoveFile}
        onPreview={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove 2025.csv" }));
    expect(onRemoveFile).toHaveBeenCalledWith(1);
  });

  it("calls onPreview with the index of the previewed file", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    renderWithMantine(
      <FileUpload
        files={FILES}
        onFilesAdded={noop}
        onRemoveFile={noop}
        onPreview={onPreview}
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: "Edit transactions" })[1],
    );
    expect(onPreview).toHaveBeenCalledWith(1);
  });

  it("shows excluded accounts badge with transaction count", () => {
    const filesWithExcluded = [
      {
        name: "mixed.csv",
        detail: "5 transactions",
        excludedAccounts: ["TFSA · test", "RRSP · registered"],
        excludedTransactionCount: 2,
      },
    ];
    renderWithMantine(
      <FileUpload
        files={filesWithExcluded}
        onFilesAdded={noop}
        onRemoveFile={noop}
        onPreview={noop}
      />,
    );

    expect(
      screen.getByText("Excluded: TFSA · test · RRSP · registered (2 tx)"),
    ).toBeInTheDocument();
  });
});
