/**
 * src/app/(manage)/groups/page.tsx
 * Subaccount Groups Management Page
 *
 * Admin page for managing internal subaccount groups with full CRUD operations:
 * - Create new groups
 * - Update existing groups
 * - Delete groups
 * - View group details (name, description, subaccount count)
 * - Manage group membership
 * - Real-time status and feedback
 *
 * Groups allow organizing subaccounts hierarchically since Luxor V2 deprecated
 * the Groups API. Each group can contain multiple subaccounts.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import GroupIcon from "@mui/icons-material/Group";
import GradientStatCard from "@/components/GradientStatCard";

/**
 * Group type matching database schema
 */
interface Group {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  creator?: {
    id: string;
    name: string;
    email: string;
  };
  _count?: {
    subaccounts: number;
  };
}

/**
 * Response structure from API routes
 */
interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Form data structure for group operations
 */
interface GroupFormData {
  name: string;
  description: string;
}

/**
 * Component state for managing groups
 */
interface GroupsState {
  groups: Group[];
  loading: boolean;
  error: string | null;
}

/**
 * Dialog state for form operations
 */
interface DialogState {
  open: boolean;
  mode: "create" | "edit" | "delete";
  selectedGroup: Group | null;
  formData: GroupFormData;
  submitting: boolean;
  message: string | null;
}

/**
 * Initial dialog state
 */
const initialDialogState: DialogState = {
  open: false,
  mode: "create",
  selectedGroup: null,
  formData: {
    name: "",
    description: "",
  },
  submitting: false,
  message: null,
};

