"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  IconButton,
  CircularProgress,
  Alert,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { AdjustmentTransaction } from "@/lib/hooks/admin/useAdjustments";

interface EditAdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (text: string) => void;
  adjustment: AdjustmentTransaction | null;
}

export default function EditAdjustmentModal({
  open,
  onClose,
  onSuccess,
  adjustment,
}: EditAdjustmentModalProps) {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (adjustment) {
      setAmount(String(adjustment.amount));
      setNarration(adjustment.narration || "");
      setError("");
      setSuccess("");
    }
  }, [adjustment]);

  const handleClose = () => {
    onClose();
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!adjustment) return;

    const adjustmentAmount = parseFloat(amount);
    if (!amount || isNaN(adjustmentAmount) || adjustmentAmount === 0) {
      setError(
        "Please enter a valid adjustment amount (positive or negative, non-zero)",
      );
      return;
    }

    if (!narration || narration.trim().length === 0) {
      setError("Please enter a narration/reason for this adjustment");
      return;
    }

    if (narration.length > 500) {
      setError("Narration must not exceed 500 characters");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/admin/adjustments/${adjustment.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: adjustmentAmount,
          narration: narration.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update adjustment");
      }

      setSuccess("Adjustment updated successfully");
      setTimeout(() => {
        onSuccess("Adjustment updated successfully");
        handleClose();
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update adjustment",
      );
    } finally {
      setLoading(false);
    }
  };

  const charCount = narration.length;
  const charLimit = 500;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, rgba(40,40,40,0.95), rgba(30,30,30,0.95))"
              : "linear-gradient(145deg, rgba(255,255,255,0.95), rgba(250,250,250,0.95))",
          backdropFilter: "blur(10px)",
        },
      }}
    >
      <DialogTitle
        sx={{
          m: 0,
          p: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        Edit Adjustment
        <IconButton
          onClick={handleClose}
          sx={{
            color: (theme) => theme.palette.grey[500],
            "&:hover": {
              backgroundColor: "action.hover",
            },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {success && <Alert severity="success">{success}</Alert>}

            {adjustment?.customer && (
              <Box sx={{ mb: 1 }}>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>
                  Adjustment for:{" "}
                  <strong>
                    {adjustment.customer.name || adjustment.customer.email}
                  </strong>
                </p>
              </Box>
            )}

            <TextField
              fullWidth
              label="Credit Amount (USD)"
              type="number"
              inputProps={{
                step: "0.01",
                placeholder: "e.g., 50.00 or -25.50",
              }}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
              helperText="Enter positive or negative amount in USD"
            />

            <TextField
              fullWidth
              label="Reason/Narration"
              type="text"
              multiline
              rows={4}
              value={narration}
              onChange={(e) => {
                if (e.target.value.length <= 500) {
                  setNarration(e.target.value);
                }
              }}
              required
              helperText={`Describe the reason for this adjustment (${charCount}/${charLimit} characters)`}
              inputProps={{ maxLength: 500 }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} color="inherit" disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{
              px: 4,
              background: (theme) =>
                `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
              "&:hover": {
                background: (theme) =>
                  `linear-gradient(45deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
              },
            }}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
