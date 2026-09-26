"use client";

/**
 * Security Settings page (authenticated) - BitFactory Daylight theme (v1.3)
 *
 * Composes:
 * - Page heading
 * - Daylight password-change card
 * - TwoFactorSettings / PasskeySettings (shared with admin, opt-in `daylight`)
 * - Daylight "Recent Activity" data table
 *
 * All fetch/change-password/polling logic is unchanged from the previous
 * implementation.
 */

import React, { useState, useEffect } from "react";
import {
  Box,
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
} from "@mui/material";
import TwoFactorSettings from "@/components/TwoFactorSettings";
import PasskeySettings from "@/components/PasskeySettings";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

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
  const { d, fonts } = useDaylight();
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

  // Keeps Recent Activity current without a manual page reload - polls in
  // the background (no loading spinner) and is also triggered right after a
  // password change so the new PASSWORD_CHANGE entry shows up immediately.
  useEffect(() => {
    const interval = setInterval(() => {
      refreshActivities();
    }, 30000);
    return () => clearInterval(interval);
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

  const refreshActivities = async () => {
    try {
      const response = await fetch("/api/user/profile", {
        method: "GET",
        credentials: "include",
        headers: {
          "Cache-Control": "no-cache",
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      setActivities(data.recentActivities || []);
    } catch (err) {
      console.error("Error refreshing recent activity:", err);
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
      refreshActivities();
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

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "8px",
      fontFamily: fonts.body,
      "& fieldset": { borderColor: d.inputBorder },
      "&:hover fieldset": { borderColor: d.action },
    },
    "& .MuiOutlinedInput-root.Mui-focused fieldset": {
      borderColor: d.action,
      borderWidth: "2px",
    },
    "& .MuiInputLabel-root": { fontFamily: fonts.body, color: d.muted },
    "& .MuiFormHelperText-root": { fontFamily: fonts.body },
  };

  const alertSx = (tone: "success" | "error") => ({
    mb: 2,
    borderRadius: "8px",
    bgcolor: tone === "success" ? d.mint : d.dangerSoft,
    color: tone === "success" ? d.success : d.danger,
    fontFamily: fonts.body,
    fontSize: 13,
    p: 1.5,
  });

  const primaryBtnSx = {
    px: 4,
    py: 1.2,
    textTransform: "none",
    fontFamily: fonts.body,
    fontWeight: 650,
    borderRadius: "8px",
    bgcolor: d.action,
    color: "#fff",
    boxShadow: "none",
    "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
    "&.Mui-disabled": { bgcolor: d.border, color: d.muted },
  } as const;

  const outlineBtnSx = {
    px: 4,
    py: 1.2,
    textTransform: "none",
    fontFamily: fonts.body,
    fontWeight: 600,
    borderRadius: "8px",
    color: d.text,
    borderColor: d.inputBorder,
    "&:hover": { bgcolor: d.hover, borderColor: d.action },
  } as const;

  const headerCellSx = {
    fontFamily: fonts.body,
    fontWeight: 600,
    fontSize: 10,
    letterSpacing: ".015em",
    textTransform: "uppercase" as const,
    color: d.muted,
    borderBottomColor: d.border,
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
        <CircularProgress sx={{ color: d.action }} />
      </Box>
    );
  }

  if (!userData) {
    return (
      <Box sx={{ maxWidth: 1200, mx: "auto" }}>
        <Box sx={alertSx("error")}>Failed to load security settings</Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{ maxWidth: 1200, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      <Box sx={{ mb: { xs: "20px", md: "26px" } }}>
        <Typography
          component="h1"
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 750,
            fontSize: { xs: 27, md: 32 },
            lineHeight: 1.3,
            letterSpacing: "-.035em",
            color: d.text,
          }}
        >
          Security Settings
        </Typography>
        <Typography
          sx={{
            fontSize: { xs: 12, md: 13 },
            lineHeight: { xs: 1.7, md: 1.5 },
            color: d.muted,
            mt: "7px",
          }}
        >
          Manage your password, two-factor authentication and passkeys.
        </Typography>
      </Box>

      {error && <Box sx={alertSx("error")}>{error}</Box>}

      {/* Password Settings Section */}
      <Box
        sx={{
          p: { xs: 2.5, sm: 4 },
          mb: 3,
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
        }}
      >
        <Typography
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 18,
            color: d.text,
            mb: 2,
          }}
        >
          Password Settings
        </Typography>

        {passwordFormError && (
          <Box sx={alertSx("error")}>{passwordFormError}</Box>
        )}
        {passwordFormSuccess && (
          <Box sx={alertSx("success")}>{passwordFormSuccess}</Box>
        )}

        {!showPasswordForm ? (
          <>
            <Typography
              sx={{
                fontFamily: fonts.body,
                fontSize: 13,
                color: d.muted,
                mb: 2,
              }}
            >
              Change your account password to keep your account secure.
            </Typography>
            <Button
              variant="contained"
              onClick={() => setShowPasswordForm(true)}
              sx={primaryBtnSx}
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
                  sx={inputSx}
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
                  sx={inputSx}
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
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12}>
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={isPasswordChanging}
                    sx={primaryBtnSx}
                  >
                    {isPasswordChanging ? (
                      <CircularProgress size={22} sx={{ color: "#fff" }} />
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
                    sx={outlineBtnSx}
                  >
                    Cancel
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </Box>
        )}
      </Box>

      {/* Two Factor Authentication Section */}
      <Box sx={{ mt: 3 }}>
        <TwoFactorSettings
          twoFactorEnabled={userData.twoFactorEnabled}
          daylight
        />
      </Box>

      {/* Passkey Settings Section */}
      <Box sx={{ mt: 3 }}>
        <PasskeySettings daylight />
      </Box>

      {/* Recent Activity Section */}
      <Box sx={{ mt: 3 }}>
        <Typography
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 20,
            color: d.text,
            mb: 2,
          }}
        >
          Recent Activity
        </Typography>
        <Box
          sx={{
            bgcolor: d.surface,
            border: `1px solid ${d.border}`,
            borderRadius: RADIUS_CARD,
            boxShadow: d.shadow,
            overflow: "hidden",
          }}
        >
          <TableContainer sx={{ maxHeight: 440 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{ ...headerCellSx, backgroundColor: d.tableHead }}
                  >
                    Date
                  </TableCell>
                  <TableCell
                    sx={{ ...headerCellSx, backgroundColor: d.tableHead }}
                  >
                    Activity
                  </TableCell>
                  <TableCell
                    sx={{
                      ...headerCellSx,
                      backgroundColor: d.tableHead,
                      display: { xs: "none", sm: "table-cell" },
                    }}
                  >
                    IP Address
                  </TableCell>
                  <TableCell
                    sx={{
                      ...headerCellSx,
                      backgroundColor: d.tableHead,
                      display: { xs: "none", md: "table-cell" },
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
                      "&:hover": { backgroundColor: d.hover },
                      "& .MuiTableCell-root": {
                        borderBottomColor: d.border,
                        fontFamily: fonts.body,
                      },
                    }}
                  >
                    <TableCell sx={{ fontSize: 12, color: d.muted }}>
                      {new Date(activity.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell
                      sx={{ fontSize: 13, color: d.text, fontWeight: 600 }}
                    >
                      {activity.type}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 12,
                        color: d.muted,
                        display: { xs: "none", sm: "table-cell" },
                      }}
                    >
                      {activity.ipAddress}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 12,
                        color: d.muted,
                        display: { xs: "none", md: "table-cell" },
                      }}
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
                        color: d.muted,
                        fontFamily: fonts.body,
                        fontSize: 13,
                      }}
                    >
                      No recent activity
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>
    </Box>
  );
}
