/**
 * src/app/(manage)/pools/page.tsx
 * Mining Pools Management Page
 *
 * Admin page for managing the mining pool catalog (Luxor, Braiins, etc.)
 * and each client's authentication credential for a given pool.
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
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Group as GroupIcon,
} from "@mui/icons-material";

interface Pool {
  id: string;
  name: string;
  apiUrl: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PoolAuthEntry {
  id: string;
  poolId: string;
  userId: string;
  authKey: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string };
}

interface ClientOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const emptyPoolForm = { name: "", apiUrl: "", description: "" };

export default function PoolsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pool create/edit dialog
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  const [poolDialogMode, setPoolDialogMode] = useState<"create" | "edit">(
    "create",
  );
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [poolForm, setPoolForm] = useState(emptyPoolForm);
  const [poolSubmitting, setPoolSubmitting] = useState(false);
  const [poolDialogMessage, setPoolDialogMessage] = useState<string | null>(
    null,
  );

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Pool | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Clients dialog (PoolAuth management) for a selected pool
  const [clientsDialogPool, setClientsDialogPool] = useState<Pool | null>(null);
  const [poolAuths, setPoolAuths] = useState<PoolAuthEntry[]>([]);
  const [poolAuthsLoading, setPoolAuthsLoading] = useState(false);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);

  // Add/edit credential form (within clients dialog)
  const [credentialFormOpen, setCredentialFormOpen] = useState(false);
  const [editingCredential, setEditingCredential] =
    useState<PoolAuthEntry | null>(null);
  const [credentialUserId, setCredentialUserId] = useState("");
  const [credentialAuthKey, setCredentialAuthKey] = useState("");
  const [credentialSubmitting, setCredentialSubmitting] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState<string | null>(
    null,
  );
  const [credentialDeleteTarget, setCredentialDeleteTarget] =
    useState<PoolAuthEntry | null>(null);

  const fetchPools = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/pools");
      const data: ApiResponse<Pool[]> = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch pools");
      }

      setPools(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchPools();
  };

  // --- Pool CRUD ---

  const openCreatePoolDialog = () => {
    setPoolDialogMode("create");
    setSelectedPool(null);
    setPoolForm(emptyPoolForm);
    setPoolDialogMessage(null);
    setPoolDialogOpen(true);
  };

  const openEditPoolDialog = (pool: Pool) => {
    setPoolDialogMode("edit");
    setSelectedPool(pool);
    setPoolForm({
      name: pool.name,
      apiUrl: pool.apiUrl,
      description: pool.description || "",
    });
    setPoolDialogMessage(null);
    setPoolDialogOpen(true);
  };

  const closePoolDialog = () => {
    setPoolDialogOpen(false);
    setSelectedPool(null);
    setPoolForm(emptyPoolForm);
    setPoolDialogMessage(null);
  };

  const handleSubmitPool = async () => {
    if (!poolForm.name.trim()) {
      setPoolDialogMessage("Pool name is required");
      return;
    }
    if (!poolForm.apiUrl.trim()) {
      setPoolDialogMessage("API URL is required");
      return;
    }

    setPoolSubmitting(true);
    setPoolDialogMessage(null);

    try {
      const isEdit = poolDialogMode === "edit" && selectedPool;
      const response = await fetch(
        isEdit ? `/api/pools/${selectedPool!.id}` : "/api/pools",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: poolForm.name.trim(),
            apiUrl: poolForm.apiUrl.trim(),
            description: poolForm.description.trim() || null,
          }),
        },
      );

      const data: ApiResponse<Pool> = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save pool");
      }

      await fetchPools();
      closePoolDialog();
    } catch (err) {
      setPoolDialogMessage(
        err instanceof Error ? err.message : "Unknown error occurred",
      );
    } finally {
      setPoolSubmitting(false);
    }
  };

  const handleDeletePool = async () => {
    if (!deleteTarget) return;

    setDeleteSubmitting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/pools/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete pool");
      }

      await fetchPools();
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Unknown error occurred",
      );
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // --- PoolAuth (client credentials) management ---

  const openClientsDialog = async (pool: Pool) => {
    setClientsDialogPool(pool);
    setPoolAuthsLoading(true);
    setCredentialFormOpen(false);
    setEditingCredential(null);
    setCredentialMessage(null);

    try {
      const [poolAuthRes, clientsRes] = await Promise.all([
        fetch(`/api/pool-auth?poolId=${pool.id}`),
        clientOptions.length ? Promise.resolve(null) : fetch("/api/user/all"),
      ]);

      const poolAuthData: ApiResponse<PoolAuthEntry[]> =
        await poolAuthRes.json();
      if (poolAuthRes.ok && poolAuthData.success) {
        setPoolAuths(Array.isArray(poolAuthData.data) ? poolAuthData.data : []);
      } else {
        setPoolAuths([]);
      }

      if (clientsRes) {
        const clientsData = await clientsRes.json();
        if (clientsRes.ok && clientsData.success) {
          const options: ClientOption[] = (clientsData.users || [])
            .filter(
              (u: { role: string; isDeleted: boolean }) =>
                !u.isDeleted &&
                (u.role === "CLIENT" || u.role === "FRANCHISEE"),
            )
            .map(
              (u: {
                id: string;
                name: string;
                email: string;
                role: string;
              }) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
              }),
            );
          setClientOptions(options);
        }
      }
    } catch {
      setPoolAuths([]);
    } finally {
      setPoolAuthsLoading(false);
    }
  };

  const closeClientsDialog = () => {
    setClientsDialogPool(null);
    setPoolAuths([]);
    setCredentialFormOpen(false);
    setEditingCredential(null);
  };

  const refreshPoolAuths = async () => {
    if (!clientsDialogPool) return;
    const res = await fetch(`/api/pool-auth?poolId=${clientsDialogPool.id}`);
    const data: ApiResponse<PoolAuthEntry[]> = await res.json();
    if (res.ok && data.success) {
      setPoolAuths(Array.isArray(data.data) ? data.data : []);
    }
  };

  const openAddCredentialForm = () => {
    setEditingCredential(null);
    setCredentialUserId("");
    setCredentialAuthKey("");
    setCredentialMessage(null);
    setCredentialFormOpen(true);
  };

  const openEditCredentialForm = (entry: PoolAuthEntry) => {
    setEditingCredential(entry);
    setCredentialUserId(entry.userId);
    setCredentialAuthKey(entry.authKey);
    setCredentialMessage(null);
    setCredentialFormOpen(true);
  };

  const handleSubmitCredential = async () => {
    if (!editingCredential && !credentialUserId) {
      setCredentialMessage("Please select a client");
      return;
    }
    if (!credentialAuthKey.trim()) {
      setCredentialMessage("Auth key / subaccount name is required");
      return;
    }
    if (!clientsDialogPool) return;

    setCredentialSubmitting(true);
    setCredentialMessage(null);

    try {
      const response = editingCredential
        ? await fetch(`/api/pool-auth/${editingCredential.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ authKey: credentialAuthKey.trim() }),
          })
        : await fetch("/api/pool-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              poolId: clientsDialogPool.id,
              userId: credentialUserId,
              authKey: credentialAuthKey.trim(),
            }),
          });

      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save credential");
      }

      await refreshPoolAuths();
      setCredentialFormOpen(false);
      setEditingCredential(null);
    } catch (err) {
      setCredentialMessage(
        err instanceof Error ? err.message : "Unknown error occurred",
      );
    } finally {
      setCredentialSubmitting(false);
    }
  };

  const handleDeleteCredential = async () => {
    if (!credentialDeleteTarget) return;

    try {
      const response = await fetch(
        `/api/pool-auth/${credentialDeleteTarget.id}`,
        { method: "DELETE" },
      );
      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to remove credential");
      }

      await refreshPoolAuths();
      setCredentialDeleteTarget(null);
    } catch (err) {
      setCredentialMessage(
        err instanceof Error ? err.message : "Unknown error occurred",
      );
      setCredentialDeleteTarget(null);
    }
  };

  const clientsWithoutCredential = clientOptions.filter(
    (c) => !poolAuths.some((pa) => pa.userId === c.id),
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Mining Pools
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage the pool catalog and each client&apos;s pool authentication
            credential.
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
            onClick={openCreatePoolDialog}
          >
            Add Pool
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
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>API URL</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : pools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No pools configured yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                pools.map((pool) => (
                  <TableRow key={pool.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{pool.name}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace" }}>
                      {pool.apiUrl}
                    </TableCell>
                    <TableCell>{pool.description || "—"}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Manage client credentials">
                        <IconButton
                          size="small"
                          onClick={() => openClientsDialog(pool)}
                        >
                          <GroupIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit pool">
                        <IconButton
                          size="small"
                          onClick={() => openEditPoolDialog(pool)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete pool">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(pool);
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Create/Edit Pool Dialog */}
      <Dialog
        open={poolDialogOpen}
        onClose={closePoolDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {poolDialogMode === "create" ? "Add Pool" : "Edit Pool"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {poolDialogMessage && (
              <Alert severity="error">{poolDialogMessage}</Alert>
            )}
            <TextField
              label="Name"
              value={poolForm.name}
              onChange={(e) =>
                setPoolForm((prev) => ({ ...prev, name: e.target.value }))
              }
              fullWidth
              autoFocus
            />
            <TextField
              label="API URL"
              value={poolForm.apiUrl}
              onChange={(e) =>
                setPoolForm((prev) => ({ ...prev, apiUrl: e.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Description"
              value={poolForm.description}
              onChange={(e) =>
                setPoolForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              fullWidth
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closePoolDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmitPool}
            disabled={poolSubmitting}
          >
            {poolSubmitting ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Pool Confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Pool</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <Typography>
            Are you sure you want to delete{" "}
            <strong>{deleteTarget?.name}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDeletePool}
            disabled={deleteSubmitting}
          >
            {deleteSubmitting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manage Client Credentials Dialog */}
      <Dialog
        open={!!clientsDialogPool}
        onClose={closeClientsDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {clientsDialogPool?.name} — Client Credentials
        </DialogTitle>
        <DialogContent>
          <Stack
            direction="row"
            justifyContent="flex-end"
            sx={{ mb: 2, mt: 1 }}
          >
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={openAddCredentialForm}
            >
              Add Client Credential
            </Button>
          </Stack>

          {credentialFormOpen && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
              <Stack spacing={2}>
                {credentialMessage && (
                  <Alert severity="error">{credentialMessage}</Alert>
                )}
                {editingCredential ? (
                  <TextField
                    label="Client"
                    value={`${editingCredential.user.name || "Unknown"} <${editingCredential.user.email}>`}
                    disabled
                    fullWidth
                  />
                ) : (
                  <FormControl fullWidth>
                    <InputLabel>Client</InputLabel>
                    <Select
                      label="Client"
                      value={credentialUserId}
                      onChange={(e) => setCredentialUserId(e.target.value)}
                    >
                      {clientsWithoutCredential.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name || "Unnamed"} ({c.email})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                <TextField
                  label="Auth Key / Subaccount Name"
                  value={credentialAuthKey}
                  onChange={(e) => setCredentialAuthKey(e.target.value)}
                  fullWidth
                  helperText="Luxor subaccount name, Braiins API token, etc."
                />
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button onClick={() => setCredentialFormOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleSubmitCredential}
                    disabled={credentialSubmitting}
                  >
                    {credentialSubmitting ? "Saving..." : "Save"}
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          )}

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Client</TableCell>
                  <TableCell>Auth Key</TableCell>
                  <TableCell>Last Updated</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {poolAuthsLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : poolAuths.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                      <Typography color="text.secondary" variant="body2">
                        No clients configured for this pool yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  poolAuths.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {entry.user.name || "Unnamed"}
                        <Typography
                          variant="caption"
                          display="block"
                          color="text.secondary"
                        >
                          {entry.user.email}
                        </Typography>
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
                          onClick={() => openEditCredentialForm(entry)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setCredentialDeleteTarget(entry)}
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
        </DialogContent>
        <DialogActions>
          <Button onClick={closeClientsDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Credential Confirmation */}
      <Dialog
        open={!!credentialDeleteTarget}
        onClose={() => setCredentialDeleteTarget(null)}
      >
        <DialogTitle>Remove Credential</DialogTitle>
        <DialogContent>
          <Typography>
            Remove{" "}
            {credentialDeleteTarget?.user.name ||
              credentialDeleteTarget?.user.email}
            &apos;s credential for {clientsDialogPool?.name}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCredentialDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDeleteCredential}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
