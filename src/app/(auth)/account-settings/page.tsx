"use client";

/**
 * Account Settings page (authenticated) - BitFactory Daylight theme (v1.3)
 *
 * Composes:
 * - Page heading
 * - Daylight profile card (avatar upload, editable fields, save button)
 * - Lightweight Daylight-toned error/success dialogs (page-local, not the
 *   shared generic modal pattern, so restyled in place rather than deferred)
 *
 * All fetch/upload/patch logic is unchanged from the previous implementation.
 */

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Grid as MuiGrid,
  Avatar,
  CircularProgress,
  Dialog,
  DialogContent,
  Fade,
  IconButton,
} from "@mui/material";

import { CheckCircleOutline, Close, ErrorOutline } from "@mui/icons-material";
import { PhotoCamera } from "@mui/icons-material";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

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
}

export default function AccountSettings() {
  const { d, fonts } = useDaylight();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
  });

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
    "& .MuiInputBase-input": { fontFamily: fonts.body, color: d.text },
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
          Account Settings
        </Typography>
        <Typography
          sx={{
            fontSize: { xs: 12, md: 13 },
            lineHeight: { xs: 1.7, md: 1.5 },
            color: d.muted,
            mt: "7px",
          }}
        >
          Manage your profile information.
        </Typography>
      </Box>

      {/* Profile Section */}
      <Box
        sx={{
          p: { xs: 2.5, sm: 4 },
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
        }}
      >
        <Grid container spacing={4}>
          {/* Profile Photo Section */}
          <Grid item xs={12} md={3}>
            <Box sx={{ textAlign: "center" }}>
              <Avatar
                src={formData.profileImage || undefined}
                sx={{
                  width: { xs: 100, sm: 120, md: 140 },
                  height: { xs: 100, sm: 120, md: 140 },
                  mx: "auto",
                  mb: 2,
                  bgcolor: d.action,
                  fontSize: { xs: "2.5rem", sm: "3rem", md: "3.5rem" },
                  fontFamily: fonts.heading,
                  border: `4px solid ${d.surface}`,
                  boxShadow: d.shadow,
                }}
              >
                {formData.name?.charAt(0) || "U"}
              </Avatar>
              <Button
                component="label"
                startIcon={<PhotoCamera sx={{ fontSize: 18 }} />}
                sx={{
                  textTransform: "none",
                  fontFamily: fonts.body,
                  fontWeight: 600,
                  fontSize: 12.5,
                  borderRadius: "8px",
                  border: `1px solid ${d.inputBorder}`,
                  color: d.text,
                  px: "16px",
                  "&:hover": { bgcolor: d.hover },
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
            <Box component="form" onSubmit={handleSubmit}>
              <Grid container spacing={3}>
                {/* Error Dialog */}
                <Dialog
                  open={Boolean(error)}
                  onClose={() => setError(null)}
                  TransitionComponent={Fade}
                  TransitionProps={{ timeout: 500 }}
                  PaperProps={{
                    sx: {
                      borderRadius: "16px",
                      minWidth: "300px",
                      bgcolor: d.surface,
                      border: `1px solid ${d.border}`,
                      boxShadow: d.shadow,
                    },
                  }}
                >
                  <Box
                    sx={{
                      textAlign: "center",
                      pt: 3,
                      pb: 0,
                      position: "relative",
                    }}
                  >
                    <IconButton
                      onClick={() => setError(null)}
                      sx={{
                        position: "absolute",
                        right: 8,
                        top: 8,
                        color: d.muted,
                      }}
                    >
                      <Close />
                    </IconButton>
                    <ErrorOutline
                      sx={{ fontSize: "3.5rem", color: d.danger, mb: 1 }}
                    />
                  </Box>
                  <DialogContent>
                    <Typography
                      align="center"
                      sx={{
                        mb: 2,
                        fontFamily: fonts.heading,
                        fontWeight: 700,
                        fontSize: 18,
                        color: d.text,
                      }}
                    >
                      Error
                    </Typography>
                    <Typography
                      align="center"
                      sx={{
                        mb: 3,
                        fontFamily: fonts.body,
                        fontSize: 13,
                        color: d.muted,
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
                          textTransform: "none",
                          fontFamily: fonts.body,
                          fontWeight: 650,
                          borderRadius: "8px",
                          bgcolor: d.danger,
                          boxShadow: "none",
                          "&:hover": {
                            bgcolor: d.danger,
                            opacity: 0.9,
                            boxShadow: "none",
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
                      borderRadius: "16px",
                      minWidth: "300px",
                      bgcolor: d.surface,
                      border: `1px solid ${d.border}`,
                      boxShadow: d.shadow,
                    },
                  }}
                >
                  <Box
                    sx={{
                      textAlign: "center",
                      pt: 3,
                      pb: 0,
                      position: "relative",
                    }}
                  >
                    <IconButton
                      onClick={() => setSuccess(null)}
                      sx={{
                        position: "absolute",
                        right: 8,
                        top: 8,
                        color: d.muted,
                      }}
                    >
                      <Close />
                    </IconButton>
                    <CheckCircleOutline
                      sx={{ fontSize: "3.5rem", color: d.success, mb: 1 }}
                    />
                  </Box>
                  <DialogContent>
                    <Typography
                      align="center"
                      sx={{
                        mb: 2,
                        fontFamily: fonts.heading,
                        fontWeight: 700,
                        fontSize: 18,
                        color: d.text,
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
                          textTransform: "none",
                          fontFamily: fonts.body,
                          fontWeight: 650,
                          borderRadius: "8px",
                          bgcolor: d.action,
                          boxShadow: "none",
                          "&:hover": {
                            bgcolor: d.actionHover,
                            boxShadow: "none",
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
                    sx={inputSx}
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
                      ...inputSx,
                      "& .MuiInputBase-input.Mui-readOnly": {
                        cursor: "not-allowed",
                        bgcolor: d.hover,
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
                    sx={inputSx}
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
                      width: "100%",
                      ...inputSx,
                      "& .MuiOutlinedInput-root": {
                        ...inputSx["& .MuiOutlinedInput-root"],
                        width: "100%",
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
                    sx={inputSx}
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
                    sx={inputSx}
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
                    sx={inputSx}
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
                    sx={inputSx}
                  />
                </Grid>
                <Grid item xs={12} sm={12} md={12} lg={12}>
                  <TextField
                    fullWidth
                    label="Street Address"
                    name="streetAddress"
                    value={getFormValue(formData.streetAddress)}
                    onChange={handleInputChange}
                    variant="outlined"
                    sx={{
                      width: "100%",
                      ...inputSx,
                      "& .MuiInputBase-root": { width: "100%" },
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
                      py: 1.4,
                      textTransform: "none",
                      fontFamily: fonts.body,
                      fontWeight: 650,
                      borderRadius: "8px",
                      bgcolor: d.action,
                      color: "#fff",
                      boxShadow: "none",
                      "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
                      "&.Mui-disabled": { bgcolor: d.border, color: d.muted },
                    }}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </Grid>
              </Grid>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
