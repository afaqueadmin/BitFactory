"use client";

/**
 * Transaction page (authenticated) - BitFactory Daylight theme (v1.3)
 *
 * Composes:
 * - Page heading + pool mode Segmented control (Total / Luxor / Braiins)
 * - Three Daylight KPI StatCards (total credits, total debits, net amount) -
 *   the summary/poolBreakdown data the API already returns, not previously
 *   rendered anywhere on this page
 * - Filter card: Type PillTabs (All / Credits / Debits, also previously
 *   computed but with no UI control) + CSV download, and a date range
 *   (Preset pills or a Custom range) below it
 * - Daylight data table with pagination
 */

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
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
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import { useUser } from "@/lib/hooks/useUser";
import { formatValue } from "@/lib/helpers/formatValue";
import { useSubaccountFilter } from "@/lib/contexts/subaccountFilter-context";
import StatCard from "@/components/daylight/StatCard";
import Segmented, { SegmentedOption } from "@/components/daylight/Segmented";
import PillTab from "@/components/daylight/PillTab";
import { MQ, RADIUS_CARD, useDaylight } from "@/lib/daylight";

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

type PoolMode = "total" | "luxor" | "braiins";
type TypeFilter = "all" | "credit" | "debit";

const POOL_MODE_OPTIONS: SegmentedOption<PoolMode>[] = [
  { id: "total", label: "Total" },
  { id: "luxor", label: "Luxor" },
  { id: "braiins", label: "Braiins" },
];

const DATE_MODE_OPTIONS: SegmentedOption<"preset" | "custom">[] = [
  { id: "preset", label: "Preset" },
  { id: "custom", label: "Custom" },
];

