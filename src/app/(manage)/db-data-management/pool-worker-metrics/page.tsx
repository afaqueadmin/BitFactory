/**
 * src/app/(manage)/pool-worker-metrics/page.tsx
 * Pool Worker Daily Metrics Management Page
 *
 * Admin CRUD for PoolWorkerDailyMetric - paginated and filterable
 * (subaccount, worker name, date range) since this table holds tens of
 * thousands of rows.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Container,
  Typography,
  Button,
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
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

const emptyForm = {
  poolSubaccountId: "",
  workerName: "",
  externalWorkerId: "",
  date: "",
  hashrate: "",
  efficiency: "",
  staleShares: "",
  rejectedShares: "",
  estRevenue: "",
  firmware: "",
  status: "",
};

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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [selected, setSelected] = useState<WorkerMetric | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<WorkerMetric | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const openCreateDialog = () => {
    setDialogMode("create");
    setSelected(null);
    setForm(emptyForm);
    setDialogMessage(null);
    setDialogOpen(true);
  };

  const openEditDialog = (row: WorkerMetric) => {
    setDialogMode("edit");
    setSelected(row);
    setForm({
      poolSubaccountId: row.poolSubaccountId,
      workerName: row.workerName,
      externalWorkerId: row.externalWorkerId ?? "",
      date: row.date.slice(0, 10),
      hashrate: row.hashrate ?? "",
      efficiency: row.efficiency ?? "",
      staleShares: row.staleShares?.toString() ?? "",
      rejectedShares: row.rejectedShares?.toString() ?? "",
      estRevenue: row.estRevenue ?? "",
      firmware: row.firmware ?? "",
      status: row.status ?? "",
    });
    setDialogMessage(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setSelected(null);
    setForm(emptyForm);
    setDialogMessage(null);
  };

  const handleSubmit = async () => {
    if (dialogMode === "create" && !form.poolSubaccountId) {
      setDialogMessage("Subaccount is required");
      return;
    }
    if (!form.workerName.trim()) {
      setDialogMessage("Worker name is required");
      return;
    }
    if (!form.date) {
      setDialogMessage("Date is required");
      return;
    }

    setSubmitting(true);
    setDialogMessage(null);

    try {
      const isEdit = dialogMode === "edit" && selected;
      const response = await fetch(
        isEdit
          ? `/api/pool-worker-metrics/${selected!.id}`
          : "/api/pool-worker-metrics",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isEdit ? {} : { poolSubaccountId: form.poolSubaccountId }),
            workerName: form.workerName.trim(),
            externalWorkerId: form.externalWorkerId.trim(),
            date: form.date,
            hashrate: form.hashrate,
            efficiency: form.efficiency,
            staleShares: form.staleShares,
            rejectedShares: form.rejectedShares,
            estRevenue: form.estRevenue,
            firmware: form.firmware.trim(),
            status: form.status.trim(),
          }),
        },
      );

      const data: ApiResponse<WorkerMetric> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save worker metric");
      }

      await fetchRows();
      closeDialog();
    } catch (err) {
      setDialogMessage(
        err instanceof Error ? err.message : "Unknown error occurred",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setDeleteError(null);

    try {
      const response = await fetch(
        `/api/pool-worker-metrics/${deleteTarget.id}`,
        {
          method: "DELETE",
        },
      );
      const data: ApiResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete worker metric");
      }
      await fetchRows();
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Unknown error occurred",
      );
    } finally {
      setDeleteSubmitting(false);
    }
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
            the day the sync cron started (no historical endpoint exists).
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh">
            <IconButton onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreateDialog}
          >
            Add Metric
          </Button>
        </Stack>
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
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
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
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => openEditDialog(row)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete is disabled for now">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(row);
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {dialogMode === "create" ? "Add Worker Metric" : "Edit Worker Metric"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogMessage && <Alert severity="error">{dialogMessage}</Alert>}

            <FormControl fullWidth disabled={dialogMode === "edit"}>
              <InputLabel>Subaccount</InputLabel>
              <Select
                label="Subaccount"
                value={form.poolSubaccountId}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    poolSubaccountId: e.target.value,
                  }))
                }
              >
                {subaccounts.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.pool.name} / {s.subaccountName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Worker Name"
              value={form.workerName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, workerName: e.target.value }))
              }
              fullWidth
              disabled={dialogMode === "edit"}
            />
            <TextField
              label="External Worker ID"
              value={form.externalWorkerId}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  externalWorkerId: e.target.value,
                }))
              }
              fullWidth
              helperText="Luxor's worker id, if known"
            />
            <TextField
              label="Date"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={form.date}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, date: e.target.value }))
              }
              fullWidth
              disabled={dialogMode === "edit"}
            />
            <TextField
              label="Hashrate (H/s)"
              value={form.hashrate}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, hashrate: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Efficiency (%)"
              value={form.efficiency}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, efficiency: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Stale Shares"
              value={form.staleShares}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, staleShares: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Rejected Shares"
              value={form.rejectedShares}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, rejectedShares: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Estimated Revenue (BTC)"
              value={form.estRevenue}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, estRevenue: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Firmware"
              value={form.firmware}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, firmware: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Status"
              value={form.status}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, status: e.target.value }))
              }
              fullWidth
              helperText="e.g. ACTIVE / INACTIVE"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Worker Metric</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <Typography>
            Delete the metric for <strong>{deleteTarget?.workerName}</strong> on{" "}
            <strong>{deleteTarget?.date.slice(0, 10)}</strong>? This cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={deleteSubmitting}
          >
            {deleteSubmitting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
