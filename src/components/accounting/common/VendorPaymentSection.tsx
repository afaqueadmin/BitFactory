"use client";

/**
 * "Payment Information" box shared by the Farm Tariff and Hardware Purchase
 * invoice pages. Pending: the payment form (date, Entity/Bank/Currency, rate,
 * amount, fee, receipt PDF) posting to `<apiBase>/<id>/record-payment`.
 * Paid: a read-only summary with a link to the receipt.
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
import {
  EMPTY_PAYMENT_ACCOUNT,
  PaymentAccountFields,
  PaymentAccountValue,
  isPaymentAccountComplete,
  parseExchangeRate,
} from "@/components/accounting/common/PaymentAccountFields";
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
  paymentAmount?: Amount | null;
  paymentExchangeRate?: Amount | null;
  paymentAmountUsd?: Amount | null;
  transactionFee?: Amount | null;
  paymentReceiptKey?: string | null;
  paymentEntity?: { id: string; name: string } | null;
  paymentBank?: { id: string; name: string } | null;
  paymentCurrency?: { id: string; code: string; name: string } | null;
}

const formatAmount = (value: Amount, code: string) =>
  `${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${code}`;

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
  const code = invoice.paymentCurrency?.code;
  const hasDetails = !!(invoice.paymentEntity && code);

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

      {hasDetails ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
          }}
        >
          <SummaryRow label="Entity">{invoice.paymentEntity?.name}</SummaryRow>
          <SummaryRow label="Bank">
            {invoice.paymentBank?.name ?? "—"}
          </SummaryRow>
          <SummaryRow label="Amount Paid">
            {invoice.paymentAmount != null
              ? formatAmount(invoice.paymentAmount, code!)
              : "—"}
          </SummaryRow>
          <SummaryRow label="Exchange Rate">
            {invoice.paymentExchangeRate != null
              ? `1 USD = ${Number(invoice.paymentExchangeRate)} ${code}`
              : "—"}
          </SummaryRow>
          <SummaryRow label="USD Equivalent">
            {invoice.paymentAmountUsd != null ? (
              <CurrencyDisplay value={invoice.paymentAmountUsd} />
            ) : (
              "—"
            )}
          </SummaryRow>
          <SummaryRow label="Transaction Fee">
            {invoice.transactionFee != null
              ? formatAmount(invoice.transactionFee, code!)
              : "—"}
          </SummaryRow>
          <SummaryRow label="Payment Receipt">
            {invoice.paymentReceiptKey ? (
              <MuiLink
                href={receiptHref}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
              >
                <PictureAsPdfIcon fontSize="small" /> View receipt
              </MuiLink>
            ) : (
              "No receipt"
            )}
          </SummaryRow>
        </Box>
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
  const [account, setAccount] = useState<PaymentAccountValue>(
    EMPTY_PAYMENT_ACCOUNT,
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [transactionFee, setTransactionFee] = useState("");
  const [receipt, setReceipt] = useState<UploadedPdf | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receiptHref = `${apiBase}/${invoice.id}/documents/receipt`;

  if (invoice.paymentStatus === "Paid") {
    return <PaidSummary invoice={invoice} receiptHref={receiptHref} />;
  }

  const totalUsd = Number(invoice.totalAmount);
  const rate = parseExchangeRate(account);
  const code = account.currencyCode;
  const amount = paymentAmount.trim() === "" ? null : Number(paymentAmount);
  const fee = transactionFee.trim() === "" ? null : Number(transactionFee);
  const amountUsd = rate && amount != null ? amount / rate : null;
  const neededAmount = rate ? Math.round(totalUsd * rate * 100) / 100 : null;
  const amountValid = amount != null && Number.isFinite(amount) && amount > 0;
  const feeValid = fee != null && Number.isFinite(fee) && fee >= 0;
  // Small epsilon so float division can't flip an exact match.
  const matchesTotal =
    amountUsd != null && Math.abs(amountUsd - totalUsd) <= TOLERANCE_USD + 1e-9;

  const canSubmit =
    !!paidDate &&
    isPaymentAccountComplete(account) &&
    amountValid &&
    matchesTotal &&
    feeValid &&
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
          entityId: account.entityId,
          bankId: account.bankId,
          currencyId: account.currencyId,
          exchangeRate: account.exchangeRate.trim(),
          paymentAmount: paymentAmount.trim(),
          transactionFee: transactionFee.trim(),
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

  const currencyAdornment = code
    ? {
        input: { endAdornment: <Typography sx={{ ml: 1 }}>{code}</Typography> },
      }
    : {};

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

      <PaymentAccountFields
        value={account}
        onChange={setAccount}
        disabled={saving}
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          fullWidth
          label={code ? `Amount Paid (${code})` : "Amount Paid"}
          type="number"
          value={paymentAmount}
          onChange={(e) => setPaymentAmount(e.target.value)}
          required
          disabled={saving || !rate}
          error={amount != null && amountValid && !matchesTotal}
          helperText={
            neededAmount != null
              ? `Invoice total: ${formatAmount(neededAmount, code)} at this rate`
              : "Choose the currency and rate first"
          }
          slotProps={{
            htmlInput: { min: 0, step: "0.01" },
            ...currencyAdornment,
          }}
        />
        <TextField
          fullWidth
          label={code ? `Transaction Fee (${code})` : "Transaction Fee"}
          type="number"
          value={transactionFee}
          onChange={(e) => setTransactionFee(e.target.value)}
          required
          disabled={saving || !code}
          error={fee != null && !feeValid}
          helperText="Enter 0 if there was no fee. For reference only."
          slotProps={{
            htmlInput: { min: 0, step: "0.01" },
            ...currencyAdornment,
          }}
        />
      </Stack>

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
            {amountUsd != null && Number.isFinite(amountUsd) ? (
              <CurrencyDisplay value={amountUsd} />
            ) : (
              "—"
            )}
          </Typography>
        </Stack>
        <Divider sx={{ my: 1 }} />
        <Stack direction="row" justifyContent="space-between">
          <Typography color="textSecondary">Invoice total</Typography>
          <Typography sx={{ fontWeight: 600 }}>
            <CurrencyDisplay value={totalUsd} />
          </Typography>
        </Stack>
        {amountValid && rate && !matchesTotal && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            The amount paid must match the invoice total within $0.01. At this
            rate that&apos;s {formatAmount(neededAmount!, code)}.
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
