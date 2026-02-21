/**
 * Invoice List Component
 *
 * Displays paginated list of invoices with filtering
 */

"use client";

import { useState } from "react";
import {
  Box,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Button,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
} from "@mui/material";
import { Invoice, InvoiceStatus } from "@/lib/types/invoice";
import { StatusBadge } from "../common/StatusBadge";
import { CurrencyDisplay } from "../common/CurrencyDisplay";
import { DateDisplay } from "../common/DateDisplay";
import { INVOICE_STATUS_LABELS } from "@/lib/constants/accounting";
import AddIcon from "@mui/icons-material/Add";
import FileDownloadIcon from "@mui/icons-material/FileDownload";

interface InvoiceListProps {
  invoices: Invoice[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onCreateNew?: () => void;
}

export function InvoiceList({
  invoices,
  total,
  page,
  pageSize,
  loading = false,
  onPageChange,
  onCreateNew,
}: InvoiceListProps) {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "ALL">(
    "ALL",
  );

  const filteredInvoices =
    statusFilter === "ALL"
      ? invoices
      : invoices.filter((inv) => inv.status === statusFilter);

  const handleChangePage = (event: unknown, newPage: number) => {
    onPageChange(newPage + 1);
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Card>
      {/* Toolbar */}
      <Box
        sx={{ p: 2, display: "flex", gap: 2, justifyContent: "space-between" }}
      >
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e) =>
              setStatusFilter(e.target.value as InvoiceStatus | "ALL")
            }
          >
            <MenuItem value="ALL">All Statuses</MenuItem>
            {Object.entries(INVOICE_STATUS_LABELS).map(([key, label]) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Stack direction="row" gap={1}>
          <Button variant="outlined" startIcon={<FileDownloadIcon />}>
            Export
          </Button>
          {onCreateNew && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onCreateNew}
            >
              Create Invoice
            </Button>
          )}
        </Stack>
      </Box>

      {/* Table */}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
              <TableCell sx={{ fontWeight: 600 }}>Invoice #</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Customer</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Amount
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Issued Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Due Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  No invoices found
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {invoice.invoiceNumber}
                  </TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell align="right">
                    <CurrencyDisplay
                      value={invoice.totalAmount}
                      fontWeight="bold"
                      standalone={true}
                    />
                  </TableCell>
                  <TableCell>
                    {invoice.issuedDate ? (
                      <DateDisplay date={invoice.issuedDate} />
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <DateDisplay date={invoice.dueDate} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={invoice.status} size="small" />
                  </TableCell>
                  <TableCell align="center">
                    <Button size="small" variant="text">
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        rowsPerPageOptions={[10, 25, 50]}
        component="div"
        count={total}
        rowsPerPage={pageSize}
        page={page - 1}
        onPageChange={handleChangePage}
      />
    </Card>
  );
}
