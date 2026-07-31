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
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
} from "@mui/material";

interface CustomerRequestRow {
  id: string;
  name: string;
  email: string;
  luxorSubaccountName: string;
  initialDeposit: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  createdAt: string;
  franchise: { id: string; businessName: string; franchiseCode: string };
  requestedBy: { id: string; name: string | null; email: string };
}

export default function CustomerRequestsPanel() {
  const [requests, setRequests] = useState<CustomerRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingRequest, setRejectingRequest] =
    useState<CustomerRequestRow | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
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

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      const response = await fetch(
        `/api/admin/customer-requests/${id}/approve`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to approve request");
      }
      setNotification(
        `Customer created. Temporary password: ${data.data?.tempPassword}`,
      );
      fetchRequests();
    } catch (err) {
      setNotification(
        err instanceof Error ? err.message : "Failed to approve request",
      );
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingRequest) return;
    setRejecting(true);
    try {
      const response = await fetch(
        `/api/admin/customer-requests/${rejectingRequest.id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectionReason }),
        },
      );
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to reject request");
      }
      setNotification("Request rejected");
      setRejectingRequest(null);
      setRejectionReason("");
      fetchRequests();
    } catch (err) {
      setNotification(
        err instanceof Error ? err.message : "Failed to reject request",
      );
    } finally {
      setRejecting(false);
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
                  <TableCell>{r.luxorSubaccountName}</TableCell>
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
                    {r.status === "PENDING" ? (
                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                          justifyContent: "flex-end",
                        }}
                      >
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => setRejectingRequest(r)}
                        >
                          Reject
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={approvingId === r.id}
                          onClick={() => handleApprove(r.id)}
                        >
                          {approvingId === r.id ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            "Approve"
                          )}
                        </Button>
                      </Box>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={Boolean(rejectingRequest)}
        onClose={() => (rejecting ? null : setRejectingRequest(null))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Reject Request</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Reject the request for <strong>{rejectingRequest?.name}</strong>?
          </Typography>
          <TextField
            fullWidth
            label="Reason (optional)"
            multiline
            minRows={2}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => setRejectingRequest(null)}
            disabled={rejecting}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleReject}
            variant="contained"
            color="error"
            disabled={rejecting}
          >
            {rejecting ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Reject"
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
