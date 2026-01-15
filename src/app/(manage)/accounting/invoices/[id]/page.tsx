/**
 * Invoice Detail Page
 *
 * Display full invoice details
 */

"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Container,
  Card,
  CardContent,
  CardHeader,
  Box,
  Button,
  Stack,
  Typography,
  Divider,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { useInvoice, useChangeInvoiceStatus } from "@/lib/hooks/useInvoices";
import { useUser } from "@/lib/hooks/useUser";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import EditIcon from "@mui/icons-material/Edit";
import DownloadIcon from "@mui/icons-material/Download";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { invoice, loading, error } = useInvoice(params.id as string);
  const { user } = useUser();
  const {
    changeStatus,
    loading: statusLoading,
    error: statusError,
  } = useChangeInvoiceStatus();

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDialogError, setStatusDialogError] = useState<string | null>(
    null,
  );

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const handleIssueInvoice = async () => {
    try {
      setStatusDialogError(null);
      await changeStatus(invoice!.id, "ISSUED");
      setStatusDialogOpen(false);
      // Reload the page to show updated invoice status
      window.location.reload();
    } catch (err) {
      setStatusDialogError(
        err instanceof Error ? err.message : "Failed to issue invoice",
      );
    }
  };

  if (loading) {
    return (
      <Container sx={{ py: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!invoice) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="warning">Invoice not found</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Box>
          <Button
            startIcon={<ArrowBackIcon />}
            variant="text"
            onClick={() => router.push("/accounting/invoices")}
            sx={{ mb: 2 }}
          >
            Back to Invoices
          </Button>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {invoice.invoiceNumber}
          </Typography>
          <Typography color="textSecondary">
            Invoice Details & Payment Tracking
          </Typography>
        </Box>
        <Stack direction="row" spacing={2}>
          <Button
            startIcon={<EditIcon />}
            variant="outlined"
            disabled={invoice.status !== "DRAFT"}
            onClick={() =>
              router.push(`/accounting/invoices/${invoice.id}/edit`)
            }
          >
            Edit
          </Button>
          {isAdmin && invoice.status === "DRAFT" && (
            <Button
              startIcon={<CheckCircleIcon />}
              variant="contained"
              color="success"
              onClick={() => setStatusDialogOpen(true)}
            >
              Issue Invoice
            </Button>
          )}
          <Button
            startIcon={<DownloadIcon />}
            variant="contained"
            onClick={() => window.print()}
          >
            Download
          </Button>
        </Stack>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
          gap: 3,
        }}
      >
        {/* Main Details */}
        <Box>
          <Card>
            <CardHeader title="Invoice Details" />
            <Divider />
            <CardContent>
              <Box
                sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}
              >
                {/* Invoice Number */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Invoice Number
                  </Typography>
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {invoice.invoiceNumber}
                  </Typography>
                </Box>

                {/* Status */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Status
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <StatusBadge status={invoice.status} />
                  </Box>
                </Box>

                {/* Total Miners */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Total Miners
                  </Typography>
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {invoice.totalMiners} units
                  </Typography>
                </Box>

                {/* Unit Price */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Unit Price
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <CurrencyDisplay
                      value={invoice.unitPrice}
                      fontWeight="bold"
                    />
                  </Box>
                </Box>

                {/* Generated Date */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Generated Date
                  </Typography>
                  <Typography component="div" sx={{ fontWeight: 600, mt: 0.5 }}>
                    <DateDisplay
                      date={invoice.invoiceGeneratedDate}
                      format="datetime"
                    />
                  </Typography>
                </Box>

                {/* Issued Date */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Issued Date
                  </Typography>
                  <Typography component="div" sx={{ fontWeight: 600, mt: 0.5 }}>
                    {invoice.issuedDate ? (
                      <DateDisplay
                        date={invoice.issuedDate}
                        format="datetime"
                      />
                    ) : (
                      <span style={{ color: "#666" }}>Not yet issued</span>
                    )}
                  </Typography>
                </Box>

                {/* Due Date */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Due Date
                  </Typography>
                  <Typography component="div" sx={{ fontWeight: 600, mt: 0.5 }}>
                    <DateDisplay date={invoice.dueDate} />
                  </Typography>
                </Box>

                {/* Paid Date */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Paid Date
                  </Typography>
                  <Typography component="div" sx={{ fontWeight: 600, mt: 0.5 }}>
                    {invoice.paidDate ? (
                      <DateDisplay date={invoice.paidDate} />
                    ) : (
                      <span style={{ color: "#666" }}>Not yet paid</span>
                    )}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Summary Sidebar */}
        <Box>
          <Card>
            <CardHeader title="Summary" />
            <Divider />
            <CardContent>
              <Stack spacing={2}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography color="textSecondary">Subtotal:</Typography>
                  <CurrencyDisplay
                    value={invoice.totalAmount}
                    fontWeight="bold"
                  />
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography color="textSecondary">Tax:</Typography>
                  <Typography sx={{ fontWeight: 600 }}>$0.00</Typography>
                </Box>

                <Divider sx={{ my: 1 }} />

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography sx={{ fontWeight: 600, fontSize: "1.1rem" }}>
                    Total Due:
                  </Typography>
                  <CurrencyDisplay
                    value={invoice.totalAmount}
                    variant="h6"
                    fontWeight="bold"
                  />
                </Box>

                <Divider sx={{ my: 1 }} />

                {invoice.paidDate && (
                  <Alert severity="success" sx={{ my: 1 }}>
                    Invoice has been paid
                  </Alert>
                )}

                {invoice.status === "OVERDUE" && (
                  <Alert severity="error" sx={{ my: 1 }}>
                    Invoice is overdue
                  </Alert>
                )}

                <Button
                  variant="contained"
                  fullWidth
                  size="large"
                  onClick={() =>
                    router.push(
                      `/accounting/invoices/${invoice.id}/record-payment`,
                    )
                  }
                  disabled={
                    invoice.status === "PAID" || invoice.status === "CANCELLED"
                  }
                >
                  Record Payment
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Issue Invoice Dialog */}
      <Dialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
      >
        <DialogTitle>Issue Invoice</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {statusDialogError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {statusDialogError}
              </Alert>
            )}
            <Typography>
              Are you sure you want to issue this invoice? This will:
            </Typography>
            <ul style={{ marginTop: 12 }}>
              <li>Change the status from DRAFT to ISSUED</li>
              <li>
                Set the issued date to today ({new Date().toLocaleDateString()})
              </li>
              <li>Make the invoice available for payment</li>
            </ul>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setStatusDialogOpen(false)}
            disabled={statusLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleIssueInvoice}
            variant="contained"
            color="success"
            disabled={statusLoading}
          >
            {statusLoading ? "Issuing..." : "Issue Invoice"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
