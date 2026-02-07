/**
 * src/app/(manage)/groups/[groupId]/page.tsx
 * Group Subaccounts Detail Page
 *
 * Admin page for viewing and managing subaccounts within a specific group:
 * - View group details and all subaccounts
 * - Add/remove subaccounts from the group
 * - Search and pagination
 * - Real-time updates
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
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
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  TablePagination,
  InputAdornment,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
} from "@mui/material";
import GradientStatCard from "@/components/GradientStatCard";

/**
 * Group type
 */
interface Group {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

/**
 * Subaccount in group with user details
 */
interface GroupSubaccount {
  id: string;
  subaccountName: string;
  addedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "CLIENT" | "SUPER_ADMIN";
    luxorSubaccountName: string;
  };
  minerCount: number;
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
 * Component state
 */
interface PageState {
  group: Group | null;
  subaccounts: GroupSubaccount[];
  availableSubaccounts: GroupSubaccount[];
  loading: boolean;
  error: string | null;
}

/**
 * Dialog state for add/remove operations
 */
interface DialogState {
  open: boolean;
  mode: "add" | "remove";
  selectedSubaccount: GroupSubaccount | null;
  submitting: boolean;
  message: string | null;
  selectedSubaccountIds: Set<string>;
}

const initialDialogState: DialogState = {
  open: false,
  mode: "add",
  selectedSubaccount: null,
  submitting: false,
  message: null,
  selectedSubaccountIds: new Set(),
};

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;

  const [state, setState] = useState<PageState>({
    group: null,
    subaccounts: [],
    availableSubaccounts: [],
    loading: true,
    error: null,
  });

  const [dialog, setDialog] = useState<DialogState>(initialDialogState);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Fetch group and its subaccounts
   */
  const fetchGroupData = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      console.log("[GroupDetail] Fetching group and subaccounts...");

      const response = await fetch(`/api/groups/${groupId}`);

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: ApiResponse<{
        group: Group;
        subaccounts: GroupSubaccount[];
        availableSubaccounts: GroupSubaccount[];
      }> = await response.json();

      if (!data.success || !data.data) {
        throw new Error(data.error || "Failed to fetch group data");
      }

      console.log("[GroupDetail] Fetched data:", data.data);

