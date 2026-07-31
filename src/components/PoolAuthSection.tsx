"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Stack,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";

interface PoolOption {
  id: string;
  name: string;
}

interface PoolAuthEntry {
  id: string;
  poolId: string;
  authKey: string;
  updatedAt: string;
  pool: { id: string; name: string };
}

interface PoolAuthSectionProps {
  customerId: string;
}

export default function PoolAuthSection({ customerId }: PoolAuthSectionProps) {
  const [poolAuths, setPoolAuths] = useState<PoolAuthEntry[]>([]);
  const [pools, setPools] = useState<PoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PoolAuthEntry | null>(null);
  const [formPoolId, setFormPoolId] = useState("");
  const [formAuthKey, setFormAuthKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PoolAuthEntry | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [poolAuthRes, poolsRes] = await Promise.all([
        fetch(`/api/pool-auth?userId=${customerId}`),
        fetch("/api/pools"),
      ]);

      const poolAuthData = await poolAuthRes.json();
      const poolsData = await poolsRes.json();

      if (!poolAuthRes.ok || !poolAuthData.success) {
        throw new Error(
          poolAuthData.error || "Failed to fetch pool credentials",
        );
      }

      setPoolAuths(Array.isArray(poolAuthData.data) ? poolAuthData.data : []);
      setPools(
        poolsData.success && Array.isArray(poolsData.data)
          ? poolsData.data
          : [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const poolsWithoutCredential = pools.filter(
    (p) => !poolAuths.some((pa) => pa.poolId === p.id),
  );

  const openAddForm = () => {
    setEditing(null);
    setFormPoolId("");
    setFormAuthKey("");
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (entry: PoolAuthEntry) => {
    setEditing(entry);
    setFormPoolId(entry.poolId);
    setFormAuthKey(entry.authKey);
    setFormError(null);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!editing && !formPoolId) {
      setFormError("Please select a pool");
      return;
    }
    if (!formAuthKey.trim()) {
      setFormError("Auth key / subaccount name is required");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = editing
        ? await fetch(`/api/pool-auth/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ authKey: formAuthKey.trim() }),
          })
        : await fetch("/api/pool-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              poolId: formPoolId,
              userId: customerId,
              authKey: formAuthKey.trim(),
            }),
          });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save credential");
      }

      await fetchData();
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Unknown error occurred",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const response = await fetch(`/api/pool-auth/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to remove credential");
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Typography variant="h6" fontWeight="600">
          Pool Authentication
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={openAddForm}
        >
          Add Credential
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {formOpen && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}
            {editing ? (
              <TextField
                label="Pool"
                value={editing.pool.name}
                disabled
                fullWidth
              />
            ) : (
              <FormControl fullWidth>
                <InputLabel>Pool</InputLabel>
                <Select
                  label="Pool"
                  value={formPoolId}
                  onChange={(e) => setFormPoolId(e.target.value)}
                >
                  {poolsWithoutCredential.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              label="Auth Key / Subaccount Name"
              value={formAuthKey}
              onChange={(e) => setFormAuthKey(e.target.value)}
              fullWidth
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Saving..." : "Save"}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Pool</TableCell>
              <TableCell>Auth Key</TableCell>
              <TableCell>Last Updated</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : poolAuths.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                  <Typography color="text.secondary" variant="body2">
                    No pool credentials configured for this client yet.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              poolAuths.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {entry.pool.name}
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace" }}>
                    {entry.authKey}
                  </TableCell>
                  <TableCell>
                    {new Date(entry.updatedAt).toLocaleString()}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => openEditForm(entry)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setDeleteTarget(entry)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {deleteTarget && (
        <Alert
          severity="warning"
          sx={{ mt: 2 }}
          action={
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button size="small" color="error" onClick={handleDelete}>
                Remove
              </Button>
            </Stack>
          }
        >
          Remove {deleteTarget.pool.name} credential for this client?
        </Alert>
      )}
    </Box>
  );
}
