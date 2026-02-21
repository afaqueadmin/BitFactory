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
  Typography,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import Link from "next/link";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";

interface VendorInvoiceDetail {
  id: string;
  invoiceNumber: string;
  billingDate: string;
  paidDate: string | null;
  dueDate: string;
  totalMiners: number;
  unitPrice: number;
  miscellaneousCharges: number;
  totalAmount: number;
  paymentStatus: "Paid" | "Pending" | "Cancelled";
  notes: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUser?: {
    id: string;
    email: string;
    name: string | null;
  };
  updatedByUser?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

export default function VendorInvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<VendorInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paidDate, setPaidDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [openCancelDialog, setOpenCancelDialog] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Fetch invoice details
  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/vendor-invoices/${invoiceId}`);

        if (!response.ok) {
          setError("Failed to fetch vendor invoice");
          return;
        }

        const data = await response.json();
        setInvoice(data.data);

        // Set initial paid date if already paid
        if (data.data.paidDate) {
          setPaidDate(data.data.paidDate.split("T")[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load invoice");
      } finally {
        setLoading(false);
      }
    };

    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId]);

  const handleMarkAsPaid = async () => {
    if (!paidDate) {
      setError("Please select a paid date");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/vendor-invoices/${invoiceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentStatus: "Paid",
          paidDate: new Date(paidDate).toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Failed to mark invoice as paid");
        return;
      }

      const data = await response.json();
      setInvoice(data.data);
      setSuccessMessage("Invoice marked as paid successfully!");

      // Redirect after success
      setTimeout(() => {
        router.push("/accounting/farm-tariffs");
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark as paid");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelInvoice = async () => {
    setCancelLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/vendor-invoices/${invoiceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentStatus: "Cancelled",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Failed to cancel invoice");
        return;
      }

      const data = await response.json();
      setInvoice(data.data);
      setSuccessMessage("Invoice cancelled successfully!");
      setOpenCancelDialog(false);

      // Redirect after success
      setTimeout(() => {
        router.push("/accounting/farm-tariffs");
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel invoice");
    } finally {
      setCancelLoading(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md">
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error && !invoice) {
    return (
      <Container maxWidth="md">
        <Box sx={{ py: 4 }}>
          <Alert severity="error">{error}</Alert>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => router.push("/accounting/farm-tariffs")}
            sx={{ mt: 2 }}
          >
            Back to Farm Tariffs
          </Button>
        </Box>
      </Container>
    );
  }

  if (!invoice) {
    return (
      <Container maxWidth="md">
        <Box sx={{ py: 4 }}>
          <Alert severity="warning">Invoice not found</Alert>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => router.push("/accounting/farm-tariffs")}
            sx={{ mt: 2 }}
          >
            Back to Farm Tariffs
          </Button>
        </Box>
      </Container>
    );
  }

  const unitTotal = invoice.totalMiners * invoice.unitPrice;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Link href="/accounting/farm-tariffs">
          <Button startIcon={<ArrowBackIcon />}>Back</Button>
        </Link>
      </Stack>

      <Paper sx={{ p: 4 }}>
        <Stack spacing={3}>
          {/* Header */}
          <Box>
            <Typography variant="h4" sx={{ fontWeight: "bold", mb: 1 }}>
              {invoice.invoiceNumber}
            </Typography>
            <StatusBadge status={invoice.paymentStatus} />
          </Box>

          {error && <Alert severity="error">{error}</Alert>}

          {successMessage && <Alert severity="success">{successMessage}</Alert>}

          <Divider />

          {/* Invoice Details Grid */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 3,
            }}
          >
            {/* Billing Date */}
            <Box>
              <Typography
                variant="subtitle2"
                color="textSecondary"
                sx={{ fontWeight: "600", mb: 0.5 }}
              >
                Issued Date
              </Typography>
              <Typography variant="body1">
                <DateDisplay
                  date={new Date(invoice.billingDate)}
                  format="date"
                />
              </Typography>
            </Box>

            {/* Due Date */}
            <Box>
              <Typography
                variant="subtitle2"
                color="textSecondary"
                sx={{ fontWeight: "600", mb: 0.5 }}
              >
                Due Date
              </Typography>
              <Typography variant="body1">
                <DateDisplay date={new Date(invoice.dueDate)} format="date" />
              </Typography>
            </Box>

            {/* Total Miners */}
            <Box>
              <Typography
                variant="subtitle2"
                color="textSecondary"
                sx={{ fontWeight: "600", mb: 0.5 }}
              >
                Total Miners
              </Typography>
              <Typography variant="body1">{invoice.totalMiners}</Typography>
            </Box>

            {/* Unit Price */}
            <Box>
              <Typography
                variant="subtitle2"
                color="textSecondary"
                sx={{ fontWeight: "600", mb: 0.5 }}
              >
                Unit Price
              </Typography>
              <Typography variant="body1">
                <CurrencyDisplay value={invoice.unitPrice} />
              </Typography>
            </Box>

            {/* Miscellaneous Charges */}
            <Box>
              <Typography
                variant="subtitle2"
                color="textSecondary"
                sx={{ fontWeight: "600", mb: 0.5 }}
              >
                Miscellaneous Charges
              </Typography>
              <Typography variant="body1">
                <CurrencyDisplay value={invoice.miscellaneousCharges} />
              </Typography>
            </Box>

            {/* Unit Total */}
            <Box>
              <Typography
                variant="subtitle2"
                color="textSecondary"
                sx={{ fontWeight: "600", mb: 0.5 }}
              >
                Unit Total
              </Typography>
              <Typography variant="body1">
                <CurrencyDisplay value={unitTotal} />
              </Typography>
            </Box>
          </Box>

          <Divider />

          {/* Amount Summary */}
          <Box
            sx={{
              p: 3,
              backgroundColor: "#f5f5f5",
              borderRadius: 1,
              border: "1px solid #e0e0e0",
            }}
          >
            <Stack spacing={2}>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body1" sx={{ fontWeight: "500" }}>
                  Unit Total:
                </Typography>
                <Typography variant="body1">
                  <CurrencyDisplay value={unitTotal} />
                </Typography>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body1" sx={{ fontWeight: "500" }}>
                  Miscellaneous:
                </Typography>
                <Typography variant="body1">
                  <CurrencyDisplay value={invoice.miscellaneousCharges} />
                </Typography>
              </Box>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  pt: 2,
                  borderTop: "2px solid #d0d0d0",
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                  Total Amount:
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: "bold", color: "primary.main" }}
                >
                  <CurrencyDisplay value={invoice.totalAmount} />
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Divider />

          {/* Notes */}
          {invoice.notes && (
            <>
              <Box>
                <Typography
                  variant="subtitle2"
                  color="textSecondary"
                  sx={{ fontWeight: "600", mb: 1 }}
                >
                  Notes
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: "pre-wrap",
                    p: 2,
                    backgroundColor: "#fafafa",
                    borderRadius: 1,
                    border: "1px solid #e0e0e0",
                  }}
                >
                  {invoice.notes}
                </Typography>
              </Box>
              <Divider />
            </>
          )}

          {/* Metadata */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 3,
              p: 2,
              backgroundColor: "#fafafa",
              borderRadius: 1,
              fontSize: "0.875rem",
            }}
          >
            <Box>
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{ fontWeight: "600" }}
              >
                Created By
              </Typography>
              <Typography variant="body2">
                {invoice.createdByUser?.name ||
                  invoice.createdByUser?.email ||
                  "System"}
              </Typography>
            </Box>
            <Box>
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{ fontWeight: "600" }}
              >
                Created At
              </Typography>
              <Typography variant="body2">
                <DateDisplay
                  date={new Date(invoice.createdAt)}
                  format="datetime"
                />
              </Typography>
            </Box>
            {invoice.updatedByUser && (
              <>
                <Box>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{ fontWeight: "600" }}
                  >
                    Last Updated By
                  </Typography>
                  <Typography variant="body2">
                    {invoice.updatedByUser.name || invoice.updatedByUser.email}
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{ fontWeight: "600" }}
                  >
                    Last Updated At
                  </Typography>
                  <Typography variant="body2">
                    <DateDisplay
                      date={new Date(invoice.updatedAt)}
                      format="datetime"
                    />
                  </Typography>
                </Box>
              </>
            )}
          </Box>

          <Divider />

          {/* Payment Section - Only show if not Cancelled */}
          {invoice.paymentStatus !== "Cancelled" && (
            <Box
              sx={{
                p: 3,
                backgroundColor: "#e3f2fd",
                borderRadius: 1,
                border: "1px solid #bbdefb",
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: "bold", mb: 2 }}>
                Payment Information
              </Typography>

              <Stack spacing={2}>
                {/* Paid Date Input */}
                <TextField
                  fullWidth
                  label="Paid Date"
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  disabled={invoice.paymentStatus === "Paid" || saving}
                  slotProps={{
                    inputLabel: { shrink: true },
                  }}
                />

                {invoice.paymentStatus === "Paid" && (
                  <Alert severity="success">
                    This invoice has been marked as paid on{" "}
                    <DateDisplay
                      date={new Date(invoice.paidDate!)}
                      format="date"
                    />
                  </Alert>
                )}

                {/* Action Buttons */}
                {invoice.paymentStatus !== "Paid" && (
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    sx={{ mt: 2 }}
                  >
                    <Button
                      fullWidth
                      variant="contained"
                      color="success"
                      startIcon={
                        saving ? (
                          <CircularProgress size={20} />
                        ) : (
                          <CheckCircleIcon />
                        )
                      }
                      onClick={handleMarkAsPaid}
                      disabled={saving || !paidDate}
                    >
                      {saving ? "Processing..." : "Mark as Paid"}
                    </Button>
                    <Button
                      fullWidth
                      variant="outlined"
                      color="error"
                      startIcon={<CancelIcon />}
                      onClick={() => setOpenCancelDialog(true)}
                      disabled={saving}
                    >
                      Cancel Invoice
                    </Button>
                  </Stack>
                )}
              </Stack>
            </Box>
          )}

          {/* Cancelled Invoice Message */}
          {invoice.paymentStatus === "Cancelled" && (
            <Alert severity="warning">
              This invoice has been cancelled and cannot be modified.
            </Alert>
          )}
        </Stack>
      </Paper>

      {/* Cancel Confirmation Dialog */}
      <Dialog
        open={openCancelDialog}
        onClose={() => setOpenCancelDialog(false)}
      >
        <DialogTitle>Cancel Invoice</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to cancel invoice{" "}
            <strong>{invoice.invoiceNumber}</strong>? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setOpenCancelDialog(false)}
            disabled={cancelLoading}
          >
            Keep Invoice
          </Button>
          <Button
            onClick={handleCancelInvoice}
            color="error"
            variant="contained"
            disabled={cancelLoading}
            startIcon={
              cancelLoading ? <CircularProgress size={20} /> : <CancelIcon />
            }
          >
            {cancelLoading ? "Cancelling..." : "Cancel Invoice"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
