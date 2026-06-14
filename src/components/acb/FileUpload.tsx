import { useState } from "react";
import {
  Badge,
  Button,
  CloseButton,
  FileInput,
  Group,
  Stack,
  Text,
} from "@mantine/core";

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
};

const FileUpload = ({
  files,
  onFilesAdded,
  onRemoveFile,
  onPreview,
}: FileUploadProps) => {
  // Remount the FileInput after each selection so it resets to empty and
  // selecting the same file again still fires onChange.
  const [inputKey, setInputKey] = useState(0);

  return (
    <Stack gap="xs">
      <FileInput
        key={inputKey}
        label="Wealthsimple activity export (CSV)"
        description="Non-registered account activity exports. Select one or more files covering distinct date ranges — each upload adds to the list below. Parsed entirely in your browser — nothing is uploaded."
        placeholder="Add CSV file(s)"
        accept=".csv,text/csv"
        multiple
        onChange={(selected) => {
          if (selected.length > 0) onFilesAdded(selected);
          setInputKey((key) => key + 1);
        }}
      />
      {files.length > 0 && (
        <Stack gap={2}>
          {files.map((file, index) => (
            <Group key={`${file.name}-${index}`} gap="xs" wrap="nowrap">
              <Text size="sm">{file.name}</Text>
              <Text size="xs" c="dimmed">
                {file.detail}
              </Text>
              {file.excludedAccounts && file.excludedAccounts.length > 0 && (
                <Badge color="gray" variant="light" size="sm">
                  Excluded: {file.excludedAccounts.join(" · ")}
                  {file.excludedTransactionCount &&
                  file.excludedTransactionCount > 0
                    ? ` (${file.excludedTransactionCount} tx)`
                    : ""}
                </Badge>
              )}
              <Button
                variant="transparent"
                size="xs"
                onClick={() => onPreview(index)}
              >
                Edit transactions
              </Button>
              <CloseButton
                size="sm"
                aria-label={`Remove ${file.name}`}
                onClick={() => onRemoveFile(index)}
              />
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

export default FileUpload;
