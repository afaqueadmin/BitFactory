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
import {
  Close as CloseIcon,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { useUser } from "@/lib/hooks/useUser";

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (text: string) => void;
  customerId: string | null;
}

export default function ChangePasswordModal({
  open,
  onClose,
  onSuccess,
  customerId,
}: ChangePasswordModalProps) {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const { user } = useUser();
  const requires2fa = !!user?.twoFactorEnabled;
  const [currentPassword, setCurrentPassword] = useState("");
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleClose = () => {
    onClose();
    setFormData({ newPassword: "", confirmPassword: "" });
    setCurrentPassword("");
    setTwoFactorToken("");
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validation
    if (formData.newPassword !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (requires2fa && !twoFactorToken.trim()) {
      setError("A 2FA code is required to reset a user's password");
      return;
    }
    if (!requires2fa && !currentPassword) {
      setError("Your current password is required to reset a user's password");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/user/${customerId}/change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPassword: formData.newPassword,
          currentPassword: requires2fa ? undefined : currentPassword,
          twoFactorToken: requires2fa ? twoFactorToken.trim() : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to change password");
      }

      setSuccess("Password changed successfully");
      setTimeout(() => {
        onSuccess("Password changed successfully");
        handleClose();
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change password",
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
        Change Password
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
              label="New Password"
              type={showPassword ? "text" : "password"}
              value={formData.newPassword}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  newPassword: e.target.value,
                }))
              }
              InputProps={{
                endAdornment: (
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    sx={{
                      color: (theme) => theme.palette.action.active,
                      "&:hover": {
                        backgroundColor: "transparent",
                      },
                    }}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                ),
              }}
              required
            />
            <TextField
              fullWidth
              label="Confirm Password"
              type={showPassword ? "text" : "password"}
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  confirmPassword: e.target.value,
                }))
              }
              required
            />
            <Alert severity="info">
              The user will be emailed their new password.
            </Alert>
            {requires2fa ? (
              <TextField
                fullWidth
                label="Your 2FA Code"
                value={twoFactorToken}
                onChange={(e) => setTwoFactorToken(e.target.value)}
                helperText="Enter the code from your authenticator app, or a backup code"
                inputProps={{ maxLength: 10 }}
                required
              />
            ) : (
              <TextField
                fullWidth
                label="Your Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                helperText="Confirm it's you before changing this password"
                required
              />
            )}
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
              "Change Password"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
