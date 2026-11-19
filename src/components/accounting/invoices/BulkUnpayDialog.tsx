"use client";

/**
 * Confirms a bulk status change that moves Paid invoices to another status
 * (Issued / Overdue / Refunded). That does what Mark Unpaid does for each:
 * voids every payment, clears the paid date and deletes the Bank
 * Reconciliation entry. Shows, per invoice, the bank statement rows it
 * removes (decided 2026-11-19). Super Admin only (the server checks).
 */

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { useQueries } from "@tanstack/react-query";
import { BankEffectNotice } from "@/components/accounting/common/BankEffectNotice";
import { fetchBankEffect } from "@/lib/hooks/useBankEffect";

const STATUS_LABEL: Record<string, string> = {
  ISSUED: "Issued",
  OVERDUE: "Overdue",
  REFUNDED: "Refunded",
};

export function BulkUnpayDialog({
  invoices,
  targetStatus,
  busy,
  onClose,
  onConfirm,
}: {
  /** The selected invoices that are Paid now. */
  invoices: { id: string; invoiceNumber: string }[];
  targetStatus: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const effects = useQueries({
    queries: invoices.map((inv) => ({
      queryKey: [
        "bankEffect",
        `/api/accounting/invoices/${inv.id}/mark-unpaid`,
      ],
      queryFn: () =>
        fetchBankEffect(`/api/accounting/invoices/${inv.id}/mark-unpaid`),
      staleTime: 0,
      gcTime: 0,
    })),
  });
  const loading = effects.some((e) => e.isLoading);
  const failed = effects.some((e) => !!e.error);

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Change {invoices.length} paid invoice{invoices.length === 1 ? "" : "s"}{" "}
        to {STATUS_LABEL[targetStatus] ?? targetStatus}?
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2 }}>
          This deletes the payment records of{" "}
          {invoices.length === 1 ? "this paid invoice" : "these paid invoices"}{" "}
          and clears their paid date, as Mark as Unpaid does. Any bank statement
          rows and Bank Reconciliation entries listed below are removed too.
          Only super administrators can do this.
        </Typography>
        {invoices.map((inv, i) => (
          <Box
            key={inv.id}
            sx={{ borderTop: 1, borderColor: "divider", pt: 1.5, mt: 1.5 }}
          >
            <Typography sx={{ fontWeight: 650 }}>
              {inv.invoiceNumber}
              {effects[i]?.data
                ? ` · ${effects[i].data.paymentCount} payment record${effects[i].data.paymentCount === 1 ? "" : "s"}`
                : ""}
            </Typography>
            <BankEffectNotice
              effect={effects[i]?.data}
              loading={!!effects[i]?.isLoading}
              error={effects[i]?.error as Error | null}
            />
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          onClick={onConfirm}
          disabled={busy || loading || failed}
        >
          {busy ? "Updating..." : "Delete payments and change status"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
