/**
 * src/app/(manage)/accounting/[id]/page.tsx
 * Invoice Detail Page
 *
 * Display full invoice details
 */
"use client";

import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
import {
  useInvoice,
  useChangeInvoiceStatus,
  useDeleteInvoice,
  useInvoiceAuditLog,
  useSendInvoiceEmail,
} from "@/lib/hooks/useInvoices";
import { useUser } from "@/lib/hooks/useUser";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import EditIcon from "@mui/icons-material/Edit";
import DownloadIcon from "@mui/icons-material/Download";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import EmailIcon from "@mui/icons-material/Email";
import CancelIcon from "@mui/icons-material/Cancel";
import { useReactToPrint } from "react-to-print";

function formatAuditAction(action: string): string {
  const actionMap: { [key: string]: string } = {
    INVOICE_CREATED: "Invoice Created",
    INVOICE_UPDATED: "Invoice Updated",
    INVOICE_ISSUED: "Invoice Issued",
    PAYMENT_ADDED: "Payment Recorded",
    PAYMENT_REMOVED: "Payment Removed",
    INVOICE_CANCELLED: "Invoice Cancelled",
    INVOICE_SENT_TO_CUSTOMER: "Invoice Sent to Customer",
    PAYMENT_REMINDER_SENT: "Payment Reminder Sent",
  };

  return actionMap[action] || action;
}

