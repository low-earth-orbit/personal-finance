import { useState, type ReactNode } from "react";
import { Badge, Button, CloseButton, FileButton, Text } from "@mantine/core";
import { IconFileUpload } from "@tabler/icons-react";
import classes from "./FileUpload.module.css";
import { Eyebrow } from "@/components/shared/Figures";

export type UploadedFileSummary = {
  name: string;
  /** Short description of the file's contents, e.g. transaction count and date range. */
  detail: string;
  /** Registered accounts excluded from ACB pooling, if any. */
  excludedAccounts?: string[];
  /** Number of transactions excluded due to registered accounts. */
  excludedTransactionCount?: number;
};

type FileUploadProps = {
  /** Files already uploaded and parsed. */
  files: UploadedFileSummary[];
  /** Called with newly selected files; they ADD to the existing list. */
  onFilesAdded: (files: File[]) => void;
  /** Remove the file at the given index from the list. */
  onRemoveFile: (index: number) => void;
  /** Open the transaction preview for the file at the given index. */
  onPreview: (fileIndex: number) => void;
  /** Shown beside the drop target while no files are loaded (e.g. the how-to). */
  empty?: ReactNode;
};

const FileUpload = ({ files, onFilesAdded, onRemoveFile, onPreview, empty }: FileUploadProps) => {
  // Remount the file button after each selection so it resets to empty and
  // selecting the same file again still fires onChange.
  const [inputKey, setInputKey] = useState(0);
  const [dragging, setDragging] = useState(false);

  return (
    <div className={classes.layout}>
      <div
        className={classes.dropzone}
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = Array.from(event.dataTransfer.files);
          if (dropped.length > 0) onFilesAdded(dropped);
        }}
      >
        <IconFileUpload size={28} stroke={1.6} aria-hidden />
        <Text fz="1.0625rem" fw={600} lh={1.35}>
          Wealthsimple, Questrade, or IBKR activity export (CSV or XLSX)
        </Text>
        <Text size="sm" c="dimmed">
          Select or drop one or more files from supported brokers covering distinct date ranges —
          each upload adds to the list. Parsed entirely in your browser — nothing is uploaded.
        </Text>
        <FileButton
          key={inputKey}
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          onChange={(selected) => {
            if (selected.length > 0) onFilesAdded(selected);
            setInputKey((key) => key + 1);
          }}
        >
          {(props) => (
            <Button {...props} size="md">
              Add CSV or XLSX file(s)
            </Button>
          )}
        </FileButton>
      </div>
      {files.length > 0 ? (
        <div>
          <span className={classes.filesHeader}>
            <Eyebrow>Files</Eyebrow>
          </span>
          <div className={classes.files}>
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className={classes.file}>
                <span className={classes.fileName}>
                  <span>{file.name}</span>
                  <Text span size="xs" c="dimmed">
                    {file.detail}
                  </Text>
                </span>
                {file.excludedAccounts && file.excludedAccounts.length > 0 && (
                  <Badge color="gray" variant="outline" size="sm">
                    Excluded: {file.excludedAccounts.join(" · ")}
                    {file.excludedTransactionCount && file.excludedTransactionCount > 0
                      ? ` (${file.excludedTransactionCount} tx)`
                      : ""}
                  </Badge>
                )}
                <Button variant="default" size="xs" onClick={() => onPreview(index)}>
                  Edit transactions
                </Button>
                <CloseButton
                  size="md"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => onRemoveFile(index)}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        empty && <div>{empty}</div>
      )}
    </div>
  );
};

export default FileUpload;
