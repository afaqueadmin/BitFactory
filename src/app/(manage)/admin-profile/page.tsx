"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Grid as MuiGrid,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  CircularProgress,
  Alert,
  Avatar,
} from "@mui/material";
import { PhotoCamera } from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import AdminProfileForm from "@/components/AdminProfileForm";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import TwoFactorSettings from "@/components/TwoFactorSettings";

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
  profileImage: string | null;
  profileImageId: string | null;
  walletAddress: string | null;
  twoFactorEnabled: boolean;
}

interface UserActivity {
  id: string;
  type: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Grid = MuiGrid as React.ComponentType<any>;

export default function AdminProfile() {
  const theme = useTheme();
  const [profileData, setProfileData] = useState<AdminProfileData | null>(null);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
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
    setChangePasswordModalOpen(false);
  };

  const handleProfileUpdated = () => {
    fetchAdminProfile();
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

  if (!profileData) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Failed to load admin profile</Alert>
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
        Admin Profile
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Profile Information Section */}
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
        <Grid container spacing={4}>
          {/* Profile Photo Section */}
          <Grid item xs={12} md={3}>
            <Box
              sx={{
                textAlign: "center",
              }}
            >
              <Avatar
                src={profileData.profileImage || undefined}
                sx={{
                  width: { xs: 100, sm: 120, md: 140 },
                  height: { xs: 100, sm: 120, md: 140 },
                  mx: "auto",
                  mb: 2,
                  bgcolor: theme.palette.primary.main,
                  fontSize: { xs: "2.5rem", sm: "3rem", md: "3.5rem" },
                  border: (theme) => `4px solid ${theme.palette.primary.main}`,
                  boxShadow: (theme) =>
                    `0 0 20px ${theme.palette.primary.main}40`,
                }}
              >
                {profileData.name?.charAt(0) || "A"}
              </Avatar>
              <Button
                component="label"
                variant="contained"
                startIcon={<PhotoCamera />}
                disabled={saving}
                sx={{
                  mt: 1,
                  background: (theme) =>
                    theme.palette.mode === "dark"
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(0,0,0,0.1)",
                  backdropFilter: "blur(5px)",
                  "&:hover": {
                    background: (theme) =>
                      theme.palette.mode === "dark"
                        ? "rgba(255,255,255,0.2)"
                        : "rgba(0,0,0,0.2)",
                  },
                }}
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
          </Grid>

          {/* Profile Information Display */}
          <Grid item xs={12} md={9}>
            <Box>
              <Typography variant="h6" fontWeight="bold" mb={2}>
                Personal Information
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      Full Name
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {profileData.name || "N/A"}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      Email
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {profileData.email}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      Phone Number
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {profileData.phoneNumber || "N/A"}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      Country
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {profileData.country || "N/A"}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      City
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {profileData.city || "N/A"}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      Company Name
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {profileData.companyName || "N/A"}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12}>
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      Wallet Address
                    </Typography>
                    <Typography
                      variant="body1"
                      fontWeight="medium"
                      sx={{
                        wordBreak: "break-all",
                      }}
                    >
                      {profileData.walletAddress || "N/A"}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12}>
                  <Button
                    variant="contained"
                    onClick={() => setEditModalOpen(true)}
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
                    Edit Profile
                  </Button>
                </Grid>
              </Grid>
            </Box>
          </Grid>
        </Grid>
      </Paper>

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
        <TwoFactorSettings twoFactorEnabled={profileData.twoFactorEnabled} />
      </Box>

      {/* Recent Activity Section */}
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
          mt: 4,
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
                    sx={{
                      color: (theme) => theme.palette.text.secondary,
                    }}
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
                    sx={{
                      color: (theme) => theme.palette.text.secondary,
                    }}
                  >
                    {activity.ipAddress}
                  </TableCell>
                  <TableCell
                    sx={{
                      color: (theme) => theme.palette.text.secondary,
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

      {/* Admin Profile Form Modal */}
      <AdminProfileForm
        open={editModalOpen}
        onClose={handleModalClose}
        onSuccess={handleProfileUpdated}
        initialData={profileData}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        open={changePasswordModalOpen}
        onClose={handleModalClose}
        onSuccess={handleProfileUpdated}
        customerId={profileData.id || ""}
      />
    </Box>
  );
}
