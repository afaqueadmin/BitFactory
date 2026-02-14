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
import { CostPayment } from "@/generated/prisma";

export default function RecordPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const { invoice, loading: invoiceLoading } = useInvoice(invoiceId);
  const {
    recordPayment,
    loading: paymentLoading,
    error: paymentError,
  } = useRecordPayment();

  const [formData, setFormData] = useState({
    amountPaid: 0,
    paymentDate: new Date().toISOString().split("T")[0],
    notes: "",
    markAsPaid: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = e.target;
    const fieldValue =
      type === "checkbox"
        ? checked
        : name === "amountPaid"
          ? parseFloat(value) || 0
          : value;

    if (name === "markAsPaid" && checked) {
      setFormData((prev) => ({
        ...prev,
        amountPaid: 0,
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
      if (!formData.markAsPaid && formData.amountPaid <= 0) {
        throw new Error("Payment amount must be greater than 0");
      }

      // if (formData.amountPaid > Number(invoice!.totalAmount)) {
      //   throw new Error(
      //     `Payment amount cannot exceed invoice total (${Number(invoice!.totalAmount)})`,
      //   );
      // }

      // Call API to record payment
      await recordPayment(invoiceId, {
        amountPaid: formData.amountPaid,
        paymentDate: formData.paymentDate,
        notes: formData.notes,
        markAsPaid: formData.markAsPaid,
      });

      // Redirect back to invoice detail
      router.push(`/accounting/${invoiceId}`);
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
        <Link href={`/accounting/${invoiceId}`}>
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
                    (!formData.markAsPaid && formData.amountPaid <= 0)
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

              {formData.amountPaid > 0 && (
                <Box
                  sx={{
                    p: 1.5,
                    backgroundColor:
                      formData.amountPaid > outstandingAmount
                        ? "#fff3cd"
                        : "#e8f5e9",
                    borderRadius: 1,
                  }}
                >
                  <Typography color="textSecondary" variant="body2">
                    {formData.amountPaid > outstandingAmount
                      ? "Positive Balance After Payment"
                      : "Remaining After Payment"}
                  </Typography>
                  <CurrencyDisplay
                    value={Math.abs(outstandingAmount - formData.amountPaid)}
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
