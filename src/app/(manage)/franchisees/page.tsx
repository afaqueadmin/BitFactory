/**
 * src/app/(manage)/franchisees/page.tsx
 * Franchisee Management Page
 *
 * Admin page for viewing franchises and creating new franchisees.
 */

"use client";

import { isStaffRole } from "@/lib/auth/staffRoles";
import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  Tabs,
  Tab,
} from "@mui/material";
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  MoreVert as MoreVertIcon,
  MonetizationOn as IncentivesIcon,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import StorefrontIcon from "@mui/icons-material/Storefront";
import AdminValueCard from "@/components/admin/AdminValueCard";
import CreateFranchiseeModal from "@/components/CreateFranchiseeModal";
import EditFranchiseeModal from "@/components/EditFranchiseeModal";
import CustomerRequestsPanel from "@/components/admin/CustomerRequestsPanel";
import { useUser } from "@/lib/hooks";
import { useDaylight } from "@/lib/daylight";
import {
  CellNote,
  DaylightAdminPage,
  DaylightEmptyState,
  DaylightLoading,
  DaylightPageHeader,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

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
  franchisee: {
    id: string;
    name: string;
    email: string;
    luxorSubaccounts: string[];
  };
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
  const router = useRouter();
  const { user } = useUser();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isAdmin = isStaffRole(user?.role);
  const { d, fonts } = useDaylight();
  const ds = useDaylightAdminSx();

  const menuPaperSx = {
    minWidth: 200,
    borderRadius: "12px",
    border: `1px solid ${d.border}`,
    bgcolor: d.surface,
    backgroundImage: "none",
    boxShadow: "0 8px 30px rgba(100,114,124,.13)",
    "& .MuiMenuItem-root": {
      minHeight: 40,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: 500,
      color: d.text,
      "&:hover": { bgcolor: d.hover },
    },
    "& .MuiListItemText-primary": { fontFamily: fonts.body, fontSize: 13 },
    "& .MuiListItemIcon-root": { color: d.muted, minWidth: 32 },
  } as const;

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
  const [tab, setTab] = useState<"franchisees" | "requests">("franchisees");
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  const fetchPendingRequestCount = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/admin/customer-requests?status=PENDING",
      );
      const data = await response.json();
      if (data.success) {
        setPendingRequestCount(Array.isArray(data.data) ? data.data.length : 0);
      }
    } catch {
      // non-critical, badge just won't show
    }
  }, []);

  useEffect(() => {
    fetchPendingRequestCount();
  }, [fetchPendingRequestCount]);

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
      <DaylightAdminPage>
        <DaylightLoading />
      </DaylightAdminPage>
    );
  }

  const activeCount = franchises.filter((f) => f.isActive).length;

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Franchisees"
        description="Manage franchisees and their franchise business details."
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
              onClick={() => setCreateModalOpen(true)}
              sx={ds.primaryBtnSx}
            >
              Create New Franchisee
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{
          mb: { xs: "20px", md: "24px" },
          minHeight: 40,
          borderBottom: `1px solid ${d.border}`,
          "& .MuiTabs-indicator": { bgcolor: d.action, height: 2 },
          "& .MuiTab-root": {
            minHeight: 40,
            px: "4px",
            mr: 3,
            minWidth: 0,
            textTransform: "none",
            fontFamily: fonts.body,
            fontSize: 13,
            fontWeight: 600,
            color: d.muted,
            "&.Mui-selected": { color: d.action },
            "&:hover": { color: d.text },
          },
        }}
      >
        <Tab label="Franchisees" value="franchisees" />
        <Tab
          value="requests"
          label={
            <Box
              component="span"
              sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
            >
              Customer Requests
              {pendingRequestCount > 0 && (
                <DaylightStatusPill
                  label={String(pendingRequestCount)}
                  tone="warning"
                />
              )}
            </Box>
          }
        />
      </Tabs>

      {tab === "requests" ? (
        <CustomerRequestsPanel />
      ) : (
        <>
          {error && (
            <Alert severity="error" sx={{ mb: 3, ...ds.alertSx("error") }}>
              <Box component="strong" sx={{ display: "block", mb: "2px" }}>
                Error Loading Franchisees
              </Box>
              {error}
            </Alert>
          )}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(min(240px, 100%), 1fr))",
              gap: { xs: "12px", sm: "16px", md: "20px" },
              mb: { xs: "20px", md: "24px" },
            }}
          >
            <AdminValueCard
              daylight
              title="Total Franchisees"
              value={franchises.length}
            />
            <AdminValueCard
              daylight
              title="Active Franchises"
              value={activeCount}
            />
          </Box>

          {franchises.length > 0 ? (
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ ...ds.tableCardSx, mb: { xs: "20px", md: "24px" } }}
            >
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Business Name</TableCell>
                    <TableCell>Franchisee</TableCell>
                    <TableCell>Contact</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Code</TableCell>
                    <TableCell align="center">Status</TableCell>
                    {isAdmin && <TableCell align="right">Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {franchises.map((franchise) => (
                    <TableRow
                      key={franchise.id}
                      onClick={() =>
                        router.push(`/franchisees/${franchise.id}`)
                      }
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>
                        <Box
                          component="span"
                          sx={{ fontWeight: 650, color: d.action }}
                        >
                          {franchise.businessName}
                        </Box>
                        <CellNote>{franchise.authorizedPersonName}</CellNote>
                      </TableCell>
                      <TableCell>
                        {franchise.franchisee?.name || "—"}
                        <CellNote>{franchise.franchisee?.email}</CellNote>
                      </TableCell>
                      <TableCell>
                        {franchise.email}
                        <CellNote>{franchise.phoneNumber}</CellNote>
                      </TableCell>
                      <TableCell>
                        {franchise.city}, {franchise.state}
                      </TableCell>
                      <TableCell
                        sx={{
                          "&&&": {
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                            fontSize: 12,
                          },
                        }}
                      >
                        {franchise.franchiseCode}
                      </TableCell>
                      <TableCell align="center">
                        <DaylightStatusPill
                          label={franchise.isActive ? "Active" : "Inactive"}
                          tone={franchise.isActive ? "success" : "neutral"}
                        />
                      </TableCell>
                      {isAdmin && (
                        <TableCell align="right" sx={{ "&&&": { py: "8px" } }}>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMenuOpen(e, franchise);
                            }}
                            aria-label={`Actions for ${franchise.businessName}`}
                            sx={{
                              color: d.muted,
                              borderRadius: "8px",
                              "&:hover": { bgcolor: d.hover, color: d.action },
                            }}
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
            <Box sx={{ mb: { xs: "20px", md: "24px" } }}>
              <DaylightEmptyState>
                <StorefrontIcon
                  sx={{ fontSize: 40, color: d.inputBorder, mb: 1 }}
                  aria-hidden
                />
                <Box sx={{ fontSize: 15, fontWeight: 650, color: d.text }}>
                  No franchisees created yet
                </Box>
                <Box sx={{ mt: "4px" }}>
                  Click &quot;Create New Franchisee&quot; to add one.
                </Box>
              </DaylightEmptyState>
            </Box>
          )}

          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{ paper: { sx: menuPaperSx } }}
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
            <MenuItem
              onClick={() => {
                if (menuFranchise) {
                  router.push(`/franchisees/${menuFranchise.id}/incentives`);
                }
                handleMenuClose();
              }}
            >
              <ListItemIcon>
                <IncentivesIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Manage Incentives</ListItemText>
            </MenuItem>
            {isSuperAdmin && (
              <MenuItem
                onClick={() => {
                  setDeleteError("");
                  setDeletingFranchise(menuFranchise);
                  handleMenuClose();
                }}
                sx={{
                  "&&": { color: d.danger },
                  "& .MuiListItemIcon-root": { color: d.danger },
                }}
              >
                <ListItemIcon>
                  <DeleteIcon fontSize="small" />
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
              sx={{ width: "100%", ...ds.alertSx("success") }}
            >
              {notification}
            </Alert>
          </Snackbar>
        </>
      )}
    </DaylightAdminPage>
  );
}
