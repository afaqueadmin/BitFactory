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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Pagination,
  Alert,
  Chip,
  Button,
} from "@mui/material";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
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

interface TransactionHistorySectionProps {
  customerId?: string;
  /** Comma-separated Luxor subaccounts to scope to, or "all" (default). */
  subaccountsParam?: string;
}

export default function TransactionHistorySection({
  customerId,
  subaccountsParam = "all",
}: TransactionHistorySectionProps) {
  const theme = useTheme();
  const [poolMode, setPoolMode] = useState<"total" | "luxor" | "braiins">(
    "total",
  );
  const [typeFilter, setTypeFilter] = useState<"all" | "credit" | "debit">(
    "all",
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);

  // Date filter state. Same model as the client's /transaction page:
  // 10d/20d/30d are fetched live from Luxor/Braiins (DB as fallback if a pool
  // call fails); "all" and custom ranges always read from the DB.
  const [dateMode, setDateMode] = useState<"preset" | "custom">("preset");
  const [presetRange, setPresetRange] = useState<"10d" | "20d" | "30d" | "all">(
    "all",
  );
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);

  const [data, setData] = useState<TransactionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date-related query params based on mode. A 10d/20d/30d preset sends
  // `range` so the API fetches live (with DB fallback); "All Time" and
  // custom ranges send only start_date/end_date (or nothing), which the API
  // always reads from the DB for.
  const getDateParams = (): Record<string, string> => {
    if (dateMode === "custom" && startDate && endDate) {
      return { start_date: startDate, end_date: endDate };
    }
    if (dateMode === "preset" && presetRange !== "all") {
      return { range: presetRange };
    }
    return {};
  };

  // Fetch transactions
  const fetchTransactions = async (page: number, type: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        type,
        pool: poolMode,
        subaccounts: subaccountsParam,
        ...getDateParams(),
      });

      // Add customerId if provided (for admin access)
      if (customerId) {
        params.append("customerId", customerId);
      }

      const response = await fetch(`/api/wallet/transactions?${params}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.statusText}`);
      }

      const txData: TransactionResponse = await response.json();
      setData(txData);
      console.log("[TransactionHistorySection] Data loaded:", txData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(
        "[TransactionHistorySection] Error fetching transactions:",
        err,
      );
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Downloads every transaction matching the current pool/type/date filters
  // as CSV — not just the current page. Hits the same endpoint with
  // export=true, which returns the full matching set unpaginated.
  const handleDownloadCsv = async () => {
    try {
      setIsExporting(true);
      setError(null);

      const params = new URLSearchParams({
        type: typeFilter,
        pool: poolMode,
        export: "true",
        subaccounts: subaccountsParam,
        ...getDateParams(),
      });
      if (customerId) {
        params.append("customerId", customerId);
      }

      const response = await fetch(`/api/wallet/transactions?${params}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(
          `Failed to export transactions: ${response.statusText}`,
        );
      }

      const exportData: TransactionResponse = await response.json();

      const header = [
        "Date",
        "Pool",
        "Category",
        "Type",
        "Amount (BTC)",
        "Amount (USD)",
        "Transaction ID",
      ];
      const rows = exportData.transactions.map((tx) =>
        [
          tx.date_time,
          tx.pool,
          tx.transaction_category,
          tx.transaction_type,
          tx.currency_amount,
          tx.usd_equivalent,
          tx.transaction_id || "",
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(","),
      );

      const blob = new Blob([[header.join(","), ...rows].join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const rangeLabel =
        dateMode === "custom" && startDate && endDate
          ? `${startDate}_to_${endDate}`
          : dateMode === "preset"
            ? presetRange
            : "custom";
      link.download = `transactions-${poolMode}-${rangeLabel}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to export transactions";
      console.error("[TransactionHistorySection] Export failed:", err);
      setError(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [
    poolMode,
    typeFilter,
    dateMode,
    presetRange,
    startDate,
    endDate,
    subaccountsParam,
  ]);

  useEffect(() => {
    fetchTransactions(currentPage, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPage,
    poolMode,
    typeFilter,
    dateMode,
    presetRange,
    startDate,
    endDate,
    subaccountsParam,
  ]);

  // The API filters by pool server-side, before pagination, so what comes
  // back is already scoped correctly — no client-side re-filtering.
  const filteredTransactions = data?.transactions || [];

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

  return (
    <Box>
      {/* Header Section */}
      <Box
        sx={{
          mb: 4,
        }}
      >
        <Typography
          variant="h5"
          component="h2"
          sx={{ fontWeight: "bold", mb: 2 }}
        >
          Transaction History
        </Typography>

        {/* Pool Mode Toggle - Below Title */}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setPoolMode("total");
              setCurrentPage(1);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontWeight: poolMode === "total" ? 600 : 400,
              backgroundColor:
                poolMode === "total"
                  ? theme.palette.primary.main
                  : theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.05)",
              color:
                poolMode === "total"
                  ? theme.palette.primary.contrastText
                  : theme.palette.text.primary,
              transition: "all 0.2s",
            }}
          >
            Total
          </button>

          <button
            onClick={() => {
              setPoolMode("luxor");
              setCurrentPage(1);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontWeight: poolMode === "luxor" ? 600 : 400,
              backgroundColor:
                poolMode === "luxor"
                  ? "#1565C0"
                  : theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.05)",
              color:
                poolMode === "luxor" ? "#FFFFFF" : theme.palette.text.primary,
              transition: "all 0.2s",
            }}
          >
            🔷 Luxor
          </button>

          <button
            onClick={() => {
              setPoolMode("braiins");
              setCurrentPage(1);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontWeight: poolMode === "braiins" ? 600 : 400,
              backgroundColor:
                poolMode === "braiins"
                  ? "#FFA500"
                  : theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.05)",
              color:
                poolMode === "braiins" ? "#FFFFFF" : theme.palette.text.primary,
              transition: "all 0.2s",
            }}
          >
            🟧 Braiins
          </button>
        </Box>
      </Box>

      {/* Summary - the totals the API returns for the current filters */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
          gap: 2,
          mb: 3,
        }}
      >
        {[
          {
            label: "Total Credits",
            btc: displaySummary?.totalCredits ?? 0,
            usd: displaySummary?.totalCreditsUsd ?? 0,
            color: "success.main",
          },
          {
            label: "Total Debits",
            btc: displaySummary?.totalDebits ?? 0,
            usd: displaySummary?.totalDebitsUsd ?? 0,
            color: "error.main",
          },
          {
            label: "Net Amount",
            btc: displaySummary?.netAmount ?? 0,
            usd: displaySummary?.netAmountUsd ?? 0,
            color: "text.primary",
          },
        ].map((stat) => (
          <Paper key={stat.label} sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {stat.label}
              {poolMode !== "total" ? ` (${poolMode.toUpperCase()})` : ""}
            </Typography>
            {isLoading ? (
              <CircularProgress size={20} sx={{ mt: 1 }} />
            ) : (
              <>
                <Typography
                  variant="h6"
                  fontWeight="bold"
                  sx={{ color: stat.color }}
                >
                  {formatValue(stat.btc, "BTC")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ≈ ${formatValue(stat.usd, "number")}
                </Typography>
              </>
            )}
          </Paper>
        ))}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 3, mb: 3 }}>
        {/* Type filter + CSV export */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 2,
            mb: 2,
            pb: 2,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <ToggleButtonGroup
            value={typeFilter}
            exclusive
            onChange={(e, newType) => {
              if (newType !== null) {
                setTypeFilter(newType);
              }
            }}
            size="small"
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="credit">Credits</ToggleButton>
            <ToggleButton value="debit">Debits</ToggleButton>
          </ToggleButtonGroup>

          <Button
            variant="outlined"
            size="small"
            onClick={handleDownloadCsv}
            disabled={isExporting || isLoading}
            startIcon={
              isExporting ? (
                <CircularProgress size={14} />
              ) : (
                <DownloadOutlinedIcon />
              )
            }
          >
            Download CSV
          </Button>
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
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
              <ToggleButton value="10d">Last 10 Days</ToggleButton>
              <ToggleButton value="20d">Last 20 Days</ToggleButton>
              <ToggleButton value="30d">Last 30 Days</ToggleButton>
              <ToggleButton value="all">All Time</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}

        {/* Custom Date Range - Same Row */}
        {dateMode === "custom" && (
          <Box
            sx={{
              display: "flex",
              gap: 2,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2">Start Date:</Typography>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  padding: "8px 12px",
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
                }}
              />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2">End Date:</Typography>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  padding: "8px 12px",
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
                }}
              />
            </Box>
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
            <Table>
              <TableHead sx={{ backgroundColor: theme.palette.grey[100] }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Pool</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    Amount (BTC)
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    USD Equivalent
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>TX ID</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTransactions.map((tx, idx) => (
                  <TableRow
                    key={`${tx.transaction_id}-${idx}`}
                    hover
                    sx={{
                      "&:last-child td, &:last-child th": { border: 0 },
                    }}
                  >
                    <TableCell sx={{ fontSize: "0.875rem" }}>
                      {formatDate(tx.date_time)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={tx.pool}
                        size="small"
                        color={getPoolColor(tx.pool)}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.875rem" }}>
                      {tx.transaction_category}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getTransactionLabel(tx.transaction_type)}
                        size="small"
                        color={getTransactionColor(tx.transaction_type)}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        color:
                          tx.transaction_type === "credit"
                            ? "success.main"
                            : "error.main",
                      }}
                    >
                      {formatValue(tx.currency_amount, "BTC")}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: "0.875rem" }}>
                      ${formatValue(tx.usd_equivalent, "number")}
                    </TableCell>
                    <TableCell
                      sx={{ fontSize: "0.75rem", fontFamily: "monospace" }}
                    >
                      {tx.transaction_id ? (
                        <a
                          href={`https://mempool.space/tx/${tx.transaction_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`View on mempool.space: ${tx.transaction_id}`}
                          style={{
                            textDecoration: "underline",
                            color: "inherit",
                          }}
                        >
                          {tx.transaction_id.length > 8
                            ? tx.transaction_id.substring(0, 8) + "..."
                            : tx.transaction_id}
                        </a>
                      ) : (
                        <span>N/A</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>

        {/* Pagination */}
        {!isLoading && data && data.pagination.totalPages > 1 && (
          <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}>
            <Pagination
              count={data.pagination.totalPages}
              page={currentPage}
              onChange={(e, page) => setCurrentPage(page)}
              color="primary"
            />
          </Box>
        )}
      </Paper>

      {/* Footer Info */}
      {data && (
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 2, color: "text.secondary" }}
        >
          Showing {(currentPage - 1) * pageSize + 1}-
          {Math.min(currentPage * pageSize, data.pagination.totalItems)} of{" "}
          {data.pagination.totalItems} transactions
        </Typography>
      )}
    </Box>
  );
}
