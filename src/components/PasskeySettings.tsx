"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import AddIcon from "@mui/icons-material/Add";
import { isWebAuthnSupported } from "@/lib/webauthn/utils";
import { registerPasskey, getPasskeys } from "@/lib/webauthn/registration";

interface Credential {
  id: string;
  credentialName: string;
  createdAt: string;
  lastUsedAt: string | null;
  transports?: string[];
  aaguid?: string;
}

export default function PasskeySettings(): React.ReactNode {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [webAuthnSupported, setWebAuthnSupported] = useState(false);

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCredential, setSelectedCredential] =
    useState<Credential | null>(null);
  const [newCredentialName, setNewCredentialName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setWebAuthnSupported(isWebAuthnSupported());
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getPasskeys();

      if (result.success && result.credentials) {
        setCredentials(result.credentials);
      } else {
        setError(result.error || "Failed to load passkeys");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load passkeys");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPasskey = async () => {
    if (!newCredentialName.trim()) {
      setError("Please enter a name for your passkey");
      return;
    }

    setRegistering(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await registerPasskey(newCredentialName);

      if (result.success) {
        setSuccess("Passkey registered successfully!");
        setNewCredentialName("");
        setAddDialogOpen(false);
        // Reload credentials list
        await loadCredentials();
      } else {
        setError(result.error || "Failed to register passkey");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred during registration",
      );
    } finally {
      setRegistering(false);
    }
  };

  const handleRenamePasskey = async () => {
    if (!selectedCredential || !newCredentialName.trim()) {
      setError("Please enter a new name");
      return;
    }

    setRenaming(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/webauthn/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId: selectedCredential.id,
          credentialName: newCredentialName,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to rename credential");
      }

      setSuccess("Passkey renamed successfully!");
      setEditDialogOpen(false);
      setSelectedCredential(null);
      setNewCredentialName("");
      await loadCredentials();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to rename credential",
      );
    } finally {
      setRenaming(false);
    }
  };

  const handleDeletePasskey = async () => {
    if (!selectedCredential) return;

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/auth/webauthn/credentials?id=${selectedCredential.id}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete credential");
      }

      setSuccess("Passkey deleted successfully!");
      setDeleteDialogOpen(false);
      setSelectedCredential(null);
      await loadCredentials();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete credential",
      );
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Unknown";
    }
  };

  if (!webAuthnSupported) {
    return (
      <Paper
        elevation={3}
        sx={{
          p: { xs: 2, sm: 4 },
          mb: 4,
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
              : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
          backdropFilter: "blur(10px)",
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <FingerprintIcon />
          <Typography variant="h6" fontWeight="medium">
            Passkeys
          </Typography>
        </Box>
        <Alert severity="info">
          Passkey login is not supported in your browser. Please use the latest
          version of Chrome, Firefox, Safari, or Edge.
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={3}
      sx={{
        p: { xs: 2, sm: 4 },
        mb: 4,
        borderRadius: 2,
        background: (theme) =>
          theme.palette.mode === "dark"
            ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
            : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
        backdropFilter: "blur(10px)",
        border: (theme) => `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 3,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FingerprintIcon />
          <Typography variant="h6" fontWeight="medium">
            Passkeys
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setAddDialogOpen(true);
            setNewCredentialName("");
            setError(null);
          }}
        >
          Add Passkey
        </Button>
      </Box>

      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
        Manage your passkeys for secure, passwordless login using biometrics or
        security keys.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : credentials.length === 0 ? (
        <Alert severity="info">
          No passkeys registered yet. Add one to enable passwordless login.
        </Alert>
      ) : (
        <TableContainer>
          <Table sx={{ minWidth: 500 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: "action.hover" }}>
                <TableCell>Name</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Last Used</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {credentials.map((credential) => (
                <TableRow key={credential.id} hover>
                  <TableCell>{credential.credentialName}</TableCell>
                  <TableCell>{formatDate(credential.createdAt)}</TableCell>
                  <TableCell>
                    {credential.lastUsedAt
                      ? formatDate(credential.lastUsedAt)
                      : "Never"}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Rename">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedCredential(credential);
                          setNewCredentialName(credential.credentialName);
                          setEditDialogOpen(true);
                          setError(null);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => {
                          setSelectedCredential(credential);
                          setDeleteDialogOpen(true);
                          setError(null);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add Passkey Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add New Passkey</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <TextField
              autoFocus
              fullWidth
              label="Passkey Name"
              placeholder="e.g., My iPhone, Office Yubikey"
              value={newCredentialName}
              onChange={(e) => setNewCredentialName(e.target.value)}
              disabled={registering}
              helperText="Give your passkey a friendly name to identify it"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setAddDialogOpen(false)}
            disabled={registering}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddPasskey}
            variant="contained"
            disabled={registering || !newCredentialName.trim()}
          >
            {registering ? <CircularProgress size={24} /> : "Register"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Passkey Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename Passkey</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              autoFocus
              fullWidth
              label="Passkey Name"
              value={newCredentialName}
              onChange={(e) => setNewCredentialName(e.target.value)}
              disabled={renaming}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={renaming}>
            Cancel
          </Button>
          <Button
            onClick={handleRenamePasskey}
            variant="contained"
            disabled={renaming || !newCredentialName.trim()}
          >
            {renaming ? <CircularProgress size={24} /> : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Passkey Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Passkey</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;
            {selectedCredential?.credentialName}&quot;? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeletePasskey}
            variant="contained"
            color="error"
            disabled={deleting}
          >
            {deleting ? <CircularProgress size={24} /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
