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
  Container,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  TextField,
  Stack,
  useTheme,
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

/**
 * Space data structure (from API)
 */
interface Space {
  id: string;
  name: string;
  location: string;
  capacity: number;
  powerCapacity: number;
  status: "AVAILABLE" | "OCCUPIED";
  createdAt: string;
  updatedAt: string;
  minerCount?: number;
  activeMinerCount?: number;
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
  const theme = useTheme();

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
      space.location.toLowerCase().includes(searchTerm.toLowerCase());
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

  /**
   * Get status chip color
   */
  const getStatusColor = (
    status: string,
  ): "success" | "warning" | "error" | "default" => {
    switch (status) {
      case "AVAILABLE":
        return "success";
      case "OCCUPIED":
        return "warning";
      default:
        return "default";
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
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
              Mining Spaces
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Manage mining spaces and their capacity
            </Typography>
          </Box>

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => fetchSpaces(true)}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreateClick}
              disabled={loading || refreshing}
            >
              Add Space
            </Button>
          </Stack>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Filters */}
        <Paper sx={{ p: 3, mb: 4, backgroundColor: "background.paper" }}>
          <Typography
            variant="h6"
            sx={{
              mb: 2,
              fontWeight: "bold",
              color: "text.primary",
            }}
          >
            Filters
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Search spaces"
              placeholder="Search by name or location..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(0); // Reset pagination
              }}
              sx={{ flex: 1, minWidth: 200 }}
            />

            <TextField
              label="Status"
              select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(
                  e.target.value as "" | "AVAILABLE" | "OCCUPIED",
                );
                setPage(0); // Reset pagination
              }}
              SelectProps={{
                native: true,
              }}
              sx={{ minWidth: 150 }}
            >
              <option value="">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="OCCUPIED">Occupied</option>
            </TextField>
          </Stack>
        </Paper>

        {/* Spaces Table */}
        {filteredSpaces.length > 0 ? (
          <Paper sx={{ overflow: "hidden" }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: "background.default" }}>
                    <TableCell sx={{ fontWeight: "bold" }}>
                      Space Name
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Location</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }} align="center">
                      Capacity
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }} align="center">
                      Power (kW)
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }} align="center">
                      Miners
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }} align="center">
                      Status
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }} align="center">
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedSpaces.map((space) => (
                    <TableRow
                      key={space.id}
                      sx={{
                        "&:hover": {
                          backgroundColor: "background.default",
                        },
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {space.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {space.location}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {space.capacityUsed || 0}/{space.capacity}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: "block",
                              color:
                                parseFloat(space.capacityPercentage || "0") > 80
                                  ? theme.palette.warning.main
                                  : parseFloat(
                                        space.capacityPercentage || "0",
                                      ) > 95
                                    ? theme.palette.error.main
                                    : undefined,
                            }}
                          >
                            {space.capacityPercentage || "0"}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">
                          {space.powerCapacity}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {space.minerCount || 0}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block" }}
                          >
                            {space.activeMinerCount || 0} active
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={space.status}
                          color={getStatusColor(space.status)}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={() => handleEditClick(space)}
                          title="Edit space"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteClick(space)}
                          title="Delete space"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]}
              component="div"
              count={filteredSpaces.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(event, newPage) => setPage(newPage)}
              onRowsPerPageChange={(event) => {
                setRowsPerPage(parseInt(event.target.value, 10));
                setPage(0);
              }}
            />
          </Paper>
        ) : (
          <Paper sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="h6" color="text.secondary">
              No spaces found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {spaces.length === 0
                ? "Create your first mining space"
                : "No spaces match your filters"}
            </Typography>
          </Paper>
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
              onClick={() =>
                setDeleteConfirm({ ...deleteConfirm, open: false })
              }
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
      </Container>
    </Box>
  );
}
