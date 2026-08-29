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
  Typography,
} from "@mui/material";
import { useCreateWalletChangeRequest } from "@/lib/hooks/useWalletChangeRequests";
import { useUser } from "@/lib/hooks/useUser";

interface RequestWalletChangeModalProps {
  open: boolean;
  onClose: () => void;
  currentAddress: string;
}

export default function RequestWalletChangeModal({
  open,
  onClose,
  currentAddress,
}: RequestWalletChangeModalProps) {
  const createRequest = useCreateWalletChangeRequest();
  const { user } = useUser();
  const requires2fa = !!user?.twoFactorEnabled;

  const [requestedAddress, setRequestedAddress] = useState("");
  const [reason, setReason] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = () => {
    setRequestedAddress("");
    setReason("");
    setCurrentPassword("");
    setTwoFactorToken("");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    const trimmed = requestedAddress.trim();
    if (!trimmed) {
      setError("New wallet address is required");
      return;
    }
    if (requires2fa && !twoFactorToken.trim()) {
      setError("A 2FA code is required to request a wallet change");
      return;
    }
    if (!requires2fa && !currentPassword) {
      setError("Your current password is required to request a wallet change");
      return;
    }
    try {
      await createRequest.mutateAsync({
        requestedAddress: trimmed,
        reason: reason.trim() || undefined,
        currentPassword: requires2fa ? undefined : currentPassword,
        twoFactorToken: requires2fa ? twoFactorToken.trim() : undefined,
      });
      resetAndClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to submit wallet change request",
      );
    }
  };

  return (
    <Dialog open={open} onClose={resetAndClose} maxWidth="sm" fullWidth>
      <DialogTitle>Request Wallet Address Change</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Alert severity="info">
            This submits a request for admin review. Your payout address on
            Luxor only changes once an admin approves it.
          </Alert>

          <Typography variant="body2" color="text.secondary">
            Current address: <strong>{currentAddress}</strong>
          </Typography>

          <TextField
            label="New Wallet Address"
            value={requestedAddress}
            onChange={(e) => setRequestedAddress(e.target.value)}
            fullWidth
            required
            inputProps={{ maxLength: 70, style: { fontFamily: "monospace" } }}
          />

          <TextField
            label="Reason (optional)"
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
          disabled={createRequest.isPending}
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
