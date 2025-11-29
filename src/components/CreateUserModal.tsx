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
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "CLIENT",
    sendEmail: true,
    groupIds: [] as string[],
    initialDeposit: 0,
  });
  const [error, setError] = useState("");
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  /**
   * Fetch available workspace groups when modal opens
   */
  useEffect(() => {
    if (open) {
      fetchGroups();
    }
  }, [open]);

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
   * Validate name field - only lowercase letters, numbers, underscores, and hyphens
   */
  const isValidName = (name: string): boolean => {
    const nameRegex = /^[a-z0-9_-]+$/;
    return nameRegex.test(name);
  };

  const handleNameChange = (newName: string) => {
    // Only allow lowercase letters, numbers, underscores, and hyphens
    const validatedName = newName
      .replace(/[^a-z0-9_-]/gi, "") // Remove invalid characters
      .toLowerCase(); // Convert to lowercase

    setFormData((prev) => ({ ...prev, name: validatedName }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validate name format
    if (!formData.name || formData.name.trim().length === 0) {
      setError("Name is required");
      setLoading(false);
      return;
    }

    if (!isValidName(formData.name)) {
      setError(
        "Name can only contain lowercase letters, numbers, underscores, and hyphens",
      );
      setLoading(false);
      return;
    }

    // Validate group selection
    if (formData.groupIds.length === 0) {
      setError("Please select at least one group");
      setLoading(false);
      return;
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

      // Log Luxor creation results if available
      if (data.luxorSummary) {
        console.log("[CreateUserModal] Luxor subaccount creation summary:", {
          success: data.luxorSummary.successCount,
          failed: data.luxorSummary.failureCount,
          total: data.luxorSummary.totalAttempted,
        });
      }

      onSuccess();
      onClose();
      setFormData({
        name: "",
        email: "",
        role: "CLIENT",
        sendEmail: true,
        groupIds: [],
        initialDeposit: 0,
      });
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
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., user-name_123"
              helperText="Lowercase letters, numbers, underscores, and hyphens only"
              required
              error={formData.name.length > 0 && !isValidName(formData.name)}
            />
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              required
            />
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
            disabled={loading || fetchingGroups || groups.length === 0}
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
