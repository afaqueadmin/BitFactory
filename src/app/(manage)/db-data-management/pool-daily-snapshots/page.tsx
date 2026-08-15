/**
 * src/app/(manage)/pool-daily-snapshots/page.tsx
 * Pool Daily Snapshots Management Page
 *
 * Admin CRUD for PoolSubaccountDailySnapshot - paginated and filterable
 * (subaccount, date range) since this table holds thousands of rows.
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

const emptyForm = {
  poolSubaccountId: "",
  date: "",
  hashrate: "",
  efficiency: "",
  uptime: "",
  activeWorkers: "",
  hashprice: "",
  balance: "",
  miningRevenue: "",
  referralRevenue: "",
  otherRevenue: "",
};

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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [selected, setSelected] = useState<Snapshot | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Snapshot | null>(null);
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

  const openCreateDialog = () => {
    setDialogMode("create");
    setSelected(null);
    setForm(emptyForm);
    setDialogMessage(null);
    setDialogOpen(true);
  };

  const openEditDialog = (row: Snapshot) => {
    setDialogMode("edit");
    setSelected(row);
    setForm({
      poolSubaccountId: row.poolSubaccountId,
      date: row.date.slice(0, 10),
      hashrate: row.hashrate ?? "",
      efficiency: row.efficiency ?? "",
      uptime: row.uptime ?? "",
      activeWorkers: row.activeWorkers?.toString() ?? "",
      hashprice: row.hashprice ?? "",
      balance: row.balance ?? "",
      miningRevenue: row.miningRevenue,
      referralRevenue: row.referralRevenue,
      otherRevenue: row.otherRevenue,
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
          ? `/api/pool-daily-snapshots/${selected!.id}`
          : "/api/pool-daily-snapshots",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isEdit ? {} : { poolSubaccountId: form.poolSubaccountId }),
            date: form.date,
            hashrate: form.hashrate,
            efficiency: form.efficiency,
            uptime: form.uptime,
            activeWorkers: form.activeWorkers,
            hashprice: form.hashprice,
            balance: form.balance,
            miningRevenue: form.miningRevenue,
            referralRevenue: form.referralRevenue,
            otherRevenue: form.otherRevenue,
          }),
        },
      );

      const data: ApiResponse<Snapshot> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save snapshot");
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
        `/api/pool-daily-snapshots/${deleteTarget.id}`,
        {
          method: "DELETE",
        },
      );
      const data: ApiResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete snapshot");
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
            Daily Snapshots
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Per-subaccount daily hashrate, efficiency, uptime and revenue
            history.
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
            Add Snapshot
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
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 4 }}>
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
          {dialogMode === "create" ? "Add Snapshot" : "Edit Snapshot"}
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
              label="Uptime (%)"
              value={form.uptime}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, uptime: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Active Workers"
              value={form.activeWorkers}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, activeWorkers: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Hashprice (BTC/PH/s/day)"
              value={form.hashprice}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, hashprice: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Balance (BTC)"
              value={form.balance}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, balance: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Mining Revenue (BTC)"
              value={form.miningRevenue}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, miningRevenue: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Referral Revenue (BTC)"
              value={form.referralRevenue}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  referralRevenue: e.target.value,
                }))
              }
              fullWidth
            />
            <TextField
              label="Other Revenue (BTC)"
              value={form.otherRevenue}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, otherRevenue: e.target.value }))
              }
              fullWidth
              helperText="Total revenue is computed automatically as mining + referral + other"
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
        <DialogTitle>Delete Snapshot</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <Typography>
            Delete the snapshot for{" "}
            <strong>{deleteTarget?.poolSubaccount.subaccountName}</strong> on{" "}
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
