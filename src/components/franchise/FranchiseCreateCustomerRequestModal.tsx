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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  CircularProgress,
  Alert,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
}

interface Subaccount {
  id: number;
  name: string;
}

interface FranchiseCreateCustomerRequestModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (text: string) => void;
}

export default function FranchiseCreateCustomerRequestModal({
  open,
  onClose,
  onSuccess,
}: FranchiseCreateCustomerRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [fetchingSubaccounts, setFetchingSubaccounts] = useState(true);
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([]);
  const [subaccountsError, setSubaccountsError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    luxorSubaccountName: "",
    initialDeposit: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (open) {
      fetchSubaccounts();
    } else {
      setFormData({
        name: "",
        email: "",
        luxorSubaccountName: "",
        initialDeposit: "",
      });
      setError("");
      setSuccess("");
    }
  }, [open]);

  const fetchSubaccounts = async () => {
    try {
      setFetchingSubaccounts(true);
      setSubaccountsError(null);
      setSubaccounts([]);

      const luxorResponse = await fetch("/api/luxor?endpoint=subaccounts");
      if (!luxorResponse.ok) {
        throw new Error(`Luxor API returned status ${luxorResponse.status}`);
      }
      const luxorData: ProxyResponse<Record<string, unknown>> =
        await luxorResponse.json();
      if (!luxorData.success) {
        throw new Error(luxorData.error || "Failed to fetch subaccounts");
      }

      const responseData = luxorData.data as Record<string, unknown>;
      let luxorSubaccountsList: Subaccount[] = [];
      if (responseData && Array.isArray(responseData.subaccounts)) {
        luxorSubaccountsList = (
          responseData.subaccounts as Array<Record<string, unknown>>
        ).map(
          (sub) =>
            ({
              id: Number(sub.id || 0),
              name: String(sub.name || ""),
            }) as Subaccount,
        );
      }

      const dbResponse = await fetch("/api/user/subaccounts/existing");
      let assignedNames: string[] = [];
      if (dbResponse.ok) {
        const dbData = await dbResponse.json();
        if (dbData.success && Array.isArray(dbData.data)) {
          assignedNames = dbData.data.map(
            (item: { luxorSubaccountName: string }) => item.luxorSubaccountName,
          );
        }
      }

      setSubaccounts(
        luxorSubaccountsList.filter((sub) => !assignedNames.includes(sub.name)),
      );
    } catch (err) {
      setSubaccountsError(
        err instanceof Error ? err.message : "Failed to fetch subaccounts",
      );
      setSubaccounts([]);
    } finally {
      setFetchingSubaccounts(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!formData.email.trim()) {
      setError("Email is required");
      return;
    }
    if (!formData.luxorSubaccountName) {
      setError("Please select a Luxor subaccount");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/franchise/customers/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          luxorSubaccountName: formData.luxorSubaccountName,
          initialDeposit: formData.initialDeposit
            ? parseFloat(formData.initialDeposit)
            : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to submit request");
      }

      setSuccess(data.message || "Request submitted — pending admin approval");
      setTimeout(() => {
        onSuccess(data.message || "Request submitted — pending admin approval");
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          m: 0,
          p: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        Request New Customer
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {success && <Alert severity="success">{success}</Alert>}
            <Alert severity="info">
              This creates a request — the customer account will only be created
              once an admin approves it.
            </Alert>

            <TextField
              fullWidth
              label="Customer Name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              required
              autoFocus
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
            />

            <FormControl fullWidth required>
              <InputLabel id="subaccount-label">Luxor Subaccount</InputLabel>
              <Select
                labelId="subaccount-label"
                label="Luxor Subaccount"
                value={formData.luxorSubaccountName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    luxorSubaccountName: e.target.value,
                  }))
                }
                disabled={fetchingSubaccounts}
              >
                {subaccounts.map((sub) => (
                  <MenuItem key={sub.id} value={sub.name}>
                    {sub.name}
                  </MenuItem>
                ))}
              </Select>
              {subaccountsError && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {subaccountsError}
                </Alert>
              )}
            </FormControl>

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
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Submit Request"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
