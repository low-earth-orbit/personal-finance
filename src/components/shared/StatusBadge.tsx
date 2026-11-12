import { Badge } from "@mantine/core";

export type AppStatus = "coming-soon" | "preview" | "new" | "updated";

const STATUS_STYLES: Record<AppStatus, { label: string; color: string }> = {
  "coming-soon": { label: "Coming soon", color: "gray" },
  preview: { label: "Preview", color: "rust" },
  new: { label: "New", color: "ledger" },
  updated: { label: "Updated", color: "ink" },
};

export default function StatusBadge({ status }: { status: AppStatus }) {
  const { label, color } = STATUS_STYLES[status];

  return (
    <Badge color={color} variant="outline">
      {label}
    </Badge>
  );
}
