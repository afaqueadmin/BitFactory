"use client";

/**
 * "Payment Information" box shared by the Farm Tariff and Hardware Purchase
 * invoice pages. Pending: the payment form (date, one or more currency
 * parts - each with its own Entity/Bank/Currency, rate, amount and fee -
 * and the receipt PDF) posting to `<apiBase>/<id>/record-payment`.
 * Paid: a read-only summary of the parts with a link to the receipt.
 */

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Link as MuiLink,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
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
  partsPayload,
  partsTotalUsd,
} from "@/components/accounting/common/PaymentPartsFields";
import type { VendorPaymentPart } from "@/lib/hooks/useVendorInvoices";
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
}

/** D8, mirrored from the server: converted amount within $0.01 of the total. */
const TOLERANCE_USD = 0.01;

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
  const multi = parts.length > 1;
  const totalUsd = parts.reduce((sum, p) => sum + Number(p.amountUsd), 0);

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

      {parts.length > 0 ? (
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
  onCancelClick: () => void;
}

export function VendorPaymentSection({
  invoice,
  apiBase,
  receiptPurpose,
  onPaid,
  onCancelClick,
}: VendorPaymentSectionProps) {
  const [paidDate, setPaidDate] = useState("");
  const [parts, setParts] = useState<PaymentPartValue[]>(() => [
    newPaymentPart(),
  ]);
  const [receipt, setReceipt] = useState<UploadedPdf | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receiptHref = `${apiBase}/${invoice.id}/documents/receipt`;

  if (invoice.paymentStatus === "Paid") {
    return <PaidSummary invoice={invoice} receiptHref={receiptHref} />;
  }

  const totalUsd = Number(invoice.totalAmount);
  const enteredUsd = partsTotalUsd(parts);
  const partsComplete = parts.every((p) =>
    isPartComplete(p, { withFee: true }),
  );
  // Small epsilon so float division can't flip an exact match.
  const matchesTotal = Math.abs(enteredUsd - totalUsd) <= TOLERANCE_USD + 1e-9;

  const canSubmit =
    !!paidDate &&
    partsComplete &&
    matchesTotal &&
    !!receipt &&
    !receiptUploading &&
    !saving;

  const handleSubmit = async () => {
    if (!canSubmit || !receipt) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${invoice.id}/record-payment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paidDate: new Date(paidDate).toISOString(),
          parts: partsPayload(parts, true),
          receiptKey: receipt.key,
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

      <PaymentPartsFields
        parts={parts}
        onChange={setParts}
        disabled={saving}
        withFee
        targetUsd={totalUsd}
      />

      <Box
        sx={{
          p: 2,
          borderRadius: 1,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack direction="row" justifyContent="space-between">
          <Typography color="textSecondary">USD equivalent</Typography>
          <Typography sx={{ fontWeight: 600 }}>
            {enteredUsd > 0 ? <CurrencyDisplay value={enteredUsd} /> : "—"}
          </Typography>
        </Stack>
        <Divider sx={{ my: 1 }} />
        <Stack direction="row" justifyContent="space-between">
          <Typography color="textSecondary">Invoice total (USD)</Typography>
          <Typography sx={{ fontWeight: 600 }}>
            <CurrencyDisplay value={totalUsd} />
          </Typography>
        </Stack>
        {parts.length === 1 && (
          <AmountDueInCurrency usd={totalUsd} account={parts[0]} compact />
        )}
        {enteredUsd > 0 && !matchesTotal && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            The amount paid must match the invoice total within $0.01.{" "}
            {enteredUsd < totalUsd
              ? `$${(totalUsd - enteredUsd).toFixed(2)} USD is still to be entered.`
              : `The parts are $${(enteredUsd - totalUsd).toFixed(2)} USD over.`}
          </Alert>
        )}
      </Box>

      <PdfUploadField
        label="Payment Receipt PDF"
        purpose={receiptPurpose}
        value={receipt}
        onChange={setReceipt}
        onUploadingChange={setReceiptUploading}
        required
        disabled={saving}
      />

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
