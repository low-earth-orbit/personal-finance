import {
  Box,
  Button,
  CloseButton,
  Group,
  Modal,
  NumberInput,
  Select,
  Table,
  Text,
} from "@mantine/core";
import type { AcbTransaction, ParsedFile } from "@/utils/acb/parser";

const TYPE_OPTIONS: AcbTransaction["type"][] = [
  "buy",
  "sell",
  "dividend",
  "transfer",
  "interest",
];

function isTransactionType(value: string): value is AcbTransaction["type"] {
  return (TYPE_OPTIONS as string[]).includes(value);
}

type FilePreviewModalProps = {
  /** File being previewed; null closes the modal. */
  file: ParsedFile | null;
  /** Index of `file` in the loaded-files list; null when closed. */
  fileIndex: number | null;
  onUpdateTransaction: (
    fileIndex: number,
    rowIndex: number,
    patch: Partial<AcbTransaction>,
  ) => void;
  onDeleteTransaction: (fileIndex: number, rowIndex: number) => void;
  onClose: () => void;
};

/**
 * Per-file transaction preview with inline editing. Type / quantity / price
 * are editable; date, account, symbol, and currency are structural fields
 * shown as plain text. Edits apply immediately; Close just dismisses.
 */
const FilePreviewModal = ({
  file,
  fileIndex,
  onUpdateTransaction,
  onDeleteTransaction,
  onClose,
}: FilePreviewModalProps) => {
  const transactions = file?.transactions ?? [];

  return (
    <Modal
      opened={file !== null && fileIndex !== null}
      onClose={onClose}
      title={`Preview — ${file?.name ?? ""}`}
      size="xl"
    >
      {/* Horizontal scroll stays inside the modal body so the header (title +
          close button) keeps its position. */}
      <Box style={{ overflowX: "auto" }}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Account</Table.Th>
              <Table.Th>Symbol</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Qty</Table.Th>
              <Table.Th>Price</Table.Th>
              <Table.Th>Currency</Table.Th>
              <Table.Th aria-hidden />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {transactions.map((tx, rowIndex) => (
              <Table.Tr key={`${rowIndex}-${tx.date ?? ""}-${tx.symbol}`}>
                <Table.Td>{tx.date || "—"}</Table.Td>
                <Table.Td>
                  {[tx.accountType, tx.accountId].filter(Boolean).join(" · ") ||
                    "—"}
                </Table.Td>
                <Table.Td fw={600}>{tx.symbol || "—"}</Table.Td>
                <Table.Td>
                  <Select
                    aria-label={`Type for row ${rowIndex + 1}`}
                    data={TYPE_OPTIONS}
                    value={tx.type}
                    onChange={(value) => {
                      if (
                        fileIndex !== null &&
                        value !== null &&
                        isTransactionType(value)
                      ) {
                        onUpdateTransaction(fileIndex, rowIndex, {
                          type: value,
                        });
                      }
                    }}
                    allowDeselect={false}
                    size="xs"
                    w={110}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    aria-label={`Quantity for row ${rowIndex + 1}`}
                    value={tx.quantity}
                    onChange={(value) => {
                      if (fileIndex !== null) {
                        onUpdateTransaction(fileIndex, rowIndex, {
                          quantity: +value || 0,
                        });
                      }
                    }}
                    min={0}
                    decimalScale={4}
                    size="xs"
                    w={100}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    aria-label={`Price for row ${rowIndex + 1}`}
                    value={tx.price}
                    onChange={(value) => {
                      if (fileIndex !== null) {
                        onUpdateTransaction(fileIndex, rowIndex, {
                          price: +value || 0,
                        });
                      }
                    }}
                    min={0}
                    prefix="$"
                    decimalScale={4}
                    size="xs"
                    w={110}
                  />
                </Table.Td>
                <Table.Td>{tx.currency ?? "CAD"}</Table.Td>
                <Table.Td>
                  <CloseButton
                    aria-label={`Delete row ${rowIndex + 1}`}
                    size="sm"
                    onClick={() => {
                      if (fileIndex !== null) {
                        onDeleteTransaction(fileIndex, rowIndex);
                      }
                    }}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      <Group justify="space-between" mt="md">
        <Text size="sm" c="dimmed">
          {transactions.length} transaction
          {transactions.length === 1 ? "" : "s"}
        </Text>
        <Button variant="default" onClick={onClose}>
          Close
        </Button>
      </Group>
    </Modal>
  );
};

export default FilePreviewModal;
