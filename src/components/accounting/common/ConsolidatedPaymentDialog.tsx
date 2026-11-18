"use client";

/**
 * Record Consolidated Payment (Farm Tariffs / Hardware Purchases list
 * pages): one bank transfer that paid several of a vendor's pending
 * invoices, credits included, recorded once as it appears on the bank
 * statement. Choose the vendor, tick the invoices, then enter the transfer:
 * paid date, entity / bank / currency and rate, amount paid (the amount due
 * plus the transaction fee, as on single-invoice payments), the fee and the
 * receipt PDF. Every ticked invoice becomes Paid with that date and receipt.
 */

import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { AmountDueInCurrency } from "@/components/accounting/common/AmountDueInCurrency";
import {
  PaymentPartValue,
  PaymentPartsFields,
  isPartComplete,
  newPaymentPart,
  partsFeesUsd,
  partsPayload,
  partsTotalUsd,
} from "@/components/accounting/common/PaymentPartsFields";
import {
  PdfUploadField,
  UploadedPdf,
} from "@/components/accounting/common/PdfUploadField";
import { useAccountingVendors } from "@/lib/hooks/usePaymentAccounts";

/** D8, mirrored from the server: within $0.01. */
const TOLERANCE_USD = 0.01;

interface Candidate {
  id: string;
  invoiceNumber: string;
  billingDate: string | null;
  dueDate: string;
  totalAmount: string;
  depositAppliedUsd: string;
  dueUsd: string;
}

const KINDS = {
  farm: {
    apiBase: "/api/vendor-invoices",
    receiptPurpose: "vendor-receipt" as const,
    title: "Record Consolidated Payment - Farm Tariffs",
    vendorFilter: (v: {
      forFarmTariffs: boolean;
      _count: { vendorInvoices: number };
    }) => v.forFarmTariffs || v._count.vendorInvoices > 0,
  },
  hardware: {
    apiBase: "/api/hardware-purchases",
    receiptPurpose: "hardware-purchase-receipt" as const,
    title: "Record Consolidated Payment - Hardware Purchases",
    vendorFilter: (v: {
      forHardwarePurchases: boolean;
      _count: { hardwarePurchases: number };
    }) => v.forHardwarePurchases || v._count.hardwarePurchases > 0,
  },
};

