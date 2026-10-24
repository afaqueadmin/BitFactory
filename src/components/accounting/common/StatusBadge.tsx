/**
 * Status Badge Component
 *
 * Displays invoice status with color coding
 */

import { Chip, ChipProps } from "@mui/material";
import { InvoiceStatus, VendorPaymentStatus } from "@prisma/client";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
} from "@/lib/constants/accounting";
import {
  DaylightStatusPill,
  type DaylightTone,
  useDaylightScope,
} from "@/components/daylight/AdminPage";

// Active/Inactive for accounting master data (entities, banks, currencies).
type RecordStatus = "Active" | "Inactive";

const RECORD_STATUS_COLORS: Record<RecordStatus, ChipProps["color"]> = {
  Active: "success",
  Inactive: "default",
};

/** MUI chip colour -> Daylight pill tone. */
const PILL_TONE: Record<string, DaylightTone> = {
  success: "success",
  warning: "warning",
  error: "danger",
  info: "info",
  primary: "info",
  secondary: "neutral",
  default: "neutral",
};

interface StatusBadgeProps {
  status: InvoiceStatus | VendorPaymentStatus | RecordStatus;
  size?: "small" | "medium";
  variant?: "filled" | "outlined";
  /** Force the Daylight pill; defaults to on inside a DaylightAdminPage. */
  daylight?: boolean;
}

export function StatusBadge({
  status,
  size = "medium",
  variant = "filled",
  daylight,
}: StatusBadgeProps) {
  const inDaylightPage = useDaylightScope();
  const isRecordStatus = status === "Active" || status === "Inactive";
  const label = isRecordStatus ? status : INVOICE_STATUS_LABELS[status];
  const color = isRecordStatus
    ? RECORD_STATUS_COLORS[status]
    : (INVOICE_STATUS_COLORS[status] as ChipProps["color"]);

  if (daylight ?? inDaylightPage) {
    return (
      <DaylightStatusPill
        label={label}
        tone={PILL_TONE[color ?? "default"] ?? "neutral"}
      />
    );
  }

  return (
    <Chip
      label={label}
      color={color}
      variant={variant}
      size={size === "small" ? "small" : "medium"}
      sx={{
        fontWeight: 600,
        textTransform: "capitalize",
      }}
    />
  );
}
