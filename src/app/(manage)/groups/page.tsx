/**
 * src/app/(manage)/groups/page.tsx
 * Luxor Workspace Groups Management Page
 *
 * Admin page for managing Luxor workspace groups with full CRUD operations:
 * - Create new groups
 * - Update existing groups (rename)
 * - Delete groups
 * - View group details (members, subaccounts)
 * - Real-time status and feedback
 *
 * This page uses the secure /api/luxor proxy route to handle all group operations
 * with server-side authentication and authorization.
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
import {
  CreateGroupResponse,
  UpdateGroupResponse,
  DeleteGroupResponse,
  GetGroupResponse,
} from "@/lib/luxor";
import GradientStatCard from "@/components/GradientStatCard";

/**
 * Response structure from the /api/luxor proxy route
 */
interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

/**
 * Form data structure for group operations
 */
interface GroupFormData {
  name: string;
}

/**
 * Component state for managing groups
 */
interface GroupsState {
  groups: GetGroupResponse[];
  loading: boolean;
  error: string | null;
}

/**
 * Dialog state for form operations
 */
interface DialogState {
  open: boolean;
  mode: "create" | "edit" | "delete";
  selectedGroup: GetGroupResponse | null;
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
  formData: { name: "" },
  submitting: false,
  message: null,
};

