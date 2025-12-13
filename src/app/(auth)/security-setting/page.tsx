"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
} from "@mui/material";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import TwoFactorSettings from "@/components/TwoFactorSettings";

interface UserData {
  id?: string;
  twoFactorEnabled: boolean;
}

export default function SecuritySettingsPage() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/user/profile", {
        method: "GET",
        credentials: "include",
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch user data");
      }

      const data = await response.json();
      if (!data.user) {
        throw new Error("No user data found");
      }

      setUserData({
        id: data.user.id,
        twoFactorEnabled: data.user.twoFactorEnabled,
      });
    } catch (err) {
      console.error("Error fetching user data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load security settings",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleModalClose = () => {
    setChangePasswordModalOpen(false);
  };

  const handleSecurityUpdated = () => {
    fetchUserData();
    handleModalClose();
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "60vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!userData) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Failed to load security settings</Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3 },
        mt: { xs: 1, sm: 2 },
        maxWidth: 1200,
        mx: "auto",
        minHeight: "100vh",
        bgcolor: (theme) =>
          theme.palette.mode === "dark" ? "background.default" : "grey.50",
      }}
    >
      <Typography
        variant="h4"
        fontWeight="bold"
        gutterBottom
        sx={{
          color: (theme) =>
            theme.palette.mode === "dark" ? "primary.light" : "primary.dark",
          mb: 3,
          borderBottom: (theme) => `2px solid ${theme.palette.primary.main}`,
          pb: 1,
        }}
      >
        Security Settings
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Password Settings Section */}
      <Paper
        elevation={3}
        sx={{
          p: { xs: 2, sm: 4 },
          mb: 4,
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
              : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
          backdropFilter: "blur(10px)",
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography
          variant="h6"
          fontWeight="medium"
          gutterBottom
          sx={{
            color: (theme) =>
              theme.palette.mode === "dark" ? "primary.light" : "primary.dark",
            mb: 3,
          }}
        >
          Password Settings
        </Typography>

        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Change your account password to keep your account secure.
        </Typography>

        <Button
          variant="contained"
          onClick={() => setChangePasswordModalOpen(true)}
          sx={{
            px: 4,
            py: 1,
            background: (theme) =>
              `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
            boxShadow: (theme) => `0 4px 20px ${theme.palette.primary.main}40`,
            "&:hover": {
              background: (theme) =>
                `linear-gradient(45deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
              boxShadow: (theme) =>
                `0 6px 25px ${theme.palette.primary.main}60`,
            },
          }}
        >
          Change Password
        </Button>
      </Paper>

      {/* Two Factor Authentication Section */}
      <Box sx={{ mt: 4 }}>
        <TwoFactorSettings twoFactorEnabled={userData.twoFactorEnabled} />
      </Box>

      {/* Change Password Modal */}
      <ChangePasswordModal
        open={changePasswordModalOpen}
        onClose={handleModalClose}
        onSuccess={handleSecurityUpdated}
        customerId={userData.id || ""}
      />
    </Box>
  );
}
