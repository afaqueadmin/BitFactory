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
import { useRouter } from "next/navigation";
import {
  Box,
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
  Tabs,
  Tab,
  Checkbox,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import GroupIcon from "@mui/icons-material/Group";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import StatCard from "@/components/daylight/StatCard";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";
import {
  CellNote,
  DaylightAdminPage,
  DaylightEmptyState,
  DaylightLoading,
  DaylightPageHeader,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

/**
 * Group type matching database schema
 */
interface Group {
  id: string;
  name: string;
  relationshipManager: string;
  email: string;
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
  relationshipManager: string;
  email: string;
  confirmEmail: string;
  description: string;
}

/**
 * Subaccount interface
 */
interface Subaccount {
  id: string;
  subaccountName: string;
  poolAuthId?: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    luxorSubaccounts: string[];
  };
  minerCount: number;
}

/**
 * Component state for managing groups
 */
interface GroupsState {
  groups: Group[];
  loading: boolean;
  error: string | null;
  unassignedSubaccounts?: Subaccount[];
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
  activeTab: number;
  availableSubaccounts: Subaccount[];
  currentSubaccounts: Subaccount[];
  selectedSubaccountIds: Set<string>;
  loadingSubaccounts: boolean;
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
    relationshipManager: "",
    email: "",
    confirmEmail: "",
    description: "",
  },
  submitting: false,
  message: null,
  activeTab: 0,
  availableSubaccounts: [],
  currentSubaccounts: [],
  selectedSubaccountIds: new Set(),
  loadingSubaccounts: false,
};

