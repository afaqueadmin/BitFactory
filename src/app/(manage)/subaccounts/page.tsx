/**
 * src/app/(manage)/subaccounts/page.tsx
 * Luxor Workspace Subaccounts Management Page
 *
 * Admin page for managing Luxor subaccounts within workspace groups with full CRUD operations:
 * - Select a group from dropdown
 * - View all subaccounts in the selected group
 * - Add new subaccounts to a group
 * - Remove subaccounts from a group
 * - Real-time status and feedback
 *
 * This page uses the secure /api/luxor proxy route to handle all subaccount operations
 * with server-side authentication and ADMIN-only authorization.
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
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import StorageIcon from "@mui/icons-material/Storage";
import GradientStatCard from "@/components/GradientStatCard";
import { GetGroupResponse, GetSubaccountResponse } from "@/lib/luxor";

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
 * Subaccount list response from GET endpoint
 */
interface SubaccountListData {
  subaccounts: GetSubaccountResponse[];
}

/**
 * Form data structure for subaccount operations
 */
interface SubaccountFormData {
  name: string;
}

/**
 * Component state for managing subaccounts
 */
interface SubaccountsState {
  groups: GetGroupResponse[];
  subaccounts: GetSubaccountResponse[];
  selectedGroupIds: string[]; // Changed to array for multi-select
  loading: boolean;
  error: string | null;
}

/**
 * Dialog state for form operations
 */
interface DialogState {
  open: boolean;
  mode: "add" | "delete";
  selectedSubaccount: GetSubaccountResponse | null;
  formData: SubaccountFormData;
  submitting: boolean;
  message: string | null;
}

/**
 * Initial dialog state
 */
const initialDialogState: DialogState = {
  open: false,
  mode: "add",
  selectedSubaccount: null,
  formData: { name: "" },
  submitting: false,
  message: null,
};

