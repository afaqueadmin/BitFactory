/**
 * src/app/(manage)/subaccounts/page.tsx
 * Luxor Workspace Subaccounts Management Page (V2 API)
 *
 * Admin page for managing Luxor subaccounts within workspace sites with full CRUD operations:
 * - Select a site from dropdown
 * - View all subaccounts in the selected site
 * - Add new subaccounts to a site
 * - Remove subaccounts from a site
 * - Real-time status and feedback
 *
 * This page uses the secure /api/luxor proxy route to handle all subaccount operations
 * with server-side authentication and ADMIN-only authorization.
 *
 * NOTE: This replaces the V1 Groups API. Sites are the new organizational unit in V2.
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
import LocationOnIcon from "@mui/icons-material/LocationOn";
import GradientStatCard from "@/components/GradientStatCard";
import { Subaccount } from "@/lib/luxor";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Fixed site ID for subaccount operations
 * TODO: Replace with dynamic site selection once authorization is resolved
 */
const FIXED_SITE_ID = process.env.LUXOR_FIXED_SITE_ID;

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
  subaccounts: Subaccount[];
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
  subaccounts: Subaccount[];
  loading: boolean;
  error: string | null;
}

/**
 * Dialog state for form operations
 */
interface DialogState {
  open: boolean;
  mode: "add" | "delete";
  selectedSubaccount: Subaccount | null;
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
    subaccounts: [],
    loading: true,
    error: null,
  });

  const [dialog, setDialog] = useState<DialogState>(initialDialogState);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Fetch all subaccounts across all sites
   *
   * This is called on component mount to populate the subaccounts table.
   * Fetches all subaccounts via pagination (site_id is optional):
   * GET /pool/subaccounts?page_number=1&page_size=10
   *
   * The response includes site information for each subaccount.
   */
  const fetchSubaccounts = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      console.log(
        "[Luxor Subaccounts] Fetching all subaccounts (without site_id filter)",
      );

      const response = await fetch(`/api/luxor?endpoint=subaccounts`);

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: ProxyResponse<SubaccountListData> = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch subaccounts");
      }

      const subaccountsList =
        (data.data as SubaccountListData)?.subaccounts || [];

      setState((prev) => ({
        ...prev,
        subaccounts: subaccountsList,
        loading: false,
        error: null,
      }));

      console.log(
        `[Luxor Subaccounts] Successfully fetched ${subaccountsList.length} subaccounts`,
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
        loading: false,
        error: errorMsg,
      }));
    }
  }, []);

  /**
   * Fetch subaccounts on component mount
   */
  useEffect(() => {
    fetchSubaccounts();
  }, [fetchSubaccounts]);

  /**
   * Handle add subaccount form submission
   *
   * Sends a POST request to /api/luxor with the new subaccount name
   * Uses the fixed FIXED_SITE_ID for all operations
   */
  const handleAddSubaccount = async () => {
    if (!dialog.formData.name.trim()) {
      setDialog((prev) => ({
        ...prev,
        message: "Subaccount name is required",
      }));
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      console.log(
        "[Luxor Subaccounts] Adding subaccount:",
        dialog.formData.name,
        "to site:",
        FIXED_SITE_ID,
      );

      const response = await fetch("/api/luxor", {
        method: "POST",
        body: JSON.stringify({
          endpoint: "subaccount",
          site_id: FIXED_SITE_ID,
          name: dialog.formData.name,
        }),
      });

      const data: ProxyResponse<Subaccount> = await response.json();

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

      // Refresh the subaccounts list
      await fetchSubaccounts();

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
   * Uses the fixed FIXED_SITE_ID for the operation
   */
  const handleDeleteSubaccount = async () => {
    if (!dialog.selectedSubaccount) {
      setDialog((prev) => ({
        ...prev,
        message: "No subaccount selected",
      }));
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      const subaccountName = dialog.selectedSubaccount.name;
      const subaccountId = dialog.selectedSubaccount.id;

      console.log("[Luxor Subaccounts] DELETE REQUEST:");
      console.log("  Site ID:", FIXED_SITE_ID);
      console.log("  Subaccount ID:", subaccountId);
      console.log("  Subaccount Name:", subaccountName);

      const requestBody = {
        endpoint: "subaccount",
        site_id: FIXED_SITE_ID,
        subaccount_id: subaccountId,
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

      // Refresh the subaccounts list
      await fetchSubaccounts();

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
  const openDeleteDialog = (subaccount: Subaccount) => {
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
    await fetchSubaccounts();
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
              View all subaccounts across all workspace sites
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
              onClick={openAddDialog}
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

        {/* Stat Cards */}
        {state.subaccounts.length > 0 && (
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
          </Box>
        )}

        {/* Subaccounts Table */}
        {state.subaccounts.length > 0 ? (
          <TableContainer component={Paper} sx={{ mb: 4 }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "background.default" }}>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    Subaccount Name
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>ID</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Site</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }} align="right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {state.subaccounts.map((subaccount) => {
                  return (
                    <TableRow
                      key={subaccount.id}
                      sx={{
                        "&:hover": {
                          backgroundColor: "background.default",
                        },
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {subaccount.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: "monospace" }}
                        >
                          {subaccount.id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {subaccount.site.name}
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
                              onClick={() => openDeleteDialog(subaccount)}
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
              No subaccounts available
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Click &quot;Add Subaccount&quot; to create one
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
                    Site
                  </Typography>
                  <Typography variant="body2">
                    {dialog.selectedSubaccount?.site?.name || "N/A"}
                  </Typography>
                </Paper>
                <Alert severity="warning" sx={{ mt: 2 }}>
                  This subaccount will be deleted from the workspace entirely.
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
