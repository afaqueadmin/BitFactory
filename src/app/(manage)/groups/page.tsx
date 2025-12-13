/**
 * src/app/(manage)/groups/page.tsx
 * Luxor Workspace Sites Management Page (V2 API)
 *
 * Admin page for managing Luxor workspace sites with full CRUD operations:
 * - Create new sites
 * - Update existing sites
 * - Delete sites
 * - View site details (energy, subaccounts)
 * - Real-time status and feedback
 *
 * This page uses the secure /api/luxor proxy route to handle all site operations
 * with server-side authentication and authorization.
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
import LocationOnIcon from "@mui/icons-material/LocationOn";
import { Site, Subaccount } from "@/lib/luxor";
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
 * Form data structure for site operations
 */
interface SiteFormData {
  name: string;
  country: string;
  base_load_kw: number;
  max_load_kw: number;
  settlement_point_id: string;
}

/**
 * Component state for managing sites
 */
interface SitesState {
  sites: Site[];
  loading: boolean;
  error: string | null;
}

/**
 * Dialog state for form operations
 */
interface DialogState {
  open: boolean;
  mode: "create" | "edit" | "delete";
  selectedSite: Site | null;
  formData: SiteFormData;
  submitting: boolean;
  message: string | null;
}

/**
 * Initial dialog state
 */
const initialDialogState: DialogState = {
  open: false,
  mode: "create",
  selectedSite: null,
  formData: {
    name: "",
    country: "",
    base_load_kw: 0,
    max_load_kw: 0,
    settlement_point_id: "",
  },
  submitting: false,
  message: null,
};

