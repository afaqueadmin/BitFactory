"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Alert,
  CircularProgress,
  Typography,
} from "@mui/material";
import { useCreateFirmwareChangeRequest } from "@/lib/hooks/useFirmwareChangeRequests";
import { useFirmwareOptions } from "@/lib/hooks/useFirmwareOptions";
import { useUser } from "@/lib/hooks/useUser";

interface RequestFirmwareChangeModalProps {
  open: boolean;
  onClose: () => void;
  minerId: string;
  minerName: string;
  /** Live firmware from Luxor, as shown in the miner's accordion. */
  currentFirmware: string | null | undefined;
}

export default function RequestFirmwareChangeModal({
  open,
  onClose,
  minerId,
  minerName,
  currentFirmware,
}: RequestFirmwareChangeModalProps) {
  const createRequest = useCreateFirmwareChangeRequest();
  const { options, loading: optionsLoading } = useFirmwareOptions(undefined, {
    enabled: open,
  });
  const { user } = useUser();
  const requires2fa = !!user?.twoFactorEnabled;

  const [firmwareId, setFirmwareId] = useState("");
  const [reason, setReason] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const noOptions = !optionsLoading && options.length === 0;

  const resetAndClose = () => {
    setFirmwareId("");
    setReason("");
    setCurrentPassword("");
    setTwoFactorToken("");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!firmwareId) {
      setError("Choose the firmware you want");
      return;
    }
    if (requires2fa && !twoFactorToken.trim()) {
      setError("A 2FA code is required to request a firmware change");
      return;
    }
    if (!requires2fa && !currentPassword) {
      setError(
        "Your current password is required to request a firmware change",
      );
      return;
    }
    try {
      await createRequest.mutateAsync({
        minerId,
        requestedFirmwareId: firmwareId,
        reason: reason.trim() || undefined,
        currentPassword: requires2fa ? undefined : currentPassword,
        twoFactorToken: requires2fa ? twoFactorToken.trim() : undefined,
      });
      resetAndClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to submit firmware change request",
      );
    }
  };

  return (
    <Dialog open={open} onClose={resetAndClose} maxWidth="sm" fullWidth>
      <DialogTitle>Request Firmware Change</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Alert severity="info">
            This submits a request for admin review. Your miner&apos;s firmware
            only changes once an admin approves it, and the miner may be briefly
            offline while it&apos;s updated.
          </Alert>

          <Typography variant="body2" color="text.secondary">
            Miner: <strong>{minerName}</strong>
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Current firmware: <strong>{currentFirmware || "N/A"}</strong>
          </Typography>

          {noOptions ? (
            <Alert severity="warning">
              No firmware options are available right now. Please contact
              support.
            </Alert>
          ) : (
            <TextField
              select
              label="New Firmware"
              value={firmwareId}
              onChange={(e) => setFirmwareId(e.target.value)}
              fullWidth
              required
              disabled={optionsLoading}
            >
              {options.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {o.name}
                </MenuItem>
              ))}
            </TextField>
          )}

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
          disabled={createRequest.isPending || noOptions}
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
