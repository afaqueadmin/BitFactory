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
  FormControlLabel,
  Checkbox,
  Alert,
  Typography,
  Divider,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

interface CreateFranchiseeModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (text: string) => void;
}

const initialFormData = {
  name: "",
  email: "",
  sendEmail: true,
  businessName: "",
  authorizedPersonName: "",
  phoneNumber: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
};

export default function CreateFranchiseeModal({
  open,
  onClose,
  onSuccess,
}: CreateFranchiseeModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [checkingEmail, setCheckingEmail] = useState(false);

  const checkEmailExists = async (email: string) => {
    if (!email || !email.includes("@")) {
      setEmailError("");
      return;
    }

    try {
      setCheckingEmail(true);
      setEmailError("");

      const response = await fetch(
        `/api/user/check-email?email=${encodeURIComponent(email)}`,
      );
      const data = await response.json();

      if (data.exists) {
        setEmailError("This email is already registered");
      } else {
        setEmailError("");
      }
    } catch (err) {
      console.error("[CreateFranchiseeModal] Error checking email:", err);
      setEmailError("");
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const requiredFields: Array<[keyof typeof formData, string]> = [
      ["name", "Name"],
      ["email", "Email"],
      ["businessName", "Business name"],
      ["authorizedPersonName", "Authorized person name"],
      ["phoneNumber", "Phone number"],
      ["address", "Address"],
      ["city", "City"],
      ["state", "State"],
      ["postalCode", "Postal code"],
    ];

    for (const [field, label] of requiredFields) {
      if (
        typeof formData[field] !== "string" ||
        !(formData[field] as string).trim()
      ) {
        setError(`${label} is required`);
        setLoading(false);
        return;
      }
    }

    if (emailError) {
      setError("Please fix the email error before submitting");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/franchisees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create franchisee");
      }

      let emailSentText =
        "Franchisee created successfully! Welcome email sent.";
      if (!data.data?.emailSent) {
        emailSentText =
          "Franchisee created, but the welcome email failed to send.";
      }

      onSuccess(emailSentText);
      onClose();
      setFormData(initialFormData);
      setEmailError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create franchisee",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData(initialFormData);
    setError("");
    setEmailError("");
    onClose();
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
        Create New Franchisee
        <IconButton
          onClick={handleClose}
          sx={{
            color: (theme) => theme.palette.grey[500],
            "&:hover": { backgroundColor: "action.hover" },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Franchisee Login
            </Typography>
            <TextField
              fullWidth
              label="Name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., John Doe"
              required
            />
            <Box>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, email: e.target.value }));
                  setEmailError("");
                }}
                onBlur={(e) => checkEmailExists(e.target.value)}
                error={!!emailError}
                disabled={checkingEmail}
                required
              />
              {checkingEmail && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mt: 0.5,
                  }}
                >
                  <CircularProgress size={16} />
                  <Typography variant="caption">Checking email...</Typography>
                </Box>
              )}
              {emailError && (
                <Typography
                  variant="caption"
                  sx={{ color: "error.main", display: "block", mt: 0.5 }}
                >
                  {emailError}
                </Typography>
              )}
            </Box>

            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" color="text.secondary">
              Franchise Business Details
            </Typography>

            <TextField
              fullWidth
              label="Business Name"
              value={formData.businessName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  businessName: e.target.value,
                }))
              }
              required
            />
            <TextField
              fullWidth
              label="Authorized Person Name"
              value={formData.authorizedPersonName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  authorizedPersonName: e.target.value,
                }))
              }
              required
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
              required
            />
            <TextField
              fullWidth
              label="Address"
              value={formData.address}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, address: e.target.value }))
              }
              required
            />
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                fullWidth
                label="City"
                value={formData.city}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, city: e.target.value }))
                }
                required
              />
              <TextField
                fullWidth
                label="State"
                value={formData.state}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, state: e.target.value }))
                }
                required
              />
              <TextField
                fullWidth
                label="Postal Code"
                value={formData.postalCode}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    postalCode: e.target.value,
                  }))
                }
                required
              />
            </Box>

            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.sendEmail}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      sendEmail: e.target.checked,
                    }))
                  }
                />
              }
              label="Send welcome email to franchisee"
            />

            {error && <Alert severity="error">{error}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} color="inherit">
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
              "Create"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
