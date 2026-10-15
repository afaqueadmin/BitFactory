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
  Chip,
  Tooltip,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Send as SendIcon,
} from "@mui/icons-material";

interface LoginEntry {
  id: string;
  email: string;
  isPrimary: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
  passkeyCount: number;
}

interface LoginEmailsSectionProps {
  customerId: string;
  /** Compact heading and copy, for use inside a dialog (Edit Customer). */
  dense?: boolean;
}

/**
 * The emails a customer's account can be signed into with. A client account
 * can have a second one for another person (e.g. their accountant), with its
 * own password and 2FA. Adding one emails it a link to choose a password.
 *
 * Every action here is saved straight away through /api/user/[id]/logins -
 * it never relies on an enclosing form's submit, so it can sit inside one.
 */
export default function LoginEmailsSection({
  customerId,
  dense = false,
}: LoginEmailsSectionProps) {
  const [logins, setLogins] = useState<LoginEntry[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [maxLogins, setMaxLogins] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoginEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/user/${customerId}/logins`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load sign-in emails");
      }
      setLogins(data.logins);
      setCanManage(data.canManage);
      setMaxLogins(data.maxLogins);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load sign-in emails",
      );
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      const post = (releaseFromDeleted: boolean) =>
        fetch(`/api/user/${customerId}/logins`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: formEmail, releaseFromDeleted }),
        });
      let res = await post(false);
      let data = await res.json();
      // The email belongs to a deleted account - it can be taken from it.
      if (res.status === 409 && data.code === "HELD_BY_DELETED_ACCOUNT") {
        if (
          !window.confirm(
            `This email belongs to deleted account "${data.deletedAccountName}". Use it here anyway? The deleted account will lose it.`,
          )
        ) {
          return;
        }
        res = await post(true);
        data = await res.json();
      }
      if (!res.ok) throw new Error(data.error || "Failed to add email");
      setNotice(data.message);
      setFormOpen(false);
      setFormEmail("");
      await fetchData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add email");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (login: LoginEntry) => {
    setBusyId(login.id);
    setError(null);
    try {
      const res = await fetch(`/api/user/${customerId}/logins`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: login.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send the link");
      setNotice(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send the link");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/user/${customerId}/logins?loginId=${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove email");
      setNotice(data.message);
      setDeleteTarget(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove email");
    } finally {
      setBusyId(null);
    }
  };

  const canAdd = canManage && !loading && logins.length < maxLogins;

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1 }}
      >
        <Typography variant={dense ? "subtitle1" : "h6"} fontWeight="600">
          Sign-in Emails
        </Typography>
        {canAdd && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => {
              setFormOpen(true);
              setFormError(null);
            }}
          >
            Add Second Email
          </Button>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {dense
          ? "A second email signs in separately with its own password and 2FA, and is CC'd on invoices. Changes here are saved immediately, not with Update."
          : "Each email signs in separately, with its own password and two-factor authentication, and has full access to this account. Invoices go to the primary email; a second email is CC'd."}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setNotice(null)}
        >
          {notice}
        </Alert>
      )}

      {formOpen && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}
            {/* Not type="email": inside the Edit Customer form, the browser
                would block that form's Update over a half-typed address.
                The server validates the format. */}
            <TextField
              label="Email"
              inputMode="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              onKeyDown={(e) => {
                // Enter adds the email; it must not submit an enclosing form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!submitting && formEmail.trim()) handleAdd();
                }
              }}
              helperText="We'll email this address a link to choose its password. It sets up two-factor authentication at its first sign-in."
              fullWidth
              autoFocus
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button
                variant="contained"
                onClick={handleAdd}
                disabled={submitting || !formEmail.trim()}
              >
                {submitting ? "Adding..." : "Add and Send Link"}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Email</TableCell>
              <TableCell>2FA</TableCell>
              <TableCell>Passkeys</TableCell>
              <TableCell>Last Sign-in</TableCell>
              {canManage && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : (
              logins.map((login) => (
                <TableRow key={login.id}>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" fontWeight={600}>
                        {login.email}
                      </Typography>
                      <Chip
                        size="small"
                        label={login.isPrimary ? "Primary" : "Secondary"}
                        color={login.isPrimary ? "primary" : "default"}
                        variant="outlined"
                      />
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={login.twoFactorEnabled ? "On" : "Off"}
                      color={login.twoFactorEnabled ? "success" : "default"}
                    />
                  </TableCell>
                  <TableCell>{login.passkeyCount}</TableCell>
                  <TableCell>
                    {login.lastLoginAt
                      ? new Date(login.lastLoginAt).toLocaleString()
                      : login.isPrimary
                        ? "-"
                        : "Not yet (invite sent)"}
                  </TableCell>
                  {canManage && (
                    <TableCell align="right">
                      {!login.isPrimary && (
                        <>
                          <Tooltip title="Send a new link to choose a password">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleResend(login)}
                                disabled={busyId === login.id}
                              >
                                <SendIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Remove this sign-in email">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => setDeleteTarget(login)}
                                disabled={busyId === login.id}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  )}
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
              <Button
                size="small"
                color="error"
                onClick={handleDelete}
                disabled={busyId === deleteTarget.id}
              >
                Remove
              </Button>
            </Stack>
          }
        >
          Remove {deleteTarget.email}? It will be signed out and can no longer
          sign in to this account.
        </Alert>
      )}
    </Box>
  );
}
