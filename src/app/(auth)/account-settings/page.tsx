"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid as MuiGrid,
  Avatar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  useTheme,
  Dialog,
  DialogContent,
  DialogTitle,
  Fade,
  IconButton,
} from "@mui/material";
import { CheckCircleOutline, Close, ErrorOutline } from "@mui/icons-material";
import { PhotoCamera } from "@mui/icons-material";
import TwoFactorSettings from "@/components/TwoFactorSettings";

// Create a Grid component that includes the 'item' prop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Grid = MuiGrid as React.ComponentType<any>;

interface UserProfile {
  name: string;
  email: string;
  phoneNumber: string;
  dateOfBirth: string;
  country: string;
  city: string;
  streetAddress: string;
  companyName: string;
  idNumber: string;
  profileImage?: string;
  profileImageId?: string;
  twoFactorEnabled: boolean;
}

interface Activity {
  id: string;
  type: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export default function AccountSettings() {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [formData, setFormData] = useState<UserProfile>({
    name: "",
    email: "",
    phoneNumber: "",
    dateOfBirth: "",
    country: "",
    city: "",
    streetAddress: "",
    companyName: "",
    idNumber: "",
    profileImage: "",
    profileImageId: "",
    twoFactorEnabled: false,
  });
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

  // Safely handle null values in form data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getFormValue = (value: any) => {
    return value === null ? "" : value;
  };

  // Fetch user data
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        setError(null);
        console.log("Fetching user profile...");

