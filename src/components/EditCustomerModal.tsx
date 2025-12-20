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
import { useUser } from "@/lib/hooks/useUser";

interface EditCustomerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (emailSentText: string) => void;
  customerId: string | null;
  initialData?: {
    id: string;
    name: string;
    email: string;
    city?: string;
    country?: string;
    phoneNumber?: string;
    companyName?: string;
    streetAddress?: string;
    companyUrl?: string;
  };
}

export default function EditCustomerModal({
  open,
  onClose,
  onSuccess,
  customerId,
  initialData,
}: EditCustomerModalProps) {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(
    initialData || {
      id: "",
      name: "",
      email: "",
      city: "",
      country: "",
      phoneNumber: "",
      companyName: "",
      streetAddress: "",
      companyUrl: "",
    },
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (initialData && open) {
      setFormData(initialData);
      setError("");
      setSuccess("");
    }
  }, [initialData, open]);

  const handleClose = () => {
    onClose();
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/user/${customerId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          city: formData.city,
          country: formData.country,
          phoneNumber: formData.phoneNumber,
          companyName: formData.companyName,
          streetAddress: formData.streetAddress,
          companyUrl: formData.companyUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update customer");
      }

      setSuccess("Customer updated successfully");
      setTimeout(() => {
        onSuccess("Customer updated successfully");
        handleClose();
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update customer",
      );
    } finally {
      setLoading(false);
    }
  };

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
        Edit Customer
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

            <TextField
              fullWidth
              label="Name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              required
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
              disabled={user ? user.role !== "SUPER_ADMIN" : true}
            />
            <TextField
              fullWidth
              label="Phone Number"
              value={formData.phoneNumber || ""}
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
              value={formData.companyName || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  companyName: e.target.value,
                }))
              }
            />
            <TextField
              fullWidth
              label="Street Address"
              value={formData.streetAddress || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  streetAddress: e.target.value,
                }))
              }
            />
            <TextField
              fullWidth
              label="City"
              value={formData.city || ""}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, city: e.target.value }))
              }
            />
            <TextField
              fullWidth
              label="Country"
              value={formData.country || ""}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, country: e.target.value }))
              }
            />
            <TextField
              fullWidth
              label="Company URL"
              value={formData.companyUrl || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  companyUrl: e.target.value,
                }))
              }
              type="url"
              placeholder="https://example.com"
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
              "Update"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
