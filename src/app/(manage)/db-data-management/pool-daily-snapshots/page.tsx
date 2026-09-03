/**
 * src/app/(manage)/pool-daily-snapshots/page.tsx
 * Pool Daily Snapshots Management Page
 *
 * Read-only admin view of PoolSubaccountDailySnapshot - paginated and
 * filterable (subaccount, date range) since this table holds thousands of
 * rows. Data is populated by the pool sync cron; this page has no
 * add/edit/delete controls.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Container,
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
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  NavigateBefore,
  NavigateNext,
} from "@mui/icons-material";

interface SubaccountOption {
  id: string;
  subaccountName: string;
  pool: { id: string; name: string };
}

interface Snapshot {
  id: string;
  poolSubaccountId: string;
  date: string;
  hashrate: string | null;
  efficiency: string | null;
  uptime: string | null;
  activeWorkers: number | null;
  hashprice: string | null;
  balance: string | null;
  miningRevenue: string;
  referralRevenue: string;
  otherRevenue: string;
  totalRevenue: string;
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

const fmt = (v: string | null, digits = 4) =>
  v === null
    ? "—"
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });

const fmtHashrate = (v: string | null) => {
  if (v === null) return "—";
  const th = Number(v) / 1e12;
  return `${th.toLocaleString(undefined, { maximumFractionDigits: 2 })} TH/s`;
};

export default function PoolDailySnapshotsPage() {
  const [rows, setRows] = useState<Snapshot[]>([]);
  const [subaccounts, setSubaccounts] = useState<SubaccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [filterSubaccountId, setFilterSubaccountId] = useState("");
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
      if (filterStartDate) params.set("startDate", filterStartDate);
      if (filterEndDate) params.set("endDate", filterEndDate);

      const res = await fetch(`/api/pool-daily-snapshots?${params.toString()}`);
      const data: ApiResponse<Snapshot[]> = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch daily snapshots");
      }
      setRows(Array.isArray(data.data) ? data.data : []);
      if (data.pagination) setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [page, filterSubaccountId, filterStartDate, filterEndDate]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchRows();
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Daily Snapshots
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Per-subaccount daily hashrate, efficiency, uptime and revenue
            history. View only.
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper elevation={1} sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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

      <Paper elevation={2} sx={{ borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Subaccount</TableCell>
                <TableCell align="right">Hashrate</TableCell>
                <TableCell align="right">Efficiency</TableCell>
                <TableCell align="right">Uptime</TableCell>
                <TableCell align="right">Workers</TableCell>
                <TableCell align="right">Hashprice</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell align="right">Mining Rev</TableCell>
                <TableCell align="right">Referral Rev</TableCell>
                <TableCell align="right">Other Rev</TableCell>
                <TableCell align="right">Total Rev</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No snapshots found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>{row.date.slice(0, 10)}</TableCell>
                    <TableCell>
                      <Chip
                        label={row.poolSubaccount.pool.name}
                        size="small"
                        sx={{ mr: 1 }}
                      />
                      {row.poolSubaccount.subaccountName}
                    </TableCell>
                    <TableCell align="right">
                      {fmtHashrate(row.hashrate)}
                    </TableCell>
                    <TableCell align="right">
                      {row.efficiency === null
                        ? "—"
                        : `${fmt(row.efficiency, 2)}%`}
                    </TableCell>
                    <TableCell align="right">
                      {row.uptime === null ? "—" : `${fmt(row.uptime, 2)}%`}
                    </TableCell>
                    <TableCell align="right">
                      {row.activeWorkers ?? "—"}
                    </TableCell>
                    <TableCell align="right">{fmt(row.hashprice, 8)}</TableCell>
                    <TableCell align="right">{fmt(row.balance, 8)}</TableCell>
                    <TableCell align="right">
                      {fmt(row.miningRevenue, 8)}
                    </TableCell>
                    <TableCell align="right">
                      {fmt(row.referralRevenue, 8)}
                    </TableCell>
                    <TableCell align="right">
                      {fmt(row.otherRevenue, 8)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {fmt(row.totalRevenue, 8)}
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
          sx={{ p: 2, borderTop: 1, borderColor: "divider" }}
        >
          <Typography variant="body2" color="text.secondary">
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
    </Container>
  );
}
