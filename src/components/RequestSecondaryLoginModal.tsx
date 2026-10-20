"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useCreateSecondaryLoginRequest } from "@/lib/hooks/useSecondaryLoginRequests";
import { useUser } from "@/lib/hooks/useUser";

interface RequestSecondaryLoginModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * A client asks for a second sign-in email on their account, for an admin
 * to approve (POST /api/secondary-login-requests).
 */
export default function RequestSecondaryLoginModal({
  open,
  onClose,
}: RequestSecondaryLoginModalProps) {
  const createRequest = useCreateSecondaryLoginRequest();
  const { user } = useUser();
  // Simulated accounts see the form but can't submit it.
  const isSimulated = user?.role === "SIMULATED";
  const requires2fa = !!user?.twoFactorEnabled;

  const [requestedEmail, setRequestedEmail] = useState("");
  const [reason, setReason] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = () => {
    setRequestedEmail("");
    setReason("");
    setCurrentPassword("");
    setTwoFactorToken("");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    const trimmed = requestedEmail.trim();
    if (!trimmed) {
      setError("The email to add is required");
      return;
    }
    if (requires2fa && !twoFactorToken.trim()) {
      setError("A 2FA code is required to request a second sign-in email");
      return;
    }
    if (!requires2fa && !currentPassword) {
      setError(
        "Your current password is required to request a second sign-in email",
      );
      return;
    }
    try {
      await createRequest.mutateAsync({
        requestedEmail: trimmed,
        reason: reason.trim() || undefined,
        currentPassword: requires2fa ? undefined : currentPassword,
        twoFactorToken: requires2fa ? twoFactorToken.trim() : undefined,
      });
      resetAndClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit the request",
      );
    }
  };

  return (
    <Dialog open={open} onClose={resetAndClose} maxWidth="sm" fullWidth>
      <DialogTitle>Request a Second Sign-in Email</DialogTitle>
      <DialogContent>
        {isSimulated && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Not available on simulated accounts.
          </Alert>
        )}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Alert severity="info">
            A second person (for example an accountant or a partner) can sign in
            to this account with their own email and password. An admin reviews
            this request; once approved, that email gets a link to choose its
            password.
          </Alert>

          <TextField
            label="Email to add"
            type="email"
            value={requestedEmail}
            onChange={(e) => setRequestedEmail(e.target.value)}
            fullWidth
            required
            inputProps={{ maxLength: 254 }}
          />

          <TextField
            label="Who is it for? (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            inputProps={{ maxLength: 1000 }}
          />

          {requires2fa ? (
            <TextField
              label="2FA Code"
              value={twoFactorToken}
              onChange={(e) => setTwoFactorToken(e.target.value)}
              fullWidth
              required
              helperText="Enter the code from your authenticator app, or a backup code"
              inputProps={{ maxLength: 10 }}
            />
          ) : (
            <TextField
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              fullWidth
              required
              helperText="Confirm it's you before we submit this request"
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={resetAndClose} disabled={createRequest.isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={createRequest.isPending || isSimulated}
          startIcon={
            createRequest.isPending ? <CircularProgress size={16} /> : undefined
          }
        >
          Submit Request
        </Button>
      </DialogActions>
    </Dialog>
  );
}