export default function SubaccountsPage() {
  const [state, setState] = useState<SubaccountsState>({
    groups: [],
    subaccounts: [],
    selectedGroupIds: [], // Changed to array
    loading: true,
    error: null,
  });

  const [dialog, setDialog] = useState<DialogState>(initialDialogState);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Fetch all workspace groups
   *
   * This is called on component mount to populate the group dropdown.
   */
  const fetchGroups = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      console.log("[Luxor Subaccounts] Fetching workspace groups...");

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
      const workspaceData = data.data as Record<string, unknown>;
      let groupsList: GetGroupResponse[] = [];

      console.log("[Luxor Subaccounts] Workspace data:", workspaceData);

      if (workspaceData && Array.isArray(workspaceData.groups)) {
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

        console.log("[Luxor Subaccounts] Parsed groups:", groupsList);
      }

      setState((prev) => ({
        ...prev,
        groups: groupsList,
        loading: false,
        error: null,
      }));

      console.log(
        `[Luxor Subaccounts] Successfully fetched ${groupsList.length} groups`,
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Subaccounts] Error fetching groups:", errorMsg);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMsg,
      }));
    }
  }, []);

  /**
   * Fetch subaccounts for the selected groups
   *
   * This is called when groups are selected or when subaccounts are updated.
   * Supports single or multiple group selection.
   */
  const fetchSubaccounts = useCallback(
    async (groupIds: string[]) => {
      if (!groupIds || groupIds.length === 0) {
        setState((prev) => ({
          ...prev,
          subaccounts: [],
          error: null,
        }));
        return;
      }

      try {
        setState((prev) => ({ ...prev, error: null }));

        console.log(
          "[Luxor Subaccounts] Fetching subaccounts for groups:",
          groupIds,
        );

        // Fetch subaccounts for all selected groups
        const allSubaccounts: Array<
          GetSubaccountResponse & { _groupId: string; _groupName: string }
        > = [];
        let hasErrors = false;
        let lastError: string | null = null;

        for (const groupId of groupIds) {
          try {
            const response = await fetch(
              `/api/luxor?endpoint=subaccount&groupId=${groupId}`,
            );

            if (!response.ok) {
              hasErrors = true;
              lastError = `Group error: API returned status ${response.status}`;
              console.warn(
                `[Luxor Subaccounts] Error fetching for group ${groupId}:`,
                lastError,
              );
              continue; // Skip this group, continue with others
            }

            const data: ProxyResponse<SubaccountListData> =
              await response.json();

            if (!data.success) {
              hasErrors = true;
              lastError = data.error || "Failed to fetch subaccounts";
              console.warn(
                `[Luxor Subaccounts] API error for group ${groupId}:`,
                lastError,
              );
              continue;
            }

            const subaccountsList =
              (data.data as SubaccountListData)?.subaccounts || [];

            // Add group context to each subaccount
            const groupName =
              state.groups.find((g) => g.id === groupId)?.name || groupId;
            const subaccountsWithGroup = subaccountsList.map((sub) => ({
              ...sub,
              _groupId: groupId,
              _groupName: groupName,
            }));

            allSubaccounts.push(...subaccountsWithGroup);
          } catch (error) {
            hasErrors = true;
            lastError =
              error instanceof Error ? error.message : "Unknown error";
            console.error(
              `[Luxor Subaccounts] Exception fetching for group ${groupId}:`,
              lastError,
            );
          }
        }

        setState((prev) => ({
          ...prev,
          subaccounts: allSubaccounts as Array<
            GetSubaccountResponse & { _groupId: string; _groupName: string }
          >,
          error: hasErrors && lastError ? `Partial error: ${lastError}` : null,
        }));

        console.log(
          `[Luxor Subaccounts] Successfully fetched ${allSubaccounts.length} subaccounts from ${groupIds.length} groups`,
        );
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error occurred";
        console.error(
          "[Luxor Subaccounts] Error fetching subaccounts:",
          errorMsg,
        );
        setState((prev) => ({
          ...prev,
          subaccounts: [],
          error: errorMsg,
        }));
      }
    },
    [state.groups],
  );

  /**
   * Fetch groups on component mount
   */
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  /**
   * Handle group selection change (multi-select)
   */
  const handleGroupChange = (groupIds: string | string[]) => {
    let selectedIds = Array.isArray(groupIds) ? groupIds : [groupIds];

    // Handle "All Groups" option
    if (selectedIds.includes("__all__")) {
      selectedIds = state.groups.map((g) => g.id);
    } else {
      selectedIds = selectedIds.filter((id) => id !== "__all__");
    }

    console.log("[Luxor Subaccounts] Groups selected:", selectedIds);
    setState((prev) => ({
      ...prev,
      selectedGroupIds: selectedIds,
      subaccounts: [],
    }));
    fetchSubaccounts(selectedIds);
  };

  /**
   * Handle add subaccount form submission
   *
   * Sends a POST request to /api/luxor with the new subaccount name
   * When multiple groups are selected, adds to the first group only
   */
  const handleAddSubaccount = async () => {
    if (!dialog.formData.name.trim()) {
      setDialog((prev) => ({
        ...prev,
        message: "Subaccount name is required",
      }));
      return;
    }

    if (!state.selectedGroupIds || state.selectedGroupIds.length === 0) {
      setDialog((prev) => ({
        ...prev,
        message: "Please select at least one group first",
      }));
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      const targetGroupId = state.selectedGroupIds[0]; // Add to first selected group
      console.log(
        "[Luxor Subaccounts] Adding subaccount:",
        dialog.formData.name,
        "to group:",
        targetGroupId,
      );

      const response = await fetch("/api/luxor", {
        method: "POST",
        body: JSON.stringify({
          endpoint: "subaccount",
          groupId: targetGroupId,
          name: dialog.formData.name,
        }),
      });

      const data: ProxyResponse<GetSubaccountResponse> = await response.json();

      console.log("[Luxor Subaccounts] Add response:", {
        status: response.status,
        data,
      });

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error("[Luxor Subaccounts] Error adding subaccount:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[Luxor Subaccounts] Subaccount added successfully");

      // Refresh the subaccounts list for all selected groups
      if (state.selectedGroupIds.length > 0) {
        await fetchSubaccounts(state.selectedGroupIds);
      }

      // Close dialog
      setDialog(initialDialogState);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Subaccounts] Error adding subaccount:", errorMsg);
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        message: errorMsg,
      }));
    }
  };

  /**
   * Handle delete subaccount confirmation
   *
   * Sends a DELETE request to /api/luxor with the subaccount details
   */
  const handleDeleteSubaccount = async () => {
    if (!dialog.selectedSubaccount) {
      setDialog((prev) => ({
        ...prev,
        message: "No subaccount selected",
      }));
      return;
    }

    // Find which group this subaccount belongs to (from the _groupId property)
    const subAcctWithGroup = state.subaccounts.find(
      (s: GetSubaccountResponse & { _groupId?: string }) =>
        s.id === dialog.selectedSubaccount?.id &&
        (s as GetSubaccountResponse & { _groupId: string })._groupId,
    ) as GetSubaccountResponse & { _groupId?: string };
    const groupId =
      (subAcctWithGroup as GetSubaccountResponse & { _groupId?: string })
        ?._groupId || state.selectedGroupIds[0];

    if (!groupId) {
      setDialog((prev) => ({
        ...prev,
        message: "No group associated with this subaccount",
      }));
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      const subaccountName = dialog.selectedSubaccount.name;

      console.log("[Luxor Subaccounts] DELETE REQUEST:");
      console.log("  Group ID:", groupId);
      console.log("  Subaccount Name:", subaccountName);

      const requestBody = {
        endpoint: "subaccount",
        groupId: groupId,
        name: subaccountName,
      };

      console.log("  Request Body:", requestBody);

      const response = await fetch("/api/luxor", {
        method: "DELETE",
        body: JSON.stringify(requestBody),
      });

      const data: ProxyResponse = await response.json();

      console.log("[Luxor Subaccounts] DELETE RESPONSE:");
      console.log("  Status:", response.status);
      console.log("  Success:", data.success);
      console.log("  Data:", data);

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error(
          "[Luxor Subaccounts] Error deleting subaccount:",
          errorMsg,
        );
        throw new Error(errorMsg);
      }

      console.log("[Luxor Subaccounts] Subaccount deleted successfully");

      // Refresh the subaccounts list for all selected groups
      if (state.selectedGroupIds.length > 0) {
        await fetchSubaccounts(state.selectedGroupIds);
      }

      // Close dialog
      setDialog(initialDialogState);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Subaccounts] Error deleting subaccount:", errorMsg);
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        message: errorMsg,
      }));
    }
  };

  /**
   * Open add subaccount dialog
   */
  const openAddDialog = () => {
    setDialog({
      ...initialDialogState,
      open: true,
      mode: "add",
    });
  };

  /**
   * Open delete confirmation dialog
   */
  const openDeleteDialog = (subaccount: GetSubaccountResponse) => {
    setDialog({
      open: true,
      mode: "delete",
      selectedSubaccount: subaccount,
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
      case "add":
        handleAddSubaccount();
        break;
      case "delete":
        handleDeleteSubaccount();
        break;
    }
  };

  /**
   * Handle manual refresh
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (state.selectedGroupIds.length > 0) {
      await fetchSubaccounts(state.selectedGroupIds);
    }
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
              Luxor Workspace Subaccounts
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Manage subaccounts within your Luxor mining groups
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={isRefreshing || state.selectedGroupIds.length === 0}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openAddDialog}
              disabled={state.selectedGroupIds.length === 0}
            >
              Add Subaccount
            </Button>
          </Stack>
        </Box>

        {/* Error Alert */}
        {state.error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
              Error
            </Typography>
            <Typography variant="body2">{state.error}</Typography>
          </Alert>
        )}

        {/* Group Selection - Multi-Select */}
        <Paper sx={{ p: 3, mb: 4 }}>
          <FormControl fullWidth>
            <InputLabel id="group-select-label">Select Groups</InputLabel>
            <Select
              labelId="group-select-label"
              id="group-select"
              multiple
              value={state.selectedGroupIds}
              label="Select Groups"
              onChange={(e) => {
                const value = e.target.value;
                handleGroupChange(typeof value === "string" ? [value] : value);
              }}
            >
              <MenuItem value="__all__">
                <strong>All Groups</strong>
              </MenuItem>
              {state.groups.map((group) => (
                <MenuItem key={group.id} value={group.id}>
                  {group.name} ({group.subaccounts.length} subaccounts)
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Paper>

        {/* Stat Cards */}
        {state.selectedGroupIds.length > 0 && (
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
                title="Total Subaccounts"
                value={String(state.subaccounts.length)}
                gradient="linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)"
                icon={<StorageIcon fontSize="small" />}
              />
            </Box>

            <Box>
              <GradientStatCard
                title="Groups Selected"
                value={String(state.selectedGroupIds.length)}
                gradient="linear-gradient(135deg, #FFB300 0%, #FFCA28 100%)"
                icon={<StorageIcon fontSize="small" />}
              />
            </Box>
          </Box>
        )}

        {/* Subaccounts Table */}
        {state.selectedGroupIds.length > 0 && state.subaccounts.length > 0 ? (
          <TableContainer component={Paper} sx={{ mb: 4 }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "background.default" }}>
                  {state.selectedGroupIds.length > 1 && (
                    <TableCell sx={{ fontWeight: "bold" }}>Group</TableCell>
                  )}
                  <TableCell sx={{ fontWeight: "bold" }}>
                    Subaccount Name
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>ID</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Created At</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }} align="right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {state.subaccounts.map((subaccount) => {
                  const sub = subaccount as GetSubaccountResponse & {
                    _groupId: string;
                    _groupName: string;
                  };
                  return (
                    <TableRow
                      key={`${sub._groupId}-${sub.id}`}
                      sx={{
                        "&:hover": {
                          backgroundColor: "background.default",
                        },
                      }}
                    >
                      {state.selectedGroupIds.length > 1 && (
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {sub._groupName}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {sub.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: "monospace" }}
                        >
                          {sub.id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(sub.created_at).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack
                          direction="row"
                          spacing={1}
                          justifyContent="flex-end"
                        >
                          <Tooltip title="Delete Subaccount">
                            <IconButton
                              size="small"
                              onClick={() =>
                                openDeleteDialog(
                                  subaccount as GetSubaccountResponse,
                                )
                              }
                              color="error"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : state.selectedGroupIds.length > 0 ? (
          <Paper sx={{ p: 4, textAlign: "center", mb: 4 }}>
            <StorageIcon
              sx={{
                fontSize: 64,
                color: "text.secondary",
                mb: 2,
                opacity: 0.5,
              }}
            />
            <Typography variant="h6" color="text.secondary">
              No subaccounts in selected groups
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Click &quot;Add Subaccount&quot; to get started
            </Typography>
          </Paper>
        ) : (
          <Paper sx={{ p: 4, textAlign: "center", mb: 4 }}>
            <StorageIcon
              sx={{
                fontSize: 64,
                color: "text.secondary",
                mb: 2,
                opacity: 0.5,
              }}
            />
            <Typography variant="h6" color="text.secondary">
              Select one or more groups to manage subaccounts
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Use the dropdown above to select groups
            </Typography>
          </Paper>
        )}

        {/* Add/Delete Dialog */}
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
            {dialog.mode === "add" ? "Add Subaccount" : "Delete Subaccount"}
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
                  Are you sure you want to delete this subaccount?
                </Typography>
                <Paper sx={{ p: 2, backgroundColor: "background.default" }}>
                  <Typography variant="body2" color="text.secondary">
                    Subaccount Name
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {dialog.selectedSubaccount?.name}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 2 }}
                  >
                    Created At
                  </Typography>
                  <Typography variant="body2">
                    {dialog.selectedSubaccount?.created_at
                      ? new Date(
                          dialog.selectedSubaccount.created_at,
                        ).toLocaleString()
                      : "N/A"}
                  </Typography>
                </Paper>
                <Alert severity="warning" sx={{ mt: 2 }}>
                  If this subaccount only belongs to this group, it will be
                  deleted from the workspace entirely.
                </Alert>
              </Box>
            ) : (
              <TextField
                fullWidth
                label="Subaccount Name"
                placeholder="Enter subaccount name"
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
              {dialog.mode === "add" ? "Add" : "Delete"}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}
