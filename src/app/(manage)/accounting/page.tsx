/**
 * Accounting Dashboard
 *
 * Main dashboard showing accounting overview with all invoices
 */

"use client";

import {
  Alert,
  Box,
  Button,
  Container,
  CircularProgress,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDashboardStats } from "@/lib/hooks/useDashboard";
import {
  Customer,
  InvoiceWithDetails,
  useCustomers,
  useChangeInvoiceStatus,
  useDeleteInvoice,
  useSendInvoiceEmail,
  useBulkSendInvoiceEmail,
  useInvoices,
} from "@/lib/hooks/useInvoices";
import { StatsCard } from "@/components/accounting/dashboard/StatsCard";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import AddIcon from "@mui/icons-material/Add";
import { InvoiceStatus } from "@/generated/prisma";

type SortKey =
  | "invoiceNumber"
  | "customer"
  | "amount"
  | "status"
  | "issuedDate"
  | "paidDate"
  | "dueDate"
  | "daysUntilDue";

type BulkStatusType = "ISSUED" | "PAID" | "OVERDUE" | "CANCELLED";

const calculateDaysUntilDue = (dueDate: Date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const getSortValue = (invoice: InvoiceWithDetails, key: SortKey) => {
  switch (key) {
    case "invoiceNumber":
      return invoice.invoiceNumber;
    case "customer":
      return invoice.user?.name || `Customer ${invoice.userId.slice(0, 8)}`;
    case "amount":
      return Number(invoice.totalAmount ?? 0);
    case "status":
      return invoice.status || "";
    case "issuedDate":
      return invoice.issuedDate ? new Date(invoice.issuedDate).getTime() : 0;
    case "paidDate":
      return invoice.paidDate ? new Date(invoice.paidDate).getTime() : 0;
    case "dueDate":
      return invoice.dueDate ? new Date(invoice.dueDate).getTime() : 0;
    case "daysUntilDue":
      return calculateDaysUntilDue(invoice.dueDate);
    default:
      return 0;
  }
};

export default function AccountingDashboard() {
  const {
    dashboard,
    loading: statsLoading,
    error: statsError,
  } = useDashboardStats();
  const { customers, loading: customersLoading } = useCustomers();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [customerFilter, setCustomerFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortKey>("dueDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<"" | BulkStatusType>("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkEmailDialogOpen, setBulkEmailDialogOpen] =
    useState<boolean>(false);
  const [bulkEmailProcessing, setBulkEmailProcessing] =
    useState<boolean>(false);
  const [bulkEmailTotal, setBulkEmailTotal] = useState<number>(0);
  const [bulkEmailProcessed, setBulkEmailProcessed] = useState<number>(0);
  const [bulkEmailSuccessCount, setBulkEmailSuccessCount] = useState<number>(0);
  const [bulkEmailFailureCount, setBulkEmailFailureCount] = useState<number>(0);
  const [bulkEmailCurrent, setBulkEmailCurrent] = useState<string | null>(null);
  const [bulkEmailError, setBulkEmailError] = useState<string | null>(null);
  const [bulkEmailRunId, setBulkEmailRunId] = useState<string | null>(null);
  const {
    invoices,
    total,
    loading: invoicesLoading,
    error: invoicesError,
  } = useInvoices(
    page,
    pageSize,
    customerFilter || undefined,
    statusFilter ? (statusFilter as InvoiceStatus) : undefined,
    "ELECTRICITY_CHARGES",
  );

  const {
    changeStatus,
    loading: bulkStatusLoading,
    error: bulkStatusHookError,
  } = useChangeInvoiceStatus();

  const {
    deleteInvoice,
    loading: bulkDeleteLoading,
    error: bulkDeleteHookError,
  } = useDeleteInvoice();

  const { sendEmail } = useSendInvoiceEmail();
  const { bulkSendEmail } = useBulkSendInvoiceEmail();

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage + 1);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setPageSize(parseInt(event.target.value, 10));
    setPage(1);
  };

  const loading = statsLoading || invoicesLoading;
  const error = statsError || invoicesError;

  const handleCustomerFilterChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setCustomerFilter(event.target.value);
    setPage(1);
  };

  const handleStatusFilterChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setStatusFilter(event.target.value);
    setPage(1);
  };

  const handleRequestSort = (property: SortKey) => {
    if (sortBy === property) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(property);
      setSortDirection("asc");
    }
  };

  const handleToggleInvoiceSelection = (invoiceId: string) => {
    setSelectedInvoiceIds((prev) =>
      prev.includes(invoiceId)
        ? prev.filter((id) => id !== invoiceId)
        : [...prev, invoiceId],
    );
  };

  const handleToggleAllInvoices = (
    event: React.ChangeEvent<HTMLInputElement>,
    visibleInvoices: InvoiceWithDetails[],
  ) => {
    if (event.target.checked) {
      setSelectedInvoiceIds(visibleInvoices.map((inv) => inv.id));
    } else {
      setSelectedInvoiceIds([]);
    }
  };

  const handleApplyBulkStatus = async () => {
    if (!bulkStatus || selectedInvoiceIds.length === 0) return;
    setBulkError(null);
    try {
      for (const id of selectedInvoiceIds) {
        await changeStatus(id, bulkStatus as BulkStatusType);
      }
      setSelectedInvoiceIds([]);
      setBulkStatus("");
    } catch (error) {
      setBulkError(
        error instanceof Error
          ? error.message
          : "Failed to update invoice statuses.",
      );
    }
  };

  const handleBulkDelete = async () => {
    if (selectedInvoiceIds.length === 0) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedInvoiceIds.length} invoice(s)? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setBulkError(null);
    try {
      for (const id of selectedInvoiceIds) {
        await deleteInvoice(id);
      }
      setSelectedInvoiceIds([]);
    } catch (error) {
      setBulkError(
        error instanceof Error
          ? error.message
          : "Failed to delete selected invoices.",
      );
    }
  };

  const handleIssueAndSendSelected = async () => {
    if (selectedInvoiceIds.length === 0) return;

    setBulkEmailError(null);
    setBulkEmailRunId(null);
    setBulkEmailTotal(selectedInvoiceIds.length);
    setBulkEmailProcessed(0);
    setBulkEmailSuccessCount(0);
    setBulkEmailFailureCount(0);
    setBulkEmailCurrent(null);
    setBulkEmailDialogOpen(true);
    setBulkEmailProcessing(true);

    try {
      // First, change status of DRAFT invoices to ISSUED
      for (const id of selectedInvoiceIds) {
        const invoice = invoices.find(
          (inv: InvoiceWithDetails) => inv.id === id,
        );
        if (invoice && invoice.status === "DRAFT") {
          await changeStatus(invoice.id, "ISSUED");
        }
        setBulkEmailProcessed((prev) => prev + 1);
      }

      // Then send emails in bulk
      const response = await bulkSendEmail(selectedInvoiceIds);

      if (response.success && response.runId) {
        setBulkEmailRunId(response.runId);
        setBulkEmailSuccessCount(response.results.sent.length);
        setBulkEmailFailureCount(response.results.failed.length);
      }

      setSelectedInvoiceIds([]);
    } catch (err) {
      setBulkEmailError(
        err instanceof Error ? err.message : "Failed to send bulk emails.",
      );
    } finally {
      setBulkEmailProcessing(false);
    }
  };

  const sortedInvoices = useMemo(() => {
    const data = [...invoices];
    data.sort((a, b) => {
      const aVal = getSortValue(a, sortBy);
      const bVal = getSortValue(b, sortBy);

      let cmp: number;
      if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal);
      } else {
        cmp = (aVal as number) - (bVal as number);
      }

      return sortDirection === "asc" ? cmp : -cmp;
    });
    return data;
  }, [invoices, sortBy, sortDirection]);

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

  if (!dashboard) {
    return (
      <Container maxWidth="lg">
        <Alert severity="warning">No data available</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Dialog
        open={bulkEmailDialogOpen}
        onClose={() => {
          if (!bulkEmailProcessing) {
            setBulkEmailDialogOpen(false);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Issue and send invoices</DialogTitle>
        <DialogContent dividers>
          {!bulkEmailProcessing && bulkEmailRunId ? (
            <Stack spacing={2}>
              <Alert severity="success">
                Emails sent successfully! {bulkEmailSuccessCount} successful,{" "}
                {bulkEmailFailureCount} failed.
              </Alert>
              <Typography variant="body2">
                View the detailed report and resend failed emails:
              </Typography>
              <Button
                component={Link}
                href={`/accounting/email-report/${bulkEmailRunId}`}
                variant="contained"
                color="primary"
                fullWidth
              >
                View Email Report
              </Button>
            </Stack>
          ) : (
            <>
              <Typography gutterBottom>
                Issuing and sending invoices to {bulkEmailTotal} {"customers"}
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                This may take a moment. You can keep this window open while we
                process each invoice.
              </Typography>
              <Box sx={{ mt: 2 }}>
                <LinearProgress
                  variant={bulkEmailTotal > 0 ? "determinate" : "indeterminate"}
                  value={
                    bulkEmailTotal > 0
                      ? (bulkEmailProcessed / Math.max(bulkEmailTotal, 1)) * 100
                      : 0
                  }
                />
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    Progress: {bulkEmailProcessed} of {bulkEmailTotal} invoice
                    {bulkEmailTotal === 1 ? "" : "s"} processed.
                  </Typography>
                  <Typography variant="body2">
                    Status: Sent successfully {bulkEmailSuccessCount},
                    Unsuccessful {bulkEmailFailureCount}.
                  </Typography>
                </Box>
              </Box>
              {bulkEmailError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {bulkEmailError}
                </Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBulkEmailDialogOpen(false)}
            disabled={bulkEmailProcessing}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={4}
      >
        <div>
          <Typography variant="h4" sx={{ fontWeight: "bold" }}>
            Accounting Dashboard
          </Typography>
          <Typography color="textSecondary" sx={{ mt: 0.5 }}>
            Overview of invoices, payments, and recurring income
          </Typography>
        </div>
        <Stack direction="row" spacing={2}>
          <Link href="/accounting/bulk-invoices">
            <Button variant="outlined">Bulk Create Invoices</Button>
          </Link>
          <Link href="/accounting/create">
            <Button variant="contained" startIcon={<AddIcon />}>
              Create Invoice
            </Button>
          </Link>
        </Stack>
      </Stack>

      {/* Stats Row */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "1fr 1fr",
            md: "1fr 1fr 1fr 1fr",
          },
          gap: 3,
          mb: 4,
        }}
      >
        <Box>
          <StatsCard
            label="Total Invoices"
            value={dashboard.totalInvoices}
            color="info"
          />
        </Box>
        <Box>
          <StatsCard
            label="Unpaid Invoices"
            value={dashboard.unpaidInvoices}
            color="warning"
          />
        </Box>
        <Box>
          <StatsCard
            label="Overdue Invoices"
            value={dashboard.overdueInvoices}
            color="error"
          />
        </Box>
        <Box>
          <StatsCard
            label="Total Outstanding"
            value={dashboard.totalOutstanding}
            isCurrency
            color="primary"
          />
        </Box>
      </Box>

      {/* Recurring Overview */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 3,
          mb: 4,
        }}
      >
        <Box>
          <StatsCard
            label="Recurring Templates"
            value={dashboard.recurringInvoices.total}
            subtext={`${dashboard.recurringInvoices.active} active`}
            color="success"
          />
        </Box>
        <Box>
          <StatsCard
            label="Active Templates"
            value={dashboard.recurringInvoices.active}
            color="success"
          />
        </Box>
      </Box>

      {/* Tables */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 3 }}>
        <Paper>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              p: 2,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: "bold" }}>
              All Invoices
            </Typography>
            <Stack direction="row" spacing={2}>
              <Link href="/accounting/bulk-invoices">
                <Button variant="outlined">Bulk Create Invoices</Button>
              </Link>
              <Link href="/accounting/create">
                <Button variant="contained" startIcon={<AddIcon />}>
                  Create Invoice
                </Button>
              </Link>
            </Stack>
          </Box>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 2,
              px: 2,
              pb: 2,
            }}
          >
            <TextField
              select
              size="small"
              label="Filter by customer"
              value={customerFilter}
              onChange={handleCustomerFilterChange}
              sx={{ minWidth: 220 }}
              disabled={customersLoading}
            >
              <MenuItem value="">All customers</MenuItem>
              {customers.map((customer: Customer) => (
                <MenuItem key={customer.id} value={customer.id}>
                  {customer.displayName}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Filter by status"
              value={statusFilter}
              onChange={handleStatusFilterChange}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">All statuses</MenuItem>
              <MenuItem value="DRAFT">Draft</MenuItem>
              <MenuItem value="ISSUED">Issued</MenuItem>
              <MenuItem value="PAID">Paid</MenuItem>
              <MenuItem value="OVERDUE">Overdue</MenuItem>
              <MenuItem value="CANCELLED">Cancelled</MenuItem>
            </TextField>
            <Box sx={{ flexGrow: 1 }} />
            <TextField
              select
              size="small"
              label="Bulk status"
              value={bulkStatus}
              onChange={(e) =>
                setBulkStatus(
                  e.target.value as
                    | ""
                    | "ISSUED"
                    | "PAID"
                    | "OVERDUE"
                    | "CANCELLED",
                )
              }
              sx={{ minWidth: 180 }}
              disabled={selectedInvoiceIds.length === 0}
            >
              <MenuItem value="">Select status</MenuItem>
              <MenuItem value="ISSUED">Mark as Issued</MenuItem>
              <MenuItem value="PAID">Mark as Paid</MenuItem>
              <MenuItem value="OVERDUE">Mark as Overdue</MenuItem>
              <MenuItem value="CANCELLED">Cancel</MenuItem>
            </TextField>
            <Button
              variant="outlined"
              size="small"
              onClick={handleApplyBulkStatus}
              disabled={
                !bulkStatus ||
                selectedInvoiceIds.length === 0 ||
                bulkStatusLoading
              }
            >
              Apply Status
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={handleIssueAndSendSelected}
              disabled={selectedInvoiceIds.length === 0 || bulkEmailProcessing}
            >
              Issue &amp; Send Emails
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={handleBulkDelete}
              disabled={selectedInvoiceIds.length === 0 || bulkDeleteLoading}
            >
              Delete Selected
            </Button>
          </Box>
          {(bulkError || bulkStatusHookError || bulkDeleteHookError) && (
            <Box sx={{ px: 2 }}>
              <Alert severity="error" sx={{ mb: 1 }}>
                {bulkError || bulkStatusHookError || bulkDeleteHookError}
              </Alert>
            </Box>
          )}
          <TableContainer>
            <Table>
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={
                        selectedInvoiceIds.length > 0 &&
                        selectedInvoiceIds.length < sortedInvoices.length
                      }
                      checked={
                        sortedInvoices.length > 0 &&
                        selectedInvoiceIds.length === sortedInvoices.length
                      }
                      onChange={(e) =>
                        handleToggleAllInvoices(e, sortedInvoices)
                      }
                    />
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold" }}
                    sortDirection={
                      sortBy === "invoiceNumber" ? sortDirection : false
                    }
                  >
                    <TableSortLabel
                      active={sortBy === "invoiceNumber"}
                      direction={
                        sortBy === "invoiceNumber" ? sortDirection : "asc"
                      }
                      onClick={() => handleRequestSort("invoiceNumber")}
                    >
                      Invoice
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold" }}
                    sortDirection={
                      sortBy === "customer" ? sortDirection : false
                    }
                  >
                    <TableSortLabel
                      active={sortBy === "customer"}
                      direction={sortBy === "customer" ? sortDirection : "asc"}
                      onClick={() => handleRequestSort("customer")}
                    >
                      Customer
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold" }}
                    sortDirection={sortBy === "amount" ? sortDirection : false}
                  >
                    <TableSortLabel
                      active={sortBy === "amount"}
                      direction={sortBy === "amount" ? sortDirection : "asc"}
                      onClick={() => handleRequestSort("amount")}
                    >
                      Amount
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold" }}
                    sortDirection={sortBy === "status" ? sortDirection : false}
                  >
                    <TableSortLabel
                      active={sortBy === "status"}
                      direction={sortBy === "status" ? sortDirection : "asc"}
                      onClick={() => handleRequestSort("status")}
                    >
                      Status
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold" }}
                    sortDirection={
                      sortBy === "issuedDate" ? sortDirection : false
                    }
                  >
                    <TableSortLabel
                      active={sortBy === "issuedDate"}
                      direction={
                        sortBy === "issuedDate" ? sortDirection : "asc"
                      }
                      onClick={() => handleRequestSort("issuedDate")}
                    >
                      Issued Date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold" }}
                    sortDirection={
                      sortBy === "paidDate" ? sortDirection : false
                    }
                  >
                    <TableSortLabel
                      active={sortBy === "paidDate"}
                      direction={sortBy === "paidDate" ? sortDirection : "asc"}
                      onClick={() => handleRequestSort("paidDate")}
                    >
                      Paid Date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold" }}
                    sortDirection={sortBy === "dueDate" ? sortDirection : false}
                  >
                    <TableSortLabel
                      active={sortBy === "dueDate"}
                      direction={sortBy === "dueDate" ? sortDirection : "asc"}
                      onClick={() => handleRequestSort("dueDate")}
                    >
                      Due Date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold" }}
                    sortDirection={
                      sortBy === "daysUntilDue" ? sortDirection : false
                    }
                  >
                    <TableSortLabel
                      active={sortBy === "daysUntilDue"}
                      direction={
                        sortBy === "daysUntilDue" ? sortDirection : "asc"
                      }
                      onClick={() => handleRequestSort("daysUntilDue")}
                    >
                      Days Until Due
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedInvoices.map((invoice: InvoiceWithDetails) => {
                  const daysUntilDue = calculateDaysUntilDue(invoice.dueDate);
                  return (
                    <TableRow key={invoice.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedInvoiceIds.includes(invoice.id)}
                          onChange={() =>
                            handleToggleInvoiceSelection(invoice.id)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/accounting/${invoice.id}`}
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
                        {invoice.issuedDate ? (
                          <DateDisplay
                            date={invoice.issuedDate}
                            format="date"
                          />
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {invoice.status === "PAID" && invoice.paidDate ? (
                          <DateDisplay date={invoice.paidDate} format="date" />
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <DateDisplay date={invoice.dueDate} format="date" />
                      </TableCell>
                      <TableCell>
                        {invoice.status === "PAID" ? (
                          "-"
                        ) : (
                          <Typography
                            sx={{
                              color:
                                daysUntilDue < 0
                                  ? "error.main"
                                  : daysUntilDue < 7
                                    ? "warning.main"
                                    : "success.main",
                              fontWeight: "500",
                            }}
                          >
                            {daysUntilDue === 0
                              ? "Today"
                              : daysUntilDue === 1
                                ? "1 day"
                                : daysUntilDue < 0
                                  ? `${Math.abs(daysUntilDue)} ${Math.abs(daysUntilDue) === 1 ? "day" : "days"} overdue`
                                  : `${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"}`}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
        </Paper>
      </Box>
    </Container>
  );
}
