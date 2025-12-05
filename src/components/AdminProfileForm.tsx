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

interface AdminProfileFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: {
    name?: string | null;
    email?: string | null;
    phoneNumber?: string | null;
    country?: string | null;
    city?: string | null;
    companyName?: string | null;
    streetAddress?: string | null;
    idNumber?: string | null;
    companyUrl?: string | null;
    dateOfBirth?: string | null;
  };
}

export default function AdminProfileForm({
  open,
  onClose,
  onSuccess,
  initialData,
}: AdminProfileFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(
    initialData || {
      name: "",
      email: "",
      phoneNumber: "",
      country: "",
      city: "",
      companyName: "",
      streetAddress: "",
      idNumber: "",
      companyUrl: "",
      dateOfBirth: "",
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: formData.email,
          name: formData.name,
          phoneNumber: formData.phoneNumber,
          country: formData.country,
          city: formData.city,
          companyName: formData.companyName,
          streetAddress: formData.streetAddress,
          idNumber: formData.idNumber,
          companyUrl: formData.companyUrl,
          dateOfBirth: formData.dateOfBirth,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update profile");
      }

      setSuccess("Profile updated successfully");
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
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
        Edit Profile
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

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 2,
              }}
            >
              <TextField
                fullWidth
                label="Full Name"
                name="name"
                value={formData.name || ""}
                onChange={handleInputChange}
                variant="outlined"
                size="small"
              />

              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={formData.email || ""}
                disabled
                variant="outlined"
                size="small"
                sx={{
                  "& .MuiInputBase-input.Mui-disabled": {
                    cursor: "not-allowed",
                    bgcolor: (theme) => theme.palette.action.disabledBackground,
                  },
                }}
              />

              <TextField
                fullWidth
                label="Phone Number"
                name="phoneNumber"
                value={formData.phoneNumber || ""}
                onChange={handleInputChange}
                variant="outlined"
                size="small"
              />

              <TextField
                fullWidth
                label="Date of Birth"
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth || ""}
                onChange={handleInputChange}
                InputLabelProps={{ shrink: true }}
                inputProps={{
                  max: new Date().toISOString().split("T")[0],
                }}
                variant="outlined"
                size="small"
              />

              <TextField
                fullWidth
                label="Country"
                name="country"
                value={formData.country || ""}
                onChange={handleInputChange}
                variant="outlined"
                size="small"
              />

              <TextField
                fullWidth
                label="City"
                name="city"
                value={formData.city || ""}
                onChange={handleInputChange}
                variant="outlined"
                size="small"
              />

              <TextField
                fullWidth
                label="Company Name"
                name="companyName"
                value={formData.companyName || ""}
                onChange={handleInputChange}
                variant="outlined"
                size="small"
              />

              <TextField
                fullWidth
                label="ID Number"
                name="idNumber"
                value={formData.idNumber || ""}
                onChange={handleInputChange}
                variant="outlined"
                size="small"
              />

              <Box sx={{ gridColumn: "1 / -1" }}>
                <TextField
                  fullWidth
                  label="Street Address"
                  name="streetAddress"
                  value={formData.streetAddress || ""}
                  onChange={handleInputChange}
                  variant="outlined"
                  size="small"
                />
              </Box>

              <Box sx={{ gridColumn: "1 / -1" }}>
                <TextField
                  fullWidth
                  label="Company URL"
                  name="companyUrl"
                  value={formData.companyUrl || ""}
                  onChange={handleInputChange}
                  variant="outlined"
                  size="small"
                  type="url"
                  placeholder="https://example.com"
                />
              </Box>
            </Box>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleClose} variant="outlined" disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{
              background: (theme) =>
                `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
              boxShadow: (theme) =>
                `0 4px 20px ${theme.palette.primary.main}40`,
              "&:hover": {
                background: (theme) =>
                  `linear-gradient(45deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
                boxShadow: (theme) =>
                  `0 6px 25px ${theme.palette.primary.main}60`,
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