export default function LuxorSitesPage() {
  const [state, setState] = useState<SitesState>({
    sites: [],
    loading: true,
    error: null,
  });

  const [dialog, setDialog] = useState<DialogState>(initialDialogState);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Fetch all workspace sites
   *
   * This function fetches all sites available in the workspace.
   * Called on component mount and when refreshing or after CRUD operations complete.
   */
  const fetchSites = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      console.log("[Luxor Sites] Fetching workspace sites...");

      const response = await fetch("/api/luxor?endpoint=sites");

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: ProxyResponse<Record<string, unknown>> =
        await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch sites");
      }

      // In V2, the sites endpoint returns an array directly or wrapped in 'sites'
      const responseData = data.data as
        | Record<string, unknown>
        | Array<unknown>;
      let sitesList: Site[] = [];

      console.log("[Luxor Sites] Response data:", responseData);

      if (Array.isArray(responseData)) {
        sitesList = responseData as Site[];
      } else if (
        responseData &&
        typeof responseData === "object" &&
        Array.isArray(responseData.sites)
      ) {
        sitesList = responseData.sites as Site[];
      }

      console.log("[Luxor Sites] Parsed sites:", sitesList);

      setState({
        sites: sitesList,
        loading: false,
        error: null,
      });

      console.log(
        `[Luxor Sites] Successfully fetched ${sitesList.length} sites`,
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Sites] Error fetching sites:", errorMsg);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMsg,
      }));
    }
  }, []);

  /**
   * Fetch sites on component mount
   */
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  /**
   * Handle create site form submission
   *
   * Sends a POST request to /api/luxor with the new site data
   */
  const handleCreateSite = async () => {
    if (!dialog.formData.name.trim()) {
      setDialog((prev) => ({
        ...prev,
        message: "Site name is required",
      }));
      return;
    }

    if (!dialog.formData.country.trim()) {
      setDialog((prev) => ({
        ...prev,
        message: "Country is required",
      }));
      return;
    }

    if (dialog.formData.base_load_kw <= 0) {
      setDialog((prev) => ({
        ...prev,
        message: "Base load must be greater than 0",
      }));
      return;
    }

    if (dialog.formData.max_load_kw <= 0) {
      setDialog((prev) => ({
        ...prev,
        message: "Max load must be greater than 0",
      }));
      return;
    }

    if (!dialog.formData.settlement_point_id.trim()) {
      setDialog((prev) => ({
        ...prev,
        message: "Settlement point ID is required",
      }));
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      console.log("[Luxor Sites] Creating site:", dialog.formData.name);

      const response = await fetch("/api/luxor", {
        method: "POST",
        body: JSON.stringify({
          endpoint: "site",
          name: dialog.formData.name,
          country: dialog.formData.country,
          energy: {
            base_load_kw: dialog.formData.base_load_kw,
            max_load_kw: dialog.formData.max_load_kw,
            settlement_point_id: dialog.formData.settlement_point_id,
          },
        }),
      });

      const data: ProxyResponse<Site> = await response.json();

      console.log("[Luxor Sites] Create response:", {
        status: response.status,
        data,
      });

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error("[Luxor Sites] Error creating site:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[Luxor Sites] Site created successfully");

      // Refresh the sites list
      await fetchSites();

      // Close dialog
      setDialog(initialDialogState);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Sites] Error creating site:", errorMsg);
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        message: errorMsg,
      }));
    }
  };

  /**
   * Handle update site form submission
   *
   * Sends a PUT request to /api/luxor with the updated site data
   */
  const handleUpdateSite = async () => {
    if (!dialog.selectedSite) {
      setDialog((prev) => ({
        ...prev,
        message: "No site selected",
      }));
      return;
    }

    if (!dialog.formData.name.trim()) {
      setDialog((prev) => ({
        ...prev,
        message: "Site name is required",
      }));
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      const siteId = dialog.selectedSite.id;

      console.log("[Luxor Sites] Updating site:", siteId);

      const response = await fetch("/api/luxor", {
        method: "PUT",
        body: JSON.stringify({
          endpoint: "site",
          site_id: siteId,
          name: dialog.formData.name,
          country: dialog.formData.country,
          energy: {
            base_load_kw: dialog.formData.base_load_kw,
            max_load_kw: dialog.formData.max_load_kw,
            settlement_point_id: dialog.formData.settlement_point_id,
          },
        }),
      });

      const data: ProxyResponse<Site> = await response.json();

      console.log("[Luxor Sites] Update response:", {
        status: response.status,
        data,
      });

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error("[Luxor Sites] Error updating site:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[Luxor Sites] Site updated successfully");

      // Refresh the sites list
      await fetchSites();

      // Close dialog
      setDialog(initialDialogState);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Sites] Error updating site:", errorMsg);
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        message: errorMsg,
      }));
    }
  };

  /**
   * Handle delete site confirmation
   *
   * Sends a DELETE request to /api/luxor with the site ID
   */
  const handleDeleteSite = async () => {
    if (!dialog.selectedSite) {
      setDialog((prev) => ({
        ...prev,
        message: "No site selected",
      }));
      return;
    }

    setDialog((prev) => ({ ...prev, submitting: true, message: null }));

    try {
      const siteId = dialog.selectedSite.id;

      console.log("[Luxor Sites] Deleting site:", siteId);

      const response = await fetch("/api/luxor", {
        method: "DELETE",
        body: JSON.stringify({
          endpoint: "site",
          site_id: siteId,
        }),
      });

      const data: ProxyResponse<Record<string, unknown>> =
        await response.json();

      console.log("[Luxor Sites] Delete response:", {
        status: response.status,
        data,
      });

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `API returned status ${response.status}`;
        console.error("[Luxor Sites] Error deleting site:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[Luxor Sites] Site deleted successfully");

      // Refresh the sites list
      await fetchSites();

      // Close dialog
      setDialog(initialDialogState);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Sites] Error deleting site:", errorMsg);
      setDialog((prev) => ({
        ...prev,
        submitting: false,
        message: errorMsg,
      }));
    }
  };

  /**
   * Open create site dialog
   */
  const openCreateDialog = () => {
    setDialog({
      ...initialDialogState,
      open: true,
      mode: "create",
    });
  };

  /**
   * Open edit site dialog
   */
  const openEditDialog = (site: Site) => {
    setDialog({
      open: true,
      mode: "edit",
      selectedSite: site,
      formData: {
        name: site.name,
        country: site.country || "",
        base_load_kw: site.energy?.base_load_kw || 0,
        max_load_kw: site.energy?.max_load_kw || 0,
        settlement_point_id: site.energy?.settlement_point_id || "",
      },
      submitting: false,
      message: null,
    });
  };

  /**
   * Open delete confirmation dialog
   */
  const openDeleteDialog = (site: Site) => {
    setDialog({
      open: true,
      mode: "delete",
      selectedSite: site,
      formData: {
        name: "",
        country: "",
        base_load_kw: 0,
        max_load_kw: 0,
        settlement_point_id: "",
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
        handleCreateSite();
        break;
      case "edit":
        handleUpdateSite();
        break;
      case "delete":
        handleDeleteSite();
        break;
    }
  };

  /**
   * Handle manual refresh
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchSites();
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
              Luxor Workspace Sites
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Manage your Luxor mining workspace sites and subaccounts
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
              Create Site
            </Button>
          </Stack>
        </Box>

        {/* Error Alert */}
        {state.error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
              Error Loading Sites
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
              title="Total Sites"
              value={String(state.sites.length)}
              gradient="linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)"
              icon={<LocationOnIcon fontSize="small" />}
            />
          </Box>

          <Box>
            <GradientStatCard
              title="Total Subaccounts"
              value={String(
                state.sites.reduce(
                  (sum, s) => sum + (s.pool?.subaccounts?.length ?? 0),
                  0,
                ),
              )}
              gradient="linear-gradient(135deg, #FFB300 0%, #FFCA28 100%)"
              icon={<GroupIcon fontSize="small" />}
            />
          </Box>

          <Box>
            <GradientStatCard
              title="Power Market"
              value={String(
                new Set(state.sites.map((s) => s.energy?.power_market)).size ||
                  0,
              )}
              gradient="linear-gradient(135deg, #00BFA6 0%, #1DE9B6 100%)"
              icon={<GroupIcon fontSize="small" />}
            />
          </Box>
        </Box>

        {/* Sites Table */}
        {state.sites.length > 0 ? (
          <TableContainer component={Paper} sx={{ mb: 4 }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "background.default" }}>
                  <TableCell sx={{ fontWeight: "bold" }}>Site Name</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Country</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    Power Market
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
                {state.sites.map((site) => (
                  <TableRow
                    key={site.id}
                    sx={{
                      "&:hover": {
                        backgroundColor: "background.default",
                      },
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {site.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: "monospace" }}
                      >
                        {site.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {site.country || "N/A"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={site.energy?.power_market || "Unknown"}
                        variant="outlined"
                        size="small"
                        color="primary"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {site.pool?.subaccounts?.length ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={1}
                        justifyContent="flex-end"
                      >
                        <Tooltip title="Edit Site">
                          <IconButton
                            size="small"
                            onClick={() => openEditDialog(site)}
                            color="primary"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Site">
                          <IconButton
                            size="small"
                            onClick={() => openDeleteDialog(site)}
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
            <LocationOnIcon
              sx={{
                fontSize: 64,
                color: "text.secondary",
                mb: 2,
                opacity: 0.5,
              }}
            />
            <Typography variant="h6" color="text.secondary">
              No sites available
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Click &quot;Create Site&quot; to get started
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
                ? "Create New Site"
                : dialog.mode === "edit"
                  ? "Edit Site"
                  : "Delete Site"}
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
                  Are you sure you want to delete this site?
                </Typography>
                <Paper sx={{ p: 2, backgroundColor: "background.default" }}>
                  <Typography variant="body2" color="text.secondary">
                    Site Name
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {dialog.selectedSite?.name}
                  </Typography>
                  {dialog.selectedSite?.id && (
                    <>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 2 }}
                      >
                        Site ID
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                      >
                        {dialog.selectedSite.id}
                      </Typography>
                    </>
                  )}
                </Paper>
                <Alert severity="warning" sx={{ mt: 2 }}>
                  This action cannot be undone.
                </Alert>
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <TextField
                  fullWidth
                  label="Site Name"
                  placeholder="Enter site name"
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
                  label="Country"
                  placeholder="Enter country (e.g., USA, CA, MX)"
                  value={dialog.formData.country}
                  onChange={(e) =>
                    setDialog((prev) => ({
                      ...prev,
                      formData: {
                        ...prev.formData,
                        country: e.target.value,
                      },
                      message: null,
                    }))
                  }
                  disabled={dialog.submitting}
                  variant="outlined"
                />

                <TextField
                  fullWidth
                  label="Base Load (kW)"
                  placeholder="Enter base load power"
                  type="number"
                  inputProps={{ step: "0.01", min: "0" }}
                  value={dialog.formData.base_load_kw}
                  onChange={(e) =>
                    setDialog((prev) => ({
                      ...prev,
                      formData: {
                        ...prev.formData,
                        base_load_kw: parseFloat(e.target.value) || 0,
                      },
                      message: null,
                    }))
                  }
                  disabled={dialog.submitting}
                  variant="outlined"
                />

                <TextField
                  fullWidth
                  label="Max Load (kW)"
                  placeholder="Enter maximum load power"
                  type="number"
                  inputProps={{ step: "0.01", min: "0" }}
                  value={dialog.formData.max_load_kw}
                  onChange={(e) =>
                    setDialog((prev) => ({
                      ...prev,
                      formData: {
                        ...prev.formData,
                        max_load_kw: parseFloat(e.target.value) || 0,
                      },
                      message: null,
                    }))
                  }
                  disabled={dialog.submitting}
                  variant="outlined"
                />

                <TextField
                  fullWidth
                  label="Settlement Point ID"
                  placeholder="Enter settlement point ID (UUID)"
                  value={dialog.formData.settlement_point_id}
                  onChange={(e) =>
                    setDialog((prev) => ({
                      ...prev,
                      formData: {
                        ...prev.formData,
                        settlement_point_id: e.target.value,
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
