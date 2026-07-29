/**
 * Hardware Sales Dashboard
 *
 * Main dashboard showing hardware sales invoices overview
 */

"use client";

import {
  Box,
  Container,
  CircularProgress,
  Alert,
  Button,
  Stack,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  TextField,
  MenuItem,
} from "@mui/material";
import Link from "next/link";
import { useState } from "react";
import {
  Customer,
  InvoiceWithDetails,
  useCustomers,
  useInvoices,
} from "@/lib/hooks/useInvoices";
import { StatsCard } from "@/components/accounting/dashboard/StatsCard";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import AddIcon from "@mui/icons-material/Add";
import { InvoiceStatus } from "@prisma/client";

type SortKey =
  | "invoiceNumber"
  | "customer"
  | "amount"
  | "status"
  | "issuedDate"
  | "paidDate"
  | "dueDate"
  | "daysUntilDue";

export default function HardwareSalesDashboard() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [customerFilter, setCustomerFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortKey>("dueDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const { customers, loading: customersLoading } = useCustomers();

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
    "HARDWARE_SALES",
    sortBy,
    sortDirection,
  );

  // Fetch the full filtered set (independent of table pagination) so the
  // summary cards reflect the selected filters across all matching invoices.
  const {
    invoices: statsInvoices,
    total: statsTotal,
    loading: statsLoading,
  } = useInvoices(
    1,
    9999,
    customerFilter || undefined,
    statusFilter ? (statusFilter as InvoiceStatus) : undefined,
    "HARDWARE_SALES",
  );

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage + 1);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setPageSize(parseInt(event.target.value, 10));
    setPage(1);
  };

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
      setSortDirection(property === "daysUntilDue" ? "desc" : "asc");
    }
    setPage(1);
  };

  const calculateDaysUntilDue = (dueDate: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Calculate stats from the full filtered set of invoices
  const totalInvoices = statsTotal;
  const unpaidInvoices = statsInvoices.filter(
    (inv: InvoiceWithDetails) => inv.status !== "PAID",
  ).length;
  const now = new Date();
  const overdueInvoices = statsInvoices.filter(
    (inv: InvoiceWithDetails) =>
      inv.status !== "PAID" && new Date(inv.dueDate) < now,
  ).length;
  const totalOutstanding = statsInvoices
    .filter(
      (inv: InvoiceWithDetails) =>
        inv.status !== "PAID" &&
        inv.status !== "CANCELLED" &&
        inv.status !== "REFUNDED",
    )
    .reduce(
      (sum: number, inv: InvoiceWithDetails) => sum + Number(inv.totalAmount),
      0,
    );

  const loading = invoicesLoading || statsLoading;
  const error = invoicesError;

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
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={4}
      >
        <div>
          <Typography variant="h4" sx={{ fontWeight: "bold" }}>
            Hardware Sales Dashboard
          </Typography>
          <Typography color="textSecondary" sx={{ mt: 0.5 }}>
            Overview of hardware sales invoices and payments
          </Typography>
        </div>
        <Link href="/hardware-sales/create">
          <Button variant="contained" startIcon={<AddIcon />}>
            Create Invoice
          </Button>
        </Link>
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
            value={totalInvoices}
            color="info"
          />
        </Box>
        <Box>
          <StatsCard
            label="Unpaid Invoices"
            value={unpaidInvoices}
            color="warning"
          />
        </Box>
        <Box>
          <StatsCard
            label="Overdue Invoices"
            value={overdueInvoices}
            color="error"
          />
        </Box>
        <Box>
          <StatsCard
            label="Total Outstanding"
            value={totalOutstanding}
            isCurrency
            color="primary"
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
              All Hardware Sales Invoices
            </Typography>
            <Link href="/hardware-sales/create">
              <Button variant="contained" startIcon={<AddIcon />}>
                Create Invoice
              </Button>
            </Link>
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
              label="Filter by Customer"
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
              label="Filter by Status"
              value={statusFilter}
              onChange={handleStatusFilterChange}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">All statuses</MenuItem>
              <MenuItem value="DRAFT">Draft</MenuItem>
              <MenuItem value="ISSUED">Issued</MenuItem>
              <MenuItem value="OVERDUE">Overdue</MenuItem>
              <MenuItem value="PAID">Paid</MenuItem>
              <MenuItem value="CANCELLED">Cancelled</MenuItem>
              <MenuItem value="REFUNDED">Refunded</MenuItem>
            </TextField>
          </Box>
          <TableContainer>
            <Table>
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold" }}>
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
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "customer"}
                      direction={sortBy === "customer" ? sortDirection : "asc"}
                      onClick={() => handleRequestSort("customer")}
                    >
                      Customer
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "amount"}
                      direction={sortBy === "amount" ? sortDirection : "asc"}
                      onClick={() => handleRequestSort("amount")}
                    >
                      Amount
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "status"}
                      direction={sortBy === "status" ? sortDirection : "asc"}
                      onClick={() => handleRequestSort("status")}
                    >
                      Status
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
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
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "paidDate"}
                      direction={sortBy === "paidDate" ? sortDirection : "asc"}
                      onClick={() => handleRequestSort("paidDate")}
                    >
                      Paid Date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "dueDate"}
                      direction={sortBy === "dueDate" ? sortDirection : "asc"}
                      onClick={() => handleRequestSort("dueDate")}
                    >
                      Due Date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
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
                {invoices.map((invoice: InvoiceWithDetails) => {
                  const daysUntilDue = calculateDaysUntilDue(invoice.dueDate);
                  return (
                    <TableRow key={invoice.id} hover>
                      <TableCell>
                        <Link
                          href={`/hardware-sales/${invoice.id}`}
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
                        <CurrencyDisplay
                          value={invoice.totalAmount}
                          standalone={true}
                        />
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
              rowsPerPageOptions={[
                5,
                10,
                25,
                50,
                { value: 9999, label: "Max" },
              ]}
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
