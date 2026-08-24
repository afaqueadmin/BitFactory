import { Chip, ChipProps } from "@mui/material";
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  TICKET_CATEGORY_LABELS,
} from "@/lib/constants/tickets";

export function TicketStatusBadge({
  status,
  size = "small",
}: {
  status: string;
  size?: ChipProps["size"];
}) {
  return (
    <Chip
      label={TICKET_STATUS_LABELS[status] || status}
      color={TICKET_STATUS_COLORS[status] || "default"}
      size={size}
      sx={{ fontWeight: 600 }}
    />
  );
}

export function TicketPriorityBadge({
  priority,
  size = "small",
}: {
  priority: string;
  size?: ChipProps["size"];
}) {
  return (
    <Chip
      label={TICKET_PRIORITY_LABELS[priority] || priority}
      color={TICKET_PRIORITY_COLORS[priority] || "default"}
      size={size}
      variant="outlined"
      sx={{ fontWeight: 600 }}
    />
  );
}

export function TicketCategoryLabel({ category }: { category: string }) {
  return <>{TICKET_CATEGORY_LABELS[category] || category}</>;
}
