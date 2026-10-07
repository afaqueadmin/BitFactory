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
import { useCreatePaymentFrequencyChangeRequest } from "@/lib/hooks/usePaymentFrequencyChangeRequests";
import { useUser } from "@/lib/hooks/useUser";
import {
  DAYS_OF_WEEK,
  PAYMENT_FREQUENCIES,
  DayOfWeek,
  PaymentFrequency,
  formatPaymentSchedule,
} from "@/lib/constants/paymentFrequency";

interface RequestPaymentFrequencyChangeModalProps {
  open: boolean;
  onClose: () => void;
  /** Which Luxor subaccount this request is for - each subaccount has its
   * own payout schedule. */
  subaccountName: string;
  currentFrequency: string | null | undefined;
  currentDayOfWeek: string | null | undefined;
}

export default function RequestPaymentFrequencyChangeModal({
  open,
  onClose,
  subaccountName,
  currentFrequency,
  currentDayOfWeek,
}: RequestPaymentFrequencyChangeModalProps) {
  const createRequest = useCreatePaymentFrequencyChangeRequest();
  const { user } = useUser();
  const requires2fa = !!user?.twoFactorEnabled;

  const [frequency, setFrequency] = useState<PaymentFrequency | "">("");
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek | "">("");
  const [reason, setReason] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = () => {
    setFrequency("");
    setDayOfWeek("");
    setReason("");
    setCurrentPassword("");
    setTwoFactorToken("");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!frequency) {
      setError("Choose a payment frequency");
      return;
    }
    if (frequency === "WEEKLY" && !dayOfWeek) {
      setError("Choose which day of the week you want to be paid");
      return;
    }
    if (requires2fa && !twoFactorToken.trim()) {
      setError("A 2FA code is required to request a payment frequency change");
      return;
    }
    if (!requires2fa && !currentPassword) {
      setError(
        "Your current password is required to request a payment frequency change",
      );
      return;
    }
    try {
      await createRequest.mutateAsync({
        requestedFrequency: frequency,
        requestedDayOfWeek:
          frequency === "WEEKLY" && dayOfWeek ? dayOfWeek : undefined,
        subaccountName,
        reason: reason.trim() || undefined,
        currentPassword: requires2fa ? undefined : currentPassword,
        twoFactorToken: requires2fa ? twoFactorToken.trim() : undefined,
      });
      resetAndClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to submit payment frequency change request",
      );
    }
  };

  return (
    <Dialog open={open} onClose={resetAndClose} maxWidth="sm" fullWidth>
      <DialogTitle>Request Payment Frequency Change</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Alert severity="info">
            This submits a request for admin review. Your payout schedule on
            Luxor only changes once an admin approves it.
          </Alert>

          <Typography variant="body2" color="text.secondary">
            Subaccount: <strong>{subaccountName}</strong>
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Current schedule:{" "}
            <strong>
              {formatPaymentSchedule(currentFrequency, currentDayOfWeek)}
            </strong>
          </Typography>

          <TextField
            select
            label="New Payment Frequency"
            value={frequency}
            onChange={(e) => {
              const next = e.target.value as PaymentFrequency;
              setFrequency(next);
              if (next !== "WEEKLY") setDayOfWeek("");
            }}
            fullWidth
            required
          >
            {PAYMENT_FREQUENCIES.map((f) => (
              <MenuItem key={f} value={f}>
                {formatPaymentSchedule(f)}
              </MenuItem>
            ))}
          </TextField>

          {frequency === "WEEKLY" && (
            <TextField
              select
              label="Payout Day"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek)}
              fullWidth
              required
            >
              {DAYS_OF_WEEK.map((day) => (
                <MenuItem key={day} value={day}>
                  {day.charAt(0) + day.slice(1).toLowerCase()}
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
