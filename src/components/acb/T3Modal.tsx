import {
  Button,
  CloseButton,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { t3NetAdjustment, type T3Entry } from "@/utils/acb/parser";

type T3ModalProps = {
  /** Symbol being edited; null closes the modal. */
  symbol: string | null;
  entries: T3Entry[];
  onChange: (entries: T3Entry[]) => void;
  onClose: () => void;
};

const netFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Per-symbol T3 slip editor. One row per tax year with box 21 (capital gains
 * distributions, adds to ACB) and box 42 (return of capital, subtracts from
 * ACB). Edits apply immediately; Close just dismisses.
 */
const T3Modal = ({ symbol, entries, onChange, onClose }: T3ModalProps) => {
  const net = t3NetAdjustment(entries);

  function updateEntry(index: number, patch: Partial<T3Entry>) {
    onChange(
      entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  }

  function removeEntry(index: number) {
    onChange(entries.filter((_, i) => i !== index));
  }

  function addEntry() {
    onChange([
      ...entries,
      { year: new Date().getFullYear() - 1, box21: 0, box42: 0 },
    ]);
  }

  return (
    <Modal
      opened={symbol !== null}
      onClose={onClose}
      title={`T3 Slips — ${symbol ?? ""}`}
      size="lg"
    >
      <Stack gap="sm">
        {entries.length > 0 && (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Tax Year</Table.Th>
                <Table.Th>Box 21 – Capital Gains Distributions</Table.Th>
                <Table.Th>
                  Box 42 – Amount Resulting in Cost Base Adjustment
                </Table.Th>
                <Table.Th aria-hidden />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {entries.map((entry, index) => (
                <Table.Tr key={index}>
                  <Table.Td>
                    <NumberInput
                      aria-label={`Tax year for row ${index + 1}`}
                      value={entry.year}
                      onChange={(value) =>
                        updateEntry(index, { year: Math.trunc(+value) || 0 })
                      }
                      min={1900}
                      max={9999}
                      step={1}
                      clampBehavior="strict"
                      allowDecimal={false}
                      size="xs"
                      w={90}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      aria-label={`Box 21 for row ${index + 1}`}
                      value={entry.box21 === 0 ? "" : entry.box21}
                      onChange={(value) =>
                        updateEntry(index, { box21: +value || 0 })
                      }
                      prefix="$"
                      min={0}
                      step={10}
                      size="xs"
                      w={130}
                      placeholder="$0"
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      aria-label={`Box 42 for row ${index + 1}`}
                      value={entry.box42 === 0 ? "" : entry.box42}
                      onChange={(value) =>
                        updateEntry(index, { box42: +value || 0 })
                      }
                      prefix="$"
                      min={0}
                      step={10}
                      size="xs"
                      w={130}
                      placeholder="$0"
                    />
                  </Table.Td>
                  <Table.Td>
                    <CloseButton
                      aria-label={`Delete row ${index + 1}`}
                      size="sm"
                      onClick={() => removeEntry(index)}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        <Button variant="light" size="xs" w="fit-content" onClick={addEntry}>
          + Add year
        </Button>
        <Group justify="space-between" mt="xs">
          <Text size="sm" fw={600}>
            Net ACB adjustment:{" "}
            {`${net < 0 ? "−" : "+"}${netFormatter.format(Math.abs(net))}`}
          </Text>
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default T3Modal;
