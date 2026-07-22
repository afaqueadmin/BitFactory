"use client";

import React, { useState, useEffect } from "react";
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

interface CreateFranchiseeModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (text: string) => void;
}

interface Subaccount {
  id: number;
  name: string;
  created_at: string;
  url: string;
}

interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
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
  luxorSubaccountName: "",
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
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([]);
  const [fetchingSubaccounts, setFetchingSubaccounts] = useState(false);

  useEffect(() => {
    if (open) {
      fetchSubaccounts();
    }
  }, [open]);

  /**
   * Fetch subaccounts from Luxor, excluding ones already assigned to a user
   * — same pattern as CreateUserModal's franchisee-personal-account picker.
   * Optional for a franchisee (unlike CLIENT, where it's required).
   */
  const fetchSubaccounts = async () => {
    try {
      setFetchingSubaccounts(true);
      setSubaccounts([]);

      const luxorResponse = await fetch("/api/luxor?endpoint=subaccounts");
      if (!luxorResponse.ok) {
        throw new Error(`Luxor API returned status ${luxorResponse.status}`);
      }

      const luxorData: ProxyResponse<Record<string, unknown>> =
        await luxorResponse.json();
      if (!luxorData.success) {
        throw new Error(luxorData.error || "Failed to fetch subaccounts");
      }

      const responseData = luxorData.data as Record<string, unknown>;
      let luxorSubaccountsList: Subaccount[] = [];
      if (responseData && Array.isArray(responseData.subaccounts)) {
        luxorSubaccountsList = (
          responseData.subaccounts as Array<Record<string, unknown>>
        ).map(
          (sub: Record<string, unknown>) =>
            ({
              id: Number(sub.id || 0),
              name: String(sub.name || ""),
              created_at: String(sub.created_at || ""),
              url: String(sub.url || ""),
            }) as Subaccount,
        );
      }

      const dbResponse = await fetch("/api/user/subaccounts/existing");
      let assignedSubaccountNames: string[] = [];
      if (dbResponse.ok) {
        const dbData = await dbResponse.json();
        if (dbData.success && Array.isArray(dbData.data)) {
          assignedSubaccountNames = dbData.data.map(
            (item: { luxorSubaccountName: string }) => item.luxorSubaccountName,
          );
        }
      }

      const unassignedSubaccounts = luxorSubaccountsList.filter(
        (sub) => !assignedSubaccountNames.includes(sub.name),
      );
      setSubaccounts(unassignedSubaccounts);
    } catch (err) {
      console.error("[CreateFranchiseeModal] Error fetching subaccounts:", err);
      setSubaccounts([]);
    } finally {
      setFetchingSubaccounts(false);
    }
  };

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

            <FormControl fullWidth disabled={fetchingSubaccounts}>
              <InputLabel>Luxor Subaccount (Optional)</InputLabel>
              <Select
                value={formData.luxorSubaccountName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    luxorSubaccountName: e.target.value,
                  }))
                }
                label="Luxor Subaccount (Optional)"
              >
                <MenuItem value="">None</MenuItem>
                {fetchingSubaccounts ? (
                  <MenuItem disabled>
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                    Loading subaccounts...
                  </MenuItem>
                ) : (
                  subaccounts.map((subaccount) => (
                    <MenuItem key={subaccount.name} value={subaccount.name}>
                      {subaccount.name}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>

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
