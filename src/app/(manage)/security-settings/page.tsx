"use client";

import React, { useState, useEffect } from "react";
import { Box, Paper, Typography, Button, Alert } from "@mui/material";
import AdminSelfChangePasswordModal from "@/components/AdminSelfChangePasswordModal";
import TwoFactorSettings from "@/components/TwoFactorSettings";
import PasskeySettings from "@/components/PasskeySettings";
import { DaylightThemedPage } from "@/components/daylight/DaylightMuiScope";
import {
  DaylightLoading,
  DaylightPageHeader,
} from "@/components/daylight/AdminPage";

interface UserData {
  id?: string;
  twoFactorEnabled: boolean;
  twoFactorMandatory?: boolean;
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
        twoFactorMandatory: data.user.twoFactorMandatory === true,
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
      <DaylightThemedPage>
        <DaylightLoading />
      </DaylightThemedPage>
    );
  }

  if (!userData) {
    return (
      <DaylightThemedPage>
        <Alert severity="error">Failed to load security settings</Alert>
      </DaylightThemedPage>
    );
  }

  return (
    <DaylightThemedPage>
      <Box sx={{ maxWidth: 1200, mx: "auto" }}>
        <DaylightPageHeader
          title="Security Settings"
          description="Password, two-factor authentication and passkeys for your admin account."
        />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 3,
          }}
        >
          {/* Password Settings Section */}
          <Paper sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
              Password
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Change your account password to keep your account secure.
            </Typography>
            <Button
              variant="contained"
              onClick={() => setChangePasswordModalOpen(true)}
            >
              Change Password
            </Button>
          </Paper>

          {/* Two Factor Authentication Section */}
          <TwoFactorSettings
            twoFactorEnabled={userData.twoFactorEnabled}
            twoFactorMandatory={userData.twoFactorMandatory}
            daylight
          />

          {/* Passkey Settings Section */}
          <PasskeySettings daylight />
        </Box>

        {/* Change Password Modal */}
        <AdminSelfChangePasswordModal
          open={changePasswordModalOpen}
          onClose={handleModalClose}
          onSuccess={handleSecurityUpdated}
        />
      </Box>
    </DaylightThemedPage>
  );
}
