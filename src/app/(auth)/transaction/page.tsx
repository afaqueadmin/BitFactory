"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
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
import DownloadIcon from "@mui/icons-material/Download";
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

  // Date filter state. 10d/20d/30d are fetched live from Luxor/Braiins (DB
  // as fallback if a pool call fails); "all" and custom ranges always read
  // from the DB, never live.
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

      const dateParams = getDateParams();
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        type,
        pool: poolMode,
        ...dateParams,
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

  // Downloads every transaction matching the current pool/type/date filters
  // as CSV — not just the current page. Hits the same endpoint with
  // export=true, which returns the full matching set unpaginated.
  const handleDownloadCsv = async () => {
    try {
      setIsExporting(true);
      setError(null);

      const dateParams = getDateParams();
      const params = new URLSearchParams({
        type: typeFilter,
        pool: poolMode,
        export: "true",
        ...dateParams,
      });

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
      console.error("[Transaction Page] Export failed:", err);
      setError(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [poolMode, typeFilter, dateMode, presetRange, startDate, endDate]);

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
  ]);

  // The API now filters by pool server-side, before pagination, so what
  // comes back is already scoped correctly — no client-side re-filtering.
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

          <Button
            variant="outlined"
            size="small"
            startIcon={
              isExporting ? (
                <CircularProgress size={14} />
              ) : (
                <DownloadIcon fontSize="small" />
              )
            }
            onClick={handleDownloadCsv}
            disabled={isExporting || isLoading}
            sx={{ ml: { sm: "auto" }, textTransform: "none" }}
          >
            Download CSV
          </Button>
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
