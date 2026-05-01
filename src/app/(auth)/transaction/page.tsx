"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  useTheme,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Pagination,
  Alert,
  Chip,
} from "@mui/material";
import { useUser } from "@/lib/hooks/useUser";
import { formatValue } from "@/lib/helpers/formatValue";

interface Transaction {
  pool: "Luxor" | "Braiins";
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
    totalCreditsUsd: number;
    totalDebitsUsd: number;
    netAmountUsd: number;
  };
  poolBreakdown?: {
    luxor: {
      count: number;
      totalCredits: number;
      totalDebits: number;
      netAmount: number;
      totalCreditsUsd: number;
      totalDebitsUsd: number;
      netAmountUsd: number;
    };
    braiins: {
      count: number;
      totalCredits: number;
      totalDebits: number;
      netAmount: number;
      totalCreditsUsd: number;
      totalDebitsUsd: number;
      netAmountUsd: number;
    };
  };
}

export default function TransactionPage() {
  const theme = useTheme();
  const { user } = useUser();
  const [poolMode, setPoolMode] = useState<"total" | "luxor" | "braiins">(
    "total",
  );
  const [typeFilter, setTypeFilter] = useState<"all" | "credit" | "debit">(
    "all",
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);

  // Date filter state (Option 3: Hybrid Smart Default)
  const [dateMode, setDateMode] = useState<"preset" | "custom">("preset");
  const [presetRange, setPresetRange] = useState<"30d" | "90d" | "all">("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [data, setData] = useState<TransactionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Calculate date range based on mode
  const getDateRange = () => {
    if (dateMode === "custom" && startDate && endDate) {
      return { start_date: startDate, end_date: endDate };
    }

    // Preset ranges
    const today = new Date();
    let start: Date;
    switch (presetRange) {
      case "30d":
        start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        start = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "all":
      default:
        start = new Date("2020-01-01");
    }
    return {
      start_date: start.toISOString().split("T")[0],
      end_date: today.toISOString().split("T")[0],
    };
  };

  // Fetch transactions
  const fetchTransactions = async (page: number, type: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const dateRange = getDateRange();
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        type,
        start_date: dateRange.start_date,
        end_date: dateRange.end_date,
      });

      const response = await fetch(`/api/wallet/transactions?${params}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.statusText}`);
      }

      const txData: TransactionResponse = await response.json();
      setData(txData);
      console.log("[Transaction Page] Data loaded:", txData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("[Transaction Page] Error fetching transactions:", err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [poolMode, typeFilter, dateMode, presetRange, startDate, endDate]);

  useEffect(() => {
    fetchTransactions(currentPage, typeFilter);
  }, [currentPage, typeFilter, dateMode, presetRange, startDate, endDate]);

  // Filter transactions by pool mode
  const filteredTransactions =
    data?.transactions.filter((tx) => {
      if (poolMode === "total") return true;
      if (poolMode === "luxor") return tx.pool === "Luxor";
      if (poolMode === "braiins") return tx.pool === "Braiins";
      return true;
    }) || [];

  // Get summary for filtered pool mode
  const getDisplaySummary = () => {
    if (!data) return null;

    if (poolMode === "total") {
      return data.summary;
    } else if (poolMode === "luxor" && data.poolBreakdown?.luxor) {
      return {
        totalCredits: data.poolBreakdown.luxor.totalCredits,
        totalDebits: data.poolBreakdown.luxor.totalDebits,
        netAmount: data.poolBreakdown.luxor.netAmount,
        totalCreditsUsd: data.poolBreakdown.luxor.totalCreditsUsd,
        totalDebitsUsd: data.poolBreakdown.luxor.totalDebitsUsd,
        netAmountUsd: data.poolBreakdown.luxor.netAmountUsd,
      };
    } else if (poolMode === "braiins" && data.poolBreakdown?.braiins) {
      return {
        totalCredits: data.poolBreakdown.braiins.totalCredits,
        totalDebits: data.poolBreakdown.braiins.totalDebits,
        netAmount: data.poolBreakdown.braiins.netAmount,
        totalCreditsUsd: data.poolBreakdown.braiins.totalCreditsUsd,
        totalDebitsUsd: data.poolBreakdown.braiins.totalDebitsUsd,
        netAmountUsd: data.poolBreakdown.braiins.netAmountUsd,
      };
    }
    return null;
  };

  const displaySummary = getDisplaySummary();

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const getTransactionColor = (type: "credit" | "debit") => {
    return type === "credit" ? "success" : "error";
  };

  const getTransactionLabel = (type: "credit" | "debit") => {
    return type === "credit" ? "+ (Credit)" : "- (Debit)";
  };

  const getPoolColor = (pool: "Luxor" | "Braiins") => {
    return pool === "Luxor" ? "primary" : "info";
  };

  if (!user) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">User not authenticated</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, maxWidth: "1400px", mx: "auto" }}>
      {/* Header Section */}
      <Box sx={{ mb: { xs: 2, md: 4 } }}>
        <Typography
          variant="h3"
          component="h1"
          sx={{
            fontWeight: "bold",
            mb: { xs: 1.5, md: 2 },
            fontSize: { xs: "1.6rem", sm: "2rem", md: "3rem" },
          }}
        >
          Transaction History
        </Typography>

        {/* Pool Mode Toggle */}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {(["total", "luxor", "braiins"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setPoolMode(mode);
                setCurrentPage(1);
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: poolMode === mode ? 600 : 400,
                backgroundColor:
                  poolMode === mode
                    ? mode === "luxor"
                      ? "#1565C0"
                      : mode === "braiins"
                        ? "#FFA500"
                        : theme.palette.primary.main
                    : theme.palette.mode === "dark"
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(0,0,0,0.05)",
                color:
                  poolMode === mode
                    ? mode === "total"
                      ? theme.palette.primary.contrastText
                      : "#FFFFFF"
                    : theme.palette.text.primary,
                transition: "all 0.2s",
              }}
            >
              {mode === "total"
                ? "Total"
                : mode === "luxor"
                  ? "🔷 Luxor"
                  : "🟧 Braiins"}
            </button>
          ))}
        </Box>
      </Box>

      {/* Date Range Filter */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: { xs: 2, md: 3 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 1, sm: 2 },
            mb: 2,
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 600, minWidth: "fit-content" }}
          >
            Date Range:
          </Typography>
          <ToggleButtonGroup
            value={dateMode}
            exclusive
            onChange={(e, newMode) => {
              if (newMode !== null) {
                setDateMode(newMode);
              }
            }}
            size="small"
          >
            <ToggleButton value="preset">Preset</ToggleButton>
            <ToggleButton value="custom">Custom</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Preset Options - Same Row */}
        {dateMode === "preset" && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <ToggleButtonGroup
              value={presetRange}
              exclusive
              onChange={(e, newRange) => {
                if (newRange !== null) {
                  setPresetRange(newRange);
                }
              }}
              size="small"
            >
              <ToggleButton value="30d">Last 30 Days</ToggleButton>
              <ToggleButton value="90d">Last 90 Days</ToggleButton>
              <ToggleButton value="all">All Time</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}

        {/* Custom Date Range */}
        {dateMode === "custom" && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: { xs: 1.5, sm: 2 },
            }}
          >
            {[
              { label: "Start Date", value: startDate, setter: setStartDate },
              { label: "End Date", value: endDate, setter: setEndDate },
            ].map(({ label, value, setter }) => (
              <Box
                key={label}
                sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600 }}
                >
                  {label}
                </Typography>
                <input
                  type="date"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "4px",
                    border:
                      theme.palette.mode === "dark"
                        ? "1px solid #444"
                        : "1px solid #ccc",
                    backgroundColor:
                      theme.palette.mode === "dark" ? "#333" : "#fff",
                    color: theme.palette.mode === "dark" ? "#fff" : "#000",
                    fontFamily: "inherit",
                    fontSize: "0.875rem",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Transactions Table */}
      <Paper sx={{ overflow: "hidden" }}>
        <TableContainer>
          {isLoading ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <CircularProgress />
              <Typography sx={{ mt: 2 }}>Loading transactions...</Typography>
            </Box>
          ) : filteredTransactions.length === 0 ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <Typography color="text.secondary">
                No transactions found
              </Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead
                sx={{
                  backgroundColor:
                    theme.palette.mode === "dark"
                      ? theme.palette.grey[800]
                      : theme.palette.grey[100],
                }}
              >
                <TableRow>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    }}
                  >
                    Date
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                      display: { xs: "none", sm: "table-cell" },
                    }}
                  >
                    Pool
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                      display: { xs: "none", md: "table-cell" },
                    }}
                  >
                    Category
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    }}
                  >
                    Type
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    }}
                  >
                    Amount (BTC)
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                      display: { xs: "none", sm: "table-cell" },
                    }}
                  >
                    USD
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                      display: { xs: "none", md: "table-cell" },
                    }}
                  >
                    TX ID
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTransactions.map((tx, idx) => (
                  <TableRow
                    key={`${tx.transaction_id}-${idx}`}
                    hover
                    sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                  >
                    <TableCell
                      sx={{
                        fontSize: { xs: "0.75rem", sm: "0.875rem" },
                        py: { xs: 1, sm: 1.5 },
                      }}
                    >
                      {formatDate(tx.date_time)}
                    </TableCell>
                    <TableCell
                      sx={{
                        display: { xs: "none", sm: "table-cell" },
                        py: { xs: 1, sm: 1.5 },
                      }}
                    >
                      <Chip
                        label={tx.pool}
                        size="small"
                        color={getPoolColor(tx.pool)}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.875rem",
                        display: { xs: "none", md: "table-cell" },
                        py: { xs: 1, sm: 1.5 },
                      }}
                    >
                      {tx.transaction_category}
                    </TableCell>
                    <TableCell sx={{ py: { xs: 1, sm: 1.5 } }}>
                      <Chip
                        label={
                          tx.transaction_type === "credit"
                            ? "+ Credit"
                            : "- Debit"
                        }
                        size="small"
                        color={getTransactionColor(tx.transaction_type)}
                        variant="outlined"
                        sx={{ fontSize: { xs: "0.65rem", sm: "0.75rem" } }}
                      />
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontSize: { xs: "0.75rem", sm: "0.875rem" },
                        fontWeight: 500,
                        color:
                          tx.transaction_type === "credit"
                            ? "success.main"
                            : "error.main",
                        py: { xs: 1, sm: 1.5 },
                      }}
                    >
                      {formatValue(tx.currency_amount, "BTC")}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontSize: "0.875rem",
                        display: { xs: "none", sm: "table-cell" },
                        py: { xs: 1, sm: 1.5 },
                      }}
                    >
                      ${formatValue(tx.usd_equivalent, "number")}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.75rem",
                        fontFamily: "monospace",
                        display: { xs: "none", md: "table-cell" },
                        py: { xs: 1, sm: 1.5 },
                      }}
                    >
                      <span
                        title={
                          copiedId === tx.transaction_id
                            ? "Copied!"
                            : `Click to copy: ${tx.transaction_id}`
                        }
                        onClick={() => {
                          navigator.clipboard.writeText(tx.transaction_id);
                          setCopiedId(tx.transaction_id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        style={{
                          cursor: "pointer",
                          textDecoration: "underline",
                          color:
                            copiedId === tx.transaction_id
                              ? "green"
                              : "inherit",
                          fontWeight:
                            copiedId === tx.transaction_id ? 600 : 400,
                          transition: "all 0.2s",
                        }}
                      >
                        {copiedId === tx.transaction_id
                          ? "Copied!"
                          : tx.transaction_id.substring(0, 8) + "..."}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>

        {/* Pagination */}
        {!isLoading && data && data.pagination.totalPages > 1 && (
          <Box
            sx={{
              p: { xs: 1.5, sm: 2 },
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Pagination
              count={data.pagination.totalPages}
              page={currentPage}
              onChange={(e, page) => setCurrentPage(page)}
              color="primary"
              size="small"
              siblingCount={0}
              boundaryCount={1}
            />
          </Box>
        )}
      </Paper>

      {/* Footer Info */}
      {data && (
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 1.5, color: "text.secondary" }}
        >
          Showing {(currentPage - 1) * pageSize + 1}-
          {Math.min(currentPage * pageSize, data.pagination.totalItems)} of{" "}
          {data.pagination.totalItems} transactions
        </Typography>
      )}
    </Box>
  );
}