export default function InvoiceDetailPage() {
  const printableRef = useRef(null);
  const params = useParams();
  const router = useRouter();
  const { invoice, loading, error } = useInvoice(params.id as string);
  const { user } = useUser();
  const { changeStatus, loading: statusLoading } = useChangeInvoiceStatus();
  const { deleteInvoice, loading: deleteLoading } = useDeleteInvoice();
  const { auditLogs, loading: auditLoading } = useInvoiceAuditLog(
    params.id as string,
  );
  const { sendEmail, loading: emailLoading } = useSendInvoiceEmail();

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDialogError, setStatusDialogError] = useState<string | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogError, setDeleteDialogError] = useState<string | null>(
    null,
  );
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogError, setEmailDialogError] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelDialogError, setCancelDialogError] = useState<string | null>(
    null,
  );
  const [cancelLoading, setCancelLoading] = useState(false);

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

  const handleDeleteInvoice = async () => {
    try {
      setDeleteDialogError(null);
      await deleteInvoice(invoice!.id);
      setDeleteDialogOpen(false);
      // Redirect to invoices list
      router.push("/accounting");
    } catch (err) {
      setDeleteDialogError(
        err instanceof Error ? err.message : "Failed to delete invoice",
      );
    }
  };

  const handleSendEmail = async () => {
    try {
      setEmailDialogError(null);
      await sendEmail(invoice!.id);
      setEmailDialogOpen(false);
      // Show success and reload to see updated audit trail
      window.location.reload();
    } catch (err) {
      setEmailDialogError(
        err instanceof Error ? err.message : "Failed to send email",
      );
    }
  };

  // Hook handles the print logic
  const handlePrint = useReactToPrint({
    contentRef: printableRef, // Link the hook to your targeted div
    documentTitle: "Invoice", // Optional: set file name for PDF saving
  });
  // Handle invoice cancellation (ISSUED invoices only)
  const handleCancelInvoice = async () => {
    try {
      setCancelDialogError(null);
      setCancelLoading(true);

      const response = await fetch(`/api/accounting/invoices/${invoice!.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to cancel invoice");
      }

      setCancelDialogOpen(false);
      // Reload to show updated invoice status
      window.location.reload();
    } catch (err) {
      setCancelDialogError(
        err instanceof Error ? err.message : "Failed to cancel invoice",
      );
    } finally {
      setCancelLoading(false);
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
            onClick={() => router.push("/accounting")}
            sx={{ mb: 2 }}
          >
            Back to Accounting Dashboard
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
          {isAdmin && invoice.status === "DRAFT" && (
            <Button
              startIcon={<DeleteIcon />}
              variant="outlined"
              color="error"
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete
            </Button>
          )}
          {invoice.status === "ISSUED" && (
            <Button
              startIcon={<EmailIcon />}
              variant="outlined"
              onClick={() => setEmailDialogOpen(true)}
            >
              Resend Email
            </Button>
          )}
          {invoice.status === "ISSUED" && (
            <Button
              startIcon={<CancelIcon />}
              variant="outlined"
              color="warning"
              onClick={() => setCancelDialogOpen(true)}
            >
              Cancel Invoice
            </Button>
          )}
          <Button
            startIcon={<DownloadIcon />}
            variant="contained"
            onClick={handlePrint}
          >
            Download
          </Button>
        </Stack>
      </Box>
      <Box
        ref={printableRef}
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
                  sx={{ displayPrint: "none" }}
                  variant="contained"
                  fullWidth
                  size="large"
                  onClick={() =>
                    router.push(`/accounting/${invoice.id}/record-payment`)
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
      {/* Audit Trail Section */}
      <Box sx={{ mt: 4 }}>
        <Card>
          <CardHeader title="Audit Trail & History" />
          <Divider />
          <CardContent>
            {auditLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={30} />
              </Box>
            ) : auditLogs.length === 0 ? (
              <Typography color="textSecondary">
                No activity recorded yet
              </Typography>
            ) : (
              <Stack spacing={2}>
                {auditLogs.map((log, index) => (
                  <Box
                    key={log.id}
                    sx={{
                      pb: 2,
                      borderBottom:
                        index < auditLogs.length - 1
                          ? "1px solid #eee"
                          : "none",
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        mb: 1,
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontWeight: 600 }}>
                          {formatAuditAction(log.action)}
                        </Typography>
                        <Typography color="textSecondary" variant="body2">
                          {log.user?.name || log.user?.email || "System"}
                        </Typography>
                      </Box>
                      <Typography color="textSecondary" variant="body2">
                        {new Date(log.createdAt).toLocaleString()}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {log.description}
                    </Typography>
                    {log.changes && (
                      <Box
                        sx={{
                          mt: 1,
                          p: 1.5,
                          bgcolor: "#f5f5f5",
                          borderRadius: 1,
                          fontSize: "0.875rem",
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          Changes:
                        </Typography>
                        <pre
                          style={{
                            margin: "8px 0 0 0",
                            overflow: "auto",
                            fontSize: "12px",
                          }}
                        >
                          {typeof log.changes === "string"
                            ? log.changes
                            : JSON.stringify(log.changes, null, 2)}
                        </pre>
                      </Box>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
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
            <ul
              style={{
                paddingLeft: 16,
                marginTop: 12,
                listStyleType: "square",
              }}
            >
              <li>Change the status from DRAFT to ISSUED</li>
              <li>
                Set the issued date to today ({new Date().toLocaleDateString()})
              </li>
              <li>Make the invoice available for payment</li>
              <li>
                <b>Send an email to the customer</b>
              </li>
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
      {/* Delete Invoice Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Invoice</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {deleteDialogError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {deleteDialogError}
              </Alert>
            )}
            <Alert severity="warning" sx={{ mb: 2 }}>
              ⚠️ This action cannot be undone!
            </Alert>
            <Typography>
              Are you sure you want to delete this invoice? This will:
            </Typography>
            <ul style={{ marginTop: 12 }}>
              <li>Permanently cancel the invoice</li>
              <li>Change the status from DRAFT to CANCELLED</li>
              <li>Remove it from active invoices</li>
              <li>Log this action in the audit trail</li>
            </ul>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleteLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteInvoice}
            variant="contained"
            color="error"
            disabled={deleteLoading}
          >
            {deleteLoading ? "Deleting..." : "Delete Invoice"}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Send Email Dialog */}
      <Dialog open={emailDialogOpen} onClose={() => setEmailDialogOpen(false)}>
        <DialogTitle>Send Invoice Email</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {emailDialogError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {emailDialogError}
              </Alert>
            )}
            <Alert severity="info" sx={{ mb: 2 }}>
              📧 Send this invoice to the customer
            </Alert>
            <Typography>
              This will send the invoice to the customer&apos;s email address.
              This will:
            </Typography>
            <ul style={{ marginTop: 12 }}>
              <li>
                Send invoice {invoice?.invoiceNumber} to {invoice?.user?.email}
              </li>
              <li>Include invoice details and due date</li>
              <li>Log this action in the audit trail</li>
            </ul>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEmailDialogOpen(false)}
            disabled={emailLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSendEmail}
            variant="contained"
            disabled={emailLoading}
          >
            {emailLoading ? "Sending..." : "Send Email"}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Cancel Invoice Confirmation Dialog */}
      <Dialog
        open={cancelDialogOpen}
        onClose={() => setCancelDialogOpen(false)}
      >
        <DialogTitle>Cancel Invoice</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {cancelDialogError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {cancelDialogError}
              </Alert>
            )}
            <Typography sx={{ mb: 2 }}>
              Are you sure you want to cancel this invoice? The invoice status
              will be changed to &quot;Cancelled&quot; and a cancellation
              notification will be sent to the customer. No payment will be
              required.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setCancelDialogOpen(false)}
            disabled={cancelLoading}
          >
            Keep Invoice
          </Button>
          <Button
            onClick={handleCancelInvoice}
            variant="contained"
            color="warning"
            disabled={cancelLoading}
          >
            {cancelLoading ? "Cancelling..." : "Cancel Invoice"}
          </Button>
        </DialogActions>
      </Dialog>{" "}
    </Container>
  );
}
