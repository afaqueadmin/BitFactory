"use client";

import React, { useState } from "react";
import {
  Box,
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
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
} from "@mui/material";
import {
  CellNote,
  DaylightAdminPage,
  DaylightEmptyState,
  DaylightLoading,
  DaylightPageHeader,
  DaylightStatusPill,
  requestStatusTone,
  statusLabel,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import {
  useWalletChangeRequests,
  useReviewWalletChangeRequest,
  WalletChangeRequestItem,
} from "@/lib/hooks/useWalletChangeRequests";
import { useUser } from "@/lib/hooks/useUser";
import FreezeCountdown from "@/components/wallet/FreezeCountdown";
import { useDaylight } from "@/lib/daylight";

const STATUSES = ["PENDING", "CONFIRMED", "APPROVED", "REJECTED"];

/** "New" / "Current" label + wrapping monospace wallet address. */
function AddressLine({
  label,
  address,
  muted = false,
}: {
  label: string;
  address: string | null;
  muted?: boolean;
}) {
  const { d } = useDaylight();
  return (
    <Box sx={{ "& + &": { mt: "6px" } }}>
      <Box
        component="span"
        sx={{
          display: "block",
          fontSize: 10,
          fontWeight: 650,
          letterSpacing: ".04em",
          textTransform: "uppercase",
          color: d.muted,
        }}
      >
        {label}
      </Box>
      <Box
        component="span"
        sx={{
          display: "block",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.45,
          wordBreak: "break-all",
          color: muted ? d.muted : d.text,
        }}
      >
        {address || "Not configured"}
      </Box>
    </Box>
  );
}

export default function WalletRequestsPage() {
  const ds = useDaylightAdminSx();
  const [status, setStatus] = useState("PENDING");
  const { requests, loading, error, refetch } = useWalletChangeRequests(
    status ? { status } : undefined,
  );
  const { confirm, confirming, approve, approving, reject, rejecting } =
    useReviewWalletChangeRequest();
  const { user } = useUser();
  const requires2fa = !!user?.twoFactorEnabled;

  const [actionError, setActionError] = useState<string | null>(null);

  // Confirm dialog state
  const [confirmTarget, setConfirmTarget] =
    useState<WalletChangeRequestItem | null>(null);
  const [confirmMethod, setConfirmMethod] = useState<"CALL" | "EMAIL" | "">("");
  const [confirmContact, setConfirmContact] = useState("");
  const [confirmNote, setConfirmNote] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTwoFactor, setConfirmTwoFactor] = useState("");

  const resetConfirmDialog = () => {
    setConfirmTarget(null);
    setConfirmMethod("");
    setConfirmContact("");
    setConfirmNote("");
    setConfirmPassword("");
    setConfirmTwoFactor("");
    setActionError(null);
  };

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    setActionError(null);
    if (!confirmMethod) {
      setActionError("Select how the client confirmed - call or email");
      return;
    }
    if (!confirmContact.trim()) {
      setActionError(
        confirmMethod === "EMAIL"
          ? "Enter the email address the client confirmed through"
          : "Enter the phone number the client confirmed on",
      );
      return;
    }
    if (!confirmNote.trim()) {
      setActionError("A note describing the confirmation is required");
      return;
    }
    if (requires2fa && !confirmTwoFactor.trim()) {
      setActionError("A 2FA code is required to confirm this request");
      return;
    }
    if (!requires2fa && !confirmPassword) {
      setActionError(
        "Your current password is required to confirm this request",
      );
      return;
    }
    try {
      await confirm({
        id: confirmTarget.id,
        confirmationMethod: confirmMethod,
        confirmationContact: confirmContact.trim(),
        confirmationNote: confirmNote.trim(),
        currentPassword: requires2fa ? undefined : confirmPassword,
        twoFactorToken: requires2fa ? confirmTwoFactor.trim() : undefined,
      });
      resetConfirmDialog();
      refetch();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to confirm request",
      );
    }
  };

  // Approve dialog state
  const [approveTarget, setApproveTarget] =
    useState<WalletChangeRequestItem | null>(null);
  const [approvePassword, setApprovePassword] = useState("");
  const [approveTwoFactor, setApproveTwoFactor] = useState("");

  const resetApproveDialog = () => {
    setApproveTarget(null);
    setApprovePassword("");
    setApproveTwoFactor("");
    setActionError(null);
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setActionError(null);
    if (requires2fa && !approveTwoFactor.trim()) {
      setActionError("A 2FA code is required to approve this request");
      return;
    }
    if (!requires2fa && !approvePassword) {
      setActionError(
        "Your current password is required to approve this request",
      );
      return;
    }
    try {
      await approve({
        id: approveTarget.id,
        currentPassword: requires2fa ? undefined : approvePassword,
        twoFactorToken: requires2fa ? approveTwoFactor.trim() : undefined,
      });
      resetApproveDialog();
      refetch();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to approve request",
      );
    }
  };

  // Reject dialog state
  const [rejectTarget, setRejectTarget] =
    useState<WalletChangeRequestItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectPassword, setRejectPassword] = useState("");
  const [rejectTwoFactor, setRejectTwoFactor] = useState("");

  const resetRejectDialog = () => {
    setRejectTarget(null);
    setRejectionReason("");
    setRejectPassword("");
    setRejectTwoFactor("");
    setActionError(null);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setActionError(null);
    if (!rejectionReason.trim()) {
      setActionError("A rejection reason is required");
      return;
    }
    if (requires2fa && !rejectTwoFactor.trim()) {
      setActionError("A 2FA code is required to reject this request");
      return;
    }
    if (!requires2fa && !rejectPassword) {
      setActionError(
        "Your current password is required to reject this request",
      );
      return;
    }
    try {
      await reject({
        id: rejectTarget.id,
        rejectionReason,
        currentPassword: requires2fa ? undefined : rejectPassword,
        twoFactorToken: requires2fa ? rejectTwoFactor.trim() : undefined,
      });
      resetRejectDialog();
      refetch();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to reject request",
      );
    }
  };

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Wallet Requests"
        description={
          <>
            Client-submitted requests to change their Luxor payout wallet
            address. Confirm with the client (call/email) first, then approve.
            Approving does not update Luxor automatically - you must log in and
            update the payout address there yourself.
          </>
        }
      />

      <Stack direction="row" sx={{ mb: 3 }}>
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 220, ...ds.inputSx }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {loading ? (
        <DaylightLoading />
      ) : error ? (
        <Alert severity="error" sx={{ ...ds.alertSx("error") }}>
          {error}
        </Alert>
      ) : requests.length === 0 ? (
        <DaylightEmptyState>No requests found.</DaylightEmptyState>
      ) : (
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={ds.tableCardSx}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Client</TableCell>
                <TableCell>Requested</TableCell>
                <TableCell>Subaccount</TableCell>
                <TableCell>Address Change</TableCell>
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
                    <CellNote>{req.user.email}</CellNote>
                    {req.requestedBySecondary && req.requestedByEmail && (
                      <CellNote>
                        Requested by {req.requestedByEmail} (secondary sign-in)
                      </CellNote>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box component="span" sx={{ whiteSpace: "nowrap" }}>
                      {new Date(req.createdAt).toLocaleDateString()}
                    </Box>
                    <CellNote>
                      {new Date(req.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </CellNote>
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem" }}>
                    {req.subaccountName || "—"}
                  </TableCell>
                  {/* One column for the change: new address first (what
                      gets verified with the client), current one under it. */}
                  <TableCell sx={{ "&&&": { minWidth: 220, maxWidth: 300 } }}>
                    <AddressLine label="New" address={req.requestedAddress} />
                    <AddressLine
                      label="Current"
                      address={req.currentAddress}
                      muted
                    />
                  </TableCell>
                  <TableCell>{req.reason || "—"}</TableCell>
                  <TableCell sx={{ "&&&": { minWidth: 170 } }}>
                    <DaylightStatusPill
                      label={statusLabel(req.status)}
                      tone={requestStatusTone(req.status)}
                    />
                    {req.status === "REJECTED" && req.rejectionReason && (
                      <CellNote>{req.rejectionReason}</CellNote>
                    )}
                    {(req.status === "CONFIRMED" ||
                      req.status === "APPROVED") &&
                      req.confirmationMethod && (
                        <CellNote>
                          Confirmed via{" "}
                          {req.confirmationMethod === "EMAIL"
                            ? "email"
                            : "call"}{" "}
                          ({req.confirmationContact}) by{" "}
                          {req.confirmedBy?.name || req.confirmedBy?.email}
                        </CellNote>
                      )}
                    {req.status === "APPROVED" && (
                      <Box sx={{ mt: 0.5 }}>
                        <FreezeCountdown
                          reviewedAt={req.reviewedAt}
                          dense
                          daylight
                        />
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack
                      direction="column"
                      alignItems="flex-end"
                      spacing={1}
                      justifyContent="flex-end"
                    >
                      {req.status === "PENDING" && (
                        <Button
                          sx={ds.primaryBtnSx}
                          size="small"
                          variant="contained"
                          disabled={confirming || rejecting}
                          onClick={() => setConfirmTarget(req)}
                        >
                          Confirm
                        </Button>
                      )}
                      {req.status === "CONFIRMED" && (
                        <Button
                          sx={ds.successBtnSx}
                          size="small"
                          variant="contained"
                          disabled={approving || rejecting}
                          onClick={() => setApproveTarget(req)}
                        >
                          Approve
                        </Button>
                      )}
                      {(req.status === "PENDING" ||
                        req.status === "CONFIRMED") && (
                        <Button
                          sx={ds.dangerOutlineBtnSx}
                          size="small"
                          variant="outlined"
                          disabled={confirming || approving || rejecting}
                          onClick={() => setRejectTarget(req)}
                        >
                          Reject
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Confirm Dialog */}
      <Dialog
        open={!!confirmTarget}
        onClose={resetConfirmDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm With Client</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            {actionError && <Alert severity="error">{actionError}</Alert>}

            <Alert severity="info">
              Before confirming, verify this change with the client yourself -
              by phone or email, outside this app. Record how you verified it
              below. Approve only becomes available after this is saved.
            </Alert>

            <FormControl>
              <FormLabel>How did the client confirm?</FormLabel>
              <RadioGroup
                row
                value={confirmMethod}
                onChange={(e) =>
                  setConfirmMethod(e.target.value as "CALL" | "EMAIL")
                }
              >
                <FormControlLabel
                  value="CALL"
                  control={<Radio />}
                  label="Phone call"
                />
                <FormControlLabel
                  value="EMAIL"
                  control={<Radio />}
                  label="Email"
                />
              </RadioGroup>
            </FormControl>

            <TextField
              label="Confirmation note"
              value={confirmNote}
              onChange={(e) => setConfirmNote(e.target.value)}
              fullWidth
              required
              multiline
              minRows={2}
              helperText="Describe how you confirmed this is really the client"
            />

            <TextField
              label={
                confirmMethod === "EMAIL"
                  ? "Client's email address"
                  : confirmMethod === "CALL"
                    ? "Client's phone number"
                    : "Contact detail"
              }
              value={confirmContact}
              onChange={(e) => setConfirmContact(e.target.value)}
              fullWidth
              required
              disabled={!confirmMethod}
            />

            {requires2fa ? (
              <TextField
                label="2FA Code"
                value={confirmTwoFactor}
                onChange={(e) => setConfirmTwoFactor(e.target.value)}
                fullWidth
                required
                helperText="Your own authenticator code or a backup code"
                inputProps={{ maxLength: 10 }}
              />
            ) : (
              <TextField
                label="Your Current Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                fullWidth
                required
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetConfirmDialog} disabled={confirming}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            variant="contained"
            color="info"
            disabled={confirming}
            startIcon={confirming ? <CircularProgress size={16} /> : undefined}
          >
            Record Confirmation
          </Button>
        </DialogActions>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog
        open={!!approveTarget}
        onClose={resetApproveDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Approve Wallet Change Request</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            {actionError && <Alert severity="error">{actionError}</Alert>}

            <Alert severity="warning">
              Approving does <strong>not</strong> update Luxor automatically.
              After approving, log into Luxor yourself and update the payout
              address. The client will see their payouts as frozen for 24 hours
              starting now.
            </Alert>

            {requires2fa ? (
              <TextField
                label="2FA Code"
                value={approveTwoFactor}
                onChange={(e) => setApproveTwoFactor(e.target.value)}
                fullWidth
                required
                helperText="Your own authenticator code or a backup code"
                inputProps={{ maxLength: 10 }}
              />
            ) : (
              <TextField
                label="Your Current Password"
                type="password"
                value={approvePassword}
                onChange={(e) => setApprovePassword(e.target.value)}
                fullWidth
                required
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetApproveDialog} disabled={approving}>
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            variant="contained"
            color="success"
            disabled={approving}
            startIcon={approving ? <CircularProgress size={16} /> : undefined}
          >
            Approve Request
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        open={!!rejectTarget}
        onClose={resetRejectDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reject Wallet Change Request</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            {actionError && <Alert severity="error">{actionError}</Alert>}

            <TextField
              label="Rejection Reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              fullWidth
              required
              multiline
              minRows={2}
            />

            {requires2fa ? (
              <TextField
                label="2FA Code"
                value={rejectTwoFactor}
                onChange={(e) => setRejectTwoFactor(e.target.value)}
                fullWidth
                required
                helperText="Your own authenticator code or a backup code"
                inputProps={{ maxLength: 10 }}
              />
            ) : (
              <TextField
                label="Your Current Password"
                type="password"
                value={rejectPassword}
                onChange={(e) => setRejectPassword(e.target.value)}
                fullWidth
                required
              />
            )}
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
            startIcon={rejecting ? <CircularProgress size={16} /> : undefined}
          >
            Reject Request
          </Button>
        </DialogActions>
      </Dialog>
    </DaylightAdminPage>
  );
}
