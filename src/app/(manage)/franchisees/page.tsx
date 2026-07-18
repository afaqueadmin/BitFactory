/**
 * src/app/(manage)/franchisees/page.tsx
 * Franchisee Management Page
 *
 * Admin page for viewing franchises and creating new franchisees.
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
  Chip,
  Snackbar,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  MoreVert as MoreVertIcon,
} from "@mui/icons-material";
import StorefrontIcon from "@mui/icons-material/Storefront";
import AdminValueCard from "@/components/admin/AdminValueCard";
import CreateFranchiseeModal from "@/components/CreateFranchiseeModal";
import EditFranchiseeModal from "@/components/EditFranchiseeModal";
import { useUser } from "@/lib/hooks";

interface Franchise {
  id: string;
  businessName: string;
  authorizedPersonName: string;
  email: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  franchiseCode: string;
  isActive: boolean;
  createdAt: string;
  franchisee: { id: string; name: string; email: string };
  createdBy: { id: string; name: string; email: string };
  _count?: { users: number };
}

interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export default function FranchiseesPage() {
  const { user } = useUser();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingFranchise, setEditingFranchise] = useState<Franchise | null>(
    null,
  );
  const [deletingFranchise, setDeletingFranchise] = useState<Franchise | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [notification, setNotification] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuFranchise, setMenuFranchise] = useState<Franchise | null>(null);

  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    franchise: Franchise,
  ) => {
    setMenuAnchor(event.currentTarget);
    setMenuFranchise(franchise);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuFranchise(null);
  };

  const fetchFranchisees = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/franchisees");
      const data: ApiResponse<Franchise[]> = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch franchisees");
      }

      setFranchises(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFranchisees();
  }, [fetchFranchisees]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchFranchisees();
    setIsRefreshing(false);
  };

  const handleFranchiseeCreated = (text: string) => {
    setNotification(text);
    fetchFranchisees();
  };

  const handleFranchiseeEdited = (text: string) => {
    setNotification(text);
    setEditingFranchise(null);
    fetchFranchisees();
  };

  const handleConfirmDelete = async () => {
    if (!deletingFranchise) return;

    setDeleting(true);
    setDeleteError("");

    try {
      const response = await fetch(`/api/franchisees/${deletingFranchise.id}`, {
        method: "DELETE",
      });
      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete franchisee");
      }

      setNotification("Franchisee deleted successfully");
      setDeletingFranchise(null);
      fetchFranchisees();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete franchisee",
      );
    } finally {
      setDeleting(false);
    }
  };

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

  const activeCount = franchises.filter((f) => f.isActive).length;

  return (
    <Box
      component="main"
      sx={{ py: 4, backgroundColor: "background.default", minHeight: "100vh" }}
    >
      <Container maxWidth="xl">
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 4,
          }}
        >
          <Box>
            <Typography variant="h3" component="h1" sx={{ fontWeight: "bold" }}>
              Franchisees
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Manage franchisees and their franchise business details
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
              onClick={() => setCreateModalOpen(true)}
              sx={{
                px: 3,
                py: 1,
                background: (theme) =>
                  `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                "&:hover": {
                  background: (theme) =>
                    `linear-gradient(45deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
                },
              }}
            >
              Create New Franchisee
            </Button>
          </Stack>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
              Error Loading Franchisees
            </Typography>
            <Typography variant="body2">{error}</Typography>
          </Alert>
        )}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 3,
            mb: 4,
          }}
        >
          <Box>
            <AdminValueCard
              title="Total Franchisees"
              value={franchises.length}
            />
          </Box>
          <Box>
            <AdminValueCard title="Active Franchises" value={activeCount} />
          </Box>
        </Box>

        {franchises.length > 0 ? (
          <TableContainer component={Paper} sx={{ mb: 4 }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "background.default" }}>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    Business Name
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Franchisee</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Contact</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Location</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Code</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }} align="center">
                    Status
                  </TableCell>
                  {isAdmin && (
                    <TableCell sx={{ fontWeight: "bold" }} align="right">
                      Actions
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {franchises.map((franchise) => (
                  <TableRow
                    key={franchise.id}
                    sx={{
                      "&:hover": { backgroundColor: "background.default" },
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {franchise.businessName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {franchise.authorizedPersonName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {franchise.franchisee?.name || "-"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {franchise.franchisee?.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{franchise.email}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {franchise.phoneNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {franchise.city}, {franchise.state}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: "monospace" }}
                      >
                        {franchise.franchiseCode}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={franchise.isActive ? "Active" : "Inactive"}
                        color={franchise.isActive ? "success" : "default"}
                        variant="outlined"
                        size="small"
                      />
                    </TableCell>
                    {isAdmin && (
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, franchise)}
                          aria-label="Franchisee actions"
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Paper sx={{ p: 4, textAlign: "center", mb: 4 }}>
            <StorefrontIcon
              sx={{
                fontSize: 64,
                color: "text.secondary",
                mb: 2,
                opacity: 0.5,
              }}
            />
            <Typography variant="h6" color="text.secondary">
              No franchisees created yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Click &quot;Create New Franchisee&quot; to add one
            </Typography>
          </Paper>
        )}

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem
            onClick={() => {
              setEditingFranchise(menuFranchise);
              handleMenuClose();
            }}
          >
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>
          {isSuperAdmin && (
            <MenuItem
              onClick={() => {
                setDeleteError("");
                setDeletingFranchise(menuFranchise);
                handleMenuClose();
              }}
              sx={{ color: "error.main" }}
            >
              <ListItemIcon>
                <DeleteIcon fontSize="small" color="error" />
              </ListItemIcon>
              <ListItemText>Delete</ListItemText>
            </MenuItem>
          )}
        </Menu>

        <CreateFranchiseeModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={handleFranchiseeCreated}
        />

        <EditFranchiseeModal
          open={Boolean(editingFranchise)}
          onClose={() => setEditingFranchise(null)}
          onSuccess={handleFranchiseeEdited}
          franchise={editingFranchise}
        />

        <Dialog
          open={Boolean(deletingFranchise)}
          onClose={() => (deleting ? null : setDeletingFranchise(null))}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Delete Franchisee</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              Are you sure you want to delete{" "}
              <strong>{deletingFranchise?.businessName}</strong>? This action
              cannot be undone.
            </Typography>
            {deleteError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {deleteError}
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button
              onClick={() => setDeletingFranchise(null)}
              disabled={deleting}
              color="inherit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={deleting}
              variant="contained"
              color="error"
            >
              {deleting ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                "Delete"
              )}
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={Boolean(notification)}
          autoHideDuration={5000}
          onClose={() => setNotification("")}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={() => setNotification("")}
            severity="success"
            sx={{ width: "100%" }}
          >
            {notification}
          </Alert>
        </Snackbar>
      </Container>
    </Box>
  );
}
