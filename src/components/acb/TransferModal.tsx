import {
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { sumOpeningLot, type TransferLot } from "@/utils/acb/parser";
import { formatCADDecimal } from "@/utils/format";

type TransferModalProps = {
  /** Symbol being edited; null closes the modal. */
  symbol: string | null;
  /** Transfer lots for the symbol, in chronological order. */
  lots: TransferLot[];
  /** Per-lot opening ACB, indexed to match `lots`. */
  acbs: number[];
  onChange: (acbs: number[]) => void;
  onClose: () => void;
};

const sharesFormatter = new Intl.NumberFormat("en-CA", {
  maximumFractionDigits: 4,
});

/**
 * Per-symbol transfer-lot ACB editor. Transferred-in shares carry no purchase
 * history, so the user supplies an opening cost basis (ACB) for each lot. Rows
 * are fixed — one per `transfer` row in the CSV, labelled with its date and
 * share count — so the user never has to aggregate multiple transfers by hand.
 * Edits apply immediately; Close just dismisses.
 */
const TransferModal = ({
  symbol,
  lots,
  acbs,
  onChange,
  onClose,
}: TransferModalProps) => {
  const total = sumOpeningLot(acbs);

  function updateAcb(index: number, value: number) {
    const next = lots.map((_, i) => (i === index ? value : (acbs[i] ?? 0)));
    onChange(next);
  }

  return (
    <Modal
      opened={symbol !== null}
      onClose={onClose}
      title={`Transfer lots — ${symbol ?? ""}`}
      size="lg"
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Transferred-in shares have no purchase history. Enter the total ACB
          (cost basis) for each transferred lot — the share count and date are
          shown to help you match each lot to your records.
        </Text>
        {lots.length > 0 ? (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th ta="right">Shares</Table.Th>
                <Table.Th>Opening lot ACB (total cost basis)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lots.map((lot, index) => (
                <Table.Tr key={index}>
                  <Table.Td>
                    {lot.date || (
                      <Text component="span" c="dimmed">
                        Unknown date
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    {sharesFormatter.format(lot.quantity)}
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      aria-label={`Opening lot ACB for ${symbol} lot ${index + 1}`}
                      value={acbs[index] ?? ""}
                      onChange={(value) => updateAcb(index, +value || 0)}
                      prefix="$"
                      min={0}
                      step={10}
                      size="xs"
                      w={160}
                      placeholder="$0"
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">
            No transferred-in shares for this holding.
          </Text>
        )}
        <Group justify="space-between" mt="xs">
          <Text size="sm" fw={600}>
            Total opening lot ACB: {formatCADDecimal(total)}
          </Text>
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default TransferModal;
