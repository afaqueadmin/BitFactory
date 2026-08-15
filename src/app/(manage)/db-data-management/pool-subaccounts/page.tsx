/**
 * src/app/(manage)/pool-subaccounts/page.tsx
 * Pool Subaccount Records Management Page
 *
 * Admin CRUD for the PoolSubaccount table - our own DB record of a pool
 * account (Luxor subaccount / Braiins account), distinct from the existing
 * "Subaccounts" page which manages live Luxor subaccounts via Luxor's API.
 *
 * Pool/User/PoolAuth are shown read-only here (sourced from their own
 * existing admin pages/APIs) - this page only writes PoolSubaccount rows.
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
} from "@mui/icons-material";

interface PoolOption {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

interface PoolAuthOption {
  id: string;
  authKey: string;
  userId: string;
}

interface PoolSubaccount {
  id: string;
  poolId: string;
  subaccountName: string;
  userId: string | null;
  poolAuthId: string | null;
  currency: string;
  walletAddress: string | null;
  paymentFrequency: string | null;
  dayOfWeek: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pool: { id: string; name: string };
  user: { id: string; name: string | null; email: string } | null;
  _count: {
    dailySnapshots: number;
    workerMetrics: number;
    transactions: number;
  };
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const emptyForm = {
  poolId: "",
  subaccountName: "",
  userId: "",
  poolAuthId: "",
  currency: "BTC",
  walletAddress: "",
  paymentFrequency: "",
  dayOfWeek: "",
};

export default function PoolSubaccountsPage() {
  const [rows, setRows] = useState<PoolSubaccount[]>([]);
  const [pools, setPools] = useState<PoolOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [poolAuths, setPoolAuths] = useState<PoolAuthOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [selected, setSelected] = useState<PoolSubaccount | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<PoolSubaccount | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const [subRes, poolsRes, usersRes] = await Promise.all([
        fetch("/api/pool-subaccounts"),
        fetch("/api/pools"),
        fetch("/api/user/all"),
      ]);

      const subData: ApiResponse<PoolSubaccount[]> = await subRes.json();
      if (!subRes.ok || !subData.success) {
        throw new Error(subData.error || "Failed to fetch pool subaccounts");
      }
      setRows(Array.isArray(subData.data) ? subData.data : []);

      const poolsData: ApiResponse<PoolOption[]> = await poolsRes.json();
      if (poolsRes.ok && poolsData.success) {
        setPools(Array.isArray(poolsData.data) ? poolsData.data : []);
      }

      const usersData = await usersRes.json();
      if (usersRes.ok && usersData.success) {
        setUsers(
          (usersData.users || []).filter(
            (u: { isDeleted: boolean }) => !u.isDeleted,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fetchPoolAuthsForPool = useCallback(async (poolId: string) => {
    if (!poolId) {
      setPoolAuths([]);
      return;
    }
    try {
      const res = await fetch(`/api/pool-auth?poolId=${poolId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setPoolAuths(Array.isArray(data.data) ? data.data : []);
      } else {
        setPoolAuths([]);
      }
    } catch {
      setPoolAuths([]);
    }
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchAll();
  };

  const openCreateDialog = () => {
    setDialogMode("create");
    setSelected(null);
    setForm(emptyForm);
    setPoolAuths([]);
    setDialogMessage(null);
    setDialogOpen(true);
  };

  const openEditDialog = (row: PoolSubaccount) => {
    setDialogMode("edit");
    setSelected(row);
    setForm({
      poolId: row.poolId,
      subaccountName: row.subaccountName,
      userId: row.userId || "",
      poolAuthId: row.poolAuthId || "",
      currency: row.currency,
      walletAddress: row.walletAddress || "",
      paymentFrequency: row.paymentFrequency || "",
      dayOfWeek: row.dayOfWeek || "",
    });
    fetchPoolAuthsForPool(row.poolId);
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
    if (dialogMode === "create" && !form.poolId) {
      setDialogMessage("Pool is required");
      return;
    }
    if (!form.subaccountName.trim()) {
      setDialogMessage("Subaccount name is required");
      return;
    }

    setSubmitting(true);
    setDialogMessage(null);

    try {
      const isEdit = dialogMode === "edit" && selected;
      const response = await fetch(
        isEdit
          ? `/api/pool-subaccounts/${selected!.id}`
          : "/api/pool-subaccounts",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isEdit ? {} : { poolId: form.poolId }),
            subaccountName: form.subaccountName.trim(),
            userId: form.userId || null,
            poolAuthId: form.poolAuthId || null,
            currency: form.currency.trim() || "BTC",
            walletAddress: form.walletAddress.trim() || null,
            paymentFrequency: form.paymentFrequency.trim() || null,
            dayOfWeek: form.dayOfWeek.trim() || null,
          }),
        },
      );

      const data: ApiResponse<PoolSubaccount> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save pool subaccount");
      }

      await fetchAll();
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
      const response = await fetch(`/api/pool-subaccounts/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data: ApiResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete pool subaccount");
      }
      await fetchAll();
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
            Subaccount Records
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Our own DB record of each pool account (Luxor subaccount / Braiins
            account) - the dimension row that daily snapshots, worker metrics
            and transactions attach to.
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
            Add Subaccount
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper elevation={2} sx={{ borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Pool</TableCell>
                <TableCell>Subaccount</TableCell>
                <TableCell>Client</TableCell>
                <TableCell>Currency</TableCell>
                <TableCell>Wallet</TableCell>
                <TableCell align="center">Snapshots</TableCell>
                <TableCell align="center">Worker Days</TableCell>
                <TableCell align="center">Txns</TableCell>
                <TableCell>Last Synced</TableCell>
                <TableCell align="right">Actions</TableCell>
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
                      No pool subaccounts yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Chip label={row.pool.name} size="small" />
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 600, fontFamily: "monospace" }}
                    >
                      {row.subaccountName}
                    </TableCell>
                    <TableCell>
                      {row.user ? (
                        <>
                          {row.user.name || "Unnamed"}
                          <Typography
                            variant="caption"
                            display="block"
                            color="text.secondary"
                          >
                            {row.user.email}
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Unlinked
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{row.currency}</TableCell>
                    <TableCell
                      sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                    >
                      {row.walletAddress || "—"}
                    </TableCell>
                    <TableCell align="center">
                      {row._count.dailySnapshots}
                    </TableCell>
                    <TableCell align="center">
                      {row._count.workerMetrics}
                    </TableCell>
                    <TableCell align="center">
                      {row._count.transactions}
                    </TableCell>
                    <TableCell>
                      {row.lastSyncedAt
                        ? new Date(row.lastSyncedAt).toLocaleString()
                        : "—"}
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
      </Paper>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {dialogMode === "create"
            ? "Add Pool Subaccount"
            : "Edit Pool Subaccount"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogMessage && <Alert severity="error">{dialogMessage}</Alert>}

            <FormControl fullWidth disabled={dialogMode === "edit"}>
              <InputLabel>Pool</InputLabel>
              <Select
                label="Pool"
                value={form.poolId}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    poolId: e.target.value,
                    poolAuthId: "",
                  }));
                  fetchPoolAuthsForPool(e.target.value);
                }}
              >
                {pools.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Subaccount Name"
              value={form.subaccountName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, subaccountName: e.target.value }))
              }
              fullWidth
              helperText="Luxor subaccount name / Braiins username"
            />

            <FormControl fullWidth>
              <InputLabel>Linked Client (optional)</InputLabel>
              <Select
                label="Linked Client (optional)"
                value={form.userId}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, userId: e.target.value }))
                }
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {users.map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.name || "Unnamed"} ({u.email}), {u.role}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth disabled={!form.poolId}>
              <InputLabel>Linked Credential (optional)</InputLabel>
              <Select
                label="Linked Credential (optional)"
                value={form.poolAuthId}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, poolAuthId: e.target.value }))
                }
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {poolAuths.map((pa) => (
                  <MenuItem key={pa.id} value={pa.id}>
                    {pa.authKey}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Currency"
              value={form.currency}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, currency: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Wallet Address"
              value={form.walletAddress}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, walletAddress: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Payment Frequency"
              value={form.paymentFrequency}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  paymentFrequency: e.target.value,
                }))
              }
              fullWidth
              helperText="e.g. DAILY / WEEKLY / MONTHLY"
            />
            <TextField
              label="Day of Week"
              value={form.dayOfWeek}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, dayOfWeek: e.target.value }))
              }
              fullWidth
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
        <DialogTitle>Delete Pool Subaccount</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <Typography>
            Delete <strong>{deleteTarget?.subaccountName}</strong>? This also
            permanently deletes its {deleteTarget?._count.dailySnapshots} daily
            snapshot(s), {deleteTarget?._count.workerMetrics} worker-day
            metric(s) and {deleteTarget?._count.transactions} transaction(s).
            This cannot be undone.
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
