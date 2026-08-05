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
import { CostPayment } from "@prisma/client";

interface RecordPaymentPageProps {
  basePath: string;
}

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

  const [formData, setFormData] = useState({
    amountPaid: 0,
    hostingAmountPaid: 0,
    paymentDate: new Date().toISOString().split("T")[0],
    notes: "",
    hostingNotes: "",
    markAsPaid: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hardware-sales invoices that also bill first-month Hosting & Colocation
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

  // Calculate paid amount from cost payments
  const paidAmount =
    invoice && invoice.costPayments
      ? invoice.costPayments.reduce(
          (sum: number, payment: CostPayment) => sum + payment.amount,
          0,
        )
      : 0;

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
  const hardwarePaid =
    invoice && invoice.costPayments
      ? invoice.costPayments
          .filter((p: CostPayment) => p.type === "HARDWARE_SALES")
          .reduce((sum: number, p: CostPayment) => sum + p.amount, 0)
      : 0;
  const hostingPaid =
    invoice && invoice.costPayments
      ? invoice.costPayments
          .filter((p: CostPayment) => p.type === "PAYMENT")
          .reduce((sum: number, p: CostPayment) => sum + p.amount, 0)
      : 0;
  const hardwareOutstanding = hardwareSubtotal - hardwarePaid;
  const hostingOutstanding = hostingSubtotal - hostingPaid;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = e.target;
    const fieldValue =
      type === "checkbox"
        ? checked
        : name === "amountPaid" || name === "hostingAmountPaid"
          ? parseFloat(value) || 0
          : value;

    if (name === "markAsPaid" && checked) {
      setFormData((prev) => ({
        ...prev,
        amountPaid: 0,
        hostingAmountPaid: 0,
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
      if (!formData.markAsPaid) {
        if (isSplitPayment) {
          if (formData.amountPaid <= 0 && formData.hostingAmountPaid <= 0) {
            throw new Error(
              "Enter a Hardware Sales Payment amount and/or a Hosting and Colocation Payment amount greater than 0",
            );
          }
        } else if (formData.amountPaid <= 0) {
          throw new Error("Payment amount must be greater than 0");
        }
      }

      // Call API to record payment
      await recordPayment(invoiceId, {
        amountPaid: formData.amountPaid,
        paymentDate: formData.paymentDate,
        notes: formData.notes,
        ...(isSplitPayment
          ? {
              hostingAmountPaid: formData.hostingAmountPaid,
              hostingNotes: formData.hostingNotes,
            }
          : {}),
        markAsPaid: formData.markAsPaid,
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
              {isSplitPayment ? (
                <>
                  <Box>
                    <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                      Hardware Sales Payment
                    </h3>
                    <Stack spacing={2}>
                      <TextField
                        label="Amount Paid (USD)"
                        name="amountPaid"
                        type="number"
                        value={formData.amountPaid}
                        onChange={handleInputChange}
                        fullWidth
                        inputProps={{ min: 0, step: 0.01 }}
                        helperText="Enter the hardware sales payment amount"
                        disabled={formData.markAsPaid}
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
                        label="Amount Paid (USD)"
                        name="hostingAmountPaid"
                        type="number"
                        value={formData.hostingAmountPaid}
                        onChange={handleInputChange}
                        fullWidth
                        inputProps={{ min: 0, step: 0.01 }}
                        helperText="Enter the hosting and colocation payment amount"
                        disabled={formData.markAsPaid}
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
                          label="Amount Paid (USD)"
                          name="amountPaid"
                          type="number"
                          value={formData.amountPaid}
                          onChange={handleInputChange}
                          fullWidth
                          inputProps={{ min: 0, step: 0.01 }}
                          helperText="Enter the payment amount"
                          required={!formData.markAsPaid}
                          disabled={formData.markAsPaid}
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
                    (!formData.markAsPaid &&
                      (isSplitPayment
                        ? formData.amountPaid <= 0 &&
                          formData.hostingAmountPaid <= 0
                        : formData.amountPaid <= 0))
                  }
                >
                  {loading ? "Recording..." : "Record Payment"}
                </Button>
              </Stack>
            </Stack>
          </form>
        </Paper>

        {/* Invoice Summary */}
        <Card>
          <CardHeader title="Invoice Summary" />
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

              {(formData.amountPaid > 0 ||
                (isSplitPayment && formData.hostingAmountPaid > 0)) && (
                <Box
                  sx={{
                    p: 1.5,
                    backgroundColor:
                      formData.amountPaid +
                        (isSplitPayment ? formData.hostingAmountPaid : 0) >
                      outstandingAmount
                        ? "#fff3cd"
                        : "#e8f5e9",
                    borderRadius: 1,
                  }}
                >
                  <Typography color="textSecondary" variant="body2">
                    {formData.amountPaid +
                      (isSplitPayment ? formData.hostingAmountPaid : 0) >
                    outstandingAmount
                      ? "Positive Balance After Payment"
                      : "Remaining After Payment"}
                  </Typography>
                  <CurrencyDisplay
                    value={Math.abs(
                      outstandingAmount -
                        (formData.amountPaid +
                          (isSplitPayment ? formData.hostingAmountPaid : 0)),
                    )}
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
