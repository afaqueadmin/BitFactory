"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Alert,
  Avatar,
} from "@mui/material";
import { PhotoCamera } from "@mui/icons-material";
import AdminProfileForm from "@/components/AdminProfileForm";
import { DaylightThemedPage } from "@/components/daylight/DaylightMuiScope";
import {
  DaylightLoading,
  DaylightPageHeader,
} from "@/components/daylight/AdminPage";

interface AdminProfileData {
  id?: string;
  name: string | null;
  email: string;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  country: string | null;
  city: string | null;
  streetAddress: string | null;
  companyName: string | null;
  idNumber: string | null;
  companyUrl: string | null;
  profileImage: string | null;
  profileImageId: string | null;
}

interface UserActivity {
  id: string;
  type: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export default function AdminProfile() {
  const [profileData, setProfileData] = useState<AdminProfileData | null>(null);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAdminProfile();
  }, []);

  const fetchAdminProfile = async () => {
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
        throw new Error("Failed to fetch admin profile");
      }

      const data = await response.json();
      if (!data.user) {
        throw new Error("No user data found");
      }

      setProfileData(data.user);
      setActivities(data.recentActivities || []);
    } catch (err) {
      console.error("Error fetching admin profile:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load admin profile",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !profileData) return;

    const file = e.target.files[0];

    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    try {
      setSaving(true);
      const uploadResponse = await fetch("/api/user/upload-image", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok) {
        throw new Error(uploadData.error || "Failed to upload image");
      }

      const updatedProfileData = {
        ...profileData,
        profileImage: uploadData.imageUrl,
        profileImageId: uploadData.publicId,
      };

      const profileResponse = await fetch("/api/user/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify(updatedProfileData),
      });

      if (!profileResponse.ok) {
        const errorData = await profileResponse.json();
        throw new Error(
          errorData.error || "Failed to update profile with new image",
        );
      }

      setProfileData(updatedProfileData);
      setError(null);
    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setSaving(false);
    }
  };

  const handleModalClose = () => {
    setEditModalOpen(false);
  };

  const handleProfileUpdated = () => {
    fetchAdminProfile();
    handleModalClose();
  };

  if (loading) {
    return (
      <DaylightThemedPage>
        <DaylightLoading />
      </DaylightThemedPage>
    );
  }

  if (!profileData) {
    return (
      <DaylightThemedPage>
        <Alert severity="error">Failed to load admin profile</Alert>
      </DaylightThemedPage>
    );
  }

  const field = (label: string, value: string | null, wide = false) => (
    <Box sx={{ minWidth: 0, ...(wide && { gridColumn: "1 / -1" }) }}>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, mt: "2px", overflowWrap: "anywhere" }}
      >
        {value || "N/A"}
      </Typography>
    </Box>
  );

  return (
    <DaylightThemedPage>
      <Box sx={{ maxWidth: 1200, mx: "auto" }}>
        <DaylightPageHeader
          title="Admin Profile"
          description="Your account details and recent sign-in activity."
        />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Profile Information Section */}
        <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "180px 1fr" },
              gap: { xs: 3, md: 4 },
              alignItems: "start",
            }}
          >
            {/* Profile Photo Section */}
            <Box sx={{ textAlign: "center" }}>
              <Avatar
                src={profileData.profileImage || undefined}
                sx={{
                  width: 112,
                  height: 112,
                  mx: "auto",
                  mb: 2,
                  bgcolor: "primary.main",
                  fontSize: "2.75rem",
                }}
              >
                {profileData.name?.charAt(0) || "A"}
              </Avatar>
              <Button
                component="label"
                variant="outlined"
                size="small"
                startIcon={<PhotoCamera />}
                disabled={saving}
              >
                {saving ? "Uploading..." : "Upload Photo"}
                <input
                  hidden
                  accept="image/*"
                  type="file"
                  onChange={handleImageUpload}
                  disabled={saving}
                />
              </Button>
            </Box>

            {/* Profile Information Display */}
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
                Personal Information
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  gap: "16px 24px",
                }}
              >
                {field("Full Name", profileData.name)}
                {field("Email", profileData.email)}
                {field("Phone Number", profileData.phoneNumber)}
                {field("Country", profileData.country)}
                {field("City", profileData.city)}
                {field("Company Name", profileData.companyName)}
                {field("Company URL", profileData.companyUrl, true)}
              </Box>
              <Button
                variant="contained"
                onClick={() => setEditModalOpen(true)}
                sx={{ mt: 3 }}
              >
                Edit Profile
              </Button>
            </Box>
          </Box>
        </Paper>

        {/* Recent Activity Section */}
        <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
          Recent Activity
        </Typography>
        <Paper sx={{ overflow: "hidden" }}>
          <TableContainer sx={{ maxHeight: 440 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Activity</TableCell>
                  <TableCell>IP Address</TableCell>
                  <TableCell>Device</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activities.map((activity) => (
                  <TableRow key={activity.id} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {new Date(activity.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      {activity.type}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {activity.ipAddress}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: "text.secondary",
                        minWidth: 240,
                        overflowWrap: "anywhere",
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
                      sx={{ py: 5, color: "text.secondary" }}
                    >
                      No recent activity
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Admin Profile Form Modal */}
        <AdminProfileForm
          open={editModalOpen}
          onClose={handleModalClose}
          onSuccess={handleProfileUpdated}
          initialData={profileData}
        />
      </Box>
    </DaylightThemedPage>
  );
}
