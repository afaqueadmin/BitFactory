"use client";

import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Typography,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import { useInvoice, useRecordPayment } from "@/lib/hooks/useInvoices";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import {
  EMPTY_PAYMENT_ACCOUNT,
  PaymentAccountFields,
  PaymentAccountValue,
  isPaymentAccountComplete,
  parseExchangeRate,
} from "@/components/accounting/common/PaymentAccountFields";
import { CostPayment } from "@prisma/client";

interface RecordPaymentPageProps {
  basePath: string;
}

/** Typed amount as a number; blank or invalid counts as 0. */
const toNumber = (value: string) => {
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) ? n : 0;
};

export default function RecordPaymentPage({
  basePath,
}: RecordPaymentPageProps) {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const invoiceHref = `${basePath}/${invoiceId}`;

  const { invoice, loading: invoiceLoading } = useInvoice(invoiceId);
  const {
    recordPayment,
    loading: paymentLoading,
    error: paymentError,
  } = useRecordPayment();

  // Amounts are kept as typed text, in the selected currency.
  const [formData, setFormData] = useState({
    amountPaid: "",
    hostingAmountPaid: "",
    paymentDate: new Date().toISOString().split("T")[0],
    notes: "",
    hostingNotes: "",
    markAsPaid: false,
  });
  // One receiving account, currency and rate for the whole payment; in the
  // split form it applies to both sections (D7).
  const [account, setAccount] = useState<PaymentAccountValue>(
    EMPTY_PAYMENT_ACCOUNT,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hardware-sales invoices that also bill Hosting & Colocation (one or more months)
  // get a two-section payment form. Invoices without a hosting line item
  // (including every invoice created before this feature) keep the single
  // "Amount Paid" form.
  const hasHostingLineItem =
    Array.isArray(invoice?.lineItems) &&
    invoice.lineItems.some(
      (li: { lineItemType?: string }) =>
        li.lineItemType === "HOSTING_COLOCATION",
    );
  const isSplitPayment =
    invoice?.invoiceType === "HARDWARE_SALES" && hasHostingLineItem;

  // Voided payments (e.g. reversed memo adjustments) don't count as paid.
  const activePayments: CostPayment[] = (invoice?.costPayments ?? []).filter(
    (payment: CostPayment) => !payment.isDeleted,
  );

  // Calculate paid amount from cost payments (USD)
  const paidAmount = activePayments.reduce(
    (sum: number, payment: CostPayment) => sum + payment.amount,
    0,
  );

  const outstandingAmount = invoice
    ? Number(invoice.totalAmount) - paidAmount
    : 0;

  const hardwareSubtotal =
    invoice && Array.isArray(invoice.lineItems)
      ? invoice.lineItems
          .filter(
            (li: { lineItemType?: string }) =>
              li.lineItemType !== "HOSTING_COLOCATION",
          )
          .reduce(
            (sum: number, li: { totalPrice: number | string }) =>
              sum + Number(li.totalPrice),
            0,
          )
      : 0;
  const hostingSubtotal =
    invoice && Array.isArray(invoice.lineItems)
      ? invoice.lineItems
          .filter(
            (li: { lineItemType?: string }) =>
              li.lineItemType === "HOSTING_COLOCATION",
          )
          .reduce(
            (sum: number, li: { totalPrice: number | string }) =>
              sum + Number(li.totalPrice),
            0,
          )
      : 0;
  const hardwarePaid = activePayments
    .filter((p: CostPayment) => p.type === "HARDWARE_SALES")
    .reduce((sum: number, p: CostPayment) => sum + p.amount, 0);
  const hostingPaid = activePayments
    .filter((p: CostPayment) => p.type === "PAYMENT")
    .reduce((sum: number, p: CostPayment) => sum + p.amount, 0);
  const hardwareOutstanding = hardwareSubtotal - hardwarePaid;
  const hostingOutstanding = hostingSubtotal - hostingPaid;

  // Entered amounts, and their USD value at the chosen rate.
  const rate = parseExchangeRate(account);
  const currencyCode = account.currencyCode;
  const enteredAmount = toNumber(formData.amountPaid);
  const enteredHosting = isSplitPayment
    ? toNumber(formData.hostingAmountPaid)
    : 0;
  const enteredTotal = enteredAmount + enteredHosting;
  const enteredTotalUsd = rate ? enteredTotal / rate : 0;
  const amountLabel = currencyCode
    ? `Amount Paid (${currencyCode})`
    : "Amount Paid";
  const usdHint = (value: number) =>
    rate && value > 0 && currencyCode !== "USD"
      ? ` ≈ $${(value / rate).toFixed(2)} USD`
      : "";

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = e.target;
    const fieldValue = type === "checkbox" ? checked : value;

    if (name === "markAsPaid" && checked) {
      setFormData((prev) => ({
        ...prev,
        amountPaid: "",
        hostingAmountPaid: "",
      }));
    }
    setFormData((prev) => ({
      ...prev,
      [name]: fieldValue,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);

      // Validate
      if (!isPaymentAccountComplete(account)) {
        throw new Error(
          "Select the entity, bank and currency, and enter the exchange rate",
        );
      }
      if (!formData.markAsPaid) {
        if (isSplitPayment) {
          if (enteredAmount <= 0 && enteredHosting <= 0) {
            throw new Error(
              "Enter a Hardware Sales Payment amount and/or a Hosting and Colocation Payment amount greater than 0",
            );
          }
        } else if (enteredAmount <= 0) {
          throw new Error("Payment amount must be greater than 0");
        }
      }

      // Call API to record payment
      await recordPayment(invoiceId, {
        amountPaid: formData.amountPaid.trim() || "0",
        paymentDate: formData.paymentDate,
        notes: formData.notes,
        ...(isSplitPayment
          ? {
              hostingAmountPaid: formData.hostingAmountPaid.trim() || "0",
              hostingNotes: formData.hostingNotes,
            }
          : {}),
        markAsPaid: formData.markAsPaid,
        entityId: account.entityId,
        bankId: account.bankId,
        currencyId: account.currencyId,
        exchangeRate: account.exchangeRate.trim(),
      });

      // Redirect back to invoice detail
      router.push(invoiceHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setLoading(false);
    }
  };

  if (invoiceLoading) {
    return (
      <Container sx={{ py: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!invoice) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Invoice not found</Alert>
      </Container>
    );
  }

  if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="warning">
          Cannot record payment for {invoice.status.toLowerCase()} invoices
        </Alert>
      </Container>
    );
  }

  const accountBlock = (
    <Box>
      <h3 style={{ marginTop: 0, marginBottom: 16 }}>Received Into</h3>
      <PaymentAccountFields
        value={account}
        onChange={setAccount}
        disabled={loading || paymentLoading}
      />
      {isSplitPayment && (
        <Typography
          variant="caption"
          color="textSecondary"
          sx={{ display: "block", mt: 1 }}
        >
          Applies to both the hardware and hosting payments.
        </Typography>
      )}
    </Box>
  );

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Link href={invoiceHref}>
          <Button startIcon={<ArrowBackIcon />}>Back to Invoice</Button>
        </Link>
        <Box flex={1}>
          <h1 style={{ margin: 0 }}>Record Payment</h1>
          <p style={{ margin: "8px 0 0 0", color: "#666" }}>
            Invoice: {invoice.invoiceNumber}
          </p>
        </Box>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {paymentError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {paymentError}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
          gap: 3,
        }}
      >
        {/* Payment Form */}
        <Paper sx={{ p: 4 }}>
          <form onSubmit={handleSubmit}>
            <Stack spacing={3}>
              {accountBlock}

              <Divider />

              {isSplitPayment ? (
                <>
                  <Box>
                    <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                      Hardware Sales Payment
                    </h3>
                    <Stack spacing={2}>
                      <TextField
                        label={amountLabel}
                        name="amountPaid"
                        type="number"
                        value={formData.amountPaid}
                        onChange={handleInputChange}
                        fullWidth
                        inputProps={{ min: 0, step: 0.01 }}
                        helperText={`Enter the hardware sales payment amount${usdHint(enteredAmount)}`}
                        disabled={formData.markAsPaid || !rate}
                      />
                      <TextField
                        label="Notes (Optional)"
                        name="notes"
                        multiline
                        rows={2}
                        value={formData.notes}
                        onChange={handleInputChange}
                        fullWidth
                        helperText="Add any notes about this payment"
                      />
                    </Stack>
                  </Box>

                  <Box>
                    <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                      Hosting and Colocation Payment
                    </h3>
                    <Stack spacing={2}>
                      <TextField
                        label={amountLabel}
                        name="hostingAmountPaid"
                        type="number"
                        value={formData.hostingAmountPaid}
                        onChange={handleInputChange}
                        fullWidth
                        inputProps={{ min: 0, step: 0.01 }}
                        helperText={`Enter the hosting and colocation payment amount${usdHint(enteredHosting)}`}
                        disabled={formData.markAsPaid || !rate}
                      />
                      <TextField
                        label="Notes (Optional)"
                        name="hostingNotes"
                        multiline
                        rows={2}
                        value={formData.hostingNotes}
                        onChange={handleInputChange}
                        fullWidth
                        helperText="Add any notes about this payment"
                      />
                    </Stack>
                  </Box>

                  <Box>
                    <Stack spacing={2}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            name="markAsPaid"
                            checked={formData.markAsPaid}
                            onChange={handleInputChange}
                          />
                        }
                        label="Mark as Paid"
                      />
                      <TextField
                        label="Payment Date"
                        name="paymentDate"
                        type="date"
                        value={formData.paymentDate}
                        onChange={handleInputChange}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        helperText="When the payment was received (applies to both sections)"
                        required
                      />
                    </Stack>
                  </Box>
                </>
              ) : (
                <Box>
                  <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                    Payment Details
                  </h3>
                  <Stack spacing={2}>
                    <Box
                      sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}
                    >
                      <Box sx={{ flex: 1 }}>
                        <TextField
                          label={amountLabel}
                          name="amountPaid"
                          type="number"
                          value={formData.amountPaid}
                          onChange={handleInputChange}
                          fullWidth
                          inputProps={{ min: 0, step: 0.01 }}
                          helperText={
                            rate
                              ? `Enter the payment amount${usdHint(enteredAmount)}`
                              : "Choose the currency and rate first"
                          }
                          required={!formData.markAsPaid}
                          disabled={formData.markAsPaid || !rate}
                        />
                      </Box>
                      <Box
                        sx={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <FormControlLabel
                          control={
                            <Checkbox
                              name="markAsPaid"
                              checked={formData.markAsPaid}
                              onChange={handleInputChange}
                            />
                          }
                          label="Mark as Paid"
                        />
                      </Box>
                    </Box>
                    <TextField
                      label="Payment Date"
                      name="paymentDate"
                      type="date"
                      value={formData.paymentDate}
                      onChange={handleInputChange}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      helperText="When the payment was received"
                      required
                    />
                    <TextField
                      label="Notes (Optional)"
                      name="notes"
                      multiline
                      rows={3}
                      value={formData.notes}
                      onChange={handleInputChange}
                      fullWidth
                      helperText="Add any notes about this payment"
                    />
                  </Stack>
                </Box>
              )}

              <Stack direction="row" spacing={2} sx={{ pt: 2 }}>
                <Button variant="outlined" onClick={() => router.back()}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={
                    loading ? <CircularProgress size={20} /> : <SaveIcon />
                  }
                  disabled={
                    loading ||
                    paymentLoading ||
                    !isPaymentAccountComplete(account) ||
                    (!formData.markAsPaid &&
                      (isSplitPayment
                        ? enteredAmount <= 0 && enteredHosting <= 0
                        : enteredAmount <= 0))
                  }
                >
                  {loading ? "Recording..." : "Record Payment"}
                </Button>
              </Stack>
            </Stack>
          </form>
        </Paper>

        {/* Invoice Summary (USD) */}
        <Card>
          <CardHeader title="Invoice Summary" subheader="Amounts in USD" />
          <Divider />
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Invoice Total
                </Typography>
                <CurrencyDisplay
                  value={invoice.totalAmount}
                  fontWeight="bold"
                />
              </Box>

              {isSplitPayment && (
                <>
                  <Divider />
                  <Box>
                    <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
                      Hardware Sales
                    </Typography>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography color="textSecondary" variant="body2">
                        Already Paid
                      </Typography>
                      <CurrencyDisplay value={hardwarePaid} />
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography color="textSecondary" variant="body2">
                        Outstanding
                      </Typography>
                      <CurrencyDisplay value={hardwareOutstanding} />
                    </Stack>
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
                      Hosting & Colocation
                    </Typography>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography color="textSecondary" variant="body2">
                        Already Paid
                      </Typography>
                      <CurrencyDisplay value={hostingPaid} />
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography color="textSecondary" variant="body2">
                        Outstanding
                      </Typography>
                      <CurrencyDisplay value={hostingOutstanding} />
                    </Stack>
                  </Box>
                </>
              )}

              <Divider />

              <Box>
                <Typography color="textSecondary" variant="body2">
                  Already Paid
                </Typography>
                <CurrencyDisplay value={paidAmount} fontWeight="bold" />
              </Box>

              <Divider />

              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: "1.1rem" }}>
                  Outstanding
                </Typography>
                <CurrencyDisplay
                  value={outstandingAmount}
                  variant="h6"
                  fontWeight="bold"
                />
              </Box>

              {enteredTotal > 0 && rate && (
                <Box
                  sx={{
                    p: 1.5,
                    backgroundColor:
                      enteredTotalUsd > outstandingAmount
                        ? "#fff3cd"
                        : "#e8f5e9",
                    borderRadius: 1,
                  }}
                >
                  <Typography color="textSecondary" variant="body2">
                    {enteredTotalUsd > outstandingAmount
                      ? "Positive Balance After Payment"
                      : "Remaining After Payment"}
                  </Typography>
                  <CurrencyDisplay
                    value={Math.abs(outstandingAmount - enteredTotalUsd)}
                    fontWeight="bold"
                  />
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
