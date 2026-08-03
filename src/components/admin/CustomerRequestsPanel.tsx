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
  Chip,
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

export default function CustomerRequestsPanel() {
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
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {requests.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">
            No customer requests have been submitted yet.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: "background.default" }}>
                <TableCell sx={{ fontWeight: "bold" }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Franchise</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Phone</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Subaccount</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>
                  Initial Deposit
                </TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Submitted</TableCell>
                <TableCell sx={{ fontWeight: "bold" }} align="center">
                  Status
                </TableCell>
                <TableCell sx={{ fontWeight: "bold" }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((r) => (
                <TableRow
                  key={r.id}
                  sx={{ "&:hover": { backgroundColor: "background.default" } }}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {r.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.email}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {r.franchise.businessName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      by {r.requestedBy.name || r.requestedBy.email}
                    </Typography>
                  </TableCell>
                  <TableCell>{r.phoneNumber || "-"}</TableCell>
                  <TableCell>{r.luxorSubaccountName || "-"}</TableCell>
                  <TableCell>
                    {r.initialDeposit ? `$${r.initialDeposit}` : "-"}
                  </TableCell>
                  <TableCell>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={r.status}
                      size="small"
                      color={
                        r.status === "APPROVED"
                          ? "success"
                          : r.status === "REJECTED"
                            ? "error"
                            : "warning"
                      }
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box
                      sx={{
                        display: "flex",
                        gap: 1,
                        justifyContent: "flex-end",
                      }}
                    >
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => setViewingRequest(r)}
                      >
                        View
                      </Button>
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, r)}
                        aria-label="More options"
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
      >
        <MenuItem
          onClick={() => {
            setDeletingRequest(menuRequest);
            handleMenuClose();
          }}
          sx={{ color: "error.main" }}
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
          sx={{ width: "100%" }}
        >
          {notification}
        </Alert>
      </Snackbar>
    </Box>
  );
}