const PRESET_RANGES: { id: "10d" | "20d" | "30d" | "all"; label: string }[] = [
  { id: "10d", label: "Last 10 days" },
  { id: "20d", label: "Last 20 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "all", label: "All time" },
];

export default function TransactionPage() {
  const { d, fonts } = useDaylight();
  const { user } = useUser();
  const { queryParam: subaccountsParam } = useSubaccountFilter();
  const [poolMode, setPoolMode] = useState<PoolMode>("total");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
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
        subaccounts: subaccountsParam,
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
        subaccounts: subaccountsParam,
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

  const dateInputSx = {
    padding: "10px 12px",
    borderRadius: "8px",
    border: `1px solid ${d.inputBorder}`,
    backgroundColor: d.surface,
    color: d.text,
    fontFamily: fonts.body,
    fontSize: "0.875rem",
    width: "100%",
    minHeight: "44px",
    boxSizing: "border-box" as const,
  };

  if (!user) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert
          severity="error"
          sx={{
            borderRadius: "8px",
            bgcolor: d.dangerSoft,
            color: d.danger,
            fontFamily: fonts.body,
          }}
        >
          User not authenticated
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{ maxWidth: 1600, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      {/* Page heading */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
          mb: { xs: "20px", md: "26px" },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: { xs: 27, md: 32 },
              lineHeight: 1.3,
              letterSpacing: "-.035em",
              color: d.text,
            }}
          >
            Transactions
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: 12, md: 13 },
              lineHeight: { xs: 1.7, md: 1.5 },
              color: d.muted,
              mt: "7px",
            }}
          >
            Every credit and debit recorded across your pools.
          </Typography>
        </Box>

        <Segmented
          value={poolMode}
          onChange={setPoolMode}
          ariaLabel="Pool mode"
          options={POOL_MODE_OPTIONS}
        />
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 2,
            borderRadius: "8px",
            bgcolor: d.dangerSoft,
            color: d.danger,
            fontFamily: fonts.body,
          }}
        >
          {error}
        </Alert>
      )}

      {/* KPI cards - the summary the API already returns */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: { xs: "10px", sm: "16px" },
          mb: { xs: "18px", sm: "22px" },
          [MQ.stack]: { gridTemplateColumns: "1fr" },
        }}
      >
        <StatCard
          title={`Total Credits${poolMode !== "total" ? ` (${poolMode.toUpperCase()})` : ""}`}
          value={formatValue(displaySummary?.totalCredits ?? 0, "BTC")}
          caption={`≈ $${formatValue(displaySummary?.totalCreditsUsd ?? 0, "number")}`}
          tone="mint"
          icon={<TrendingUpOutlinedIcon />}
          isLoading={isLoading}
        />
        <StatCard
          title={`Total Debits${poolMode !== "total" ? ` (${poolMode.toUpperCase()})` : ""}`}
          value={formatValue(displaySummary?.totalDebits ?? 0, "BTC")}
          caption={`≈ $${formatValue(displaySummary?.totalDebitsUsd ?? 0, "number")}`}
          tone="amber"
          icon={<TrendingDownOutlinedIcon />}
          isLoading={isLoading}
        />
        <StatCard
          title={`Net Amount${poolMode !== "total" ? ` (${poolMode.toUpperCase()})` : ""}`}
          value={formatValue(displaySummary?.netAmount ?? 0, "BTC")}
          caption={`≈ $${formatValue(displaySummary?.netAmountUsd ?? 0, "number")}`}
          tone="sky"
          icon={<AccountBalanceOutlinedIcon />}
          isLoading={isLoading}
        />
      </Box>

      {/* Filters card */}
      <Box
        sx={{
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
          p: { xs: "16px 18px", sm: "20px 24px" },
          mb: { xs: "18px", sm: "22px" },
        }}
      >
        {/* Type filter + CSV export */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            mb: "16px",
          }}
        >
          <Box sx={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            <PillTab
              active={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
            >
              All
            </PillTab>
            <PillTab
              active={typeFilter === "credit"}
              onClick={() => setTypeFilter("credit")}
              dot={d.success}
            >
              Credits
            </PillTab>
            <PillTab
              active={typeFilter === "debit"}
              onClick={() => setTypeFilter("debit")}
              dot={d.danger}
            >
              Debits
            </PillTab>
          </Box>

          <Button
            onClick={handleDownloadCsv}
            disabled={isExporting || isLoading}
            startIcon={
              isExporting ? (
                <CircularProgress size={14} sx={{ color: d.action }} />
              ) : (
                <DownloadOutlinedIcon sx={{ fontSize: 16 }} />
              )
            }
            sx={{
              textTransform: "none",
              fontFamily: fonts.body,
              fontSize: 12,
              fontWeight: 600,
              minHeight: 40,
              borderRadius: "8px",
              border: `1px solid ${d.inputBorder}`,
              color: d.text,
              px: "15px",
              "&:hover": { bgcolor: d.hover },
              [MQ.mobile]: { minHeight: 44 },
            }}
          >
            Download CSV
          </Button>
        </Box>

        {/* Date range */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            pt: "14px",
            borderTop: `1px solid ${d.border}`,
          }}
        >
          <Typography sx={{ fontSize: 11, fontWeight: 650, color: d.muted }}>
            Date range
          </Typography>
          <Segmented
            value={dateMode}
            onChange={setDateMode}
            ariaLabel="Date range mode"
            options={DATE_MODE_OPTIONS}
          />
        </Box>

        {dateMode === "preset" ? (
          <Box
            sx={{ display: "flex", gap: "4px", flexWrap: "wrap", mt: "12px" }}
          >
            {PRESET_RANGES.map((r) => (
              <PillTab
                key={r.id}
                active={presetRange === r.id}
                onClick={() => setPresetRange(r.id)}
              >
                {r.label}
              </PillTab>
            ))}
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: { xs: "12px", sm: "16px" },
              mt: "14px",
            }}
          >
            {[
              { label: "Start Date", value: startDate, setter: setStartDate },
              { label: "End Date", value: endDate, setter: setEndDate },
            ].map(({ label, value, setter }) => (
              <Box
                key={label}
                sx={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <Typography
                  sx={{ fontSize: 11, fontWeight: 650, color: d.muted }}
                >
                  {label}
                </Typography>
                <input
                  type="date"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  style={dateInputSx}
                />
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Transactions table */}
      <Box
        sx={{
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
          overflow: "hidden",
        }}
      >
        <TableContainer>
          {isLoading ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <CircularProgress sx={{ color: d.action }} />
              <Typography sx={{ mt: 2, fontSize: 13, color: d.muted }}>
                Loading transactions...
              </Typography>
            </Box>
          ) : filteredTransactions.length === 0 ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography sx={{ fontSize: 13, color: d.muted }}>
                No transactions found
              </Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead sx={{ backgroundColor: d.tableHead }}>
                <TableRow>
                  {[
                    { label: "Date", show: true, align: "left" as const },
                    {
                      label: "Pool",
                      show: true,
                      align: "left" as const,
                      hideBelow: "sm",
                    },
                    {
                      label: "Category",
                      show: true,
                      align: "left" as const,
                      hideBelow: "md",
                    },
                    { label: "Type", show: true, align: "left" as const },
                    {
                      label: "Amount (BTC)",
                      show: true,
                      align: "right" as const,
                    },
                    {
                      label: "USD",
                      show: true,
                      align: "right" as const,
                      hideBelow: "sm",
                    },
                    {
                      label: "TX ID",
                      show: true,
                      align: "left" as const,
                      hideBelow: "md",
                    },
                  ].map((col) => (
                    <TableCell
                      key={col.label}
                      align={col.align}
                      sx={{
                        fontFamily: fonts.body,
                        fontWeight: 600,
                        fontSize: 10,
                        letterSpacing: ".015em",
                        textTransform: "uppercase",
                        color: d.muted,
                        borderBottomColor: d.border,
                        display: col.hideBelow
                          ? { xs: "none", [col.hideBelow]: "table-cell" }
                          : "table-cell",
                      }}
                    >
                      {col.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTransactions.map((tx, idx) => (
                  <TableRow
                    key={`${tx.transaction_id}-${idx}`}
                    hover
                    sx={{
                      "&:hover": { backgroundColor: d.hover },
                      "& .MuiTableCell-root": {
                        borderBottomColor: d.border,
                        fontFamily: fonts.body,
                      },
                      "&:last-child td, &:last-child th": { border: 0 },
                    }}
                  >
                    <TableCell
                      sx={{
                        fontSize: 12,
                        color: d.text,
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
                        sx={{
                          fontFamily: fonts.body,
                          fontWeight: 600,
                          fontSize: 10,
                          bgcolor: tx.pool === "Luxor" ? d.skySoft : d.amber,
                          color: tx.pool === "Luxor" ? d.action : d.warning,
                        }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 12,
                        color: d.text,
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
                        sx={{
                          fontFamily: fonts.body,
                          fontWeight: 600,
                          fontSize: { xs: 9, sm: 10 },
                          bgcolor:
                            tx.transaction_type === "credit"
                              ? d.mint
                              : d.dangerSoft,
                          color:
                            tx.transaction_type === "credit"
                              ? d.success
                              : d.danger,
                        }}
                      />
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontSize: 12,
                        fontWeight: 650,
                        fontVariantNumeric: "tabular-nums",
                        color:
                          tx.transaction_type === "credit"
                            ? d.success
                            : d.danger,
                        py: { xs: 1, sm: 1.5 },
                      }}
                    >
                      {formatValue(tx.currency_amount, "BTC")}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontSize: 12,
                        color: d.text,
                        display: { xs: "none", sm: "table-cell" },
                        py: { xs: 1, sm: 1.5 },
                      }}
                    >
                      ${formatValue(tx.usd_equivalent, "number")}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 11,
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
                            color: d.action,
                          }}
                        >
                          {tx.transaction_id.length > 8
                            ? tx.transaction_id.substring(0, 8) + "..."
                            : tx.transaction_id}
                        </a>
                      ) : (
                        <span style={{ color: d.muted }}>N/A</span>
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
              p: { xs: "14px", sm: "16px" },
              borderTop: `1px solid ${d.border}`,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Pagination
              count={data.pagination.totalPages}
              page={currentPage}
              onChange={(e, page) => setCurrentPage(page)}
              size="small"
              siblingCount={0}
              boundaryCount={1}
              sx={{
                "& .MuiPaginationItem-root": {
                  fontFamily: fonts.body,
                  fontSize: 12,
                  color: d.muted,
                  borderRadius: "8px",
                },
                "& .MuiPaginationItem-root.Mui-selected": {
                  bgcolor: d.action,
                  color: "#fff",
                  "&:hover": { bgcolor: d.actionHover },
                },
              }}
            />
          </Box>
        )}
      </Box>

      {/* Footer info */}
      {data && (
        <Typography
          sx={{ display: "block", mt: "12px", fontSize: 11, color: d.muted }}
        >
          Showing {(currentPage - 1) * pageSize + 1}-
          {Math.min(currentPage * pageSize, data.pagination.totalItems)} of{" "}
          {data.pagination.totalItems} transactions
        </Typography>
      )}
    </Box>
  );
}
