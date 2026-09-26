import { Chip, ChipProps } from "@mui/material";
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  TICKET_CATEGORY_LABELS,
} from "@/lib/constants/tickets";
import { DaylightPalette, useDaylight } from "@/lib/daylight";

/** Daylight soft-tone pill colours for a ticket status. */
function daylightStatusTone(d: DaylightPalette, status: string) {
  switch (status) {
    case "OPEN":
      return { bg: d.skySoft, text: d.action };
    case "IN_PROGRESS":
      return { bg: d.amber, text: d.warning };
    case "RESOLVED":
      return { bg: d.mint, text: d.success };
    default:
      // WAITING_ON_CUSTOMER, CLOSED
      return { bg: d.border, text: d.muted };
  }
}

/** Daylight soft-tone pill colours for a ticket priority. */
function daylightPriorityTone(d: DaylightPalette, priority: string) {
  switch (priority) {
    case "URGENT":
      return { bg: d.dangerSoft, text: d.danger };
    case "HIGH":
      return { bg: d.amber, text: d.warning };
    case "NORMAL":
      return { bg: d.skySoft, text: d.action };
    default:
      // LOW
      return { bg: d.border, text: d.muted };
  }
}

export function TicketStatusBadge({
  status,
  size = "small",
  daylight = false,
}: {
  status: string;
  size?: ChipProps["size"];
  daylight?: boolean;
}) {
  const { d, fonts } = useDaylight();
  if (daylight) {
    const tone = daylightStatusTone(d, status);
    return (
      <Chip
        label={TICKET_STATUS_LABELS[status] || status}
        size={size}
        sx={{
          fontFamily: fonts.body,
          fontWeight: 600,
          bgcolor: tone.bg,
          color: tone.text,
        }}
      />
    );
  }
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
  daylight = false,
}: {
  priority: string;
  size?: ChipProps["size"];
  daylight?: boolean;
}) {
  const { d, fonts } = useDaylight();
  if (daylight) {
    const tone = daylightPriorityTone(d, priority);
    return (
      <Chip
        label={TICKET_PRIORITY_LABELS[priority] || priority}
        size={size}
        sx={{
          fontFamily: fonts.body,
          fontWeight: 600,
          bgcolor: tone.bg,
          color: tone.text,
        }}
      />
    );
  }
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
