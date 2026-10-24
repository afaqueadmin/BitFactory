/**
 * src/app/(manage)/pool-transactions/page.tsx
 * Pool Transactions Management Page
 *
 * Read-only admin view of PoolTransaction - the raw pool-side ledger
 * (payouts, fees, revenue accrual). Paginated and filterable (subaccount,
 * category, type, date range) since this table holds thousands of rows.
 * Data is populated by the pool sync cron; this page has no
 * add/edit/delete controls.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  NavigateBefore,
  NavigateNext,
} from "@mui/icons-material";
import { useDaylight } from "@/lib/daylight";
import {
  DaylightAdminPage,
  DaylightPageHeader,
  DaylightStatusPill,
  statusLabel,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

interface SubaccountOption {
  id: string;
  subaccountName: string;
  pool: { id: string; name: string };
}

interface PoolTransaction {
  id: string;
  poolId: string;
  poolSubaccountId: string;
  externalTransactionId: string | null;
  transactionType: string;
  category: string | null;
  amount: string;
  usdEquivalent: string | null;
  addressName: string | null;
  status: string | null;
  occurredAt: string;
  poolSubaccount: {
    id: string;
    subaccountName: string;
    pool: { id: string; name: string };
  };
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  pagination?: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  error?: string;
}

const fmt = (v: string | null, digits = 8) =>
  v === null
    ? "—"
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });

export default function PoolTransactionsPage() {
  const { d } = useDaylight();
  const ds = useDaylightAdminSx();
  const [rows, setRows] = useState<PoolTransaction[]>([]);
  const [subaccounts, setSubaccounts] = useState<SubaccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [filterSubaccountId, setFilterSubaccountId] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 1,
  });

  useEffect(() => {
    fetch("/api/pool-subaccounts")
      .then((r) => r.json())
      .then((data: ApiResponse<SubaccountOption[]>) => {
        if (data.success)
          setSubaccounts(Array.isArray(data.data) ? data.data : []);
      })
      .catch(() => {});
  }, []);

  const fetchRows = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "50",
      });
      if (filterSubaccountId)
        params.set("poolSubaccountId", filterSubaccountId);
      if (filterCategory) params.set("category", filterCategory);
      if (filterType) params.set("transactionType", filterType);
      if (filterStartDate) params.set("startDate", filterStartDate);
      if (filterEndDate) params.set("endDate", filterEndDate);

      const res = await fetch(`/api/pool-transactions?${params.toString()}`);
      const data: ApiResponse<PoolTransaction[]> = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch transactions");
      }
      setRows(Array.isArray(data.data) ? data.data : []);
      if (data.pagination) setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [
    page,
    filterSubaccountId,
    filterCategory,
    filterType,
    filterStartDate,
    filterEndDate,
  ]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchRows();
  };

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Pool Transactions"
        description="Raw pool-side transaction ledger (revenue accrual, payouts, fees). Deduped on (subaccount, date, category, type, amount) since Luxor leaves the transaction ID blank on most accrual rows. View only."
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={isRefreshing}
            sx={ds.outlineBtnSx}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3, ...ds.alertSx("error") }}>
          {error}
        </Alert>
      )}

      <Paper elevation={0} sx={{ ...ds.cardSx, ...ds.inputSx, mb: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          flexWrap="wrap"
          useFlexGap
        >
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel>Subaccount</InputLabel>
            <Select
              label="Subaccount"
              value={filterSubaccountId}
              onChange={(e) => {
                setPage(1);
                setFilterSubaccountId(e.target.value);
              }}
            >
              <MenuItem value="">
                <em>All</em>
              </MenuItem>
              {subaccounts.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.pool.name} / {s.subaccountName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Category"
            size="small"
            value={filterCategory}
            onChange={(e) => {
              setPage(1);
              setFilterCategory(e.target.value);
            }}
            placeholder="Miner Revenue, Payment, ..."
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Type</InputLabel>
            <Select
              label="Type"
              value={filterType}
              onChange={(e) => {
                setPage(1);
                setFilterType(e.target.value);
              }}
            >
              <MenuItem value="">
                <em>All</em>
              </MenuItem>
              <MenuItem value="credit">credit</MenuItem>
              <MenuItem value="debit">debit</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Start Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filterStartDate}
            onChange={(e) => {
              setPage(1);
              setFilterStartDate(e.target.value);
            }}
          />
          <TextField
            label="End Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filterEndDate}
            onChange={(e) => {
              setPage(1);
              setFilterEndDate(e.target.value);
            }}
          />
        </Stack>
      </Paper>

      <Paper elevation={0} sx={ds.listCardSx}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Occurred At</TableCell>
                <TableCell>Subaccount</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Amount (BTC)</TableCell>
                <TableCell align="right">USD Equiv.</TableCell>
                <TableCell>Address</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>External Tx ID</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} sx={{ color: d.action }} />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" sx={{ color: d.muted }}>
                      No transactions found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      {new Date(row.occurredAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Box component="span" sx={{ mr: 1 }}>
                        <DaylightStatusPill
                          label={row.poolSubaccount.pool.name}
                          tone="neutral"
                        />
                      </Box>
                      {row.poolSubaccount.subaccountName}
                    </TableCell>
                    <TableCell>{row.category || "—"}</TableCell>
                    <TableCell>
                      <DaylightStatusPill
                        label={statusLabel(row.transactionType)}
                        tone={
                          row.transactionType === "credit"
                            ? "success"
                            : "neutral"
                        }
                      />
                    </TableCell>
                    <TableCell align="right">{fmt(row.amount)}</TableCell>
                    <TableCell align="right">
                      {fmt(row.usdEquivalent, 2)}
                    </TableCell>
                    <TableCell
                      sx={{
                        "&&&": {
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                          fontSize: 11.5,
                          color: d.muted,
                        },
                      }}
                    >
                      {row.addressName || "—"}
                    </TableCell>
                    <TableCell>{row.status || "—"}</TableCell>
                    <TableCell
                      sx={{
                        "&&&": {
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                          fontSize: 11.5,
                          color: d.muted,
                        },
                      }}
                    >
                      {row.externalTransactionId
                        ? `${row.externalTransactionId.slice(0, 10)}...`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ px: "16px", py: "10px", borderTop: `1px solid ${d.border}` }}
        >
          <Typography variant="body2" sx={{ color: d.muted }}>
            {pagination.totalCount} total rows — page {pagination.page} of{" "}
            {pagination.totalPages}
          </Typography>
          <Stack direction="row" spacing={1}>
            <IconButton
              size="small"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <NavigateBefore />
            </IconButton>
            <IconButton
              size="small"
              disabled={page >= pagination.totalPages}
              onClick={() =>
                setPage((p) => Math.min(pagination.totalPages, p + 1))
              }
            >
              <NavigateNext />
            </IconButton>
          </Stack>
        </Stack>
      </Paper>
    </DaylightAdminPage>
  );
}
