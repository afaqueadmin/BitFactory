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
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

interface Credential {
  id: string;
  credentialName: string;
  createdAt: string;
  lastUsedAt: string | null;
  transports?: string[];
  aaguid?: string;
}

export default function PasskeySettings({
  daylight = false,
}: {
  daylight?: boolean;
} = {}): React.ReactNode {
  const { d, fonts } = useDaylight();
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

  // Dialogs (add/rename/delete) are left on default MUI styling in both
  // variants - they're genuine overlays, not the page's primary content.
  const addDialog = (
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
        <Button onClick={() => setAddDialogOpen(false)} disabled={registering}>
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
  );

  const editDialog = (
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
  );

  const deleteDialog = (
    <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
      <DialogTitle>Delete Passkey</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete &quot;
          {selectedCredential?.credentialName}&quot;? This action cannot be
          undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
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
  );

  if (!daylight) {
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
            Passkey login is not supported in your browser. Please use the
            latest version of Chrome, Firefox, Safari, or Edge.
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
          Manage your passkeys for secure, passwordless login using biometrics
          or security keys.
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

        {addDialog}
        {editDialog}
        {deleteDialog}
      </Paper>
    );
  }

  const cardSx = {
    bgcolor: d.surface,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS_CARD,
    boxShadow: d.shadow,
    p: { xs: 2.5, sm: 4 },
  };

  const alertSx = (tone: "info" | "success" | "error") => ({
    borderRadius: "8px",
    bgcolor:
      tone === "success" ? d.mint : tone === "error" ? d.dangerSoft : d.skySoft,
    color:
      tone === "success" ? d.success : tone === "error" ? d.danger : d.action,
    fontFamily: fonts.body,
    "& .MuiAlert-icon": {
      color:
        tone === "success" ? d.success : tone === "error" ? d.danger : d.action,
    },
  });

  const primaryBtnSx = {
    textTransform: "none",
    fontFamily: fonts.body,
    fontWeight: 650,
    borderRadius: "8px",
    minHeight: 40,
    bgcolor: d.action,
    color: "#fff",
    boxShadow: "none",
    "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
  } as const;

  const headerCellSx = {
    fontFamily: fonts.body,
    fontWeight: 600,
    fontSize: 10,
    letterSpacing: ".015em",
    textTransform: "uppercase" as const,
    color: d.muted,
    borderBottomColor: d.border,
  };

  if (!webAuthnSupported) {
    return (
      <Box sx={cardSx}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <FingerprintIcon sx={{ color: d.text }} />
          <Typography
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 700,
              fontSize: 18,
              color: d.text,
            }}
          >
            Passkeys
          </Typography>
        </Box>
        <Alert sx={alertSx("info")}>
          Passkey login is not supported in your browser. Please use the latest
          version of Chrome, Firefox, Safari, or Edge.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={cardSx}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 2,
          mb: 3,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FingerprintIcon sx={{ color: d.text }} />
          <Typography
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 700,
              fontSize: 18,
              color: d.text,
            }}
          >
            Passkeys
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon sx={{ fontSize: 18 }} />}
          onClick={() => {
            setAddDialogOpen(true);
            setNewCredentialName("");
            setError(null);
          }}
          sx={primaryBtnSx}
        >
          Add Passkey
        </Button>
      </Box>

      <Typography
        sx={{ fontFamily: fonts.body, fontSize: 13, color: d.muted, mb: 3 }}
      >
        Manage your passkeys for secure, passwordless login using biometrics or
        security keys.
      </Typography>

      {error && <Alert sx={{ mb: 2, ...alertSx("error") }}>{error}</Alert>}

      {success && (
        <Alert sx={{ mb: 2, ...alertSx("success") }}>{success}</Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress sx={{ color: d.action }} />
        </Box>
      ) : credentials.length === 0 ? (
        <Alert sx={alertSx("info")}>
          No passkeys registered yet. Add one to enable passwordless login.
        </Alert>
      ) : (
        <TableContainer>
          <Table sx={{ minWidth: { xs: 280, sm: 500 } }}>
            <TableHead sx={{ backgroundColor: d.tableHead }}>
              <TableRow>
                <TableCell sx={headerCellSx}>Name</TableCell>
                <TableCell
                  sx={{
                    ...headerCellSx,
                    display: { xs: "none", sm: "table-cell" },
                  }}
                >
                  Created
                </TableCell>
                <TableCell
                  sx={{
                    ...headerCellSx,
                    display: { xs: "none", sm: "table-cell" },
                  }}
                >
                  Last Used
                </TableCell>
                <TableCell align="right" sx={headerCellSx}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {credentials.map((credential) => (
                <TableRow
                  key={credential.id}
                  hover
                  sx={{
                    "&:hover": { backgroundColor: d.hover },
                    "& .MuiTableCell-root": {
                      borderBottomColor: d.border,
                      fontFamily: fonts.body,
                    },
                  }}
                >
                  <TableCell
                    sx={{ fontSize: 13, color: d.text, fontWeight: 600 }}
                  >
                    {credential.credentialName}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontSize: 12,
                      color: d.muted,
                      display: { xs: "none", sm: "table-cell" },
                    }}
                  >
                    {formatDate(credential.createdAt)}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontSize: 12,
                      color: d.muted,
                      display: { xs: "none", sm: "table-cell" },
                    }}
                  >
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
                        sx={{
                          color: d.muted,
                          "&:hover": { color: d.action, bgcolor: d.hover },
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedCredential(credential);
                          setDeleteDialogOpen(true);
                          setError(null);
                        }}
                        sx={{
                          color: d.muted,
                          "&:hover": { color: d.danger, bgcolor: d.dangerSoft },
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

      {addDialog}
      {editDialog}
      {deleteDialog}
    </Box>
  );
}
