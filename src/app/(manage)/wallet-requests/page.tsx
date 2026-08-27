"use client";

import React, { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  TextField,
  MenuItem,
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
} from "@mui/material";
import {
  useWalletChangeRequests,
  useReviewWalletChangeRequest,
  WalletChangeRequestItem,
} from "@/lib/hooks/useWalletChangeRequests";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"];
const STATUS_COLOR: Record<string, "warning" | "success" | "error"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "error",
};

export default function WalletRequestsPage() {
  const [status, setStatus] = useState("PENDING");
  const { requests, loading, error, refetch } = useWalletChangeRequests(
    status ? { status } : undefined,
  );
  const { approve, approving, reject, rejecting } =
    useReviewWalletChangeRequest();

  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] =
    useState<WalletChangeRequestItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const handleApprove = async (id: string) => {
    setActionError(null);
    try {
      await approve(id);
      refetch();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to approve request",
      );
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setActionError(null);
    try {
      await reject({ id: rejectTarget.id, rejectionReason });
      setRejectTarget(null);
      setRejectionReason("");
      refetch();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to reject request",
      );
    }
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
        Wallet Requests
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Client-submitted requests to change their Luxor payout wallet address.
        Approving pushes the new address to Luxor directly.
      </Typography>

      <Stack direction="row" sx={{ mb: 3 }}>
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : requests.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No requests found.
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Client</TableCell>
                <TableCell>Requested</TableCell>
                <TableCell>Current Address</TableCell>
                <TableCell>Requested Address</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    {req.user.name || req.user.email}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      {req.user.email}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {new Date(req.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell
                    sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                  >
                    {req.currentAddress || "Not configured"}
                  </TableCell>
                  <TableCell
                    sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                  >
                    {req.requestedAddress}
                  </TableCell>
                  <TableCell>{req.reason || "—"}</TableCell>
                  <TableCell>
                    <Chip
                      label={req.status}
                      size="small"
                      color={STATUS_COLOR[req.status] || "default"}
                    />
                    {req.status === "REJECTED" && req.rejectionReason && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        {req.rejectionReason}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {req.status === "PENDING" && (
                      <Stack
                        direction="row"
                        spacing={1}
                        justifyContent="flex-end"
                      >
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          disabled={approving || rejecting}
                          onClick={() => handleApprove(req.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          disabled={approving || rejecting}
                          onClick={() => setRejectTarget(req)}
                        >
                          Reject
                        </Button>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reject Wallet Change Request</DialogTitle>
        <DialogContent>
          <TextField
            label="Rejection Reason"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            fullWidth
            required
            multiline
            minRows={2}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)} disabled={rejecting}>
            Cancel
          </Button>
          <Button
            onClick={handleReject}
            variant="contained"
            color="error"
            disabled={rejecting || !rejectionReason.trim()}
          >
            Reject Request
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