export default function GroupsPage() {
  const [state, setState] = useState<GroupsState>({
    groups: [],
    loading: true,
    error: null,
  });

  const [dialog, setDialog] = useState<DialogState>(initialDialogState);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Fetch all groups
   *
   * This function fetches all groups available in the system.
   * Called on component mount and when refreshing or after CRUD operations complete.
   */
  const fetchGroups = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      console.log("[Groups] Fetching all groups...");

      const response = await fetch("/api/groups");

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: ApiResponse<Group[]> = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch groups");
      }

      const groupsList = Array.isArray(data.data) ? data.data : [];

      console.log("[Groups] Parsed groups:", groupsList);

      setState({
        groups: groupsList,
        loading: false,
        error: null,
      });

      console.log(`[Groups] Successfully fetched ${groupsList.length} groups`);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Groups] Error fetching groups:", errorMsg);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMsg,
      }));
    }
  }, []);

  /**
   * Fetch groups on component mount
   */
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  /**
   * Handle create group form submission
   *
   * Sends a POST request to /api/groups with the new group data
   */
  const handleCreateGroup = async () => {
    if (!dialog.formData.name.trim()) {
      setDialog((prev) => ({
        ...prev,
        message: "Group name is required",
      }));
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      console.log("[Groups] Creating group:", dialog.formData.name);

      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dialog.formData.name.trim(),
          description: dialog.formData.description.trim(),
        }),
      });

      const data: ApiResponse<Group> = await response.json();

      console.log("[Groups] Create response:", {
        status: response.status,
        data,
      });

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error("[Groups] Error creating group:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[Groups] Group created successfully");

      // Refresh the groups list
      await fetchGroups();

      // Close dialog
      setDialog(initialDialogState);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Groups] Error creating group:", errorMsg);
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        message: errorMsg,
      }));
    }
  };

  /**
   * Handle update group form submission
   *
   * Sends a PUT request to /api/groups/[id] with the updated group data
   */
  const handleUpdateGroup = async () => {
    if (!dialog.selectedGroup) {
      setDialog((prev) => ({
        ...prev,
        message: "No group selected",
      }));
      return;
    }

    if (!dialog.formData.name.trim()) {
      setDialog((prev) => ({
        ...prev,
        message: "Group name is required",
      }));
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      const groupId = dialog.selectedGroup.id;

      console.log("[Groups] Updating group:", groupId);

      const response = await fetch(`/api/groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dialog.formData.name.trim(),
          description: dialog.formData.description.trim(),
        }),
      });

      const data: ApiResponse<Group> = await response.json();

      console.log("[Groups] Update response:", {
        status: response.status,
        data,
      });

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error("[Groups] Error updating group:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[Groups] Group updated successfully");

      // Refresh the groups list
      await fetchGroups();

      // Close dialog
      setDialog(initialDialogState);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Groups] Error updating group:", errorMsg);
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        message: errorMsg,
      }));
    }
  };

  /**
   * Handle delete group confirmation
   *
   * Sends a DELETE request to /api/groups/[id]
   */
  const handleDeleteGroup = async () => {
    if (!dialog.selectedGroup) {
      setDialog((prev) => ({
        ...prev,
        message: "No group selected",
      }));
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      const groupId = dialog.selectedGroup.id;

      console.log("[Groups] Deleting group:", groupId);

      const response = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
      });

      const data: ApiResponse = await response.json();

      console.log("[Groups] Delete response:", {
        status: response.status,
        data,
      });

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error("[Groups] Error deleting group:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[Groups] Group deleted successfully");

      // Refresh the groups list
      await fetchGroups();

      // Close dialog
      setDialog(initialDialogState);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Groups] Error deleting group:", errorMsg);
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        message: errorMsg,
      }));
    }
  };

  /**
   * Open create group dialog
   */
  const openCreateDialog = () => {
    setDialog({
      ...initialDialogState,
      open: true,
      mode: "create",
    });
  };

  /**
   * Open edit group dialog
   */
  const openEditDialog = (group: Group) => {
    setDialog({
      open: true,
      mode: "edit",
      selectedGroup: group,
      formData: {
        name: group.name,
        description: group.description || "",
      },
      submitting: false,
      message: null,
    });
  };

  /**
   * Open delete confirmation dialog
   */
  const openDeleteDialog = (group: Group) => {
    setDialog({
      open: true,
      mode: "delete",
      selectedGroup: group,
      formData: {
        name: "",
        description: "",
      },
      submitting: false,
      message: null,
    });
  };

  /**
   * Close dialog
   */
  const closeDialog = () => {
    setDialog(initialDialogState);
  };

  /**
   * Handle dialog form submission
   */
  const handleDialogSubmit = () => {
    switch (dialog.mode) {
      case "create":
        handleCreateGroup();
        break;
      case "edit":
        handleUpdateGroup();
        break;
      case "delete":
        handleDeleteGroup();
        break;
    }
  };

  /**
   * Handle manual refresh
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchGroups();
    setIsRefreshing(false);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (state.loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  const totalSubaccounts = state.groups.reduce(
    (sum, g) => sum + (g._count?.subaccounts ?? 0),
    0,
  );

  return (
    <Box
      component="main"
      sx={{ py: 4, backgroundColor: "background.default", minHeight: "100vh" }}
    >
      <Container maxWidth="xl">
        {/* Page Header */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 4,
          }}
        >
          <Box>
            <Typography
              variant="h3"
              component="h1"
              sx={{
                fontWeight: "bold",
                color: "text.primary",
              }}
            >
              Subaccount Groups
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Organize your subaccounts into groups for better management
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openCreateDialog}
            >
              Create Group
            </Button>
          </Stack>
        </Box>

        {/* Error Alert */}
        {state.error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
              Error Loading Groups
            </Typography>
            <Typography variant="body2">{state.error}</Typography>
          </Alert>
        )}

        {/* Stat Cards */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "1fr 1fr",
              md: "repeat(2, 1fr)",
            },
            gap: 3,
            mb: 4,
          }}
        >
          <Box>
            <GradientStatCard
              title="Total Groups"
              value={String(state.groups.length)}
              gradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
              icon={<GroupIcon fontSize="small" />}
            />
          </Box>

          <Box>
            <GradientStatCard
              title="Total Subaccounts"
              value={String(totalSubaccounts)}
              gradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
              icon={<GroupIcon fontSize="small" />}
            />
          </Box>
        </Box>

        {/* Groups Table */}
        {state.groups.length > 0 ? (
          <TableContainer component={Paper} sx={{ mb: 4 }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "background.default" }}>
                  <TableCell sx={{ fontWeight: "bold" }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }} align="center">
                    Status
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }} align="right">
                    Subaccounts
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Created By</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }} align="right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {state.groups.map((group) => (
                  <TableRow
                    key={group.id}
                    sx={{
                      "&:hover": {
                        backgroundColor: "background.default",
                      },
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {group.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}
                      >
                        {group.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {group.description || "-"}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={group.isActive ? "Active" : "Inactive"}
                        color={group.isActive ? "success" : "default"}
                        variant="outlined"
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {group._count?.subaccounts ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {group.creator?.name || group.createdBy}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={1}
                        justifyContent="flex-end"
                      >
                        <Tooltip title="Edit Group">
                          <IconButton
                            size="small"
                            onClick={() => openEditDialog(group)}
                            color="primary"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Group">
                          <IconButton
                            size="small"
                            onClick={() => openDeleteDialog(group)}
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Paper sx={{ p: 4, textAlign: "center", mb: 4 }}>
            <GroupIcon
              sx={{
                fontSize: 64,
                color: "text.secondary",
                mb: 2,
                opacity: 0.5,
              }}
            />
            <Typography variant="h6" color="text.secondary">
              No groups created yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Click &quot;Create Group&quot; to organize your subaccounts
            </Typography>
          </Paper>
        )}

        {/* Create/Edit/Delete Dialog */}
        <Dialog
          open={dialog.open}
          onClose={closeDialog}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box>
              {dialog.mode === "create"
                ? "Create New Group"
                : dialog.mode === "edit"
                  ? "Edit Group"
                  : "Delete Group"}
            </Box>
            <IconButton onClick={closeDialog} size="small">
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ pt: 2 }}>
            {dialog.message && (
              <Alert
                severity={
                  dialog.message.toLowerCase().includes("error")
                    ? "error"
                    : "info"
                }
                sx={{ mb: 2 }}
              >
                {dialog.message}
              </Alert>
            )}

            {dialog.mode === "delete" ? (
              <Box>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  Are you sure you want to delete this group?
                </Typography>
                <Paper sx={{ p: 2, backgroundColor: "background.default" }}>
                  <Typography variant="body2" color="text.secondary">
                    Group Name
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {dialog.selectedGroup?.name}
                  </Typography>
                  {dialog.selectedGroup?.description && (
                    <>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 2 }}
                      >
                        Description
                      </Typography>
                      <Typography variant="body2">
                        {dialog.selectedGroup.description}
                      </Typography>
                    </>
                  )}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 2 }}
                  >
                    Subaccounts
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {dialog.selectedGroup?._count?.subaccounts ?? 0}
                  </Typography>
                </Paper>
                <Alert severity="warning" sx={{ mt: 2 }}>
                  This action cannot be undone. Associated subaccounts will not
                  be deleted, only removed from the group.
                </Alert>
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <TextField
                  fullWidth
                  label="Group Name"
                  placeholder="Enter group name"
                  value={dialog.formData.name}
                  onChange={(e) =>
                    setDialog((prev) => ({
                      ...prev,
                      formData: {
                        ...prev.formData,
                        name: e.target.value,
                      },
                      message: null,
                    }))
                  }
                  disabled={dialog.submitting}
                  variant="outlined"
                  autoFocus
                />

                <TextField
                  fullWidth
                  label="Description"
                  placeholder="Enter group description (optional)"
                  multiline
                  rows={3}
                  value={dialog.formData.description}
                  onChange={(e) =>
                    setDialog((prev) => ({
                      ...prev,
                      formData: {
                        ...prev.formData,
                        description: e.target.value,
                      },
                      message: null,
                    }))
                  }
                  disabled={dialog.submitting}
                  variant="outlined"
                />
              </Box>
            )}
          </DialogContent>

          <DialogActions sx={{ p: 2 }}>
            <Button onClick={closeDialog} disabled={dialog.submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleDialogSubmit}
              variant="contained"
              disabled={dialog.submitting}
              color={dialog.mode === "delete" ? "error" : "primary"}
            >
              {dialog.submitting ? (
                <CircularProgress size={20} sx={{ mr: 1 }} />
              ) : null}
              {dialog.mode === "create"
                ? "Create"
                : dialog.mode === "edit"
                  ? "Update"
                  : "Delete"}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}
