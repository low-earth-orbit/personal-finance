import { Group, Text } from "@mantine/core";
import { Eyebrow } from "./Figures";
import classes from "./TwoColumn.module.css";

/** Caption above an input or result column: an eyebrow title with an optional note on the right. */
export default function ColumnHeader({ title, note }: { title: string; note?: string }) {
  return (
    <Group justify="space-between" align="baseline" gap="sm" className={classes.columnHeader}>
      <Eyebrow>{title}</Eyebrow>
      {note && (
        <Text size="xs" c="dimmed">
          {note}
        </Text>
      )}
    </Group>
  );
}