export default function GroupsPage() {
  const router = useRouter();
  const { d, fonts } = useDaylight();
  const ds = useDaylightAdminSx();
  const [state, setState] = useState<GroupsState>({
    groups: [],
    loading: true,
    error: null,
    unassignedSubaccounts: [],
  });

  const [dialog, setDialog] = useState<DialogState>(initialDialogState);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Navigate to group details page
   */
  const handleViewGroup = (groupId: string) => {
    router.push(`/groups/${groupId}`);
  };

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

      // Fetch unassigned (available) subaccounts
      let unassigned: Subaccount[] = [];
      try {
        const uaResp = await fetch("/api/groups/available");
        if (uaResp.ok) {
          const uaData: ApiResponse<Subaccount[]> = await uaResp.json();
          if (uaData.success && Array.isArray(uaData.data)) {
            unassigned = uaData.data as Subaccount[];
          }
        }
      } catch (e) {
        console.warn("[Groups] Failed to fetch unassigned subaccounts", e);
      }

      console.log("[Groups] Parsed groups:", groupsList);

      setState({
        groups: groupsList,
        loading: false,
        error: null,
        unassignedSubaccounts: unassigned,
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

    if (!dialog.formData.relationshipManager.trim()) {
      setDialog((prev) => ({
        ...prev,
        message: "Relationship Manager is required",
      }));
      return;
    }

    if (!dialog.formData.email.trim()) {
      setDialog((prev) => ({
        ...prev,
        message: "Email is required",
      }));
      return;
    }

    if (dialog.formData.email !== dialog.formData.confirmEmail) {
      setDialog((prev) => ({
        ...prev,
        message: "Emails do not match",
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
          relationshipManager: dialog.formData.relationshipManager.trim(),
          email: dialog.formData.email.trim(),
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

    if (!dialog.formData.relationshipManager.trim()) {
      setDialog((prev) => ({
        ...prev,
        message: "Relationship Manager is required",
      }));
      return;
    }

    if (!dialog.formData.email.trim()) {
      setDialog((prev) => ({
        ...prev,
        message: "Email is required",
      }));
      return;
    }

    if (dialog.formData.email !== dialog.formData.confirmEmail) {
      setDialog((prev) => ({
        ...prev,
        message: "Emails do not match",
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
          relationshipManager: dialog.formData.relationshipManager.trim(),
          email: dialog.formData.email.trim(),
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
   * Fetch available and current subaccounts for a group
   */
  const fetchGroupSubaccounts = useCallback(async (groupId: string) => {
    setDialog((prev) => ({ ...prev, loadingSubaccounts: true, message: null }));

    try {
      console.log("[Groups] Fetching subaccounts for group:", groupId);

      const response = await fetch(`/api/groups/${groupId}`);

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch subaccounts");
      }

      console.log("[Groups] Fetched subaccounts:", {
        available: data.data?.availableSubaccounts?.length || 0,
        current: data.data?.subaccounts?.length || 0,
      });

      setDialog((prev) => ({
        ...prev,
        availableSubaccounts: data.data?.availableSubaccounts || [],
        currentSubaccounts: data.data?.subaccounts || [],
        loadingSubaccounts: false,
      }));
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Groups] Error fetching subaccounts:", errorMsg);
      setDialog((prev) => ({
        ...prev,
        loadingSubaccounts: false,
        message: errorMsg,
      }));
    }
  }, []);

  /**
   * Toggle subaccount selection
   */
  const handleSubaccountToggle = (subaccountId: string) => {
    setDialog((prev) => {
      const newSelected = new Set(prev.selectedSubaccountIds);
      if (newSelected.has(subaccountId)) {
        newSelected.delete(subaccountId);
      } else {
        newSelected.add(subaccountId);
      }
      return {
        ...prev,
        selectedSubaccountIds: newSelected,
      };
    });
  };

  /**
   * Select all available subaccounts
   */
  const handleSelectAllSubaccounts = () => {
    setDialog((prev) => ({
      ...prev,
      selectedSubaccountIds: new Set(
        prev.availableSubaccounts.map((s) => s.id),
      ),
    }));
  };

  /**
   * Deselect all subaccounts
   */
  const handleDeselectAllSubaccounts = () => {
    setDialog((prev) => ({
      ...prev,
      selectedSubaccountIds: new Set(),
    }));
  };

  /**
   * Add selected subaccounts to group
   */
  const handleAddSubaccounts = async () => {
    if (!dialog.selectedGroup || dialog.selectedSubaccountIds.size === 0) {
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      const selectedSubaccounts = dialog.availableSubaccounts.filter((s) =>
        dialog.selectedSubaccountIds.has(s.id),
      );
      const poolAuthIds = selectedSubaccounts
        .map((s) => s.poolAuthId)
        .filter((id): id is string => !!id);

      console.log("[Groups] Adding subaccounts (poolAuthIds):", poolAuthIds);

      const response = await fetch(
        `/api/groups/${dialog.selectedGroup.id}/subaccounts/bulk-add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ poolAuthIds }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error("[Groups] Error adding subaccounts:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[Groups] Subaccounts added successfully");

      // Refresh subaccounts
      await fetchGroupSubaccounts(dialog.selectedGroup.id);

      // Clear selection
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        selectedSubaccountIds: new Set(),
        message: `Successfully added ${data.data.count} subaccount(s)`,
      }));
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Groups] Error adding subaccounts:", errorMsg);
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        message: errorMsg,
      }));
    }
  };

  /**
   * Remove subaccounts from group
   */
  const handleRemoveSubaccounts = async (subaccountIds: string[]) => {
    if (!dialog.selectedGroup || subaccountIds.length === 0) {
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      console.log("[Groups] Removing subaccounts:", subaccountIds);

      const response = await fetch(
        `/api/groups/${dialog.selectedGroup.id}/subaccounts/bulk-remove`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subaccountIds }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error("[Groups] Error removing subaccounts:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[Groups] Subaccounts removed successfully");

      // Refresh subaccounts
      await fetchGroupSubaccounts(dialog.selectedGroup.id);

      // Clear selection
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        message: `Successfully removed ${data.data.count} subaccount(s)`,
      }));
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Groups] Error removing subaccounts:", errorMsg);
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
        relationshipManager: group.relationshipManager || "",
        email: group.email || "",
        confirmEmail: group.email || "",
        description: group.description || "",
      },
      submitting: false,
      message: null,
      activeTab: 0,
      availableSubaccounts: [],
      currentSubaccounts: [],
      selectedSubaccountIds: new Set(),
      loadingSubaccounts: false,
    });

    // Fetch subaccounts
    fetchGroupSubaccounts(group.id);
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
        relationshipManager: "",
        email: "",
        confirmEmail: "",
        description: "",
      },
      submitting: false,
      message: null,
      activeTab: 0,
      availableSubaccounts: [],
      currentSubaccounts: [],
      selectedSubaccountIds: new Set(),
      loadingSubaccounts: false,
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
      <DaylightAdminPage>
        <DaylightLoading />
      </DaylightAdminPage>
    );
  }

  const totalSubaccounts = state.groups.reduce(
    (sum, g) => sum + (g._count?.subaccounts ?? 0),
    0,
  );
  const unassigned = state.unassignedSubaccounts ?? [];

  const cardSx = {
    bgcolor: d.surface,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS_CARD,
    boxShadow: d.shadow,
  } as const;

  const sectionTitleSx = {
    m: 0,
    fontFamily: fonts.heading,
    fontWeight: 700,
    fontSize: 16,
    color: d.text,
  } as const;

  const iconBtnSx = (tone: "action" | "danger") => ({
    color: d.muted,
    borderRadius: "8px",
    "&:hover": {
      bgcolor: tone === "danger" ? d.dangerSoft : d.hover,
      color: tone === "danger" ? d.danger : d.action,
    },
  });

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Subaccount Groups"
        description="Organize your subaccounts into groups for better management."
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={isRefreshing}
              sx={ds.outlineBtnSx}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openCreateDialog}
              sx={ds.primaryBtnSx}
            >
              Create Group
            </Button>
          </>
        }
      />

      {/* Error Alert */}
      {state.error && (
        <Alert severity="error" sx={{ mb: 3, ...ds.alertSx("error") }}>
          <Box component="strong" sx={{ display: "block", mb: "2px" }}>
            Error Loading Groups
          </Box>
          {state.error}
        </Alert>
      )}

      {/* Stat Cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
          gap: { xs: "12px", sm: "16px", md: "20px" },
          mb: { xs: "20px", md: "24px" },
        }}
      >
        <StatCard
          title="Total Groups"
          value={state.groups.length}
          tone="sky"
          icon={<GroupIcon />}
        />
        <StatCard
          title="Total Subaccounts"
          value={totalSubaccounts}
          caption="Assigned to a group"
          tone="mint"
          icon={<AccountTreeIcon />}
        />
        <StatCard
          title="Unassigned Subaccounts"
          value={unassigned.length}
          caption={unassigned.length > 0 ? "Need a group" : "All assigned"}
          tone={unassigned.length > 0 ? "amber" : "mint"}
          icon={<LinkOffIcon />}
        />
      </Box>

      {/* Groups Table */}
      {state.groups.length > 0 ? (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ ...ds.tableCardSx, mb: { xs: "20px", md: "24px" } }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="right">Subaccounts</TableCell>
                <TableCell>Created By</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {state.groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => handleViewGroup(group.id)}
                      sx={{
                        p: 0,
                        border: 0,
                        bgcolor: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: fonts.body,
                        fontSize: 13,
                        fontWeight: 650,
                        color: d.action,
                        "&:hover": { textDecoration: "underline" },
                        "&:focus-visible": {
                          outline: `3px solid ${d.action}`,
                          outlineOffset: "2px",
                          borderRadius: "4px",
                        },
                      }}
                    >
                      {group.name}
                    </Box>
                    <CellNote>
                      <Box
                        component="span"
                        sx={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                          fontSize: 11,
                        }}
                      >
                        {group.id}
                      </Box>
                    </CellNote>
                  </TableCell>
                  <TableCell sx={{ "&&&": { color: d.muted } }}>
                    {group.description || "—"}
                  </TableCell>
                  <TableCell align="center">
                    <DaylightStatusPill
                      label={group.isActive ? "Active" : "Inactive"}
                      tone={group.isActive ? "success" : "neutral"}
                    />
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      "&&&": {
                        fontWeight: 650,
                        fontVariantNumeric: "tabular-nums",
                      },
                    }}
                  >
                    {group._count?.subaccounts ?? 0}
                  </TableCell>
                  <TableCell>
                    {group.creator?.name || group.createdBy}
                  </TableCell>
                  <TableCell align="right" sx={{ "&&&": { py: "8px" } }}>
                    <Stack
                      direction="row"
                      spacing={0.5}
                      justifyContent="flex-end"
                    >
                      <Tooltip title="Edit Group">
                        <IconButton
                          size="small"
                          aria-label={`Edit ${group.name}`}
                          onClick={() => openEditDialog(group)}
                          sx={iconBtnSx("action")}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Group">
                        <IconButton
                          size="small"
                          aria-label={`Delete ${group.name}`}
                          onClick={() => openDeleteDialog(group)}
                          sx={iconBtnSx("danger")}
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
        <Box sx={{ mb: { xs: "20px", md: "24px" } }}>
          <DaylightEmptyState>
            <GroupIcon
              sx={{ fontSize: 40, color: d.inputBorder, mb: 1 }}
              aria-hidden
            />
            <Box sx={{ fontSize: 15, fontWeight: 650, color: d.text }}>
              No groups created yet
            </Box>
            <Box sx={{ mt: "4px" }}>
              Click &quot;Create Group&quot; to organize your subaccounts.
            </Box>
          </DaylightEmptyState>
        </Box>
      )}

      {/* Unassigned Subaccounts List */}
      <Box
        component="section"
        aria-labelledby="unassigned-heading"
        sx={{ ...cardSx, p: { xs: "16px", sm: "20px 24px" } }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: unassigned.length > 0 ? "8px" : 0,
          }}
        >
          <Typography
            id="unassigned-heading"
            component="h2"
            sx={sectionTitleSx}
          >
            Unassigned Subaccounts
          </Typography>
          <DaylightStatusPill
            label={String(unassigned.length)}
            tone={unassigned.length > 0 ? "warning" : "neutral"}
          />
        </Box>
        {unassigned.length > 0 ? (
          <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
            {unassigned.map((sub) => (
              <Box
                component="li"
                key={sub.id}
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  columnGap: "12px",
                  rowGap: "2px",
                  py: "10px",
                  borderBottom: `1px solid ${d.border}`,
                  "&:last-of-type": { borderBottom: 0, pb: 0 },
                }}
              >
                <Box
                  component="span"
                  sx={{ fontSize: 13, fontWeight: 650, color: d.text }}
                >
                  {sub.subaccountName}
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontSize: 12,
                    color: d.muted,
                    overflowWrap: "anywhere",
                  }}
                >
                  {sub.user?.name || "Unknown"} · {sub.user?.email} ·{" "}
                  {sub.minerCount} miners
                </Box>
              </Box>
            ))}
          </Box>
        ) : (
          <Box sx={{ mt: "6px", fontSize: 13, color: d.muted }}>
            All subaccounts are assigned to groups.
          </Box>
        )}
      </Box>

      {/* Create/Edit/Delete Dialog */}
      <Dialog open={dialog.open} onClose={closeDialog} maxWidth="sm" fullWidth>
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

        <DialogContent
          sx={{ pt: 2, minHeight: dialog.mode === "edit" ? "600px" : "auto" }}
        >
          {dialog.message && (
            <Alert
              severity={
                dialog.message.toLowerCase().includes("error")
                  ? "error"
                  : dialog.message.toLowerCase().includes("added") ||
                      dialog.message.toLowerCase().includes("removed")
                    ? "success"
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
                This action cannot be undone. Associated subaccounts will not be
                deleted, only removed from the group.
              </Alert>
            </Box>
          ) : (
            <>
              {dialog.mode === "edit" && (
                <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
                  <Tabs
                    value={dialog.activeTab}
                    onChange={(e, newValue) =>
                      setDialog((prev) => ({
                        ...prev,
                        activeTab: newValue,
                      }))
                    }
                  >
                    <Tab label="Group Details" />
                    <Tab label="Manage Subaccounts" />
                  </Tabs>
                </Box>
              )}

              {/* Tab 0: Group Details Form */}
              {(dialog.mode !== "edit" || dialog.activeTab === 0) && (
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
                    required
                  />

                  <TextField
                    fullWidth
                    label="Relationship Manager"
                    placeholder="Enter relationship manager name"
                    value={dialog.formData.relationshipManager}
                    onChange={(e) =>
                      setDialog((prev) => ({
                        ...prev,
                        formData: {
                          ...prev.formData,
                          relationshipManager: e.target.value,
                        },
                        message: null,
                      }))
                    }
                    disabled={dialog.submitting}
                    variant="outlined"
                    required
                  />

                  <TextField
                    fullWidth
                    label="Email"
                    placeholder="Enter email address"
                    type="email"
                    value={dialog.formData.email}
                    onChange={(e) =>
                      setDialog((prev) => ({
                        ...prev,
                        formData: {
                          ...prev.formData,
                          email: e.target.value,
                        },
                        message: null,
                      }))
                    }
                    disabled={dialog.submitting}
                    variant="outlined"
                    required
                  />

                  <TextField
                    fullWidth
                    label="Confirm Email"
                    placeholder="Re-enter email address"
                    type="email"
                    value={dialog.formData.confirmEmail}
                    onChange={(e) =>
                      setDialog((prev) => ({
                        ...prev,
                        formData: {
                          ...prev.formData,
                          confirmEmail: e.target.value,
                        },
                        message: null,
                      }))
                    }
                    disabled={dialog.submitting}
                    variant="outlined"
                    required
                    error={
                      !!(
                        dialog.formData.email &&
                        dialog.formData.confirmEmail &&
                        dialog.formData.email !== dialog.formData.confirmEmail
                      )
                    }
                    helperText={
                      dialog.formData.email &&
                      dialog.formData.confirmEmail &&
                      dialog.formData.email !== dialog.formData.confirmEmail
                        ? "Emails do not match"
                        : ""
                    }
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

              {/* Tab 1: Manage Subaccounts */}
              {dialog.mode === "edit" && dialog.activeTab === 1 && (
                <Box>
                  {dialog.loadingSubaccounts ? (
                    <Box
                      sx={{ display: "flex", justifyContent: "center", p: 3 }}
                    >
                      <CircularProgress />
                    </Box>
                  ) : (
                    <>
                      {/* Current Subaccounts */}
                      <Box sx={{ mb: 4 }}>
                        <Typography
                          variant="h6"
                          sx={{ mb: 2, fontWeight: "bold" }}
                        >
                          Current Subaccounts (
                          {dialog.currentSubaccounts.length})
                        </Typography>
                        {dialog.currentSubaccounts.length > 0 ? (
                          <Paper sx={{ maxHeight: "300px", overflow: "auto" }}>
                            <List>
                              {dialog.currentSubaccounts.map((subaccount) => (
                                <ListItem
                                  key={subaccount.id}
                                  secondaryAction={
                                    <Tooltip title="Remove from group">
                                      <IconButton
                                        edge="end"
                                        color="error"
                                        onClick={() =>
                                          handleRemoveSubaccounts([
                                            subaccount.id,
                                          ])
                                        }
                                        disabled={dialog.submitting}
                                      >
                                        <DeleteIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  }
                                  sx={{
                                    borderBottom: "1px solid",
                                    borderColor: "divider",
                                  }}
                                >
                                  <ListItemText
                                    primary={subaccount.subaccountName}
                                    secondary={`${subaccount.user?.name || "Unknown"} • ${subaccount.minerCount} miners`}
                                  />
                                </ListItem>
                              ))}
                            </List>
                          </Paper>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No subaccounts assigned yet
                          </Typography>
                        )}
                      </Box>

                      {/* Available Subaccounts */}
                      <Box>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            mb: 2,
                          }}
                        >
                          <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                            Available Subaccounts (
                            {dialog.availableSubaccounts.length})
                          </Typography>
                          {dialog.availableSubaccounts.length > 0 && (
                            <Stack direction="row" spacing={1}>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={handleSelectAllSubaccounts}
                                disabled={
                                  dialog.submitting ||
                                  dialog.selectedSubaccountIds.size ===
                                    dialog.availableSubaccounts.length
                                }
                              >
                                Select All
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={handleDeselectAllSubaccounts}
                                disabled={
                                  dialog.submitting ||
                                  dialog.selectedSubaccountIds.size === 0
                                }
                              >
                                Deselect All
                              </Button>
                            </Stack>
                          )}
                        </Box>

                        {dialog.availableSubaccounts.length > 0 ? (
                          <>
                            <Paper
                              sx={{ maxHeight: "300px", overflow: "auto" }}
                            >
                              <List>
                                {dialog.availableSubaccounts.map(
                                  (subaccount) => (
                                    <ListItem
                                      key={subaccount.id}
                                      disablePadding
                                      sx={{
                                        borderBottom: "1px solid",
                                        borderColor: "divider",
                                        "&:hover": {
                                          backgroundColor: "action.hover",
                                        },
                                      }}
                                    >
                                      <ListItemIcon sx={{ minWidth: "40px" }}>
                                        <Checkbox
                                          edge="start"
                                          checked={dialog.selectedSubaccountIds.has(
                                            subaccount.id,
                                          )}
                                          onChange={() => {
                                            handleSubaccountToggle(
                                              subaccount.id,
                                            );
                                          }}
                                          tabIndex={0}
                                          disableRipple
                                        />
                                      </ListItemIcon>
                                      <ListItemText
                                        primary={subaccount.subaccountName}
                                        secondary={`${subaccount.user?.name || "Unknown"} (${subaccount.user?.email}) • ${subaccount.minerCount} miners`}
                                        onClick={() =>
                                          handleSubaccountToggle(subaccount.id)
                                        }
                                        sx={{
                                          cursor: "pointer",
                                          flex: 1,
                                        }}
                                      />
                                    </ListItem>
                                  ),
                                )}
                              </List>
                            </Paper>

                            <Box
                              sx={{
                                mt: 2,
                                minHeight: "80px",
                                p: 2,
                                backgroundColor:
                                  dialog.selectedSubaccountIds.size > 0
                                    ? "action.hover"
                                    : "transparent",
                                borderRadius: 1,
                              }}
                            >
                              {dialog.selectedSubaccountIds.size > 0 && (
                                <>
                                  <Typography variant="body2" sx={{ mb: 2 }}>
                                    {dialog.selectedSubaccountIds.size}{" "}
                                    subaccount(s) selected
                                  </Typography>
                                  <Button
                                    variant="contained"
                                    color="primary"
                                    fullWidth
                                    onClick={handleAddSubaccounts}
                                    disabled={dialog.submitting}
                                  >
                                    {dialog.submitting ? (
                                      <CircularProgress
                                        size={20}
                                        sx={{ mr: 1 }}
                                      />
                                    ) : null}
                                    Add Selected Subaccounts
                                  </Button>
                                </>
                              )}
                            </Box>
                          </>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            All subaccounts are already assigned to groups
                          </Typography>
                        )}
                      </Box>
                    </>
                  )}
                </Box>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialog} disabled={dialog.submitting}>
            Cancel
          </Button>
          {dialog.mode === "edit" &&
            dialog.activeTab === 1 &&
            dialog.currentSubaccounts.length > 0 && (
              <Button
                onClick={() => {
                  const ids = dialog.currentSubaccounts.map((s) => s.id);
                  handleRemoveSubaccounts(ids);
                }}
                variant="outlined"
                color="error"
                disabled={dialog.submitting}
              >
                Remove All from Group
              </Button>
            )}
          <Button
            onClick={handleDialogSubmit}
            variant="contained"
            disabled={
              dialog.submitting ||
              !dialog.formData.name?.trim() ||
              !dialog.formData.relationshipManager?.trim() ||
              !dialog.formData.email?.trim() ||
              !dialog.formData.confirmEmail?.trim() ||
              (dialog.formData.email !== dialog.formData.confirmEmail &&
                dialog.mode !== "delete")
            }
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
    </DaylightAdminPage>
  );
}
