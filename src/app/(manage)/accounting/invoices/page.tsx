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
} from "@mui/material";
import { useState } from "react";
import Link from "next/link";
import AddIcon from "@mui/icons-material/Add";
import { useMockInvoicesPage } from "@/lib/mocks/useMockInvoices";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { InvoiceStatus } from "@/lib/types/invoice";

export default function InvoicesPage() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");

  const { invoices, total, loading, error } = useMockInvoicesPage(
    page,
    pageSize,
  );

  const filteredInvoices = statusFilter
    ? invoices.filter((inv) => inv.status === statusFilter)
    : invoices;

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setPageSize(parseInt(event.target.value, 10));
    setPage(0);
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
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold" }}>Invoice #</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Customer</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Amount</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Due Date</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredInvoices.map((invoice) => (
              <TableRow key={invoice.id} hover>
                <TableCell>
                  <Link
                    href={`/accounting/invoices/${invoice.id}`}
                    style={{ color: "#1976d2", textDecoration: "none" }}
                  >
                    {invoice.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell>{`Customer ${invoice.userId.slice(0, 8)}`}</TableCell>
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
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </TableContainer>
    </Container>
  );
}
