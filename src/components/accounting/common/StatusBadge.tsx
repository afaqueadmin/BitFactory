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

// Active/Inactive for accounting master data (entities, banks, currencies).
type RecordStatus = "Active" | "Inactive";

const RECORD_STATUS_COLORS: Record<RecordStatus, ChipProps["color"]> = {
  Active: "success",
  Inactive: "default",
};

interface StatusBadgeProps {
  status: InvoiceStatus | VendorPaymentStatus | RecordStatus;
  size?: "small" | "medium";
  variant?: "filled" | "outlined";
}

export function StatusBadge({
  status,
  size = "medium",
  variant = "filled",
}: StatusBadgeProps) {
  const isRecordStatus = status === "Active" || status === "Inactive";
  const label = isRecordStatus ? status : INVOICE_STATUS_LABELS[status];
  const color = isRecordStatus
    ? RECORD_STATUS_COLORS[status]
    : (INVOICE_STATUS_COLORS[status] as ChipProps["color"]);

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
