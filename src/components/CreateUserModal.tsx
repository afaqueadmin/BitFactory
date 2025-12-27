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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Alert,
  OutlinedInput,
  Chip,
  Typography,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

/**
 * Response structure from /api/luxor proxy route
 */
interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

interface Subaccount {
  id: number;
  name: string;
  created_at: string;
  url: string;
}

interface Group {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (text: string) => void;
}

export default function CreateUserModal({
  open,
  onClose,
  onSuccess,
}: CreateUserModalProps) {
  const [loading, setLoading] = useState(false);
  const [fetchingSubaccounts, setFetchingSubaccounts] = useState(true);
  const [fetchingGroups, setFetchingGroups] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "CLIENT",
    sendEmail: true,
    luxorSubaccountName: "",
    groupId: "",
    initialDeposit: 0,
  });
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([]);
  const [subaccountsError, setSubaccountsError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  /**
   * Check if email already exists in database
   */
  const checkEmailExists = async (email: string) => {
    // Only check if email has a valid format
    if (!email || !email.includes("@")) {
      setEmailError("");
      return;
    }

    try {
      setCheckingEmail(true);
      setEmailError("");

      console.log(`[CreateUserModal] Checking if email exists: ${email}`);

      const response = await fetch(
        `/api/user/check-email?email=${encodeURIComponent(email)}`,
      );

      const data = await response.json();

      if (data.exists) {
        setEmailError("This email is already registered");
        console.log("[CreateUserModal] Email already exists in database");
      } else {
        setEmailError("");
        console.log("[CreateUserModal] Email is available");
      }
    } catch (err) {
      console.error("[CreateUserModal] Error checking email:", err);
      setEmailError(""); // Don't show error on network issues
    } finally {
      setCheckingEmail(false);
    }
  };

  /**
   * Fetch subaccounts and groups when modal opens
   */
  useEffect(() => {
    if (open) {
      fetchSubaccounts();
      fetchGroups();
    }
  }, [open]);

  /**
   * Fetch subaccounts from V2 Luxor API
   * Filter out subaccounts already assigned to users in the database
   * Called when modal opens
   */
  const fetchSubaccounts = async () => {
    try {
      setFetchingSubaccounts(true);
      setSubaccountsError(null);
      setSubaccounts([]);

      console.log(
        "[CreateUserModal] Fetching subaccounts from V2 Luxor API and filtering assigned ones",
      );

      // Fetch all subaccounts from Luxor
      const luxorResponse = await fetch("/api/luxor?endpoint=subaccounts");

      if (!luxorResponse.ok) {
        throw new Error(`Luxor API returned status ${luxorResponse.status}`);
      }

      const luxorData: ProxyResponse<Record<string, unknown>> =
        await luxorResponse.json();

      if (!luxorData.success) {
        throw new Error(luxorData.error || "Failed to fetch subaccounts");
      }

      // Extract subaccounts array from response
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

      console.log(
        `[CreateUserModal] Fetched ${luxorSubaccountsList.length} subaccounts from Luxor`,
      );

      // Fetch assigned subaccounts from database
      console.log("[CreateUserModal] Fetching already-assigned subaccounts...");
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

      console.log(
        `[CreateUserModal] Found ${assignedSubaccountNames.length} already-assigned subaccounts:`,
        assignedSubaccountNames,
      );

      // Filter out assigned subaccounts
      const unassignedSubaccounts = luxorSubaccountsList.filter(
        (sub) => !assignedSubaccountNames.includes(sub.name),
      );

      console.log(
        `[CreateUserModal] Filtered to ${unassignedSubaccounts.length} unassigned subaccounts`,
      );

      setSubaccounts(unassignedSubaccounts);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to fetch subaccounts";
      console.error("[CreateUserModal] Error fetching subaccounts:", errorMsg);
      setSubaccountsError(errorMsg);
      setSubaccounts([]);
    } finally {
      setFetchingSubaccounts(false);
    }
  };

  /**
   * Fetch groups from API
   */
  const fetchGroups = async () => {
    try {
      setFetchingGroups(true);
      setGroupsError(null);
      setGroups([]);

      console.log("[CreateUserModal] Fetching groups from API");

      const response = await fetch("/api/groups");

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch groups");
      }

      const groupsList = Array.isArray(data.data) ? data.data : [];
      console.log(`[CreateUserModal] Fetched ${groupsList.length} groups`);

      // Filter only active groups
      const activeGroups = groupsList.filter((group: Group) => group.isActive);
      setGroups(activeGroups);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to fetch groups";
      console.error("[CreateUserModal] Error fetching groups:", errorMsg);
      setGroupsError(errorMsg);
      setGroups([]);
    } finally {
      setFetchingGroups(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validate name
    if (!formData.name || formData.name.trim().length === 0) {
      setError("Name is required");
      setLoading(false);
      return;
    }

    // Check if email error exists
    if (emailError) {
      setError("Please fix the email error before submitting");
      setLoading(false);
      return;
    }

    // Validate subaccount selection only for CLIENT role
    if (formData.role === "CLIENT") {
      if (!formData.luxorSubaccountName) {
        setError("Please select a Luxor subaccount");
        setLoading(false);
        return;
      }
    }

    try {
      const response = await fetch("/api/user/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create user");
      }

      // Show appropriate snackbar based on email sent status
      let emailSentText = "User created successfully! Welcome email sent.";
      if (!data.emailSent) {
        emailSentText = "Failed to send welcome email to the user.";
      }

      onSuccess(emailSentText);
      onClose();
      setFormData({
        name: "",
        email: "",
        role: "CLIENT",
        sendEmail: true,
        luxorSubaccountName: "",
        groupId: "",
        initialDeposit: 0,
      });
      setEmailError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
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
        Create New User
        <IconButton
          onClick={onClose}
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
                  setEmailError(""); // Clear error while typing
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
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={formData.role}
                label="Role"
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, role: e.target.value }))
                }
              >
                <MenuItem value="CLIENT">Client</MenuItem>
                <MenuItem value="ADMIN">Admin</MenuItem>
              </Select>
            </FormControl>

            {/* Initial Deposit - Only for CLIENT role */}
            {formData.role === "CLIENT" && (
              <TextField
                fullWidth
                label="Initial Deposit ($)"
                type="number"
                inputProps={{ step: "0.01", min: "0" }}
                value={formData.initialDeposit}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    initialDeposit: parseFloat(e.target.value) || 0,
                  }))
                }
                helperText="Optional: Set initial balance for this client"
              />
            )}

            {/* Luxor Subaccount - Only for CLIENT role */}
            {formData.role === "CLIENT" && (
              <>
                {/* Luxor Subaccount Single-Select */}
                <FormControl fullWidth>
                  <InputLabel>Luxor Subaccount</InputLabel>
                  <Select
                    value={formData.luxorSubaccountName}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        luxorSubaccountName: e.target.value,
                      }))
                    }
                    label="Luxor Subaccount"
                  >
                    {fetchingSubaccounts ? (
                      <MenuItem disabled>
                        <CircularProgress size={20} sx={{ mr: 1 }} />
                        Loading subaccounts...
                      </MenuItem>
                    ) : subaccounts.length > 0 ? (
                      subaccounts.map((subaccount) => (
                        <MenuItem key={subaccount.name} value={subaccount.name}>
                          {subaccount.name}
                        </MenuItem>
                      ))
                    ) : (
                      <MenuItem disabled>No subaccounts available</MenuItem>
                    )}
                  </Select>
                </FormControl>

                {subaccountsError && (
                  <Alert severity="warning">{subaccountsError}</Alert>
                )}

                {/* Group Selection - Only for CLIENT role */}
                <FormControl fullWidth disabled={fetchingGroups}>
                  <InputLabel>Group (Optional)</InputLabel>
                  <Select
                    value={formData.groupId}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        groupId: e.target.value,
                      }))
                    }
                    label="Group (Optional)"
                  >
                    <MenuItem value="">No Group</MenuItem>
                    {fetchingGroups ? (
                      <MenuItem disabled>
                        <CircularProgress size={20} sx={{ mr: 1 }} />
                        Loading groups...
                      </MenuItem>
                    ) : groups.length > 0 ? (
                      groups.map((group) => (
                        <MenuItem key={group.id} value={group.id}>
                          {group.name}
                        </MenuItem>
                      ))
                    ) : (
                      <MenuItem disabled>No groups available</MenuItem>
                    )}
                  </Select>
                </FormControl>

                {groupsError && <Alert severity="warning">{groupsError}</Alert>}
              </>
            )}

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
              label="Send welcome email to user"
            />

            {error && <Alert severity="error">{error}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={
              loading ||
              (formData.role === "CLIENT" &&
                (fetchingSubaccounts ||
                  subaccounts.length === 0 ||
                  !formData.luxorSubaccountName))
            }
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
