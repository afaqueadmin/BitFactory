/**
 * Mining Spaces Management Page
 *
 * Admin interface for managing mining spaces.
 * Supports:
 * - Viewing all spaces with real-time capacity information
 * - Creating new spaces
 * - Editing existing spaces
 * - Deleting spaces (with validation for associated miners)
 * - Filtering and sorting
 * - Pagination
 */

"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  TablePagination,
  IconButton,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import SpaceFormModal from "@/components/admin/SpaceFormModal";
import { useDaylight } from "@/lib/daylight";
import {
  CellNote,
  DaylightAdminPage,
  DaylightEmptyState,
  DaylightLoading,
  DaylightPageHeader,
  DaylightStatusPill,
  statusLabel,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

/**
 * Space data structure (from API)
 */
interface Space {
  id: string;
  name: string;
  location: string;
  address: string | null;
  capacity: number;
  powerCapacity: number;
  status: "AVAILABLE" | "OCCUPIED";
  createdAt: string;
  updatedAt: string;
  minerCount?: number;
  activeMinerCount?: number;
  inactiveMinerCount?: number;
  capacityUsed?: number;
  capacityPercentage?: string;
  powerUsagePercentage?: string;
}

interface DeleteConfirmState {
  open: boolean;
  space: Space | null;
  isDeleting: boolean;
  error: string | null;
}

export default function SpacesPage() {
  const { d, fonts } = useDaylight();
  const ds = useDaylightAdminSx();

  // State management
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Modals
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({
    open: false,
    space: null,
    isDeleting: false,
    error: null,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<
    "" | "AVAILABLE" | "OCCUPIED"
  >("");
  const [searchTerm, setSearchTerm] = useState("");

  /**
   * Fetch spaces from API
   */
  const fetchSpaces = async (showRefreshing = true) => {
    try {
      if (showRefreshing) setRefreshing(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      params.append("sortBy", "createdAt");
      params.append("order", "desc");

      const response = await fetch(`/api/spaces?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch spaces");
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        setSpaces(data.data);
      } else {
        throw new Error(data.error || "Invalid response format");
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to fetch spaces";
      setError(errorMsg);
      console.error("[Spaces Page] Error fetching spaces:", errorMsg);
    } finally {
      setLoading(false);
      if (showRefreshing) setRefreshing(false);
    }
  };

  /**
   * Load spaces on component mount
   */
  useEffect(() => {
    fetchSpaces(false);
  }, []);

  /**
   * Handle creating a new space
   */
  const handleCreateClick = () => {
    setSelectedSpace(null);
    setFormModalOpen(true);
  };

  /**
   * Handle editing a space
   */
  const handleEditClick = (space: Space) => {
    setSelectedSpace(space);
    setFormModalOpen(true);
  };

  /**
   * Handle delete click - show confirmation
   */
  const handleDeleteClick = (space: Space) => {
    setDeleteConfirm({
      open: true,
      space,
      isDeleting: false,
      error: null,
    });
  };

  /**
   * Confirm and execute space deletion
   */
  const handleConfirmDelete = async () => {
    if (!deleteConfirm.space) return;

    setDeleteConfirm((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      const response = await fetch(`/api/spaces/${deleteConfirm.space.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete space");
      }

      // Refresh spaces list
      await fetchSpaces(false);

      // Close dialog
      setDeleteConfirm({
        open: false,
        space: null,
        isDeleting: false,
        error: null,
      });
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to delete space";
      setDeleteConfirm((prev) => ({
        ...prev,
        error: errorMsg,
        isDeleting: false,
      }));
    }
  };

  /**
   * Handle form modal success
   */
  const handleFormSuccess = () => {
    fetchSpaces(false);
    setFormModalOpen(false);
  };

  /**
   * Filter and search spaces
   */
  const filteredSpaces = spaces.filter((space) => {
    const matchesSearch =
      space.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      space.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (space.address || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || space.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  /**
   * Paginate filtered spaces
   */
  const paginatedSpaces = filteredSpaces.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <DaylightAdminPage>
        <DaylightLoading />
      </DaylightAdminPage>
    );
  }

  // Above 95% is critical, above 80% needs attention.
  const capacityColor = (pct: number) =>
    pct > 95 ? d.danger : pct > 80 ? d.warning : d.success;

  const iconBtnSx = (tone: "action" | "danger" = "action") => ({
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
        title="Mining Spaces"
        description="Manage mining spaces and their capacity."
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => fetchSpaces(true)}
              disabled={refreshing}
              sx={ds.outlineBtnSx}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreateClick}
              disabled={loading || refreshing}
              sx={ds.primaryBtnSx}
            >
              Add Space
            </Button>
          </>
        }
      />

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3, ...ds.alertSx("error") }}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Box
        component="section"
        aria-labelledby="space-filters-heading"
        sx={{ ...ds.cardSx, mb: { xs: "20px", md: "24px" } }}
      >
        <Typography
          id="space-filters-heading"
          component="h2"
          sx={{ ...ds.sectionTitleSx, fontSize: 14, mb: "12px" }}
        >
          Filters
        </Typography>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={ds.inputSx}
        >
          <TextField
            size="small"
            label="Search spaces"
            placeholder="Search by name, location, or address..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(0); // Reset pagination
            }}
            sx={{ flex: 1, minWidth: 200 }}
          />

          <TextField
            size="small"
            label="Status"
            select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "" | "AVAILABLE" | "OCCUPIED");
              setPage(0); // Reset pagination
            }}
            SelectProps={{
              native: true,
            }}
            // Native select shows "All Statuses" for the empty value, so
            // the label must stay raised or it overlaps that text.
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 180 }}
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="OCCUPIED">Occupied</option>
          </TextField>
        </Stack>
      </Box>

      {/* Spaces Table */}
      {filteredSpaces.length > 0 ? (
        <Paper elevation={0} sx={{ ...ds.tableCardSx, overflow: "hidden" }}>
          <TableContainer sx={ds.tableSx}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Space Name</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Address</TableCell>
                  <TableCell align="center">Capacity</TableCell>
                  <TableCell align="center">Power (kW)</TableCell>
                  <TableCell align="center">Miners</TableCell>
                  <TableCell align="center">Status</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedSpaces.map((space) => {
                  const pct = parseFloat(space.capacityPercentage || "0");
                  return (
                    <TableRow key={space.id}>
                      <TableCell sx={{ "&&&": { fontWeight: 650 } }}>
                        {space.name}
                      </TableCell>
                      <TableCell>{space.location}</TableCell>
                      <TableCell sx={{ "&&&": { color: d.muted } }}>
                        {space.address || "—"}
                      </TableCell>
                      <TableCell align="center">
                        <Box
                          component="span"
                          sx={{
                            fontWeight: 650,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {space.capacityUsed || 0}/{space.capacity}
                        </Box>
                        {/* Capacity bar */}
                        <Box
                          role="meter"
                          aria-label={`${space.name} capacity used`}
                          aria-valuenow={Math.min(pct, 100)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          sx={{
                            mx: "auto",
                            mt: "6px",
                            width: 72,
                            height: 4,
                            borderRadius: "999px",
                            bgcolor: d.border,
                            overflow: "hidden",
                          }}
                        >
                          <Box
                            sx={{
                              width: `${Math.min(pct, 100)}%`,
                              height: "100%",
                              bgcolor: capacityColor(pct),
                            }}
                          />
                        </Box>
                        <Box
                          component="span"
                          sx={{
                            display: "block",
                            mt: "2px",
                            fontSize: 11.5,
                            fontWeight: pct > 80 ? 650 : 500,
                            color: pct > 80 ? capacityColor(pct) : d.muted,
                          }}
                        >
                          {space.capacityPercentage || "0"}%
                        </Box>
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{ "&&&": { fontVariantNumeric: "tabular-nums" } }}
                      >
                        {space.powerCapacity}
                      </TableCell>
                      <TableCell align="center">
                        <Box component="span" sx={{ fontWeight: 650 }}>
                          {space.minerCount || 0}
                        </Box>
                        <CellNote>
                          {space.activeMinerCount || 0} active ·{" "}
                          {space.inactiveMinerCount || 0} inactive
                        </CellNote>
                      </TableCell>
                      <TableCell align="center">
                        <DaylightStatusPill
                          label={statusLabel(space.status)}
                          tone={
                            space.status === "AVAILABLE" ? "success" : "warning"
                          }
                        />
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{ "&&&": { py: "8px", whiteSpace: "nowrap" } }}
                      >
                        <IconButton
                          size="small"
                          onClick={() => handleEditClick(space)}
                          title="Edit space"
                          aria-label={`Edit ${space.name}`}
                          sx={iconBtnSx()}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteClick(space)}
                          title="Delete space"
                          aria-label={`Delete ${space.name}`}
                          sx={iconBtnSx("danger")}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50, { value: 9999, label: "Max" }]}
            component="div"
            count={filteredSpaces.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(event, newPage) => setPage(newPage)}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
            sx={{
              borderTop: `1px solid ${d.border}`,
              color: d.muted,
              "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows, & .MuiTablePagination-select":
                { fontFamily: fonts.body, fontSize: 12.5 },
              "& .MuiIconButton-root": { color: d.muted },
            }}
          />
        </Paper>
      ) : (
        <DaylightEmptyState>
          <Box sx={{ fontSize: 15, fontWeight: 650, color: d.text }}>
            No spaces found
          </Box>
          <Box sx={{ mt: "4px" }}>
            {spaces.length === 0
              ? "Create your first mining space."
              : "No spaces match your filters."}
          </Box>
        </DaylightEmptyState>
      )}

      {/* Space Form Modal */}
      <SpaceFormModal
        open={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setSelectedSpace(null);
        }}
        onSuccess={handleFormSuccess}
        space={selectedSpace}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ ...deleteConfirm, open: false })}
      >
        <DialogTitle>Delete Space</DialogTitle>
        <DialogContent>
          {deleteConfirm.error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteConfirm.error}
            </Alert>
          ) : (
            <Typography>
              Are you sure you want to delete{" "}
              <strong>{deleteConfirm.space?.name}</strong>? This action cannot
              be undone.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteConfirm({ ...deleteConfirm, open: false })}
            disabled={deleteConfirm.isDeleting}
          >
            Cancel
          </Button>
          {!deleteConfirm.error && (
            <Button
              onClick={handleConfirmDelete}
              color="error"
              variant="contained"
              disabled={deleteConfirm.isDeleting}
            >
              {deleteConfirm.isDeleting ? "Deleting..." : "Delete"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </DaylightAdminPage>
  );
}
