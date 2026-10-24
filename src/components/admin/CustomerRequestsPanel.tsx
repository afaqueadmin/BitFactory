"use client";

/**
 * Admin panel for reviewing franchisee-submitted customer requests.
 * Rendered as a tab on the Franchisees page.
 */

import React, { useState, useCallback, useEffect } from "react";
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
  IconButton,
  Menu,
  MenuItem,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
} from "@mui/material";
import {
  MoreVert as MoreVertIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import CustomerRequestReviewModal, {
  type CustomerRequestRow,
} from "./CustomerRequestReviewModal";
import { useDaylight } from "@/lib/daylight";
import {
  CellNote,
  DaylightEmptyState,
  DaylightLoading,
  DaylightStatusPill,
  requestStatusTone,
  statusLabel,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

export default function CustomerRequestsPanel() {
  const { d, fonts } = useDaylight();
  const ds = useDaylightAdminSx();
  const [requests, setRequests] = useState<CustomerRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingRequest, setViewingRequest] =
    useState<CustomerRequestRow | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuRequest, setMenuRequest] = useState<CustomerRequestRow | null>(
    null,
  );
  const [deletingRequest, setDeletingRequest] =
    useState<CustomerRequestRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notification, setNotification] = useState("");

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/admin/customer-requests");
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch requests");
      }
      setRequests(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleMenuOpen = (
    e: React.MouseEvent<HTMLElement>,
    request: CustomerRequestRow,
  ) => {
    setMenuAnchorEl(e.currentTarget);
    setMenuRequest(request);
  };
  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuRequest(null);
  };

  const handleDelete = async () => {
    if (!deletingRequest) return;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/admin/customer-requests/${deletingRequest.id}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to delete request");
      }
      setNotification("Request deleted");
      setDeletingRequest(null);
      fetchRequests();
    } catch (err) {
      setNotification(
        err instanceof Error ? err.message : "Failed to delete request",
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <DaylightLoading />;
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 3, ...ds.alertSx("error") }}>
          {error}
        </Alert>
      )}

      {requests.length === 0 ? (
        <DaylightEmptyState>
          No customer requests have been submitted yet.
        </DaylightEmptyState>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={ds.tableCardSx}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell>Franchise</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Subaccount</TableCell>
                <TableCell>Initial Deposit</TableCell>
                <TableCell>Submitted</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Box component="span" sx={{ fontWeight: 650 }}>
                      {r.name}
                    </Box>
                    <CellNote>{r.email}</CellNote>
                  </TableCell>
                  <TableCell>
                    {r.franchise.businessName}
                    <CellNote>
                      by {r.requestedBy.name || r.requestedBy.email}
                    </CellNote>
                  </TableCell>
                  <TableCell>{r.phoneNumber || "—"}</TableCell>
                  <TableCell>
                    {r.luxorSubaccounts.length > 0
                      ? r.luxorSubaccounts.join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell
                    sx={{ "&&&": { fontVariantNumeric: "tabular-nums" } }}
                  >
                    {r.initialDeposit ? `$${r.initialDeposit}` : "—"}
                  </TableCell>
                  <TableCell sx={{ "&&&": { whiteSpace: "nowrap" } }}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell align="center">
                    <DaylightStatusPill
                      label={statusLabel(r.status)}
                      tone={requestStatusTone(r.status)}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ "&&&": { py: "8px" } }}>
                    <Box
                      sx={{
                        display: "flex",
                        gap: 0.5,
                        justifyContent: "flex-end",
                        alignItems: "center",
                      }}
                    >
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => setViewingRequest(r)}
                        sx={ds.primaryBtnSx}
                      >
                        View
                      </Button>
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, r)}
                        aria-label={`More options for ${r.name}`}
                        sx={{
                          color: d.muted,
                          borderRadius: "8px",
                          "&:hover": { bgcolor: d.hover, color: d.action },
                        }}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CustomerRequestReviewModal
        open={Boolean(viewingRequest)}
        request={viewingRequest}
        onClose={() => setViewingRequest(null)}
        onSuccess={(text) => {
          setNotification(text);
          fetchRequests();
        }}
      />

      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
        slotProps={{
          paper: {
            sx: {
              minWidth: 180,
              borderRadius: "12px",
              border: `1px solid ${d.border}`,
              bgcolor: d.surface,
              backgroundImage: "none",
              boxShadow: "0 8px 30px rgba(100,114,124,.13)",
            },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            setDeletingRequest(menuRequest);
            handleMenuClose();
          }}
          sx={{
            minHeight: 40,
            fontFamily: fonts.body,
            fontSize: 13,
            color: d.danger,
            "&:hover": { bgcolor: d.dangerSoft },
          }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete Request
        </MenuItem>
      </Menu>

      <Dialog
        open={Boolean(deletingRequest)}
        onClose={() => (deleting ? null : setDeletingRequest(null))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Request</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete the request for <strong>{deletingRequest?.name}</strong>?
            {deletingRequest?.status === "APPROVED" &&
              " This will not affect the customer account already created."}{" "}
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => setDeletingRequest(null)}
            disabled={deleting}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            variant="contained"
            color="error"
            disabled={deleting}
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
        autoHideDuration={8000}
        onClose={() => setNotification("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setNotification("")}
          severity={
            notification.toLowerCase().includes("fail") ? "error" : "success"
          }
          sx={{
            width: "100%",
            ...ds.alertSx(
              notification.toLowerCase().includes("fail") ? "error" : "success",
            ),
          }}
        >
          {notification}
        </Alert>
      </Snackbar>
    </Box>
  );
}
