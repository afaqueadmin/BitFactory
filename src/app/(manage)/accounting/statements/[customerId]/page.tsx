"use client";

import {
  Box,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Stack,
  Button,
  Card,
  CardContent,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from "@mui/material";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useAccountStatement } from "@/lib/hooks/useStatements";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import DownloadIcon from "@mui/icons-material/Download";
import PrintIcon from "@mui/icons-material/Print";
import SendIcon from "@mui/icons-material/Send";
import Link from "next/link";

// Email templates for different tones
const EMAIL_TEMPLATES = {
  normal: `Please find attached your BitFactory's current account statement. If you have any questions, do let us know.

Thanks!
Sincerely,`,
  reminder: `Please find attached your BitFactory's current account statement. To avoid any inconvenience, please make the requisite payment asap.

If payment has already been made, please disregard this notice.

If you have any questions, do let us know.

Thanks!
Sincerely,`,
  final: `Please find attached your BitFactory's current account statement. To avoid disruption to your BitFactory's service, please make the requisite payment ASAP.

If payment has already been made, please disregard this notice.

If you have any further questions, do let us know.

Thanks!
Sincerely,`,
};

export default function CustomerStatementPage() {
  const { customerId } = useParams();
  const { statement, loading, error } = useAccountStatement(
    customerId as string,
  );
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailTone, setEmailTone] = useState<"normal" | "reminder" | "final">(
    "normal",
  );
  const [emailBody, setEmailBody] = useState<string>(EMAIL_TEMPLATES.normal);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Auto-update email body when tone changes
  useEffect(() => {
    const baseTemplate = EMAIL_TEMPLATES[emailTone];
    const customerName = statement?.customer?.name || "Customer";
    const personalizedBody = `Dear ${customerName},\n\n${baseTemplate}\n\nhttp://bitfactory.ae/`;
    setEmailBody(personalizedBody);
  }, [emailTone, statement?.customer?.name]);

  const handleDownloadPDF = async () => {
    try {
      setDownloadLoading(true);
      const response = await fetch(
        `/api/accounting/statements/${customerId}/pdf`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to download statement");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Extract filename from Content-Disposition header
      const contentDisposition = response.headers.get("content-disposition");
      let filename = "statement.pdf";
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading statement:", err);
      alert("Failed to download statement. Please try again.");
    } finally {
      setDownloadLoading(false);
    }
  };

  const handlePrint = async () => {
    try {
      setPrintLoading(true);
      const response = await fetch(
        `/api/accounting/statements/${customerId}/print`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to load statement for printing");
      }

      const htmlContent = await response.text();

      // Open in new window for printing
      const printWindow = window.open("", "", "width=900,height=700");
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Wait for content to load, then print
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (err) {
      console.error("Error printing statement:", err);
      alert("Failed to open print dialog. Please try again.");
    } finally {
      setPrintLoading(false);
    }
  };

  const handleSendEmail = async () => {
    try {
      setEmailLoading(true);
      setEmailError(null);

      if (!emailBody.trim()) {
        setEmailError("Email message is required");
        setEmailLoading(false);
        return;
      }

      const response = await fetch(
        `/api/accounting/statements/${customerId}/send-email`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emailTone,
            emailBody,
            customerName: customer?.name,
          }),
        },
      );

      const data = await response.json();

      console.log("Email send response:", { status: response.status, data });

      if (!response.ok) {
        throw new Error(
          data.error || data.details || `Server error: ${response.status}`,
        );
      }

      if (!data.success) {
        throw new Error(
          data.error || data.details || "Failed to send statement email",
        );
      }

      setEmailDialogOpen(false);
      setEmailBody(EMAIL_TEMPLATES[emailTone]);
      alert(`Statement sent successfully to ${customer?.email}`);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error occurred";
      console.error("Error sending statement:", err);
      setEmailError(errorMsg);
    } finally {
      setEmailLoading(false);
    }
  };

  const invoices = statement?.invoices || [];
  const customer = statement?.customer;
  const totals = statement?.stats;

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg">
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!customer) {
    return (
      <Container maxWidth="lg">
        <Alert severity="warning">Customer not found</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 4 }}
      >
        <Box>
          <h1 style={{ margin: 0 }}>{customer.name} - Statement</h1>
          <p style={{ margin: "8px 0 0 0", color: "#666" }}>
            Customer ID: {customer.id}
          </p>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadPDF}
            disabled={downloadLoading}
          >
            {downloadLoading ? "Downloading..." : "Download Statement"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
            disabled={printLoading}
          >
            {printLoading ? "Loading..." : "Print"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<SendIcon />}
            onClick={() => setEmailDialogOpen(true)}
            disabled={emailLoading}
          >
            Send Email
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Total Invoices
            </Typography>
            <Typography variant="h5">{invoices.length}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Total Amount
            </Typography>
            <Typography variant="h5">
              <CurrencyDisplay value={totals?.totalAmount || 0} />
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Total Paid
            </Typography>
            <Typography variant="h5">
              <CurrencyDisplay value={totals?.totalPaid || 0} />
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Outstanding
            </Typography>
            <Typography variant="h5" sx={{ color: "#d32f2f" }}>
              <CurrencyDisplay value={totals?.totalPending || 0} />
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      <Box sx={{ mb: 2 }}>
        <h2 style={{ marginTop: 0 }}>Invoice History</h2>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold" }}>Invoice #</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Date</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Due Date</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Type</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Amount</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Paid</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Outstanding</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id} hover>
                <TableCell sx={{ fontWeight: "bold" }}>
                  <Link
                    href={`/accounting/${invoice.id}`}
                    style={{ color: "#1976d2", textDecoration: "none" }}
                  >
                    {invoice.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  <DateDisplay
                    date={invoice.issuedDate || invoice.invoiceGeneratedDate}
                    format="date"
                  />
                </TableCell>
                <TableCell>
                  <DateDisplay date={invoice.dueDate} format="date" />
                </TableCell>
                <TableCell>
                  {invoice.invoiceType === "HARDWARE_PURCHASE"
                    ? "Hardware"
                    : "Hosting & Electricity"}
                </TableCell>
                <TableCell>
                  <CurrencyDisplay value={invoice.totalAmount} />
                </TableCell>
                <TableCell>
                  <CurrencyDisplay
                    value={invoice.status === "PAID" ? invoice.paidAmount : 0}
                  />
                </TableCell>
                <TableCell>
                  <CurrencyDisplay
                    value={
                      invoice.status === "ISSUED" ||
                      invoice.status === "OVERDUE"
                        ? Math.max(0, invoice.totalAmount - invoice.paidAmount)
                        : 0
                    }
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge status={invoice.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {invoices.length === 0 && (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <p style={{ color: "#999" }}>No invoices found for this customer</p>
        </Box>
      )}

      {/* Send Email Dialog */}
      <Dialog
        open={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Send Statement Email</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {emailError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {emailError}
            </Alert>
          )}
          <Alert severity="info" sx={{ mb: 2 }}>
            📧 Send this customer statement to {customer?.email}
          </Alert>

          <FormControl fullWidth sx={{ mb: 3 }}>
            <FormLabel sx={{ mb: 2, fontWeight: 600 }}>Email Tone</FormLabel>
            <RadioGroup
              value={emailTone}
              onChange={(e) =>
                setEmailTone(e.target.value as "normal" | "reminder" | "final")
              }
            >
              <FormControlLabel
                value="normal"
                control={<Radio />}
                label="Statement Email (Normal Tone)"
              />
              <Typography
                variant="caption"
                sx={{ ml: 4, mb: 1, color: "#666" }}
              >
                Professional and standard statement notification
              </Typography>

              <FormControlLabel
                value="reminder"
                control={<Radio />}
                label="Reminder/Warning Email (Moderate Tone)"
              />
              <Typography
                variant="caption"
                sx={{ ml: 4, mb: 1, color: "#666" }}
              >
                Payment reminder with moderate urgency
              </Typography>

              <FormControlLabel
                value="final"
                control={<Radio />}
                label="Final Notice Email (Hard Tone)"
              />
              <Typography
                variant="caption"
                sx={{ ml: 4, mb: 2, color: "#666" }}
              >
                Urgent final notice requiring immediate action
              </Typography>
            </RadioGroup>
          </FormControl>

          <TextField
            fullWidth
            multiline
            rows={6}
            label="Email Message"
            placeholder="Enter your message here..."
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            variant="outlined"
            helperText="This message will be included in the email along with the statement PDF"
          />

          <Alert severity="success" sx={{ mt: 2 }}>
            ✅ Statement PDF will be automatically attached to the email
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => {
              setEmailDialogOpen(false);
              setEmailBody("");
              setEmailError(null);
            }}
            disabled={emailLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSendEmail}
            variant="contained"
            startIcon={<SendIcon />}
            disabled={emailLoading || !emailBody.trim()}
          >
            {emailLoading ? "Sending..." : "Send Email"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
