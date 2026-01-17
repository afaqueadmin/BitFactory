"use client";

import {
  Box,
  Button,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Stack,
  MenuItem,
  CircularProgress,
  Alert,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { useState } from "react";
import Link from "next/link";
import AddIcon from "@mui/icons-material/Add";
import EmailIcon from "@mui/icons-material/Email";
import { useInvoices, useBulkSendInvoiceEmail } from "@/lib/hooks/useInvoices";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { InvoiceStatus } from "@/generated/prisma";

export default function InvoicesPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [bulkSendDialogOpen, setBulkSendDialogOpen] = useState(false);
  const [bulkSendMessage, setBulkSendMessage] = useState<string | null>(null);
  const [bulkSendError, setBulkSendError] = useState<string | null>(null);
  const { invoices, total, loading, error } = useInvoices(
    page,
    pageSize,
    undefined,
    statusFilter || undefined,
  );

  const { bulkSendEmail, loading: bulkSendLoading } = useBulkSendInvoiceEmail();

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage + 1);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setPageSize(parseInt(event.target.value, 10));
    setPage(1);
  };

  const handleSelectInvoice = (invoiceId: string) => {
    setSelectedInvoices((prev) =>
      prev.includes(invoiceId)
        ? prev.filter((id) => id !== invoiceId)
        : [...prev, invoiceId],
    );
  };

  const handleSelectAll = () => {
    if (selectedInvoices.length === invoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(invoices.map((inv) => inv.id));
    }
  };

  const handleBulkSendClick = () => {
    if (selectedInvoices.length === 0) {
      alert("Please select at least one invoice");
      return;
    }
    setBulkSendDialogOpen(true);
  };

  const handleBulkSendConfirm = async () => {
    try {
      setBulkSendError(null);
      setBulkSendMessage(null);

      const result = await bulkSendEmail(selectedInvoices);

      if (result.success) {
        setBulkSendMessage(
          `Emails sent successfully! ${result.results.sent.length} sent, ${result.results.failed.length} failed.`,
        );
        setSelectedInvoices([]);
        setTimeout(() => setBulkSendDialogOpen(false), 1500);
      }
    } catch (err) {
      setBulkSendError(
        err instanceof Error ? err.message : "Failed to send emails",
      );
    }
  };

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

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Box>
          <h1 style={{ margin: 0 }}>Invoices</h1>
          <p style={{ margin: "8px 0 0 0", color: "#666" }}>
            Manage and track all customer invoices
          </p>
        </Box>
        <Link href="/accounting/invoices/create">
          <Button variant="contained" startIcon={<AddIcon />}>
            Create Invoice
          </Button>
        </Link>
      </Stack>

      <Paper sx={{ mb: 3, p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            select
            label="Filter by Status"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as InvoiceStatus | "")
            }
            variant="outlined"
            size="small"
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value={InvoiceStatus.DRAFT}>Draft</MenuItem>
            <MenuItem value={InvoiceStatus.ISSUED}>Issued</MenuItem>
            <MenuItem value={InvoiceStatus.PAID}>Paid</MenuItem>
            <MenuItem value={InvoiceStatus.OVERDUE}>Overdue</MenuItem>
            <MenuItem value={InvoiceStatus.CANCELLED}>Cancelled</MenuItem>
          </TextField>
          {selectedInvoices.length > 0 && (
            <>
              <Box sx={{ ml: "auto", color: "text.secondary" }}>
                {selectedInvoices.length} selected
              </Box>
              <Button
                variant="contained"
                color="primary"
                startIcon={<EmailIcon />}
                onClick={handleBulkSendClick}
                disabled={bulkSendLoading}
              >
                Send Emails
              </Button>
            </>
          )}
        </Stack>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold", width: 50 }}>
                <Checkbox
                  checked={
                    invoices.length > 0 &&
                    selectedInvoices.length === invoices.length
                  }
                  indeterminate={
                    selectedInvoices.length > 0 &&
                    selectedInvoices.length < invoices.length
                  }
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Invoice #</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Customer</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Amount</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Due Date</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow
                key={invoice.id}
                hover
                selected={selectedInvoices.includes(invoice.id)}
              >
                <TableCell sx={{ width: 50 }}>
                  <Checkbox
                    checked={selectedInvoices.includes(invoice.id)}
                    onChange={() => handleSelectInvoice(invoice.id)}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/accounting/invoices/${invoice.id}`}
                    style={{ color: "#1976d2", textDecoration: "none" }}
                  >
                    {invoice.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  {invoice.user?.name ||
                    `Customer ${invoice.userId.slice(0, 8)}`}
                </TableCell>
                <TableCell>
                  <CurrencyDisplay value={invoice.totalAmount} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={invoice.status} />
                </TableCell>
                <TableCell>
                  <DateDisplay date={invoice.dueDate} format="date" />
                </TableCell>
                <TableCell>
                  <Link href={`/accounting/invoices/${invoice.id}`}>
                    <Button size="small" variant="outlined">
                      View
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={total}
          rowsPerPage={pageSize}
          page={page - 1}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </TableContainer>

      {/* Bulk Send Email Dialog */}
      <Dialog
        open={bulkSendDialogOpen}
        onClose={() => setBulkSendDialogOpen(false)}
      >
        <DialogTitle>Send Invoices via Email</DialogTitle>
        <DialogContent>
          {bulkSendError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {bulkSendError}
            </Alert>
          ) : bulkSendMessage ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              {bulkSendMessage}
            </Alert>
          ) : (
            <Box sx={{ mt: 2 }}>
              <p>
                Send {selectedInvoices.length} invoice{" "}
                {selectedInvoices.length !== 1 ? "s" : ""} to customers via
                email?
              </p>
              <p style={{ color: "#666", fontSize: "0.9em" }}>
                Customers will receive their invoice details and a link to view
                the full invoice.
              </p>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBulkSendDialogOpen(false)}
            disabled={bulkSendLoading || !!bulkSendMessage}
          >
            Cancel
          </Button>
          {!bulkSendMessage && (
            <Button
              onClick={handleBulkSendConfirm}
              variant="contained"
              disabled={bulkSendLoading || !!bulkSendError}
            >
              {bulkSendLoading ? "Sending..." : "Send Emails"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
}
