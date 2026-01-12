/**
 * Status Badge Component
 *
 * Displays invoice status with color coding
 */

import { Chip, ChipProps } from "@mui/material";
import { InvoiceStatus } from "@/lib/types/invoice";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
} from "@/lib/constants/accounting";

interface StatusBadgeProps {
  status: InvoiceStatus;
  size?: "small" | "medium";
  variant?: "filled" | "outlined";
}

export function StatusBadge({
  status,
  size = "medium",
  variant = "filled",
}: StatusBadgeProps) {
  const label = INVOICE_STATUS_LABELS[status];
  const color = INVOICE_STATUS_COLORS[status] as ChipProps["color"];

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
