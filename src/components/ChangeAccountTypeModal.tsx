"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
} from "@mui/material";

interface ChangeAccountTypeModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  customer: {
    id: string;
    name: string;
    role: string;
    phoneNumber?: string;
    companyName?: string;
    streetAddress?: string;
    city?: string;
  } | null;
  /** What to change a regular customer into; a franchisee always becomes a
   * regular customer. */
  target?: "FRANCHISEE" | "SIMULATED";
}

const emptyFranchise = {
  businessName: "",
  authorizedPersonName: "",
  phoneNumber: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
};

const franchiseFields: Array<[keyof typeof emptyFranchise, string]> = [
  ["businessName", "Business Name"],
  ["authorizedPersonName", "Authorized Person Name"],
  ["phoneNumber", "Phone Number"],
  ["address", "Address"],
  ["city", "City"],
  ["state", "State"],
  ["postalCode", "Postal Code"],
];

/**
 * Switches an account between franchisee and regular customer, or turns a
 * regular customer into a simulated account (POST /api/user/[id]/account-type).
 */
export default function ChangeAccountTypeModal({
  open,
  onClose,
  onSuccess,
  customer,
  target = "FRANCHISEE",
}: ChangeAccountTypeModalProps) {
  const [segment, setSegment] = useState("");
  const [franchise, setFranchise] = useState(emptyFranchise);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toClient = customer?.role === "FRANCHISEE";
  const toSimulated = !toClient && target === "SIMULATED";

  useEffect(() => {
    if (open && customer) {
      setSegment("");
      setError("");
      // Prefill what the customer record already has.
      setFranchise({
        ...emptyFranchise,
        businessName: customer.companyName || "",
        authorizedPersonName: customer.name || "",
        phoneNumber: customer.phoneNumber || "",
        address: customer.streetAddress || "",
        city: customer.city || "",
      });
    }
  }, [open, customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/user/${customer.id}/account-type`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          toClient
            ? { role: "CLIENT", segment }
            : toSimulated
              ? { role: "SIMULATED" }
              : { role: "FRANCHISEE", franchise },
        ),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to change account type");
      }
      onSuccess(data.message || "Account type changed");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change account type",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {toClient
          ? "Change to Regular Customer"
          : toSimulated
            ? "Change to Simulated Account"
            : "Change to Franchisee"}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}

            {toClient ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  {customer?.name} will become a regular customer and their
                  franchise will be closed. Customers still assigned to the
                  franchise must be reassigned first. They will be signed out on
                  all devices.
                </Typography>
                <FormControl fullWidth required>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={segment}
                    label="Type"
                    onChange={(e) => setSegment(e.target.value)}
                  >
                    <MenuItem value="CORPORATE">Corporate</MenuItem>
                    <MenuItem value="SME">SME</MenuItem>
                    <MenuItem value="SELF_MINING">Self Mining</MenuItem>
                    <MenuItem value="POTENTIAL_CUSTOMER">
                      Potential Customer
                    </MenuItem>
                  </Select>
                </FormControl>
              </>
            ) : toSimulated ? (
              <Typography variant="body2" color="text.secondary">
                {customer?.name} will become a simulated account: they keep
                their login and see the simulated miner&apos;s simulated data
                starting today, with the welcome bonus as their balance. They
                drop out of the customer list and billing (find them under
                Simulated Accounts), and will be signed out on all devices. Only
                a customer with no miners, subaccounts, invoices or payments can
                be changed.
              </Typography>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  {customer?.name} will become a franchisee with the franchise
                  below. They keep their login, miners and subaccounts, and will
                  be signed out on all devices.
                </Typography>
                {franchiseFields.map(([field, label]) => (
                  <TextField
                    key={field}
                    fullWidth
                    required
                    label={label}
                    value={franchise[field]}
                    onChange={(e) =>
                      setFranchise((prev) => ({
                        ...prev,
                        [field]: e.target.value,
                      }))
                    }
                  />
                ))}
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || (toClient && !segment)}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Change Type"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
