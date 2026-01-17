/**
 * Accounting Dashboard
 *
 * Main dashboard showing accounting overview with all invoices
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
} from "@mui/material";
import Link from "next/link";
import { useState } from "react";
import { useDashboardStats } from "@/lib/hooks/useDashboard";
import { useInvoices } from "@/lib/hooks/useInvoices";
import { StatsCard } from "@/components/accounting/dashboard/StatsCard";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import RefreshIcon from "@mui/icons-material/Refresh";
import AddIcon from "@mui/icons-material/Add";

export default function AccountingDashboard() {
  const {
    dashboard,
    loading: statsLoading,
    error: statsError,
    refetch,
  } = useDashboardStats();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const {
    invoices,
    total,
    loading: invoicesLoading,
    error: invoicesError,
  } = useInvoices(page, pageSize);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage + 1);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setPageSize(parseInt(event.target.value, 10));
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

  const loading = statsLoading || invoicesLoading;
  const error = statsError || invoicesError;

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
          <Link href="/accounting/create">
            <Button variant="contained" startIcon={<AddIcon />}>
              Create Invoice
            </Button>
          </Link>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={refetch}
          >
            Refresh
          </Button>
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
            <Link href="/accounting/create">
              <Button variant="contained" startIcon={<AddIcon />}>
                Create Invoice
              </Button>
            </Link>
          </Box>
          <TableContainer>
            <Table>
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold" }}>Invoice #</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Amount</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Issued Date</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Due Date</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    Days Until Due
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoices.map((invoice) => {
                  const daysUntilDue = calculateDaysUntilDue(invoice.dueDate);
                  return (
                    <TableRow key={invoice.id} hover>
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
                        <DateDisplay
                          date={invoice.issuedDate || new Date()}
                          format="date"
                        />
                      </TableCell>
                      <TableCell>
                        <DateDisplay date={invoice.dueDate} format="date" />
                      </TableCell>
                      <TableCell>
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
                                : `${daysUntilDue} days`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Link href={`/accounting/${invoice.id}`}>
                          <Button size="small" variant="outlined">
                            View
                          </Button>
                        </Link>
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
