/**
 * src/app/(manage)/accounting/[id]/page.tsx
 * Invoice Detail Page
 *
 * Display full invoice details
 */
"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
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
  const [downloadLoading, setDownloadLoading] = useState(false);
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

  const [groupInfo, setGroupInfo] = useState<{
    id: string;
    name: string;
    relationshipManager: string;
    email: string;
  } | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState<{
    message: string;
    sentTo: string;
    ccDescription: string;
  } | null>(null);

  // Fetch group info when invoice loads
  useEffect(() => {
    if (!invoice?.user?.id) return;

    setGroupLoading(true);
    fetch(`/api/accounting/customer-group?customerId=${invoice.user.id}`)
      .then((res) => res.json())
      .then((data) => {
        setGroupInfo(data.group || null);
      })
      .catch(() => {
        setGroupInfo(null);
      })
      .finally(() => {
        setGroupLoading(false);
      });
  }, [invoice?.user?.id]);

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const handleIssueInvoice = async () => {
    try {
      setStatusDialogError(null);
      setIssueSuccess(null);

      // First, change status to ISSUED
      await changeStatus(invoice!.id, "ISSUED");

      // Then, automatically send the email
      try {
        const emailResult = await sendEmail(invoice!.id);
        setIssueSuccess({
          message: emailResult.message,
          sentTo: emailResult.sentTo,
          ccDescription: emailResult.ccDescription,
        });
        // Keep dialog open to show success
        // Auto-reload after 3 seconds
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } catch (emailErr) {
        // Status was changed but email failed - show error but don't fail completely
        setStatusDialogError(
          `Invoice issued successfully, but failed to send email: ${emailErr instanceof Error ? emailErr.message : "Unknown error"}`,
        );
      }
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

  // Handle invoice download
  const handleDownload = async () => {
    try {
      setDownloadLoading(true);
      const response = await fetch(
        `/api/accounting/invoices/${invoice?.id}/download`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to download invoice");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${invoice?.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
      alert("Failed to download invoice PDF");
    } finally {
      setDownloadLoading(false);
    }
  };

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
            onClick={() => router.back()}
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
          {isAdmin &&
            (invoice.status === "DRAFT" || invoice.status === "CANCELLED") && (
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
            onClick={handleDownload}
            disabled={downloadLoading}
          >
            {downloadLoading ? "Downloading..." : "Download"}
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
      {/* Customer & Relationship Manager Information Section */}
      <Box sx={{ mt: 4 }}>
        <Card>
          <CardHeader title="Customer & Relationship Manager Information" />
          <Divider />
          <CardContent>
            <Box
              sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}
            >
              {/* Customer Name */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Customer Name
                </Typography>
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  {invoice.user?.name || "N/A"}
                </Typography>
              </Box>

              {/* Customer Email */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Customer Email
                </Typography>
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  {invoice.user?.email || "N/A"}
                </Typography>
              </Box>

              {/* Relationship Manager Name */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Relationship Manager
                </Typography>
                {groupLoading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mt: 0.5,
                    }}
                  >
                    <CircularProgress size={16} />
                    <Typography variant="body2">Loading...</Typography>
                  </Box>
                ) : (
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {groupInfo?.relationshipManager || "Not assigned"}
                  </Typography>
                )}
              </Box>

              {/* Relationship Manager Email */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  RM Email
                </Typography>
                {groupLoading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mt: 0.5,
                    }}
                  >
                    <CircularProgress size={16} />
                    <Typography variant="body2">Loading...</Typography>
                  </Box>
                ) : (
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {groupInfo?.email || "Not assigned"}
                  </Typography>
                )}
              </Box>

              {/* Group Name */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Group Name
                </Typography>
                {groupLoading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mt: 0.5,
                    }}
                  >
                    <CircularProgress size={16} />
                    <Typography variant="body2">Loading...</Typography>
                  </Box>
                ) : (
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {groupInfo?.name || "No group assigned"}
                  </Typography>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>
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
        onClose={() => {
          if (!statusLoading) setStatusDialogOpen(false);
        }}
      >
        <DialogTitle>Issue Invoice</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {issueSuccess ? (
              <Alert severity="success" sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>
                  ✅ Invoice Issued Successfully!
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {issueSuccess.message}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500, mt: 1 }}>
                  Email Details:
                </Typography>
                <Typography variant="body2" sx={{ ml: 1, mt: 0.5 }}>
                  To: {issueSuccess.sentTo}
                </Typography>
                <Typography variant="body2" sx={{ ml: 1 }}>
                  {issueSuccess.ccDescription}
                </Typography>
              </Alert>
            ) : statusDialogError && !statusLoading ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {statusDialogError}
              </Alert>
            ) : (
              <>
                <Typography sx={{ fontWeight: 600, mb: 2 }}>
                  Are you sure you want to issue this invoice? This will:
                </Typography>
                <ul style={{ marginTop: 0, marginBottom: 16 }}>
                  <li>Change the status from DRAFT to ISSUED</li>
                  <li>
                    Set the issued date to today (
                    {new Date().toLocaleDateString()})
                  </li>
                  <li>Make the invoice available for payment</li>
                  <li>Automatically send an email to the customer</li>
                </ul>

                {/* Email Details Section */}
                <Box
                  sx={{
                    mb: 2,
                    p: 2,
                    backgroundColor: "#f5f5f5",
                    borderRadius: 1,
                  }}
                >
                  <Typography sx={{ fontWeight: 600, mb: 1.5 }}>
                    📧 Email will be sent to:
                  </Typography>
                  <Box sx={{ ml: 1 }}>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      <strong>To:</strong> {invoice?.user?.email}
                    </Typography>
                    {groupLoading ? (
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <CircularProgress size={16} />
                        <Typography variant="body2">
                          Loading CC details...
                        </Typography>
                      </Box>
                    ) : groupInfo ? (
                      <Box>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          <strong>CC:</strong> {groupInfo.relationshipManager} (
                          {groupInfo.email})
                        </Typography>
                        <Typography variant="body2">
                          <strong>CC:</strong> invoices@bitfactory.ae
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" sx={{ color: "#d32f2f" }}>
                        <strong>CC:</strong> invoices@bitfactory.ae{" "}
                        <em>(No RM assigned to this customer)</em>
                      </Typography>
                    )}
                  </Box>
                </Box>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          {!issueSuccess && statusDialogError && !statusLoading && (
            <Button
              onClick={() => {
                setStatusDialogOpen(false);
                setStatusDialogError(null);
                setIssueSuccess(null);
              }}
            >
              Close
            </Button>
          )}
          {!issueSuccess && !statusDialogError && (
            <>
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
                {statusLoading ? "Issuing & Sending..." : "Issue Invoice"}
              </Button>
            </>
          )}
          {issueSuccess && (
            <Button
              onClick={() => {
                setStatusDialogOpen(false);
                setIssueSuccess(null);
              }}
              variant="contained"
            >
              Close
            </Button>
          )}
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
