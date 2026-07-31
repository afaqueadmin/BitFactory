"use client";

import React, { useState } from "react";
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

interface FranchiseAddPaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (text: string) => void;
  customerId: string | null;
  customerName?: string;
}

export default function FranchiseAddPaymentModal({
  open,
  onClose,
  onSuccess,
  customerId,
  customerName,
}: FranchiseAddPaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleClose = () => {
    onClose();
    setAmount("");
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const paymentAmount = parseFloat(amount);
    if (!amount || isNaN(paymentAmount) || paymentAmount <= 0) {
      setError("Please enter a valid payment amount greater than 0");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `/api/franchise/customers/${customerId}/payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: paymentAmount }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add payment");
      }

      setSuccess("Payment added successfully");
      setTimeout(() => {
        onSuccess("Payment added successfully");
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          m: 0,
          p: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        Add Payment
        <IconButton onClick={handleClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {success && <Alert severity="success">{success}</Alert>}

            {customerName && (
              <Box sx={{ mb: 1 }}>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>
                  Adding payment for: <strong>{customerName}</strong>
                </p>
              </Box>
            )}

            <TextField
              fullWidth
              label="Payment Amount (USD)"
              type="number"
              inputProps={{ step: "0.01", min: "0", placeholder: "0.00" }}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
              helperText="Enter amount in USD"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} color="inherit" disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Add Payment"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