      setState({
        group: data.data.group,
        subaccounts: data.data.subaccounts,
        availableSubaccounts: data.data.availableSubaccounts,
        loading: false,
        error: null,
      });
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[GroupDetail] Error fetching data:", errorMsg);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMsg,
      }));
    }
  }, [groupId]);

  /**
   * Fetch group data on component mount
   */
  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  /**
   * Handle add subaccount
   */
  const handleAddSubaccount = async () => {
    if (!dialog.selectedSubaccount) return;

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      console.log(
        "[GroupDetail] Adding subaccount:",
        dialog.selectedSubaccount.subaccountName,
      );

      const response = await fetch(`/api/groups/${groupId}/subaccounts/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subaccountName: dialog.selectedSubaccount.subaccountName,
        }),
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `API returned status ${response.status}`);
      }

      console.log("[GroupDetail] Subaccount added successfully");

      // Refresh data
      await fetchGroupData();

      // Close dialog
      setDialog(initialDialogState);
      setPage(0);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[GroupDetail] Error adding subaccount:", errorMsg);
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        message: errorMsg,
      }));
    }
  };

  /**
   * Handle remove subaccount
   */
  const handleRemoveSubaccount = async () => {
    if (!dialog.selectedSubaccount) return;

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      const subaccountId = dialog.selectedSubaccount.id;

      console.log("[GroupDetail] Removing subaccount:", subaccountId);

      const response = await fetch(
        `/api/groups/${groupId}/subaccounts/${subaccountId}`,
        {
          method: "DELETE",
        },
      );

      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `API returned status ${response.status}`);
      }

      console.log("[GroupDetail] Subaccount removed successfully");

      // Refresh data
      await fetchGroupData();

      // Close dialog
      setDialog(initialDialogState);
      setPage(0);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[GroupDetail] Error removing subaccount:", errorMsg);
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        message: errorMsg,
      }));
    }
  };

  /**
   * Toggle subaccount selection for multi-add
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
        state.availableSubaccounts.map((s) => s.id),
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
   * Add multiple selected subaccounts to group
   */
  const handleAddMultipleSubaccounts = async () => {
    if (dialog.selectedSubaccountIds.size === 0) {
      setDialog((prev) => ({
        ...prev,
        message: "Please select at least one subaccount",
      }));
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      const selectedSubaccounts = state.availableSubaccounts.filter((s) =>
        dialog.selectedSubaccountIds.has(s.id),
      );
      const subaccountNames = selectedSubaccounts.map((s) => s.subaccountName);

      console.log("[GroupDetail] Adding subaccounts:", subaccountNames);

      const response = await fetch(
        `/api/groups/${groupId}/subaccounts/bulk-add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subaccountNames }),
        },
      );

      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `API returned status ${response.status}`);
      }

      console.log("[GroupDetail] Subaccounts added successfully");

      // Refresh data
      await fetchGroupData();

      // Close dialog
      setDialog(initialDialogState);
      setPage(0);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[GroupDetail] Error adding subaccounts:", errorMsg);
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
      open: true,
      mode: "add",
      selectedSubaccount: null,
      submitting: false,
      message: null,
      selectedSubaccountIds: new Set(),
    });
  };

  /**
   * Open remove subaccount dialog
   */
  const openRemoveDialog = (subaccount: GroupSubaccount) => {
    setDialog({
      open: true,
      mode: "remove",
      selectedSubaccount: subaccount,
      submitting: false,
      message: null,
      selectedSubaccountIds: new Set(),
    });
  };

  /**
   * Close dialog
   */
  const closeDialog = () => {
    setDialog(initialDialogState);
  };

  /**
   * Handle dialog submission
   */
  const handleDialogSubmit = () => {
    if (dialog.mode === "add") {
      handleAddSubaccount();
    } else {
      handleRemoveSubaccount();
    }
  };

  /**
   * Handle refresh
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchGroupData();
    setIsRefreshing(false);
  };

  /**
   * Filter subaccounts based on search term
   */
  const filteredSubaccounts = state.subaccounts.filter(
    (sub) =>
      sub.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.subaccountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.user.luxorSubaccountName
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
  );

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

  if (!state.group) {
    return (
      <Box component="main" sx={{ py: 4 }}>
        <Container maxWidth="xl">
          <Alert severity="error">Group not found</Alert>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => router.back()}
            sx={{ mt: 2 }}
          >
            Go Back
          </Button>
        </Container>
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
        <Box sx={{ mb: 4 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <IconButton
              onClick={() => router.back()}
              size="small"
              color="primary"
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h3" component="h1" sx={{ fontWeight: "bold" }}>
              {state.group.name}
            </Typography>
          </Stack>
          {state.group.description && (
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
              {state.group.description}
            </Typography>
          )}
        </Box>

        {/* Error Alert */}
        {state.error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
              Error Loading Group Data
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
              title="Total Subaccounts"
              value={String(state.subaccounts.length)}
              gradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
            />
          </Box>

          <Box>
            <GradientStatCard
              title="Available to Add"
              value={String(state.availableSubaccounts.length)}
              gradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
            />
          </Box>
        </Box>

        {/* Subaccounts Table */}
        <Paper sx={{ mb: 4 }}>
          {/* Table Toolbar */}
          <Box
            sx={{
              p: 2,
              borderBottom: 1,
              borderColor: "divider",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <TextField
              size="small"
              placeholder="Search by name, email, or subaccount..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(0);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ width: "300px" }}
            />

            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={handleRefresh}
                disabled={isRefreshing}
                size="small"
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={openAddDialog}
                disabled={state.availableSubaccounts.length === 0}
                size="small"
              >
                Add Subaccount
              </Button>
            </Stack>
          </Box>

          {/* Table */}
          {state.subaccounts.length > 0 ? (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "background.default" }}>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        User Name
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>Email</TableCell>
                      <TableCell sx={{ fontWeight: "bold" }} align="center">
                        Role
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        Luxor Subaccount
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }} align="right">
                        Miners
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }} align="right">
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredSubaccounts
                      .slice(
                        page * rowsPerPage,
                        page * rowsPerPage + rowsPerPage,
                      )
                      .map((subaccount) => (
                        <TableRow
                          key={subaccount.id}
                          sx={{
                            "&:hover": {
                              backgroundColor: "background.default",
                            },
                          }}
                        >
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 500 }}
                            >
                              {subaccount.user.name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {subaccount.user.email}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={subaccount.user.role}
                              size="small"
                              variant="outlined"
                              color={
                                subaccount.user.role === "ADMIN"
                                  ? "error"
                                  : subaccount.user.role === "SUPER_ADMIN"
                                    ? "warning"
                                    : "default"
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {subaccount.user.luxorSubaccountName || "-"}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 500 }}
                            >
                              {subaccount.minerCount}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Remove Subaccount">
                              <IconButton
                                size="small"
                                onClick={() => openRemoveDialog(subaccount)}
                                color="error"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                rowsPerPageOptions={[5, 10, 25, 50]}
                component="div"
                count={filteredSubaccounts.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={(event, newPage) => setPage(newPage)}
                onRowsPerPageChange={(event) => {
                  setRowsPerPage(parseInt(event.target.value, 10));
                  setPage(0);
                }}
              />
            </>
          ) : (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography variant="h6" color="text.secondary">
                No subaccounts in this group yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Click &quot;Add Subaccount&quot; to add subaccounts to this
                group
              </Typography>
            </Box>
          )}
        </Paper>

        {/* Add/Remove Dialog */}
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
              {dialog.mode === "add"
                ? "Add Subaccount to Group"
                : "Remove Subaccount from Group"}
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

            {dialog.mode === "add" ? (
              <Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  Select subaccounts to add to this group:
                </Typography>
                {state.availableSubaccounts.length > 0 ? (
                  <>
                    <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={handleSelectAllSubaccounts}
                        disabled={
                          dialog.submitting ||
                          dialog.selectedSubaccountIds.size ===
                            state.availableSubaccounts.length
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
                    </Box>

                    <Paper sx={{ maxHeight: "400px", overflow: "auto" }}>
                      <List>
                        {state.availableSubaccounts.map((subaccount) => (
                          <ListItem
                            key={subaccount.id}
                            disablePadding
                            sx={{
                              borderBottom: "1px solid",
                              borderColor: "divider",
                            }}
                          >
                            <ListItemButton
                              role={undefined}
                              onClick={() =>
                                handleSubaccountToggle(subaccount.id)
                              }
                              dense
                            >
                              <ListItemIcon sx={{ minWidth: "40px" }}>
                                <Checkbox
                                  edge="start"
                                  checked={dialog.selectedSubaccountIds.has(
                                    subaccount.id,
                                  )}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleSubaccountToggle(subaccount.id);
                                  }}
                                  tabIndex={-1}
                                  disableRipple
                                />
                              </ListItemIcon>
                              <ListItemText
                                primary={subaccount.subaccountName}
                                secondary={`${subaccount.user?.name || "Unknown"} (${subaccount.user?.email}) • ${subaccount.minerCount} miners`}
                              />
                            </ListItemButton>
                          </ListItem>
                        ))}
                      </List>
                    </Paper>

                    <Box
                      sx={{
                        mt: 2,
                        minHeight: "60px",
                        p: 2,
                        backgroundColor:
                          dialog.selectedSubaccountIds.size > 0
                            ? "action.hover"
                            : "transparent",
                        borderRadius: 1,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {dialog.selectedSubaccountIds.size > 0 && (
                        <Typography variant="body2">
                          {dialog.selectedSubaccountIds.size} subaccount(s)
                          selected
                        </Typography>
                      )}
                    </Box>
                  </>
                ) : (
                  <Alert severity="info">
                    All subaccounts are already in this group
                  </Alert>
                )}
              </Box>
            ) : (
              <Box>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  Are you sure you want to remove this subaccount from the
                  group?
                </Typography>
                <Paper sx={{ p: 2, backgroundColor: "background.default" }}>
                  <Typography variant="body2" color="text.secondary">
                    User Name
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {dialog.selectedSubaccount?.user.name}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 2 }}
                  >
                    Email
                  </Typography>
                  <Typography variant="body2">
                    {dialog.selectedSubaccount?.user.email}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 2 }}
                  >
                    Luxor Subaccount
                  </Typography>
                  <Typography variant="body2">
                    {dialog.selectedSubaccount?.user.luxorSubaccountName || "-"}
                  </Typography>
                </Paper>
              </Box>
            )}
          </DialogContent>

          <DialogActions sx={{ p: 2 }}>
            <Button onClick={closeDialog} disabled={dialog.submitting}>
              Cancel
            </Button>
            <Button
              onClick={
                dialog.mode === "add"
                  ? handleAddMultipleSubaccounts
                  : handleDialogSubmit
              }
              variant="contained"
              disabled={
                dialog.submitting ||
                (dialog.mode === "add" &&
                  dialog.selectedSubaccountIds.size === 0) ||
                (dialog.mode === "remove" && !dialog.selectedSubaccount)
              }
              color={dialog.mode === "remove" ? "error" : "primary"}
            >
              {dialog.submitting ? (
                <CircularProgress size={20} sx={{ mr: 1 }} />
              ) : null}
              {dialog.mode === "add"
                ? `Add (${dialog.selectedSubaccountIds.size})`
                : "Remove"}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}
