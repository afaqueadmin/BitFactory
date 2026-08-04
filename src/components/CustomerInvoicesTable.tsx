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
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useInvoices } from "@/lib/hooks/useInvoices";
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

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
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
