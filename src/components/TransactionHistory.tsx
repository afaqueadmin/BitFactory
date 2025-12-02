"use client";

import React, { useEffect, useState } from "react";
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
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
  Chip,
} from "@mui/material";

interface Transaction {
  currency_type: string;
  date_time: string;
  address_name: string;
  subaccount_name: string;
  transaction_category: string;
  currency_amount: number;
  usd_equivalent: number;
  transaction_id: string;
  transaction_type: "credit" | "debit";
}

interface TransactionResponse {
  transactions: Transaction[];
  pagination: {
    pageNumber: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  summary: {
    totalCredits: number;
    totalDebits: number;
    netAmount: number;
  };
}

interface TransactionHistoryProps {
  limit?: number;
}

export default function TransactionHistory({
  limit = 50,
}: TransactionHistoryProps) {
  const [data, setData] = useState<TransactionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<"all" | "credit" | "debit">(
    "all",
  );

  const fetchTransactions = async (page: number, type: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        type,
      });

      const response = await fetch(`/api/wallet/transactions?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.statusText}`);
      }

      const txData: TransactionResponse = await response.json();
      setData(txData);
      console.log("[TransactionHistory] Transactions loaded:", txData);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[TransactionHistory] Error fetching transactions:", error);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions(currentPage, typeFilter);
  }, [currentPage, typeFilter]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const getTransactionColor = (type: "credit" | "debit") => {
    return type === "credit" ? "success" : "error";
  };

  const getTransactionLabel = (type: "credit" | "debit") => {
    return type === "credit" ? "Received" : "Sent";
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Transaction History
      </Typography>

      {/* Summary Stats */}
      {data && (
        <Box
          sx={{
            display: "flex",
            gap: 2,
            mb: 3,
            flexWrap: "wrap",
          }}
        >
          <Paper sx={{ p: 2, flex: "1 1 150px", minWidth: "150px" }}>
            <Typography variant="caption" color="text.secondary">
              Total Credits
            </Typography>
            <Typography variant="body1" fontWeight="bold" color="success.main">
              ₿ {data.summary.totalCredits.toFixed(8)}
            </Typography>
          </Paper>
          <Paper sx={{ p: 2, flex: "1 1 150px", minWidth: "150px" }}>
            <Typography variant="caption" color="text.secondary">
              Total Debits
            </Typography>
            <Typography variant="body1" fontWeight="bold" color="error.main">
              ₿ {data.summary.totalDebits.toFixed(8)}
            </Typography>
          </Paper>
          <Paper sx={{ p: 2, flex: "1 1 150px", minWidth: "150px" }}>
            <Typography variant="caption" color="text.secondary">
              Net Amount
            </Typography>
            <Typography
              variant="body1"
              fontWeight="bold"
              color={
                data.summary.netAmount >= 0 ? "success.main" : "error.main"
              }
            >
              ₿ {data.summary.netAmount.toFixed(8)}
            </Typography>
          </Paper>
        </Box>
      )}

      {/* Filter */}
      <Box sx={{ mb: 3, display: "flex", gap: 2 }}>
        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel>Transaction Type</InputLabel>
          <Select
            value={typeFilter}
            label="Transaction Type"
            onChange={(e) => {
              setTypeFilter(e.target.value as "all" | "credit" | "debit");
              setCurrentPage(1);
            }}
          >
            <MenuItem value="all">All Transactions</MenuItem>
            <MenuItem value="credit">Credits Only</MenuItem>
            <MenuItem value="debit">Debits Only</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Error Message */}
      {error && (
        <Paper
          sx={{
            p: 2,
            mb: 2,
            backgroundColor: "#ffebee",
            borderLeft: "4px solid #d32f2f",
            color: "#d32f2f",
          }}
        >
          <Typography variant="body2">
            <strong>Error loading transactions:</strong> {error}
          </Typography>
        </Paper>
      )}

      {/* Loading State */}
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Transactions Table */}
      {!isLoading && data && data.transactions.length > 0 && (
        <>
          <TableContainer component={Paper}>
            <Table>
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold" }}>Date & Time</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Address</TableCell>
                  <TableCell sx={{ fontWeight: "bold", textAlign: "right" }}>
                    Amount (BTC)
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", textAlign: "right" }}>
                    USD Value
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>TX ID</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.transactions.map((tx) => (
                  <TableRow key={tx.transaction_id} hover>
                    <TableCell>{formatDate(tx.date_time)}</TableCell>
                    <TableCell>
                      <Chip
                        label={getTransactionLabel(tx.transaction_type)}
                        color={getTransactionColor(tx.transaction_type)}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{tx.transaction_category}</TableCell>
                    <TableCell>{tx.address_name}</TableCell>
                    <TableCell
                      sx={{
                        textAlign: "right",
                        color:
                          tx.transaction_type === "credit"
                            ? "success.main"
                            : "error.main",
                        fontWeight: "bold",
                      }}
                    >
                      {tx.transaction_type === "credit" ? "+" : "-"}
                      {tx.currency_amount.toFixed(8)}
                    </TableCell>
                    <TableCell sx={{ textAlign: "right" }}>
                      ${tx.usd_equivalent.toFixed(2)}
                    </TableCell>
                    <TableCell
                      sx={{ fontSize: "0.85rem", fontFamily: "monospace" }}
                    >
                      {tx.transaction_id.substring(0, 12)}...
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                mt: 3,
                mb: 2,
              }}
            >
              <Pagination
                count={data.pagination.totalPages}
                page={currentPage}
                onChange={(event, value) => setCurrentPage(value)}
                color="primary"
              />
            </Box>
          )}

          {/* Results info */}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
            Showing {data.transactions.length} of {data.pagination.totalItems}{" "}
            transactions (Page {data.pagination.pageNumber} of{" "}
            {data.pagination.totalPages})
          </Typography>
        </>
      )}

      {/* Empty State */}
      {!isLoading && data && data.transactions.length === 0 && (
        <Paper
          sx={{
            p: 4,
            textAlign: "center",
            backgroundColor: "#f5f5f5",
          }}
        >
          <Typography color="text.secondary">
            No transactions found.{" "}
            {typeFilter !== "all" && "Try changing the filter."}
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
