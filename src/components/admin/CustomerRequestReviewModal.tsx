"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  IconButton,
  CircularProgress,
  Alert,
  Typography,
  Chip,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import LuxorSubaccountMultiSelect from "@/components/LuxorSubaccountMultiSelect";

export interface CustomerRequestRow {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  /** The created customer's Luxor subaccounts (empty until approved). */
  luxorSubaccounts: string[];
  initialDeposit: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  createdAt: string;
  franchise: { id: string; businessName: string; franchiseCode: string };
  requestedBy: { id: string; name: string | null; email: string };
}

interface CustomerRequestReviewModalProps {
  open: boolean;
  request: CustomerRequestRow | null;
  onClose: () => void;
  onSuccess: (text: string) => void;
}

export default function CustomerRequestReviewModal({
  open,
  request,
  onClose,
  onSuccess,
}: CustomerRequestReviewModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    initialDeposit: "",
    luxorSubaccountNames: [] as string[],
  });
  const [rejectionReason, setRejectionReason] = useState("");
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");

  const isPending = request?.status === "PENDING";

  useEffect(() => {
    if (open && request) {
      setFormData({
        name: request.name,
        email: request.email,
        phoneNumber: request.phoneNumber || "",
        initialDeposit: request.initialDeposit || "",
        luxorSubaccountNames: request.luxorSubaccounts ?? [],
      });
      setRejectionReason("");
      setError("");
    }
  }, [open, request]);

  const handleApprove = async () => {
    if (!request) return;
    setError("");

    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!formData.email.trim()) {
      setError("Email is required");
      return;
    }
    if (formData.luxorSubaccountNames.length === 0) {
      setError("Please select a Luxor subaccount");
      return;
    }

    setApproving(true);
    try {
      const response = await fetch(
        `/api/admin/customer-requests/${request.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name.trim(),
            email: formData.email.trim(),
            phoneNumber: formData.phoneNumber.trim() || null,
            luxorSubaccountNames: formData.luxorSubaccountNames,
            initialDeposit: formData.initialDeposit
              ? parseFloat(formData.initialDeposit)
              : null,
          }),
        },
      );
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to approve request");
      }
      onSuccess(
        `Customer created. Welcome email with login details sent to ${data.data?.user?.email ?? "the customer"}.`,
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to approve request",
      );
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!request) return;
    setError("");
    setRejecting(true);
    try {
      const response = await fetch(
        `/api/admin/customer-requests/${request.id}/reject`,
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
      onSuccess("Request rejected");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject request");
    } finally {
      setRejecting(false);
    }
  };

  const busy = approving || rejecting;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle
        sx={{
          m: 0,
          p: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        Customer Request
        <IconButton onClick={onClose} disabled={busy}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Requested by{" "}
              {request?.requestedBy.name || request?.requestedBy.email} —{" "}
              {request?.franchise.businessName}
            </Typography>
            {request && (
              <Chip
                label={request.status}
                size="small"
                color={
                  request.status === "APPROVED"
                    ? "success"
                    : request.status === "REJECTED"
                      ? "error"
                      : "warning"
                }
                variant="outlined"
              />
            )}
          </Box>

          {!isPending &&
            request?.status === "REJECTED" &&
            request.rejectionReason && (
              <Alert severity="info">
                Rejection reason: {request.rejectionReason}
              </Alert>
            )}

          <TextField
            fullWidth
            label="Customer Name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            required
            disabled={!isPending}
          />
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, email: e.target.value }))
            }
            required
            disabled={!isPending}
          />
          <TextField
            fullWidth
            label="Phone Number (optional)"
            type="tel"
            value={formData.phoneNumber}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, phoneNumber: e.target.value }))
            }
            disabled={!isPending}
          />

          <LuxorSubaccountMultiSelect
            open={open && isPending}
            value={formData.luxorSubaccountNames}
            onChange={(names) =>
              setFormData((prev) => ({
                ...prev,
                luxorSubaccountNames: names,
              }))
            }
            required
            disabled={!isPending}
          />

          <TextField
            fullWidth
            label="Initial Deposit (USD, optional)"
            type="number"
            inputProps={{ step: "0.01", min: "0" }}
            value={formData.initialDeposit}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                initialDeposit: e.target.value,
              }))
            }
            disabled={!isPending}
          />

          {isPending && (
            <TextField
              fullWidth
              label="Rejection Reason (optional)"
              multiline
              minRows={2}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              helperText="Only used if you reject this request"
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={busy}>
          Close
        </Button>
        {isPending && (
          <>
            <Button
              onClick={handleReject}
              variant="outlined"
              color="error"
              disabled={busy}
            >
              {rejecting ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                "Reject Request"
              )}
            </Button>
            <Button onClick={handleApprove} variant="contained" disabled={busy}>
              {approving ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                "Create User"
              )}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
