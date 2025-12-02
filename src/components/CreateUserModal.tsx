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

/**
 * Workspace group from Luxor API
 */
interface WorkspaceGroup {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown;
}

interface Subaccount {
  id: number;
  name: string;
  created_at: string;
  url: string;
}

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateUserModal({
  open,
  onClose,
  onSuccess,
}: CreateUserModalProps) {
  const [loading, setLoading] = useState(false);
  const [fetchingGroups, setFetchingGroups] = useState(true);
  const [fetchingSubaccounts, setFetchingSubaccounts] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "CLIENT",
    sendEmail: true,
    groupIds: [] as string[],
    luxorSubaccountName: "",
    initialDeposit: 0,
  });
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([]);
  const [subaccountsError, setSubaccountsError] = useState<string | null>(null);

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
   * Fetch workspace groups when modal opens
   */
  useEffect(() => {
    if (open) {
      fetchGroups();
    }
  }, [open]);

  /**
   * Fetch subaccounts when selected groups change
   */
  useEffect(() => {
    if (formData.groupIds.length > 0) {
      fetchSubaccounts();
    } else {
      setSubaccounts([]);
      setFormData((prev) => ({ ...prev, luxorSubaccountName: "" }));
    }
  }, [formData.groupIds]);

  /**
   * Fetch workspace groups from Luxor API
   * Mirrors the exact flow from the Subaccounts page
   */
  const fetchGroups = async () => {
    try {
      setFetchingGroups(true);
      setGroupsError(null);

      console.log(
        "[CreateUserModal] Fetching workspace groups from /api/luxor",
      );

      const response = await fetch("/api/luxor?endpoint=workspace");

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: ProxyResponse<Record<string, unknown>> =
        await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch groups");
      }

      // Extract groups array from workspace data - same as Subaccounts page
      const workspaceData = data.data as Record<string, unknown>;
      let groupsList: WorkspaceGroup[] = [];

      if (workspaceData && Array.isArray(workspaceData.groups)) {
        groupsList = (
          workspaceData.groups as Array<Record<string, unknown>>
        ).map(
          (group: Record<string, unknown>) =>
            ({
              id: String(group.id || ""),
              name: String(group.name || ""),
              type: String(group.type || "UNSPECIFIED"),
            }) as WorkspaceGroup,
        );
      }

      setGroups(groupsList);
      console.log(`[CreateUserModal] Fetched ${groupsList.length} groups`);
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

  /**
   * Fetch subaccounts from Luxor API for selected groups
   * Filters out subaccounts that are already assigned to other users in the database
   */
  const fetchSubaccounts = async () => {
    try {
      setFetchingSubaccounts(true);
      setSubaccountsError(null);
      setSubaccounts([]);

      console.log(
        "[CreateUserModal] Fetching subaccounts for groups:",
        formData.groupIds,
      );

      // Step 1: Fetch all existing luxor subaccount names from database
      let existingSubaccounts: string[] = [];
      try {
        const dbResponse = await fetch("/api/user/subaccounts/existing", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (dbResponse.ok) {
          const dbData = await dbResponse.json();
          existingSubaccounts = dbData.subaccounts || [];
          console.log(
            "[CreateUserModal] Existing subaccounts in DB:",
            existingSubaccounts,
          );
        } else {
          console.warn(
            "[CreateUserModal] Failed to fetch existing subaccounts from DB",
          );
        }
      } catch (err) {
        console.warn(
          "[CreateUserModal] Error fetching existing subaccounts:",
          err,
        );
      }

      // Step 2: Fetch subaccounts for each selected group from Luxor API
      const allSubaccounts: Subaccount[] = [];

      for (const groupId of formData.groupIds) {
        try {
          const response = await fetch(
            `/api/luxor?endpoint=subaccount&groupId=${groupId}`,
          );

          if (!response.ok) {
            console.warn(
              `[CreateUserModal] Failed to fetch subaccounts for group ${groupId}: status ${response.status}`,
            );
            continue;
          }

          const data: ProxyResponse<Record<string, unknown>> =
            await response.json();

          if (!data.success) {
            console.warn(
              `[CreateUserModal] API error for group ${groupId}:`,
              data.error,
            );
            continue;
          }

          // Extract subaccounts array
          const subaccountsData = data.data as Record<string, unknown>;
          if (subaccountsData && Array.isArray(subaccountsData.subaccounts)) {
            const groupSubaccounts = (
              subaccountsData.subaccounts as Array<Record<string, unknown>>
            ).map(
              (sub: Record<string, unknown>) =>
                ({
                  id: Number(sub.id || 0),
                  name: String(sub.name || ""),
                  created_at: String(sub.created_at || ""),
                  url: String(sub.url || ""),
                }) as Subaccount,
            );
            allSubaccounts.push(...groupSubaccounts);
          }
        } catch (err) {
          console.warn(
            `[CreateUserModal] Error fetching group ${groupId}:`,
            err,
          );
        }
      }

      // Step 3: Remove duplicates and filter out already assigned subaccounts
      const uniqueSubaccounts = Array.from(
        new Map(allSubaccounts.map((s) => [s.name, s])).values(),
      );

      const availableSubaccounts = uniqueSubaccounts.filter(
        (sub) => !existingSubaccounts.includes(sub.name),
      );

      setSubaccounts(availableSubaccounts);
      console.log(
        `[CreateUserModal] Available subaccounts: ${availableSubaccounts.length}/${uniqueSubaccounts.length} (${uniqueSubaccounts.length - availableSubaccounts.length} already assigned)`,
      );
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

    // Validate group selection and subaccount selection only for CLIENT role
    if (formData.role === "CLIENT") {
      if (formData.groupIds.length === 0) {
        setError("Please select at least one group");
        setLoading(false);
        return;
      }

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

      onSuccess();
      onClose();
      setFormData({
        name: "",
        email: "",
        role: "CLIENT",
        sendEmail: true,
        groupIds: [],
        luxorSubaccountName: "",
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

            {/* Luxor Groups and Subaccount - Only for CLIENT role */}
            {formData.role === "CLIENT" && (
              <>
                {/* Luxor Groups Multi-Select */}
                <FormControl fullWidth>
                  <InputLabel>Luxor Groups</InputLabel>
                  <Select
                    multiple
                    value={formData.groupIds}
                    onChange={(e) => {
                      const value =
                        typeof e.target.value === "string"
                          ? e.target.value.split(",")
                          : e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        groupIds: value as string[],
                      }));
                    }}
                    input={<OutlinedInput label="Luxor Groups" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {(selected as string[]).map((groupId) => {
                          const group = groups.find((g) => g.id === groupId);
                          return (
                            <Chip
                              key={groupId}
                              label={group?.name || groupId}
                              size="small"
                            />
                          );
                        })}
                      </Box>
                    )}
                    disabled={fetchingGroups || groups.length === 0}
                  >
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

                {/* Luxor Subaccount Single-Select */}
                <FormControl
                  fullWidth
                  disabled={formData.groupIds.length === 0}
                >
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
                      <MenuItem disabled>
                        {formData.groupIds.length === 0
                          ? "Select groups first"
                          : "No subaccounts available"}
                      </MenuItem>
                    )}
                  </Select>
                  {formData.groupIds.length === 0 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 0.5 }}
                    >
                      Select at least one group to see subaccounts
                    </Typography>
                  )}
                </FormControl>

                {subaccountsError && (
                  <Alert severity="warning">{subaccountsError}</Alert>
                )}
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
                (fetchingGroups ||
                  fetchingSubaccounts ||
                  groups.length === 0 ||
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