export function ConsolidatedPaymentDialog({
  kind,
  open,
  onClose,
  onRecorded,
}: {
  kind: "farm" | "hardware";
  open: boolean;
  onClose: () => void;
  /** After it's saved: the message to show; the caller reloads its list. */
  onRecorded: (message: string) => void;
}) {
  const config = KINDS[kind];
  const { data: allVendors = [] } = useAccountingVendors();
  const vendors = allVendors.filter(config.vendorFilter);

  const [vendorId, setVendorId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [paidDate, setPaidDate] = useState("");
  const [parts, setParts] = useState<PaymentPartValue[]>(() => [
    newPaymentPart(),
  ]);
  const [receipt, setReceipt] = useState<UploadedPdf | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start fresh each time it opens.
  useEffect(() => {
    if (!open) return;
    setVendorId("");
    setCandidates(null);
    setSelected([]);
    setPaidDate("");
    setParts([newPaymentPart()]);
    setReceipt(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    setSelected([]);
    setCandidates(null);
    if (!vendorId) return;
    let cancelled = false;
    setLoadingInvoices(true);
    fetch(
      `${config.apiBase}/consolidated-payment?vendorId=${encodeURIComponent(vendorId)}`,
      { credentials: "include" },
    )
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Failed to load invoices");
        if (!cancelled) setCandidates(body.data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load invoices");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingInvoices(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId, config.apiBase]);

  const chosen = useMemo(
    () => (candidates ?? []).filter((c) => selected.includes(c.id)),
    [candidates, selected],
  );
  const dueUsd = chosen.reduce((s, c) => s + Number(c.dueUsd), 0);
  const feesUsd = partsFeesUsd(parts);
  const targetUsd = dueUsd + feesUsd;
  const enteredUsd = partsTotalUsd(parts);
  const matches = Math.abs(enteredUsd - targetUsd) <= TOLERANCE_USD + 1e-9;
  const hasCredit = chosen.some((c) => Number(c.dueUsd) < 0);

  const problem =
    chosen.length === 0
      ? null
      : chosen.length < 2
        ? "Tick at least two invoices. For one invoice, use Record Payment on its page."
        : dueUsd <= 0
          ? "The ticked invoices add up to zero or less. A credit is paid together with invoices it offsets."
          : null;

  const canSubmit =
    !!vendorId &&
    chosen.length >= 2 &&
    dueUsd > 0 &&
    !!paidDate &&
    parts.length === 1 &&
    isPartComplete(parts[0], { withFee: true }) &&
    matches &&
    !!receipt &&
    !receiptUploading &&
    !saving;

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      // Keep the list's order.
      const invoiceIds = (candidates ?? [])
        .filter((c) => selected.includes(c.id))
        .map((c) => c.id);
      const res = await fetch(`${config.apiBase}/consolidated-payment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          invoiceIds,
          paidDate: new Date(paidDate).toISOString(),
          part: partsPayload(parts, true)[0],
          receiptKey: receipt?.key,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Failed to record the consolidated payment");
        return;
      }
      onRecorded(
        `Consolidated payment recorded: invoices ${(body.data?.invoiceNumbers ?? []).join(", ")} are now Paid`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to record the consolidated payment",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>{config.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Typography variant="body2" color="textSecondary">
            For one bank transfer that paid several of a vendor&apos;s invoices
            at once, credits included. Enter it once, exactly as on the bank
            statement. Every ticked invoice becomes Paid with this paid date and
            receipt.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            id="consolidated-vendor"
            select
            fullWidth
            label="Vendor"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            disabled={saving}
            required
          >
            {vendors.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.name}
                {v.isActive ? "" : " (inactive)"}
              </MenuItem>
            ))}
          </TextField>

          {vendorId && (
            <Box>
              <Typography sx={{ fontWeight: 600, mb: 1 }}>
                Pending invoices
              </Typography>
              {loadingInvoices ? (
                <CircularProgress size={24} />
              ) : candidates && candidates.length === 0 ? (
                <Alert severity="info">
                  This vendor has no pending invoices with anything left to pay.
                </Alert>
              ) : candidates ? (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" />
                      <TableCell>Invoice</TableCell>
                      <TableCell>Issued</TableCell>
                      <TableCell>Due</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell align="right">Amount due</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {candidates.map((c) => {
                      const deposit = Number(c.depositAppliedUsd);
                      return (
                        <TableRow
                          key={c.id}
                          hover
                          onClick={() => !saving && toggle(c.id)}
                          sx={{ cursor: saving ? "default" : "pointer" }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              id={`consolidated-invoice-${c.id}`}
                              checked={selected.includes(c.id)}
                              disabled={saving}
                              inputProps={{
                                "aria-label": `Invoice ${c.invoiceNumber}`,
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {c.invoiceNumber}
                            {Number(c.dueUsd) < 0 && (
                              <Typography
                                component="span"
                                variant="caption"
                                color="textSecondary"
                              >
                                {" "}
                                · credit
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            {c.billingDate ? (
                              <DateDisplay
                                date={new Date(c.billingDate)}
                                format="date"
                              />
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            <DateDisplay
                              date={new Date(c.dueDate)}
                              format="date"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <CurrencyDisplay value={c.totalAmount} />
                          </TableCell>
                          <TableCell align="right">
                            <strong>
                              <CurrencyDisplay value={c.dueUsd} />
                            </strong>
                            {deposit > 0 && (
                              <Typography
                                variant="caption"
                                color="textSecondary"
                                component="div"
                              >
                                after <CurrencyDisplay value={deposit} /> from
                                deposit
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : null}
            </Box>
          )}

          {problem && <Alert severity="warning">{problem}</Alert>}

          {chosen.length > 0 && (
            <>
              <Divider />
              <TextField
                id="consolidated-paid-date"
                fullWidth
                label="Paid Date"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                required
                disabled={saving}
                helperText="The date of the bank transfer. Every ticked invoice gets this paid date."
                slotProps={{ inputLabel: { shrink: true } }}
              />

              <PaymentPartsFields
                parts={parts}
                onChange={setParts}
                disabled={saving}
                withFee
                singlePart
                targetUsd={targetUsd}
              />

              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                {chosen.map((c) => (
                  <Stack
                    key={c.id}
                    direction="row"
                    justifyContent="space-between"
                  >
                    <Typography color="textSecondary">
                      Invoice {c.invoiceNumber}
                      {Number(c.dueUsd) < 0 ? " (credit)" : ""}
                    </Typography>
                    <Typography sx={{ fontWeight: 600 }}>
                      <CurrencyDisplay value={c.dueUsd} />
                    </Typography>
                  </Stack>
                ))}
                <Divider sx={{ my: 1 }} />
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="textSecondary">
                    Amount due (USD)
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }}>
                    <CurrencyDisplay value={dueUsd} />
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="textSecondary">
                    + Transaction fee (USD)
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }}>
                    <CurrencyDisplay value={feesUsd} />
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="textSecondary">
                    Amount paid must be (USD)
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }}>
                    <CurrencyDisplay value={targetUsd} />
                  </Typography>
                </Stack>
                {parts.length === 1 && dueUsd > 0 && (
                  <AmountDueInCurrency
                    usd={targetUsd}
                    account={parts[0]}
                    compact
                  />
                )}
                {enteredUsd > 0 && !matches && dueUsd > 0 && (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>
                    The amount paid must equal the amount due plus the
                    transaction fee within $0.01.{" "}
                    {enteredUsd < targetUsd
                      ? `$${(targetUsd - enteredUsd).toFixed(2)} USD is still to be entered.`
                      : `It's $${(enteredUsd - targetUsd).toFixed(2)} USD over.`}
                  </Alert>
                )}
                {hasCredit && (
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    component="div"
                    sx={{ mt: 1 }}
                  >
                    Credits are deducted from the amount due, as in the bank
                    transfer.
                  </Typography>
                )}
              </Box>

              <PdfUploadField
                label="Payment Receipt PDF"
                purpose={config.receiptPurpose}
                value={receipt}
                onChange={setReceipt}
                onUploadingChange={setReceiptUploading}
                required
                disabled={saving}
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={submit}
          disabled={!canSubmit}
          startIcon={saving ? <CircularProgress size={18} /> : undefined}
        >
          {saving
            ? "Saving..."
            : chosen.length > 0
              ? `Mark ${chosen.length} invoices as Paid`
              : "Mark as Paid"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
