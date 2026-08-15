/**
 * src/app/(manage)/pool-transactions/page.tsx
 * Pool Transactions Management Page
 *
 * Admin CRUD for PoolTransaction - the raw pool-side ledger (payouts, fees,
 * revenue accrual). Paginated and filterable (subaccount, category, type,
 * date range) since this table holds thousands of rows.
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

const emptyForm = {
  poolSubaccountId: "",
  externalTransactionId: "",
  transactionType: "credit",
  category: "",
  amount: "",
  usdEquivalent: "",
  addressName: "",
  status: "",
  occurredAt: "",
};

const fmt = (v: string | null, digits = 8) =>
  v === null
    ? "—"
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });

export default function PoolTransactionsPage() {
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [selected, setSelected] = useState<PoolTransaction | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<PoolTransaction | null>(
    null,
  );
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

  const openCreateDialog = () => {
    setDialogMode("create");
    setSelected(null);
    setForm(emptyForm);
    setDialogMessage(null);
    setDialogOpen(true);
  };

  const openEditDialog = (row: PoolTransaction) => {
    setDialogMode("edit");
    setSelected(row);
    setForm({
      poolSubaccountId: row.poolSubaccountId,
      externalTransactionId: row.externalTransactionId ?? "",
      transactionType: row.transactionType,
      category: row.category ?? "",
      amount: row.amount,
      usdEquivalent: row.usdEquivalent ?? "",
      addressName: row.addressName ?? "",
      status: row.status ?? "",
      occurredAt: row.occurredAt.slice(0, 16),
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
    if (!form.amount) {
      setDialogMessage("Amount is required");
      return;
    }
    if (!form.occurredAt) {
      setDialogMessage("Occurred at is required");
      return;
    }

    setSubmitting(true);
    setDialogMessage(null);

    try {
      const isEdit = dialogMode === "edit" && selected;
      const response = await fetch(
        isEdit
          ? `/api/pool-transactions/${selected!.id}`
          : "/api/pool-transactions",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isEdit ? {} : { poolSubaccountId: form.poolSubaccountId }),
            externalTransactionId: form.externalTransactionId.trim(),
            transactionType: form.transactionType,
            category: form.category.trim(),
            amount: form.amount,
            usdEquivalent: form.usdEquivalent,
            addressName: form.addressName.trim(),
            status: form.status.trim(),
            occurredAt: new Date(form.occurredAt).toISOString(),
          }),
        },
      );

      const data: ApiResponse<PoolTransaction> = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save transaction");
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
        `/api/pool-transactions/${deleteTarget.id}`,
        {
          method: "DELETE",
        },
      );
      const data: ApiResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete transaction");
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
            Pool Transactions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Raw pool-side transaction ledger (revenue accrual, payouts, fees).
            Deduped on (subaccount, date, category, type, amount) since Luxor
            leaves the transaction ID blank on most accrual rows.
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
            Add Transaction
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper elevation={1} sx={{ p: 2, mb: 2, borderRadius: 2 }}>
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

      <Paper elevation={2} sx={{ borderRadius: 2 }}>
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
                      <Chip
                        label={row.poolSubaccount.pool.name}
                        size="small"
                        sx={{ mr: 1 }}
                      />
                      {row.poolSubaccount.subaccountName}
                    </TableCell>
                    <TableCell>{row.category || "—"}</TableCell>
                    <TableCell>
                      <Chip
                        label={row.transactionType}
                        size="small"
                        color={
                          row.transactionType === "credit"
                            ? "success"
                            : "default"
                        }
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">{fmt(row.amount)}</TableCell>
                    <TableCell align="right">
                      {fmt(row.usdEquivalent, 2)}
                    </TableCell>
                    <TableCell
                      sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}
                    >
                      {row.addressName || "—"}
                    </TableCell>
                    <TableCell>{row.status || "—"}</TableCell>
                    <TableCell
                      sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}
                    >
                      {row.externalTransactionId
                        ? `${row.externalTransactionId.slice(0, 10)}...`
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
          {dialogMode === "create" ? "Add Transaction" : "Edit Transaction"}
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
              label="Occurred At"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={form.occurredAt}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, occurredAt: e.target.value }))
              }
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                label="Type"
                value={form.transactionType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    transactionType: e.target.value,
                  }))
                }
              >
                <MenuItem value="credit">credit</MenuItem>
                <MenuItem value="debit">debit</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Category"
              value={form.category}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, category: e.target.value }))
              }
              fullWidth
              helperText="e.g. Miner Revenue, LuxOS Rebate, Transaction Fee, Payment, Payout"
            />
            <TextField
              label="Amount (BTC)"
              value={form.amount}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, amount: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="USD Equivalent"
              value={form.usdEquivalent}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, usdEquivalent: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Address / Wallet"
              value={form.addressName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, addressName: e.target.value }))
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
              helperText="Braiins payout status: queued / confirmed / failed"
            />
            <TextField
              label="External Transaction ID"
              value={form.externalTransactionId}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  externalTransactionId: e.target.value,
                }))
              }
              fullWidth
              helperText="Blank for most Luxor accrual rows - only Payment/Transaction Fee/payouts have one"
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
        <DialogTitle>Delete Transaction</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <Typography>
            Delete this <strong>{deleteTarget?.category}</strong> transaction of{" "}
            <strong>{deleteTarget?.amount} BTC</strong> for{" "}
            <strong>{deleteTarget?.poolSubaccount.subaccountName}</strong>? This
            cannot be undone.
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
