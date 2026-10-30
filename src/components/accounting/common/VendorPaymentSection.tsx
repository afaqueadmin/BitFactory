"use client";

/**
 * "Payment Information" box shared by the Farm Tariff and Hardware Purchase
 * invoice pages. Pending: the payment form (date, one or more currency
 * parts - each with its own Entity/Bank/Currency, rate, amount and fee -
 * and the receipt PDF) posting to `<apiBase>/<id>/record-payment`.
 * Paid: a read-only summary of the parts with a link to the receipt.
 *
 * Security deposit: the vendor may apply part of the deposit it holds to
 * the invoice. Adjustments recorded earlier (Security Deposits page) and
 * the optional "Apply from deposit" amount lower the cash due, which the
 * currency parts must then match, plus their transaction fees (the amount
 * paid includes the fee). If the deposit covers the whole total, no cash
 * parts or receipt are needed.
 */

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Link as MuiLink,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import DeleteIcon from "@mui/icons-material/Delete";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { ReactNode, useState } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { formatCurrencyAmount } from "@/components/accounting/common/PaymentAccountFields";
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
import type {
  DepositAdjustment,
  InvoiceVendor,
  VendorPaymentPart,
} from "@/lib/hooks/useVendorInvoices";
import {
  useSaveDepositMovement,
  useVendorDeposit,
} from "@/lib/hooks/useSecurityDeposits";
import {
  PdfUploadField,
  PdfUploadPurpose,
  UploadedPdf,
} from "@/components/accounting/common/PdfUploadField";

type Amount = number | string;

/** The payment fields of a Farm Tariff / Hardware Purchase invoice. */
export interface VendorSideInvoice {
  id: string;
  paymentStatus: "Paid" | "Pending" | "Cancelled";
  totalAmount: Amount;
  paidDate: string | null;
  paymentReceiptKey?: string | null;
  /**
   * Payment details come only from the parts; the invoice's single-currency
   * payment columns are deprecated (backfilled into one part each).
   */
  paymentParts?: VendorPaymentPart[];
  /** Optional on Farm Tariffs. */
  vendorId?: string | null;
  vendor?: InvoiceVendor | null;
  /** Security deposit the vendor applied to this invoice. */
  depositAdjustments?: DepositAdjustment[];
}

/**
 * D8, mirrored from the server: converted amount within $0.01 of the cash
 * due plus fees.
 */
const TOLERANCE_USD = 0.01;

/** Gaps under half a cent count as settled. */
const CENT_EPSILON = 0.005;

const adjustedTotal = (invoice: VendorSideInvoice) =>
  (invoice.depositAdjustments ?? []).reduce(
    (sum, a) => sum + Number(a.amountUsd),
    0,
  );

