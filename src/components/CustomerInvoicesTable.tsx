"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  TablePagination,
  TextField,
  InputAdornment,
  useTheme,
  CircularProgress,
  Alert,
  Button,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import type { InvoiceStatus, InvoiceType } from "@prisma/client";
import { useInvoices } from "@/lib/hooks/useInvoices";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_TYPE_LABELS,
} from "@/lib/constants/accounting";
import { buildCsv, formatIsoDate } from "@/lib/helpers/admin/tableExport";

const EXPORT_PAGE_SIZE = 500;

interface ExportInvoice {
  invoiceNumber: string;
  invoiceType: InvoiceType;
  issuedDate: string | null;
  dueDate: string;
  paidDate: string | null;
  totalAmount: number | string;
  status: InvoiceStatus;
}
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";

interface CustomerInvoicesTableProps {
  customerId?: string;
}

export default function CustomerInvoicesTable({
  customerId,
}: CustomerInvoicesTableProps) {
  const theme = useTheme();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchTerm, setSearchTerm] = useState("");

  const { invoices, total, loading, error } = useInvoices(
    page,
    rowsPerPage,
    customerId,
  );

  const filteredInvoices = React.useMemo(() => {
    if (!searchTerm) return invoices;
    const term = searchTerm.toLowerCase();
    return invoices.filter(
      (invoice: {
        invoiceNumber: string;
        invoiceType: string;
        status: string;
      }) =>
        invoice.invoiceNumber?.toLowerCase().includes(term) ||
        invoice.invoiceType?.toLowerCase().includes(term) ||
        invoice.status?.toLowerCase().includes(term),
    );
  }, [invoices, searchTerm]);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage + 1);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(1);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(1);
  };

  // Downloads every invoice the table lists for this customer (all pages,
  // same filters: drafts excluded) as CSV. Dates are in the viewer's timezone.
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const handleDownloadCsv = async () => {
    if (!customerId) return;
    try {
      setIsExporting(true);
      setExportError(null);

      const all: ExportInvoice[] = [];
      for (let exportPage = 1; ; exportPage++) {
        const params = new URLSearchParams({
          page: exportPage.toString(),
          limit: EXPORT_PAGE_SIZE.toString(),
          customerId,
        });
        const res = await fetch(`/api/accounting/invoices?${params}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to export invoices");
        const data = await res.json();
        all.push(...(data.invoices ?? []));
        if (exportPage >= (data.pagination?.pages ?? 0)) break;
      }

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const csv = buildCsv(
        [
          "Invoice #",
          "Type",
          "Issued Date",
          "Due Date",
          "Paid Date",
          "Amount (USD)",
          "Status",
        ],
        all.map((invoice) => [
          invoice.invoiceNumber,
          INVOICE_TYPE_LABELS[invoice.invoiceType] ?? invoice.invoiceType,
          invoice.issuedDate ? formatIsoDate(invoice.issuedDate, tz) : "",
          formatIsoDate(invoice.dueDate, tz),
          invoice.status === "PAID" && invoice.paidDate
            ? formatIsoDate(invoice.paidDate, tz)
            : "",
          Number(invoice.totalAmount).toFixed(2),
          INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status,
        ]),
      );

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `invoices-${formatIsoDate(new Date(), tz)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting invoices:", err);
      setExportError(
        err instanceof Error ? err.message : "Failed to export invoices",
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Box sx={{ width: "100%", mt: { xs: 2, md: 3 } }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          flexDirection: { xs: "column", sm: "row" },
          gap: 1.5,
          mb: 2,
        }}
      >
        <Typography variant="h6" fontWeight="bold">
          Invoices
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            width: { xs: "100%", sm: "auto" },
          }}
        >
          {customerId && (
            <Button
              variant="outlined"
              size="small"
              onClick={handleDownloadCsv}
              disabled={isExporting || loading}
              startIcon={
                isExporting ? (
                  <CircularProgress size={14} />
                ) : (
                  <DownloadOutlinedIcon />
                )
              }
              sx={{ flexShrink: 0 }}
            >
              Download CSV
            </Button>
          )}
          <TextField
            size="small"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={handleSearchChange}
            fullWidth
            sx={{
              maxWidth: { sm: 280 },
              "& .MuiOutlinedInput-root": {
                backgroundColor: theme.palette.background.paper,
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: theme.palette.text.secondary }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </Box>

      {(error || exportError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || exportError}
        </Alert>
      )}

      <Paper
        sx={{
          width: "100%",
          borderRadius: 2,
          overflow: "hidden",
          boxShadow: theme.shadows[2],
        }}
      >
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredInvoices.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">No invoices found</Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table
                sx={{ minWidth: { xs: 320, sm: 750 } }}
                aria-labelledby="invoicesTableTitle"
                size="small"
              >
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        fontWeight: "bold",
                        borderBottom: "2px solid",
                        borderBottomColor: "divider",
                        py: 2,
                      }}
                    >
                      Invoice #
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: "bold",
                        borderBottom: "2px solid",
                        borderBottomColor: "divider",
                        py: 2,
                        display: { xs: "none", sm: "table-cell" },
                      }}
                    >
                      Type
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: "bold",
                        borderBottom: "2px solid",
                        borderBottomColor: "divider",
                        py: 2,
                      }}
                    >
                      Issued Date
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: "bold",
                        borderBottom: "2px solid",
                        borderBottomColor: "divider",
                        py: 2,
                        display: { xs: "none", sm: "table-cell" },
                      }}
                    >
                      Due Date
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: "bold",
                        borderBottom: "2px solid",
                        borderBottomColor: "divider",
                        py: 2,
                      }}
                    >
                      Amount
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: "bold",
                        borderBottom: "2px solid",
                        borderBottomColor: "divider",
                        py: 2,
                      }}
                    >
                      Status
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredInvoices.map(
                    (invoice: {
                      id: string;
                      invoiceNumber: string;
                      invoiceType: string;
                      issuedDate: string | null;
                      dueDate: string;
                      totalAmount: number;
                      status: import("@prisma/client").InvoiceStatus;
                    }) => (
                      <TableRow
                        hover
                        key={invoice.id}
                        onClick={() => router.push(`/accounting/${invoice.id}`)}
                        sx={{
                          cursor: "pointer",
                          "&:nth-of-type(odd)": {
                            backgroundColor: theme.palette.action.hover,
                          },
                        }}
                      >
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{
                            py: { xs: 1.5, sm: 2 },
                            px: { xs: 1.5, sm: 2 },
                          }}
                        >
                          <Typography variant="body2" fontWeight="medium">
                            {invoice.invoiceNumber}
                          </Typography>
                        </TableCell>
                        <TableCell
                          sx={{
                            py: { xs: 1.5, sm: 2 },
                            display: { xs: "none", sm: "table-cell" },
                          }}
                        >
                          <Typography variant="body2">
                            {invoice.invoiceType}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: { xs: 1.5, sm: 2 } }}>
                          {invoice.issuedDate ? (
                            <DateDisplay date={invoice.issuedDate} standalone />
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              -
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell
                          sx={{
                            py: { xs: 1.5, sm: 2 },
                            display: { xs: "none", sm: "table-cell" },
                          }}
                        >
                          <DateDisplay date={invoice.dueDate} standalone />
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            py: { xs: 1.5, sm: 2 },
                            px: { xs: 1.5, sm: 2 },
                          }}
                        >
                          <CurrencyDisplay
                            value={invoice.totalAmount}
                            fontWeight={500}
                            standalone
                          />
                        </TableCell>
                        <TableCell sx={{ py: { xs: 1.5, sm: 2 } }}>
                          <StatusBadge status={invoice.status} size="small" />
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50, { value: 9999, label: "Max" }]}
              component="div"
              count={total}
              rowsPerPage={rowsPerPage}
              page={page - 1}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              sx={{
                borderTop: `1px solid ${theme.palette.divider}`,
                "& .MuiTablePagination-toolbar": {
                  paddingLeft: 2,
                  paddingRight: 1,
                },
                "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows":
                  {
                    margin: 0,
                    fontSize: "0.875rem",
                  },
              }}
            />
          </>
        )}
      </Paper>
    </Box>
  );
}
