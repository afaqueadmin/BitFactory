"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Grid as MuiGrid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
} from "@mui/material";
import TwoFactorSettings from "@/components/TwoFactorSettings";
import PasskeySettings from "@/components/PasskeySettings";

// Create a Grid component that includes the 'item' prop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Grid = MuiGrid as React.ComponentType<any>;

interface UserData {
  id?: string;
  twoFactorEnabled: boolean;
}

interface Activity {
  id: string;
  type: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export default function SecuritySettingsPage() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordErrors, setPasswordErrors] = useState<
    Partial<{
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }>
  >({});
  const [isPasswordChanging, setIsPasswordChanging] = useState(false);
  const [passwordFormError, setPasswordFormError] = useState<string | null>(
    null,
  );
  const [passwordFormSuccess, setPasswordFormSuccess] = useState<string | null>(
    null,
  );

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
      setActivities(data.recentActivities || []);
    } catch (err) {
      console.error("Error fetching user data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load security settings",
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPasswordChanging(true);
    setPasswordErrors({});
    setPasswordFormError(null);
    setPasswordFormSuccess(null);

    // Basic client-side validation
    const newErrors: Partial<{
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }> = {};
    if (!passwordData.currentPassword) {
      newErrors.currentPassword = "Current password is required";
    }
    if (!passwordData.newPassword) {
      newErrors.newPassword = "New password is required";
    } else if (passwordData.newPassword.length < 8) {
      newErrors.newPassword = "New password must be at least 8 characters";
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    setPasswordErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      setIsPasswordChanging(false);
      return;
    }

    try {
      const response = await fetch("/api/user/change-password", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify(passwordData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to change password");
      }

      setPasswordFormSuccess("Password changed successfully!");
      setShowPasswordForm(false);
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while changing your password. Please try again later.";
      setPasswordFormError(errorMessage);
      console.error("Error changing password:", error);
    } finally {
      setIsPasswordChanging(false);
    }
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

        {passwordFormError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {passwordFormError}
          </Alert>
        )}
        {passwordFormSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {passwordFormSuccess}
          </Alert>
        )}

        {!showPasswordForm ? (
          <>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Change your account password to keep your account secure.
            </Typography>
            <Button
              variant="contained"
              onClick={() => setShowPasswordForm(true)}
              sx={{
                px: 4,
                py: 1,
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
              Change Password
            </Button>
          </>
        ) : (
          <Box component="form" onSubmit={handlePasswordSubmit}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  type="password"
                  label="Current Password"
                  value={passwordData.currentPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPasswordData((prev) => ({
                      ...prev,
                      currentPassword: e.target.value,
                    }))
                  }
                  required
                  error={!!passwordErrors.currentPassword}
                  helperText={passwordErrors.currentPassword}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  type="password"
                  label="New Password"
                  value={passwordData.newPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPasswordData((prev) => ({
                      ...prev,
                      newPassword: e.target.value,
                    }))
                  }
                  required
                  error={!!passwordErrors.newPassword}
                  helperText={passwordErrors.newPassword}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  type="password"
                  label="Confirm New Password"
                  value={passwordData.confirmPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPasswordData((prev) => ({
                      ...prev,
                      confirmPassword: e.target.value,
                    }))
                  }
                  required
                  error={!!passwordErrors.confirmPassword}
                  helperText={passwordErrors.confirmPassword}
                />
              </Grid>
              <Grid item xs={12}>
                <Box sx={{ display: "flex", gap: 2 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={isPasswordChanging}
                    sx={{
                      px: 4,
                      py: 1,
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
                    {isPasswordChanging ? (
                      <CircularProgress size={24} color="inherit" />
                    ) : (
                      "Save Password"
                    )}
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setPasswordData({
                        currentPassword: "",
                        newPassword: "",
                        confirmPassword: "",
                      });
                      setPasswordErrors({});
                      setPasswordFormError(null);
                    }}
                    sx={{
                      px: 4,
                      py: 1,
                    }}
                  >
                    Cancel
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>

      {/* Two Factor Authentication Section */}
      <Box sx={{ mt: 4 }}>
        <TwoFactorSettings twoFactorEnabled={userData.twoFactorEnabled} />
      </Box>

      {/* Passkey Settings Section */}
      <Box sx={{ mt: 4 }}>
        <PasskeySettings />
      </Box>

      {/* Recent Activity Section */}
      <Box sx={{ mt: 4 }}>
        <Typography
          variant="h5"
          fontWeight="bold"
          gutterBottom
          sx={{
            color: (theme) =>
              theme.palette.mode === "dark" ? "primary.light" : "primary.dark",
            borderBottom: (theme) => `2px solid ${theme.palette.primary.main}`,
            pb: 1,
            mb: 3,
          }}
        >
          Recent Activity
        </Typography>
        <Paper
          elevation={3}
          sx={{
            width: "100%",
            overflow: "hidden",
            borderRadius: 2,
            background: (theme) =>
              theme.palette.mode === "dark"
                ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
                : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
            backdropFilter: "blur(10px)",
            border: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          <TableContainer
            sx={{
              maxHeight: 440,
              "&::-webkit-scrollbar": {
                width: "8px",
                height: "8px",
              },
              "&::-webkit-scrollbar-track": {
                background: "transparent",
              },
              "&::-webkit-scrollbar-thumb": {
                background: (theme) =>
                  theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.2)"
                    : "rgba(0,0,0,0.2)",
                borderRadius: "4px",
                "&:hover": {
                  background: (theme) =>
                    theme.palette.mode === "dark"
                      ? "rgba(255,255,255,0.3)"
                      : "rgba(0,0,0,0.3)",
                },
              },
            }}
          >
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      background: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(0,0,0,0.5)"
                          : "rgba(255,255,255,0.9)",
                      color: (theme) => theme.palette.primary.main,
                    }}
                  >
                    Date
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      background: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(0,0,0,0.5)"
                          : "rgba(255,255,255,0.9)",
                      color: (theme) => theme.palette.primary.main,
                    }}
                  >
                    Activity
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      background: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(0,0,0,0.5)"
                          : "rgba(255,255,255,0.9)",
                      color: (theme) => theme.palette.primary.main,
                    }}
                  >
                    IP Address
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      background: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(0,0,0,0.5)"
                          : "rgba(255,255,255,0.9)",
                      color: (theme) => theme.palette.primary.main,
                    }}
                  >
                    Device
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activities.map((activity) => (
                  <TableRow
                    key={activity.id}
                    hover
                    sx={{
                      transition: "background-color 0.2s",
                      "&:hover": {
                        backgroundColor: (theme) =>
                          theme.palette.mode === "dark"
                            ? "rgba(255,255,255,0.05)"
                            : "rgba(0,0,0,0.05)",
                      },
                    }}
                  >
                    <TableCell
                      sx={{ color: (theme) => theme.palette.text.secondary }}
                    >
                      {new Date(activity.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: (theme) => theme.palette.primary.main,
                        fontWeight: "medium",
                      }}
                    >
                      {activity.type}
                    </TableCell>
                    <TableCell
                      sx={{ color: (theme) => theme.palette.text.secondary }}
                    >
                      {activity.ipAddress}
                    </TableCell>
                    <TableCell
                      sx={{ color: (theme) => theme.palette.text.secondary }}
                    >
                      {activity.userAgent}
                    </TableCell>
                  </TableRow>
                ))}
                {activities.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      align="center"
                      sx={{
                        py: 6,
                        color: (theme) => theme.palette.text.secondary,
                        fontStyle: "italic",
                        fontSize: "0.95rem",
                      }}
                    >
                      No recent activity
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </Box>
  );
}
