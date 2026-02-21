"use client";

import React from "react";
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  Container,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/lib/hooks/useUser";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { Invoice } from "@/generated/prisma";

interface InvoicesResponse {
  pagination: {
    limit: number;
    page: number;
    pages: number;
    total: number;
  };
  invoices: Invoice[];
}

export default function InvoicesPage() {
  const theme = useTheme();
  const { user } = useUser();

  // Fetch invoices using TanStack Query
  const {
    data: invoicesResponse,
    isLoading: invoicesLoading,
    error: invoicesError,
  } = useQuery<InvoicesResponse>({
    queryKey: ["invoices", user?.id],
    queryFn: async () => {
      if (!user?.id) {
        throw new Error("User ID is required");
      }
      const response = await fetch(
        `/api/accounting/invoices?customerId=${user.id}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch invoices");
      }
      return response.json();
    },
    enabled: !!user?.id,
  });

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontWeight: "bold", mb: 1 }}
        >
          Invoices
        </Typography>
        <Typography variant="body2" color="textSecondary">
          View and manage your invoices
        </Typography>
      </Box>

      {/* Invoices Table */}
      <Paper
        sx={{
          width: "100%",
          borderRadius: 2,
          overflow: "hidden",
          boxShadow: theme.shadows[2],
        }}
      >
        <TableContainer>
          <Table sx={{ minWidth: 750 }} size="medium">
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
                  Invoice
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
                  }}
                >
                  Due Date
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoicesLoading ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: "center", py: 3 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : invoicesError ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    sx={{ textAlign: "center", py: 3, color: "error.main" }}
                  >
                    <Typography variant="body2">
                      Failed to load invoices
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : invoicesResponse?.invoices &&
                invoicesResponse.invoices.length > 0 ? (
                invoicesResponse.invoices.map((invoice) => {
                  return (
                    <TableRow
                      hover
                      key={invoice.id}
                      sx={{
                        cursor: "pointer",
                        "&:nth-of-type(odd)": {
                          backgroundColor: theme.palette.action.hover,
                        },
                      }}
                    >
                      <TableCell sx={{ py: 2 }}>
                        <Typography variant="body2" fontWeight="medium">
                          {invoice.invoiceNumber}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 2 }}>
                        <Typography variant="body2" fontWeight="medium">
                          ${Number(invoice.totalAmount).toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 2 }}>
                        <StatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell sx={{ py: 2 }}>
                        <Typography variant="body2">
                          {invoice.issuedDate &&
                            new Date(invoice.issuedDate).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 2 }}>
                        <Typography variant="body2">
                          {new Date(invoice.dueDate).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: "center", py: 3 }}>
                    <Typography variant="body2">No invoices found</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  );
}
