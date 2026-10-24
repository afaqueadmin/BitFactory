"use client";

import { MenuItem, TextField } from "@mui/material";
import { useAccountingVendors } from "@/lib/hooks/usePaymentAccounts";
import type { InvoiceVendor } from "@/lib/hooks/useVendorInvoices";

/**
 * Vendor dropdown for Hardware Purchase / Farm Tariff forms: active vendors
 * tagged for that invoice type, plus the invoice's current vendor even if it
 * was deactivated or untagged since, so an edit never silently drops it.
 */
export function VendorSelect({
  type,
  value,
  onChange,
  currentVendor,
  required = false,
  disabled = false,
  size,
  helperText,
}: {
  type: "hardware" | "farm";
  value: string;
  onChange: (vendorId: string) => void;
  currentVendor?: InvoiceVendor | null;
  required?: boolean;
  disabled?: boolean;
  size?: "small" | "medium";
  helperText?: string;
}) {
  const { data: vendors = [], isLoading } = useAccountingVendors(true, type);
  const options = [
    ...vendors.map((v) => ({ id: v.id, name: v.name, extra: "" })),
    ...(currentVendor && !vendors.some((v) => v.id === currentVendor.id)
      ? [
          {
            id: currentVendor.id,
            name: currentVendor.name,
            extra: currentVendor.isActive ? " (not tagged)" : " (inactive)",
          },
        ]
      : []),
  ];

  return (
    <TextField
      select
      fullWidth
      label="Vendor Name"
      value={
        isLoading && value && !options.some((o) => o.id === value) ? "" : value
      }
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
      size={size}
      helperText={helperText}
    >
      <MenuItem value="">
        {required ? "-- Select Vendor --" : "No vendor"}
      </MenuItem>
      {options.map((option) => (
        <MenuItem key={option.id} value={option.id}>
          {option.name}
          {option.extra}
        </MenuItem>
      ))}
    </TextField>
  );
}
