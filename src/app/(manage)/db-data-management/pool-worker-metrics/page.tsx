/**
 * src/app/(manage)/pool-worker-metrics/page.tsx
 * Pool Worker Daily Metrics Management Page
 *
 * Read-only admin view of PoolWorkerDailyMetric - paginated and filterable
 * (subaccount, worker name, date range) since this table holds tens of
 * thousands of rows. Data is populated by the pool sync cron; this page has
 * no add/edit/delete controls.
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

interface WorkerMetric {
  id: string;
  poolSubaccountId: string;
  workerName: string;
  externalWorkerId: string | null;
  date: string;
  hashrate: string | null;
  efficiency: string | null;
  staleShares: number | null;
  rejectedShares: number | null;
  estRevenue: string | null;
  firmware: string | null;
  status: string | null;
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
  return `${th.toLocaleString(undefined, { maximumFractionDigits: 3 })} TH/s`;
};

export default function PoolWorkerMetricsPage() {
  const [rows, setRows] = useState<WorkerMetric[]>([]);
  const [subaccounts, setSubaccounts] = useState<SubaccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [filterSubaccountId, setFilterSubaccountId] = useState("");
  const [filterWorkerName, setFilterWorkerName] = useState("");
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
      if (filterWorkerName) params.set("workerName", filterWorkerName);
      if (filterStartDate) params.set("startDate", filterStartDate);
      if (filterEndDate) params.set("endDate", filterEndDate);

      const res = await fetch(`/api/pool-worker-metrics?${params.toString()}`);
      const data: ApiResponse<WorkerMetric[]> = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch worker metrics");
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
    filterWorkerName,
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
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Worker Metrics
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Per-worker daily hashrate, efficiency and estimated revenue history.
            Stale/rejected shares, firmware and status are only available from
            the day the sync cron started (no historical endpoint exists). View
            only.
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
            label="Worker Name"
            size="small"
            value={filterWorkerName}
            onChange={(e) => {
              setPage(1);
              setFilterWorkerName(e.target.value);
            }}
          />
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
                <TableCell>Worker</TableCell>
                <TableCell align="right">Hashrate</TableCell>
                <TableCell align="right">Efficiency</TableCell>
                <TableCell align="right">Stale</TableCell>
                <TableCell align="right">Rejected</TableCell>
                <TableCell align="right">Est. Revenue</TableCell>
                <TableCell>Firmware</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No worker metrics found.
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
                    <TableCell sx={{ fontFamily: "monospace" }}>
                      {row.workerName}
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
                      {row.staleShares ?? "—"}
                    </TableCell>
                    <TableCell align="right">
                      {row.rejectedShares ?? "—"}
                    </TableCell>
                    <TableCell align="right">
                      {fmt(row.estRevenue, 8)}
                    </TableCell>
                    <TableCell>{row.firmware || "—"}</TableCell>
                    <TableCell>{row.status || "—"}</TableCell>
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
