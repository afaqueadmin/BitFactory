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

interface CustomerInitialData {
  name: string;
  phoneNumber?: string;
  companyName?: string;
  streetAddress?: string;
  city?: string;
  country?: string;
  companyUrl?: string;
}

interface FranchiseEditCustomerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (text: string) => void;
  customerId: string | null;
  initialData: CustomerInitialData | null;
}

export default function FranchiseEditCustomerModal({
  open,
  onClose,
  onSuccess,
  customerId,
  initialData,
}: FranchiseEditCustomerModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CustomerInitialData>({
    name: "",
    phoneNumber: "",
    companyName: "",
    streetAddress: "",
    city: "",
    country: "",
    companyUrl: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (open && initialData) {
      setFormData({
        name: initialData.name || "",
        phoneNumber: initialData.phoneNumber || "",
        companyName: initialData.companyName || "",
        streetAddress: initialData.streetAddress || "",
        city: initialData.city || "",
        country: initialData.country || "",
        companyUrl: initialData.companyUrl || "",
      });
      setError("");
      setSuccess("");
    }
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!formData.name?.trim()) {
      setError("Name is required");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/franchise/customers/${customerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update customer");
      }

      setSuccess("Customer updated successfully");
      setTimeout(() => {
        onSuccess("Customer updated successfully");
        onClose();
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update customer",
      );
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
        Edit Customer
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {success && <Alert severity="success">{success}</Alert>}

            <TextField
              fullWidth
              label="Name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              required
              autoFocus
            />
            <TextField
              fullWidth
              label="Phone Number"
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
              label="Company Name"
              value={formData.companyName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  companyName: e.target.value,
                }))
              }
            />
            <TextField
              fullWidth
              label="Company URL"
              value={formData.companyUrl}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  companyUrl: e.target.value,
                }))
              }
            />
            <TextField
              fullWidth
              label="Street Address"
              value={formData.streetAddress}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  streetAddress: e.target.value,
                }))
              }
            />
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                fullWidth
                label="City"
                value={formData.city}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, city: e.target.value }))
                }
              />
              <TextField
                fullWidth
                label="Country"
                value={formData.country}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    country: e.target.value,
                  }))
                }
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : "Save"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
