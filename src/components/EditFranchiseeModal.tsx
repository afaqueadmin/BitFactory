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
  FormControlLabel,
  Checkbox,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

interface FranchiseData {
  id: string;
  businessName: string;
  authorizedPersonName: string;
  email: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  isActive: boolean;
  franchisee: {
    id: string;
    name: string;
    email: string;
    luxorSubaccountName: string | null;
  };
}

interface EditFranchiseeModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (text: string) => void;
  franchise: FranchiseData | null;
}

interface Subaccount {
  id: number;
  name: string;
  created_at: string;
  url: string;
}

interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
}

const toFormData = (franchise: FranchiseData | null) => ({
  businessName: franchise?.businessName || "",
  authorizedPersonName: franchise?.authorizedPersonName || "",
  email: franchise?.email || "",
  phoneNumber: franchise?.phoneNumber || "",
  address: franchise?.address || "",
  city: franchise?.city || "",
  state: franchise?.state || "",
  postalCode: franchise?.postalCode || "",
  isActive: franchise?.isActive ?? true,
  luxorSubaccountName: franchise?.franchisee?.luxorSubaccountName || "",
});

export default function EditFranchiseeModal({
  open,
  onClose,
  onSuccess,
  franchise,
}: EditFranchiseeModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(toFormData(franchise));
  const [error, setError] = useState("");
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([]);
  const [fetchingSubaccounts, setFetchingSubaccounts] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData(toFormData(franchise));
      setError("");
      fetchSubaccounts(franchise?.franchisee?.luxorSubaccountName || null);
    }
  }, [open, franchise]);

  /**
   * Same exclude-already-assigned pattern as CreateFranchiseeModal, except
   * the franchise's own currently-assigned subaccount must stay selectable
   * even though it's "assigned" (to this same franchisee).
   */
  const fetchSubaccounts = async (currentName: string | null) => {
    try {
      setFetchingSubaccounts(true);
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
          (sub: Record<string, unknown>) =>
            ({
              id: Number(sub.id || 0),
              name: String(sub.name || ""),
              created_at: String(sub.created_at || ""),
              url: String(sub.url || ""),
            }) as Subaccount,
        );
      }

      const dbResponse = await fetch("/api/user/subaccounts/existing");
      let assignedSubaccountNames: string[] = [];
      if (dbResponse.ok) {
        const dbData = await dbResponse.json();
        if (dbData.success && Array.isArray(dbData.data)) {
          assignedSubaccountNames = dbData.data.map(
            (item: { luxorSubaccountName: string }) => item.luxorSubaccountName,
          );
        }
      }

      const selectableSubaccounts = luxorSubaccountsList.filter(
        (sub) =>
          !assignedSubaccountNames.includes(sub.name) ||
          sub.name === currentName,
      );
      setSubaccounts(selectableSubaccounts);
    } catch (err) {
      console.error("[EditFranchiseeModal] Error fetching subaccounts:", err);
      setSubaccounts([]);
    } finally {
      setFetchingSubaccounts(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!franchise) return;

    setLoading(true);
    setError("");

    const requiredFields: Array<[keyof typeof formData, string]> = [
      ["businessName", "Business name"],
      ["authorizedPersonName", "Authorized person name"],
      ["email", "Email"],
      ["phoneNumber", "Phone number"],
      ["address", "Address"],
      ["city", "City"],
      ["state", "State"],
      ["postalCode", "Postal code"],
    ];

    for (const [field, label] of requiredFields) {
      if (
        typeof formData[field] !== "string" ||
        !(formData[field] as string).trim()
      ) {
        setError(`${label} is required`);
        setLoading(false);
        return;
      }
    }

    try {
      const response = await fetch(`/api/franchisees/${franchise.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update franchisee");
      }

      onSuccess("Franchisee updated successfully");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update franchisee",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, rgba(40,40,40,0.95), rgba(30,30,30,0.95))"
              : "linear-gradient(145deg, rgba(255,255,255,0.95), rgba(250,250,250,0.95))",
          backdropFilter: "blur(10px)",
        },
      }}
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
        Edit Franchisee
        <IconButton
          onClick={onClose}
          sx={{
            color: (theme) => theme.palette.grey[500],
            "&:hover": { backgroundColor: "action.hover" },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              fullWidth
              label="Business Name"
              value={formData.businessName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  businessName: e.target.value,
                }))
              }
              required
            />
            <TextField
              fullWidth
              label="Authorized Person Name"
              value={formData.authorizedPersonName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  authorizedPersonName: e.target.value,
                }))
              }
              required
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

            <FormControl fullWidth disabled={fetchingSubaccounts}>
              <InputLabel>Luxor Subaccount (Optional)</InputLabel>
              <Select
                value={formData.luxorSubaccountName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    luxorSubaccountName: e.target.value,
                  }))
                }
                label="Luxor Subaccount (Optional)"
              >
                <MenuItem value="">None</MenuItem>
                {fetchingSubaccounts ? (
                  <MenuItem disabled>
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                    Loading subaccounts...
                  </MenuItem>
                ) : (
                  subaccounts.map((subaccount) => (
                    <MenuItem key={subaccount.name} value={subaccount.name}>
                      {subaccount.name}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Phone Number"
              value={formData.phoneNumber}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  phoneNumber: e.target.value,
                }))
              }
              required
            />
            <TextField
              fullWidth
              label="Address"
              value={formData.address}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, address: e.target.value }))
              }
              required
            />
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                fullWidth
                label="City"
                value={formData.city}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, city: e.target.value }))
                }
                required
              />
              <TextField
                fullWidth
                label="State"
                value={formData.state}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, state: e.target.value }))
                }
                required
              />
              <TextField
                fullWidth
                label="Postal Code"
                value={formData.postalCode}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    postalCode: e.target.value,
                  }))
                }
                required
              />
            </Box>

            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      isActive: e.target.checked,
                    }))
                  }
                />
              }
              label="Active"
            />

            {error && <Alert severity="error">{error}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{
              px: 4,
              background: (theme) =>
                `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
              "&:hover": {
                background: (theme) =>
                  `linear-gradient(45deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
              },
            }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : "Save"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
