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
  useSecondaryLoginRequests,
  useReviewSecondaryLoginRequest,
  SecondaryLoginRequestError,
  SecondaryLoginRequestItem,
} from "@/lib/hooks/useSecondaryLoginRequests";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"];
const STATUS_COLOR: Record<string, "warning" | "success" | "error"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "error",
};

export default function SecondaryLoginRequestsPage() {
  const [status, setStatus] = useState("PENDING");
  const { requests, loading, error, refetch } = useSecondaryLoginRequests(
    status ? { status } : undefined,
  );
  const { approve, approving, reject, rejecting } =
    useReviewSecondaryLoginRequest();

  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Approving adds the sign-in email exactly like Edit Customer does. An
  // email a deleted account holds needs the same confirmation as there.
  const handleApprove = async (req: SecondaryLoginRequestItem) => {
    if (
      !window.confirm(
        `Add ${req.requestedEmail} as a second sign-in email for ${req.user.name || req.user.email}? It will be emailed a link to choose its password.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setNotice(null);
    setApprovingId(req.id);
    try {
      let result;
      try {
        result = await approve({ id: req.id });
      } catch (err) {
        if (
          err instanceof SecondaryLoginRequestError &&
          err.code === "HELD_BY_DELETED_ACCOUNT"
        ) {
          if (
            !window.confirm(
              `This email belongs to deleted account "${err.deletedAccountName}". Use it here anyway? The deleted account will lose it.`,
            )
          ) {
            return;
          }
          result = await approve({ id: req.id, releaseFromDeleted: true });
        } else {
          throw err;
        }
      }
      setNotice(result?.message || "Request approved");
      refetch();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to approve request",
      );
    } finally {
      setApprovingId(null);
    }
  };

  // Reject dialog state
  const [rejectTarget, setRejectTarget] =
    useState<SecondaryLoginRequestItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  const resetRejectDialog = () => {
    setRejectTarget(null);
    setRejectionReason("");
    setRejectError(null);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setRejectError(null);
    if (!rejectionReason.trim()) {
      setRejectError("A rejection reason is required");
      return;
    }
    try {
      await reject({
        id: rejectTarget.id,
        rejectionReason: rejectionReason.trim(),
      });
      resetRejectDialog();
      setNotice("Request rejected");
      refetch();
    } catch (err) {
      setRejectError(
        err instanceof Error ? err.message : "Failed to reject request",
      );
    }
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
        Sign-in Email Requests
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Client requests for a second sign-in email on their account. Approving
        adds it straight away, the same as adding it from Edit Customer: the new
        email gets a link to choose its password, and the account&apos;s primary
        email is notified.
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

      {notice && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setNotice(null)}
        >
          {notice}
        </Alert>
      )}
      {actionError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setActionError(null)}
        >
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
                <TableCell>Email to Add</TableCell>
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
                  <TableCell>{req.requestedEmail}</TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>
                    {req.reason || "—"}
                    {req.status === "REJECTED" && req.rejectionReason && (
                      <Typography
                        variant="caption"
                        color="error"
                        display="block"
                      >
                        Rejected: {req.rejectionReason}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={req.status}
                      size="small"
                      color={STATUS_COLOR[req.status]}
                    />
                    {req.reviewedBy && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        by {req.reviewedBy.name || req.reviewedBy.email}
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
                          onClick={() => handleApprove(req)}
                          disabled={approving || rejecting}
                          startIcon={
                            approvingId === req.id ? (
                              <CircularProgress size={14} />
                            ) : undefined
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => setRejectTarget(req)}
                          disabled={approving || rejecting}
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
        open={Boolean(rejectTarget)}
        onClose={resetRejectDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reject Sign-in Email Request</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            {rejectError && <Alert severity="error">{rejectError}</Alert>}
            <Typography variant="body2" color="text.secondary">
              {rejectTarget?.requestedEmail} for{" "}
              {rejectTarget?.user.name || rejectTarget?.user.email}. The reason
              is shown to the client and emailed to them.
            </Typography>
            <TextField
              label="Reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              fullWidth
              required
              multiline
              minRows={2}
              inputProps={{ maxLength: 1000 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetRejectDialog} disabled={rejecting}>
            Cancel
          </Button>
          <Button
            onClick={handleReject}
            variant="contained"
            color="error"
            disabled={rejecting}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