export default function LuxorApiPage() {
  const [state, setState] = useState<GroupsState>({
    groups: [],
    loading: true,
    error: null,
  });

  const [dialog, setDialog] = useState<DialogState>(initialDialogState);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Fetch all workspace groups
   *
   * This function fetches the workspace information which includes all groups
   * available to the authenticated user. This is called on component mount
   * and when refreshing or after CRUD operations complete.
   */
  const fetchGroups = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      console.log("[Luxor Groups] Fetching workspace groups...");

      const response = await fetch("/api/luxor?endpoint=workspace");

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: ProxyResponse<Record<string, unknown>> =
        await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch groups");
      }

      // Extract groups array from workspace data
      // The workspace response includes a 'groups' field with all groups
      const workspaceData = data.data as Record<string, unknown>;
      let groupsList: GetGroupResponse[] = [];

      console.log("[Luxor Groups] Workspace data:", workspaceData);

      if (workspaceData && Array.isArray(workspaceData.groups)) {
        // Map the groups data to GetGroupResponse format
        groupsList = (
          workspaceData.groups as Array<Record<string, unknown>>
        ).map(
          (group: Record<string, unknown>) =>
            ({
              id: String(group.id || ""),
              name: String(group.name || ""),
              type:
                (group.type as
                  | "UNSPECIFIED"
                  | "POOL"
                  | "DERIVATIVES"
                  | "HARDWARE") || "UNSPECIFIED",
              url: String(group.url || ""),
              members: Array.isArray(group.members)
                ? (group.members as Array<Record<string, unknown>>)
                : [],
              subaccounts: Array.isArray(group.subaccounts)
                ? (group.subaccounts as Array<Record<string, unknown>>)
                : [],
            }) as unknown as GetGroupResponse,
        );

        console.log("[Luxor Groups] Parsed groups:", groupsList);
      }

      setState({
        groups: groupsList,
        loading: false,
        error: null,
      });

      console.log(
        `[Luxor Groups] Successfully fetched ${groupsList.length} groups`,
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Groups] Error fetching groups:", errorMsg);
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
   * Sends a POST request to /api/luxor with the new group name
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
      console.log("[Luxor Groups] Creating group:", dialog.formData.name);

      const response = await fetch("/api/luxor", {
        method: "POST",
        body: JSON.stringify({
          endpoint: "group",
          name: dialog.formData.name,
        }),
      });

      const data: ProxyResponse<CreateGroupResponse> = await response.json();

      console.log("[Luxor Groups] Create response:", {
        status: response.status,
        data,
      });

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error("[Luxor Groups] Error creating group:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[Luxor Groups] Group created successfully");

      // Refresh the groups list to get the updated data from Luxor
      await fetchGroups();

      // Close dialog
      setDialog(initialDialogState);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Groups] Error creating group:", errorMsg);
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
   * Sends a PUT request to /api/luxor with the updated group name
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
      const groupName = dialog.formData.name;

      console.log("[Luxor Groups] UPDATE REQUEST:");
      console.log("  Group ID:", groupId);
      console.log("  Group ID Type:", typeof groupId);
      console.log("  New Name:", groupName);
      console.log("  Selected Group Data:", dialog.selectedGroup);

      const requestBody = {
        endpoint: "group",
        id: groupId,
        name: groupName,
      };

      console.log("  Request Body:", requestBody);

      const response = await fetch("/api/luxor", {
        method: "PATCH",
        body: JSON.stringify(requestBody),
      });

      const data: ProxyResponse<UpdateGroupResponse> = await response.json();

      console.log("[Luxor Groups] UPDATE RESPONSE:");
      console.log("  Status:", response.status);
      console.log("  Success:", data.success);
      console.log("  Data:", data);

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error("[Luxor Groups] Error updating group:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[Luxor Groups] Group updated successfully");

      // Refresh the groups list to get the updated data from Luxor
      await fetchGroups();

      // Close dialog
      setDialog(initialDialogState);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Groups] Error updating group:", errorMsg);
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
   * Sends a DELETE request to /api/luxor with the group ID
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

      console.log("[Luxor Groups] DELETE REQUEST:");
      console.log("  Group ID:", groupId);
      console.log("  Group ID Type:", typeof groupId);
      console.log("  Selected Group Data:", dialog.selectedGroup);

      const requestBody = {
        endpoint: "group",
        id: groupId,
      };

      console.log("  Request Body:", requestBody);

      const response = await fetch("/api/luxor", {
        method: "DELETE",
        body: JSON.stringify(requestBody),
      });

      const data: ProxyResponse<DeleteGroupResponse> = await response.json();

      console.log("[Luxor Groups] DELETE RESPONSE:");
      console.log("  Status:", response.status);
      console.log("  Success:", data.success);
      console.log("  Data:", data);

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error("[Luxor Groups] Error deleting group:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[Luxor Groups] Group deleted successfully");

      // Refresh the groups list to get the updated data from Luxor
      await fetchGroups();

      // Close dialog
      setDialog(initialDialogState);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Groups] Error deleting group:", errorMsg);
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
  const openEditDialog = (group: GetGroupResponse) => {
    setDialog({
      open: true,
      mode: "edit",
      selectedGroup: group,
      formData: { name: group.name },
      submitting: false,
      message: null,
    });
  };

  /**
   * Open delete confirmation dialog
   */
  const openDeleteDialog = (group: GetGroupResponse) => {
    setDialog({
      open: true,
      mode: "delete",
      selectedGroup: group,
      formData: { name: "" },
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
              Luxor Workspace Groups
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Manage your Luxor mining workspace groups and subaccounts
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
              md: "repeat(3, 1fr)",
            },
            gap: 3,
            mb: 4,
          }}
        >
          <Box>
            <GradientStatCard
              title="Total Groups"
              value={String(state.groups.length)}
              gradient="linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)"
              icon={<GroupIcon fontSize="small" />}
            />
          </Box>

          <Box>
            <GradientStatCard
              title="Total Members"
              value={String(
                state.groups.reduce((sum, g) => sum + g.members.length, 0),
              )}
              gradient="linear-gradient(135deg, #FFB300 0%, #FFCA28 100%)"
              icon={<GroupIcon fontSize="small" />}
            />
          </Box>

          <Box>
            <GradientStatCard
              title="Total Subaccounts"
              value={String(
                state.groups.reduce((sum, g) => sum + g.subaccounts.length, 0),
              )}
              gradient="linear-gradient(135deg, #00BFA6 0%, #1DE9B6 100%)"
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
                  <TableCell sx={{ fontWeight: "bold" }}>Group Name</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }} align="right">
                    Members
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }} align="right">
                    Subaccounts
                  </TableCell>
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
                        sx={{ fontFamily: "monospace" }}
                      >
                        {group.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={group.type}
                        variant="outlined"
                        size="small"
                        color={
                          group.type === "POOL"
                            ? "primary"
                            : group.type === "DERIVATIVES"
                              ? "secondary"
                              : "default"
                        }
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {group.members.length}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {group.subaccounts.length}
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
              No groups available
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Click &quot;Create Group&quot; to get started
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
            <Typography variant="h6">
              {dialog.mode === "create"
                ? "Create New Group"
                : dialog.mode === "edit"
                  ? "Edit Group"
                  : "Delete Group"}
            </Typography>
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
                  {dialog.selectedGroup?.id && (
                    <>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 2 }}
                      >
                        Group ID
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                      >
                        {dialog.selectedGroup.id}
                      </Typography>
                    </>
                  )}
                </Paper>
                <Alert severity="warning" sx={{ mt: 2 }}>
                  This action cannot be undone.
                </Alert>
              </Box>
            ) : (
              <TextField
                fullWidth
                label="Group Name"
                placeholder="Enter group name"
                value={dialog.formData.name}
                onChange={(e) =>
                  setDialog((prev) => ({
                    ...prev,
                    formData: { name: e.target.value },
                    message: null,
                  }))
                }
                disabled={dialog.submitting}
                variant="outlined"
                autoFocus
              />
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