        // First check if we're authenticated
        const authCheckResponse = await fetch("/api/auth/check", {
          credentials: "include",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (!authCheckResponse.ok) {
          throw new Error("Authentication check failed");
        }

        const response = await fetch("/api/user/profile", {
          credentials: "include",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        const data = await response.json();
        console.log("Profile Response:", {
          status: response.status,
          ok: response.ok,
          data: data,
        });

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch profile");
        }
        setFormData({
          ...data.user,
          dateOfBirth: data.user.dateOfBirth
            ? new Date(data.user.dateOfBirth).toISOString().split("T")[0]
            : "",
        });
        setActivities(data.recentActivities);
      } catch (error) {
        console.error("Error loading profile:", error);
        if (error instanceof Error) {
          if (error.message === "Authentication check failed") {
            setError("Your session has expired. Please log in again.");
            // Redirect to login
            window.location.href = "/login";
            return;
          }
          setError(error.message);
        } else {
          setError("Failed to load profile data");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update profile");
      }

      setSuccess("Profile updated successfully!");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while updating your profile. Please try again later.";
      setError(errorMessage);
      console.error("Error updating profile:", error);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPasswordChanging(true);
    setPasswordErrors({});

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

      setSuccess("Password changed successfully!");
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
      setError(errorMessage);
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
        Account Settings
      </Typography>

      {/* Profile Section */}
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
                position: "relative",
                "&:hover .upload-overlay": {
                  opacity: 1,
                },
              }}
            >
              <Avatar
                src={formData.profileImage || undefined}
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
                {formData.name?.charAt(0) || "U"}
              </Avatar>
              <Button
                component="label"
                variant="contained"
                startIcon={<PhotoCamera />}
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
                Upload Photo
                <input
                  hidden
                  accept="image/*"
                  type="file"
                  onChange={async (e) => {
                    if (!e.target.files?.[0]) return;

                    const file = e.target.files[0];
                    console.log("Selected file:", {
                      name: file.name,
                      type: file.type,
                      size: file.size,
                    });

                    // Check file size
                    if (file.size > 10 * 1024 * 1024) {
                      setError("File size must be less than 10MB");
                      return;
                    }

                    // Create form data
                    const formData = new FormData();
                    formData.append("image", file);

                    try {
                      console.log("Sending upload request...");
                      const response = await fetch("/api/user/upload-image", {
                        method: "POST",
                        credentials: "include",
                        body: formData,
                      });

                      const data = await response.json();
                      console.log("Upload response:", data);

                      if (!response.ok) {
                        throw new Error(data.error || "Failed to upload image");
                      }

                      // Get current user data first
                      const userResponse = await fetch("/api/user/profile", {
                        credentials: "include",
                        headers: {
                          "Cache-Control": "no-cache",
                        },
                      });

                      if (!userResponse.ok) {
                        throw new Error("Failed to fetch current user data");
                      }

                      const userData = await userResponse.json();

                      // Create updated profile data
                      const updatedProfileData = {
                        ...userData.user, // Keep all existing user data
                        profileImage: data.imageUrl,
                        profileImageId: data.publicId,
                      };

                      // Save all profile data including the new image
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
                          errorData.error ||
                            "Failed to update profile with new image",
                        );
                      }

                      // Update form data with the new image
                      setFormData((prevData) => ({
                        ...prevData,
                        profileImage: data.imageUrl,
                        profileImageId: data.publicId,
                      }));

                      setSuccess("Profile image updated successfully!");
                    } catch (error) {
                      console.error("Upload error:", error);
                      setError(
                        error instanceof Error
                          ? error.message
                          : "Failed to upload image",
                      );
                    }
                  }}
                />
              </Button>
            </Box>
          </Grid>

          {/* Form Fields */}
          <Grid item xs={12} md={9}>
            <Box
              component="form"
              onSubmit={handleSubmit}
              sx={{
                "& .MuiTextField-root": {
                  "& .MuiOutlinedInput-root": {
                    "&:hover fieldset": {
                      borderColor: (theme) => theme.palette.primary.main,
                    },
                    "&.Mui-focused fieldset": {
                      borderWidth: "2px",
                    },
                  },
                },
              }}
            >
              <Grid container spacing={3}>
                {/* Error Dialog */}
                <Dialog
                  open={Boolean(error)}
                  onClose={() => setError(null)}
                  TransitionComponent={Fade}
                  TransitionProps={{ timeout: 500 }}
                  PaperProps={{
                    sx: {
                      borderRadius: 3,
                      minWidth: "300px",
                      background: (theme) =>
                        theme.palette.mode === "dark"
                          ? "linear-gradient(145deg, rgba(40,40,40,0.95), rgba(30,30,30,0.95))"
                          : "linear-gradient(145deg, rgba(255,255,255,0.95), rgba(250,250,250,0.95))",
                      backdropFilter: "blur(10px)",
                      border: (theme) =>
                        `1px solid ${theme.palette.error.main}40`,
                      boxShadow: (theme) =>
                        `0 8px 32px ${theme.palette.error.main}30`,
                    },
                  }}
                >
                  <DialogTitle
                    sx={{
                      textAlign: "center",
                      pt: 3,
                      pb: 0,
                    }}
                  >
                    <IconButton
                      onClick={() => setError(null)}
                      sx={{
                        position: "absolute",
                        right: 8,
                        top: 8,
                        color: (theme) => theme.palette.grey[500],
                      }}
                    >
                      <Close />
                    </IconButton>
                    <ErrorOutline
                      sx={{
                        fontSize: "4rem",
                        color: "error.main",
                        mb: 1,
                      }}
                    />
                  </DialogTitle>
                  <DialogContent>
                    <Typography
                      variant="h6"
                      align="center"
                      sx={{
                        mb: 2,
                        color: (theme) =>
                          theme.palette.mode === "dark"
                            ? theme.palette.error.light
                            : theme.palette.error.dark,
                        fontWeight: "bold",
                      }}
                    >
                      Error
                    </Typography>
                    <Typography
                      align="center"
                      sx={{
                        mb: 3,
                        color: (theme) => theme.palette.text.secondary,
                      }}
                    >
                      {error}
                    </Typography>
                    <Box sx={{ textAlign: "center", mb: 2 }}>
                      <Button
                        onClick={() => setError(null)}
                        variant="contained"
                        sx={{
                          px: 4,
                          background: (theme) =>
                            `linear-gradient(45deg, ${theme.palette.error.main}, ${theme.palette.error.dark})`,
                          boxShadow: (theme) =>
                            `0 4px 20px ${theme.palette.error.main}40`,
                          "&:hover": {
                            background: (theme) =>
                              `linear-gradient(45deg, ${theme.palette.error.dark}, ${theme.palette.error.main})`,
                            boxShadow: (theme) =>
                              `0 6px 25px ${theme.palette.error.main}60`,
                          },
                        }}
                      >
                        Close
                      </Button>
                    </Box>
                  </DialogContent>
                </Dialog>

                {/* Success Dialog */}
                <Dialog
                  open={Boolean(success)}
                  onClose={() => setSuccess(null)}
                  TransitionComponent={Fade}
                  TransitionProps={{ timeout: 500 }}
                  PaperProps={{
                    sx: {
                      borderRadius: 3,
                      minWidth: "300px",
                      background: (theme) =>
                        theme.palette.mode === "dark"
                          ? "linear-gradient(145deg, rgba(40,40,40,0.95), rgba(30,30,30,0.95))"
                          : "linear-gradient(145deg, rgba(255,255,255,0.95), rgba(250,250,250,0.95))",
                      backdropFilter: "blur(10px)",
                      border: (theme) =>
                        `1px solid ${theme.palette.primary.main}40`,
                      boxShadow: (theme) =>
                        `0 8px 32px ${theme.palette.primary.main}30`,
                    },
                  }}
                >
                  <DialogTitle
                    sx={{
                      textAlign: "center",
                      pt: 3,
                      pb: 0,
                    }}
                  >
                    <IconButton
                      onClick={() => setSuccess(null)}
                      sx={{
                        position: "absolute",
                        right: 8,
                        top: 8,
                        color: (theme) => theme.palette.grey[500],
                      }}
                    >
                      <Close />
                    </IconButton>
                    <CheckCircleOutline
                      sx={{
                        fontSize: "4rem",
                        color: "success.main",
                        mb: 1,
                      }}
                    />
                  </DialogTitle>
                  <DialogContent>
                    <Typography
                      variant="h6"
                      align="center"
                      sx={{
                        mb: 2,
                        color: (theme) =>
                          theme.palette.mode === "dark"
                            ? theme.palette.primary.light
                            : theme.palette.primary.dark,
                        fontWeight: "bold",
                      }}
                    >
                      {success}
                    </Typography>
                    <Box sx={{ textAlign: "center", mb: 2 }}>
                      <Button
                        onClick={() => setSuccess(null)}
                        variant="contained"
                        sx={{
                          px: 4,
                          background: (theme) =>
                            `linear-gradient(45deg, ${theme.palette.success.main}, ${theme.palette.success.dark})`,
                          boxShadow: (theme) =>
                            `0 4px 20px ${theme.palette.success.main}40`,
                          "&:hover": {
                            background: (theme) =>
                              `linear-gradient(45deg, ${theme.palette.success.dark}, ${theme.palette.success.main})`,
                            boxShadow: (theme) =>
                              `0 6px 25px ${theme.palette.success.main}60`,
                          },
                        }}
                      >
                        OK
                      </Button>
                    </Box>
                  </DialogContent>
                </Dialog>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Name"
                    name="name"
                    value={getFormValue(formData.name)}
                    onChange={handleInputChange}
                    variant="outlined"
                    sx={{
                      "& label.Mui-focused": {
                        color: (theme) => theme.palette.primary.main,
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    required
                    label="Email"
                    name="email"
                    type="email"
                    value={getFormValue(formData.email)}
                    InputProps={{
                      readOnly: true,
                    }}
                    variant="outlined"
                    sx={{
                      "& label.Mui-focused": {
                        color: (theme) => theme.palette.primary.main,
                      },
                      "& .MuiInputBase-input.Mui-readOnly": {
                        cursor: "not-allowed",
                        bgcolor: (theme) =>
                          theme.palette.action.disabledBackground,
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Phone Number"
                    name="phoneNumber"
                    value={getFormValue(formData.phoneNumber)}
                    onChange={handleInputChange}
                    variant="outlined"
                    sx={{
                      "& label.Mui-focused": {
                        color: (theme) => theme.palette.primary.main,
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Date of Birth"
                    name="dateOfBirth"
                    type="date"
                    value={getFormValue(formData.dateOfBirth)}
                    onChange={handleInputChange}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{
                      max: new Date().toISOString().split("T")[0],
                    }}
                    variant="outlined"
                    sx={{
                      "& label.Mui-focused": {
                        color: (theme) => theme.palette.primary.main,
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Country"
                    name="country"
                    value={getFormValue(formData.country)}
                    onChange={handleInputChange}
                    variant="outlined"
                    sx={{
                      "& label.Mui-focused": {
                        color: (theme) => theme.palette.primary.main,
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="City"
                    name="city"
                    value={getFormValue(formData.city)}
                    onChange={handleInputChange}
                    variant="outlined"
                    sx={{
                      "& label.Mui-focused": {
                        color: (theme) => theme.palette.primary.main,
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Company Name"
                    name="companyName"
                    value={getFormValue(formData.companyName)}
                    onChange={handleInputChange}
                    variant="outlined"
                    sx={{
                      "& label.Mui-focused": {
                        color: (theme) => theme.palette.primary.main,
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="ID Number"
                    name="idNumber"
                    value={getFormValue(formData.idNumber)}
                    onChange={handleInputChange}
                    variant="outlined"
                    sx={{
                      "& label.Mui-focused": {
                        color: (theme) => theme.palette.primary.main,
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Street Address"
                    name="streetAddress"
                    value={getFormValue(formData.streetAddress)}
                    onChange={handleInputChange}
                    multiline
                    rows={2}
                    variant="outlined"
                    sx={{
                      mr: 0.6,
                      "& label.Mui-focused": {
                        color: (theme) => theme.palette.primary.main,
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={saving}
                    sx={{
                      px: 4,
                      py: 2,
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
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </Grid>
              </Grid>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Two Factor Authentication Section */}
      <Box sx={{ mt: 4 }}>
        <TwoFactorSettings twoFactorEnabled={formData.twoFactorEnabled} />
      </Box>

      {/* Password Change Section */}
      <Box sx={{ mt: 4, mb: 4 }}>
        <Paper
          elevation={3}
          sx={{
            p: { xs: 2, sm: 4 },
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
                theme.palette.mode === "dark"
                  ? "primary.light"
                  : "primary.dark",
              mb: 3,
            }}
          >
            Password Settings
          </Typography>

          {!showPasswordForm ? (
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
          ) : (
            <Box component="form" onSubmit={handlePasswordSubmit}>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    type="password"
                    label="Current Password"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
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
                    onChange={(e) =>
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
                    onChange={(e) =>
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
  );
}