/** "From security deposit" rows (paid summary and pending form). */
function DepositAdjustmentRows({
  adjustments,
  onDelete,
  busy = false,
}: {
  adjustments: DepositAdjustment[];
  onDelete?: (id: string) => void;
  busy?: boolean;
}) {
  if (adjustments.length === 0) return null;
  return (
    <Box>
      <Typography
        variant="subtitle2"
        color="textSecondary"
        sx={{ fontWeight: 600, mb: 0.5 }}
      >
        From Security Deposit
      </Typography>
      <Stack spacing={0.5}>
        {adjustments.map((a) => (
          <Stack
            key={a.id}
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
          >
            <Typography variant="body2">
              <DateDisplay date={new Date(a.date)} format="date" />
              {a.note ? ` · ${a.note}` : ""}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={a.amountUsd} />
              </Typography>
              {onDelete && (
                <Tooltip title="Remove this deposit adjustment">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => onDelete(a.id)}
                      disabled={busy}
                    >
                      <DeleteIcon fontSize="small" color="error" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography
        variant="subtitle2"
        color="textSecondary"
        sx={{ fontWeight: 600, mb: 0.5 }}
      >
        {label}
      </Typography>
      <Typography variant="body1" component="div">
        {children}
      </Typography>
    </Box>
  );
}

function PaidSummary({
  invoice,
  receiptHref,
}: {
  invoice: VendorSideInvoice;
  receiptHref: string;
}) {
  const parts = invoice.paymentParts ?? [];
  const adjustments = invoice.depositAdjustments ?? [];
  const multi = parts.length > 1;
  const totalUsd = parts.reduce((sum, p) => sum + Number(p.amountUsd), 0);
  const feeUsd = (p: VendorPaymentPart) =>
    Number(p.transactionFee) / Number(p.exchangeRate);
  const totalFeesUsd = parts.reduce((sum, p) => sum + feeUsd(p), 0);

  return (
    <Stack spacing={2}>
      <Alert severity="success">
        This invoice was marked as paid on{" "}
        {invoice.paidDate ? (
          <DateDisplay date={new Date(invoice.paidDate)} format="date" />
        ) : (
          "—"
        )}
      </Alert>

      <DepositAdjustmentRows adjustments={adjustments} />

      {parts.length === 0 && adjustments.length > 0 ? (
        <Typography variant="body2" color="textSecondary">
          Paid in full from the vendor&apos;s security deposit; there was no
          cash payment.
        </Typography>
      ) : parts.length > 0 ? (
        <>
          {parts.map((part, index) => (
            <Box key={part.id}>
              {multi && (
                <Typography sx={{ fontWeight: 600, mb: 1 }}>
                  Currency part {index + 1}
                </Typography>
              )}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  gap: 2,
                }}
              >
                <SummaryRow label="Entity">{part.entity.name}</SummaryRow>
                <SummaryRow label="Bank">{part.bank.name}</SummaryRow>
                <SummaryRow label="Amount Paid">
                  {formatCurrencyAmount(part.amount, part.currency.code)}
                </SummaryRow>
                <SummaryRow label="Exchange Rate">
                  {`1 USD = ${Number(part.exchangeRate)} ${part.currency.code}`}
                </SummaryRow>
                <SummaryRow label="USD Equivalent">
                  <CurrencyDisplay value={part.amountUsd} />
                </SummaryRow>
                <SummaryRow label="Transaction Fee">
                  {formatCurrencyAmount(
                    part.transactionFee,
                    part.currency.code,
                  )}
                </SummaryRow>
                <SummaryRow label="Fee (USD)">
                  <CurrencyDisplay value={feeUsd(part)} />
                </SummaryRow>
              </Box>
              {multi && <Divider sx={{ mt: 2 }} />}
            </Box>
          ))}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 2,
            }}
          >
            {multi && (
              <SummaryRow label="Total Paid (USD)">
                <CurrencyDisplay value={totalUsd} />
              </SummaryRow>
            )}
            {multi && (
              <SummaryRow label="Total Fees (USD)">
                <CurrencyDisplay value={totalFeesUsd} />
              </SummaryRow>
            )}
            <SummaryRow label="Payment Receipt">
              {invoice.paymentReceiptKey ? (
                <MuiLink
                  href={receiptHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  <PictureAsPdfIcon fontSize="small" /> View receipt
                </MuiLink>
              ) : (
                "No receipt"
              )}
            </SummaryRow>
          </Box>
        </>
      ) : (
        <Typography variant="body2" color="textSecondary">
          This invoice was paid before payment details were recorded, so it has
          no entity, bank, currency or receipt on file.
        </Typography>
      )}
    </Stack>
  );
}

interface VendorPaymentSectionProps {
  invoice: VendorSideInvoice;
  /** e.g. "/api/vendor-invoices" */
  apiBase: string;
  receiptPurpose: PdfUploadPurpose;
  /** Called with the updated invoice after the payment is recorded. */
  onPaid: (invoice: VendorSideInvoice) => void;
  /** Called with the reloaded invoice after a deposit adjustment is removed. */
  onUpdated?: (invoice: VendorSideInvoice) => void;
  onCancelClick: () => void;
}

export function VendorPaymentSection({
  invoice,
  apiBase,
  receiptPurpose,
  onPaid,
  onUpdated,
  onCancelClick,
}: VendorPaymentSectionProps) {
  const [paidDate, setPaidDate] = useState("");
  const [parts, setParts] = useState<PaymentPartValue[]>(() => [
    newPaymentPart(),
  ]);
  const [applyDeposit, setApplyDeposit] = useState("");
  const [receipt, setReceipt] = useState<UploadedPdf | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPending = invoice.paymentStatus === "Pending";
  const depositQuery = useVendorDeposit(
    isPending ? (invoice.vendorId ?? null) : null,
  );
  const removeAdjustment = useSaveDepositMovement();

  const receiptHref = `${apiBase}/${invoice.id}/documents/receipt`;

  if (invoice.paymentStatus === "Paid") {
    return <PaidSummary invoice={invoice} receiptHref={receiptHref} />;
  }

  const totalUsd = Number(invoice.totalAmount);
  const alreadyAdjusted = adjustedTotal(invoice);
  const remainingUsd = totalUsd - alreadyAdjusted;
  const held = depositQuery.data?.balance.held ?? 0;
  const maxApply = Math.max(0, Math.min(held, remainingUsd));
  const applyTrimmed = applyDeposit.trim();
  const applied = applyTrimmed === "" ? 0 : Number(applyTrimmed);
  const applyInvalid =
    applyTrimmed !== "" &&
    (!Number.isFinite(applied) ||
      applied < 0 ||
      !/^\d+(\.\d{1,2})?$/.test(applyTrimmed) ||
      applied > maxApply + CENT_EPSILON);
  const cashDueUsd = Math.max(0, remainingUsd - (applyInvalid ? 0 : applied));
  // The deposit covers everything: no cash payment, parts or receipt.
  const noCash = cashDueUsd < CENT_EPSILON;

  const enteredUsd = partsTotalUsd(parts);
  // The amount paid covers the cash due and the fees on top of it.
  const feesUsd = noCash ? 0 : partsFeesUsd(parts);
  const targetUsd = cashDueUsd + feesUsd;
  const partsComplete = parts.every((p) =>
    isPartComplete(p, { withFee: true }),
  );
  // Small epsilon so float division can't flip an exact match.
  const matchesTotal = Math.abs(enteredUsd - targetUsd) <= TOLERANCE_USD + 1e-9;

  const canSubmit =
    !!paidDate &&
    !applyInvalid &&
    (noCash
      ? true
      : partsComplete && matchesTotal && !!receipt && !receiptUploading) &&
    !saving;

  const handleRemoveAdjustment = async (id: string) => {
    setError(null);
    try {
      await removeAdjustment.mutateAsync({ id });
      const res = await fetch(`${apiBase}/${invoice.id}`, {
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.data) onUpdated?.(body.data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to remove the adjustment",
      );
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${invoice.id}/record-payment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paidDate: new Date(paidDate).toISOString(),
          depositAdjustment: applied > 0 ? applyTrimmed : undefined,
          ...(noCash
            ? {}
            : {
                parts: partsPayload(parts, true),
                receiptKey: receipt?.key,
              }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Failed to record payment");
        return;
      }
      onPaid(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        fullWidth
        label="Paid Date"
        type="date"
        value={paidDate}
        onChange={(e) => setPaidDate(e.target.value)}
        required
        disabled={saving}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <DepositAdjustmentRows
        adjustments={invoice.depositAdjustments ?? []}
        onDelete={handleRemoveAdjustment}
        busy={saving || removeAdjustment.isPending}
      />

      {invoice.vendorId && (held > 0 || applyTrimmed !== "") && (
        <TextField
          fullWidth
          label="Apply from security deposit (USD, optional)"
          type="number"
          value={applyDeposit}
          onChange={(e) => setApplyDeposit(e.target.value)}
          disabled={saving}
          error={applyInvalid}
          helperText={
            applyInvalid
              ? `Enter up to $${maxApply.toFixed(2)} (2 decimal places)`
              : `${invoice.vendor?.name ?? "The vendor"} holds $${held.toFixed(2)} of deposit. Use this if they took part of this invoice from it.`
          }
          slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
        />
      )}

      {noCash ? (
        <Alert severity="info">
          The security deposit covers the whole invoice, so no cash payment or
          receipt is needed.
        </Alert>
      ) : (
        <PaymentPartsFields
          parts={parts}
          onChange={setParts}
          disabled={saving}
          withFee
          targetUsd={targetUsd}
        />
      )}

      <Box
        sx={{
          p: 2,
          borderRadius: 1,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        {!noCash && (
          <>
            <Stack direction="row" justifyContent="space-between">
              <Typography color="textSecondary">USD equivalent</Typography>
              <Typography sx={{ fontWeight: 600 }}>
                {enteredUsd > 0 ? <CurrencyDisplay value={enteredUsd} /> : "—"}
              </Typography>
            </Stack>
            <Divider sx={{ my: 1 }} />
          </>
        )}
        <Stack direction="row" justifyContent="space-between">
          <Typography color="textSecondary">Invoice total (USD)</Typography>
          <Typography sx={{ fontWeight: 600 }}>
            <CurrencyDisplay value={totalUsd} />
          </Typography>
        </Stack>
        {cashDueUsd < totalUsd - CENT_EPSILON && (
          <>
            <Stack direction="row" justifyContent="space-between">
              <Typography color="textSecondary">
                From security deposit
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                − <CurrencyDisplay value={totalUsd - cashDueUsd} />
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography color="textSecondary">Cash due (USD)</Typography>
              <Typography sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={cashDueUsd} />
              </Typography>
            </Stack>
          </>
        )}
        {feesUsd > 0 && (
          <>
            <Stack direction="row" justifyContent="space-between">
              <Typography color="textSecondary">
                Transaction fees (USD)
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                + <CurrencyDisplay value={feesUsd} />
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography color="textSecondary">Total to pay (USD)</Typography>
              <Typography sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={targetUsd} />
              </Typography>
            </Stack>
          </>
        )}
        {!noCash && parts.length === 1 && (
          <AmountDueInCurrency usd={targetUsd} account={parts[0]} compact />
        )}
        {!noCash && enteredUsd > 0 && !matchesTotal && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            {feesUsd > 0
              ? "The amount paid must match the cash due plus transaction fees within $0.01."
              : "The amount paid must match the cash due within $0.01."}{" "}
            {enteredUsd < targetUsd
              ? `$${(targetUsd - enteredUsd).toFixed(2)} USD is still to be entered.`
              : `The parts are $${(enteredUsd - targetUsd).toFixed(2)} USD over.`}
          </Alert>
        )}
      </Box>

      {!noCash && (
        <PdfUploadField
          label="Payment Receipt PDF"
          purpose={receiptPurpose}
          value={receipt}
          onChange={setReceipt}
          onUploadingChange={setReceiptUploading}
          required
          disabled={saving}
        />
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 1 }}>
        <Button
          fullWidth
          variant="contained"
          color="success"
          startIcon={
            saving ? <CircularProgress size={20} /> : <CheckCircleIcon />
          }
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {saving ? "Processing..." : "Mark as Paid"}
        </Button>
        <Button
          fullWidth
          variant="outlined"
          color="error"
          startIcon={<CancelIcon />}
          onClick={onCancelClick}
          disabled={saving}
        >
          Cancel Invoice
        </Button>
      </Stack>
    </Stack>
  );
}
