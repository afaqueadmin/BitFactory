"use client";

import React, { useState, useEffect } from "react";
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

interface FranchiseCreateCustomerRequestModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (text: string) => void;
}

export default function FranchiseCreateCustomerRequestModal({
  open,
  onClose,
  onSuccess,
}: FranchiseCreateCustomerRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    initialDeposit: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) {
      setFormData({
        name: "",
        email: "",
        phoneNumber: "",
        initialDeposit: "",
      });
      setError("");
      setSuccess("");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!formData.email.trim()) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/franchise/customers/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          phoneNumber: formData.phoneNumber.trim() || undefined,
          initialDeposit: formData.initialDeposit
            ? parseFloat(formData.initialDeposit)
            : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to submit request");
      }

      setSuccess(data.message || "Request submitted — pending admin approval");
      setTimeout(() => {
        onSuccess(data.message || "Request submitted — pending admin approval");
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          m: 0,
          p: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        Request New Customer
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {success && <Alert severity="success">{success}</Alert>}
            <Alert severity="info">
              This creates a request — the customer account will only be created
              once an admin approves it.
            </Alert>

            <TextField
              fullWidth
              label="Customer Name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              required
              autoFocus
            />
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              required
            />
            <TextField
              fullWidth
              label="Phone Number (optional)"
              type="tel"
              value={formData.phoneNumber}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  phoneNumber: e.target.value,
                }))
              }
            />

            <TextField
              fullWidth
              label="Initial Deposit (USD, optional)"
              type="number"
              inputProps={{ step: "0.01", min: "0" }}
              value={formData.initialDeposit}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  initialDeposit: e.target.value,
                }))
              }
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Submit Request"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
