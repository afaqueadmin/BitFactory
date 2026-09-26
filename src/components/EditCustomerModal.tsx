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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { useUser } from "@/lib/hooks/useUser";
import LuxorSubaccountMultiSelect from "@/components/LuxorSubaccountMultiSelect";

// Placeholder Group value shown when the client's subaccounts are split
// across several groups.
const MIXED_GROUPS = "__mixed__";

interface Group {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

interface Franchise {
  id: string;
  businessName: string;
  isActive: boolean;
}

interface EditCustomerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (emailSentText: string) => void;
  customerId: string | null;
  initialData?: {
    id: string;
    name: string;
    email: string;
    city?: string;
    country?: string;
    phoneNumber?: string;
    companyName?: string;
    streetAddress?: string;
    companyUrl?: string;
    luxorSubaccounts?: string[];
    braiinsAuthKey?: string;
    groupId?: string;
    franchiseeId?: string | null;
    segment?: string | null;
  };
}

export default function EditCustomerModal({
  open,
  onClose,
  onSuccess,
  customerId,
  initialData,
}: EditCustomerModalProps) {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [fetchingGroups, setFetchingGroups] = useState(false);
  // The customer's Luxor subaccounts as currently saved - kept selectable in
  // the picker. Edits to formData.luxorSubaccountNames are only saved (added
  // / removed together) when the form is submitted.
  const [savedSubaccounts, setSavedSubaccounts] = useState<string[]>([]);
  const [loadingSubaccounts, setLoadingSubaccounts] = useState(false);
  // The customer's subaccounts can sit in different groups (the groups pages
  // manage them one at a time). Then the Group field shows "Multiple groups"
  // and is left untouched on save unless the admin picks a group.
  const [groupIsMixed, setGroupIsMixed] = useState(false);
  const [groupTouched, setGroupTouched] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [fetchingFranchises, setFetchingFranchises] = useState(false);
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    email: "",
    city: "",
    country: "",
    phoneNumber: "",
    companyName: "",
    streetAddress: "",
    companyUrl: "",
    ...initialData,
    luxorSubaccountNames: initialData?.luxorSubaccounts ?? [],
    braiinsAuthKey: "",
    groupId: "",
    franchiseeId: initialData?.franchiseeId || "",
    segment: initialData?.segment || "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (initialData && open) {
      setFormData((prev) => ({
        ...prev,
        ...initialData,
        luxorSubaccountNames: initialData.luxorSubaccounts ?? [],
        braiinsAuthKey: "",
        groupId: "",
        franchiseeId: initialData.franchiseeId || "",
        segment: initialData.segment || "",
      }));
      setSavedSubaccounts(initialData.luxorSubaccounts ?? []);
      setGroupIsMixed(false);
      setGroupTouched(false);
      setError("");
      setSuccess("");
      fetchGroups();
      if (customerId) {
        loadCurrentGroup(customerId);
        loadCurrentPoolAuths(customerId);
      }
      fetchFranchises();
    }
  }, [initialData, open]);

  const fetchFranchises = async () => {
    try {
      setFetchingFranchises(true);
      const response = await fetch("/api/franchisees");
      if (!response.ok) {
        setFranchises([]);
        return;
      }
      const data = await response.json();
      const franchisesList: Franchise[] = Array.isArray(data.data)
        ? data.data
        : [];
      setFranchises(franchisesList.filter((f) => f.isActive));
    } catch (err) {
      console.error("[EditCustomerModal] Error fetching franchises:", err);
      setFranchises([]);
    } finally {
      setFetchingFranchises(false);
    }
  };

  /**
   * Fetch active groups from API (for the Group dropdown options)
   */
  const fetchGroups = async () => {
    try {
      setFetchingGroups(true);

      console.log("[EditCustomerModal] Fetching groups from API");

      const response = await fetch("/api/groups");

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch groups");
      }

      const groupsList = Array.isArray(data.data) ? data.data : [];
      console.log(`[EditCustomerModal] Fetched ${groupsList.length} groups`);

      // Filter only active groups
      const activeGroups = groupsList.filter((group: Group) => group.isActive);
      setGroups(activeGroups);
    } catch (err) {
      console.error("[EditCustomerModal] Error fetching groups:", err);
      // Don't set error for groups, just fail silently
    } finally {
      setFetchingGroups(false);
    }
  };

  /**
   * Load the customer's current group assignment. When their subaccounts sit
   * in more than one group, the field shows "Multiple groups" instead.
   */
  const loadCurrentGroup = async (custId: string) => {
    try {
      const response = await fetch(
        `/api/accounting/customer-group?customerId=${custId}`,
      );

      if (!response.ok) return;

      const data = await response.json();
      const groupIds: string[] = Array.isArray(data.groupIds)
        ? data.groupIds
        : [];

      setGroupIsMixed(groupIds.length > 1);
      setFormData((prev) => ({
        ...prev,
        groupId: groupIds.length > 1 ? "" : data.group?.id || "",
      }));
    } catch (err) {
      console.error("[EditCustomerModal] Error loading current group:", err);
    }
  };

  /**
   * Load the customer's current pool credentials - their Luxor subaccounts
   * and Braiins credential, if any
   */
  const loadCurrentPoolAuths = async (custId: string) => {
    try {
      setLoadingSubaccounts(true);
      const response = await fetch(`/api/pool-auth?userId=${custId}`);

      if (!response.ok) return;

      const data = await response.json();
      if (!data.success || !Array.isArray(data.data)) return;

      const entries = data.data as Array<{
        id: string;
        authKey: string;
        createdAt: string;
        pool: { name: string };
      }>;

      const braiinsEntry = entries.find(
        (entry) => entry.pool.name === "Braiins",
      );
      const luxorNames = entries
        .filter((entry) => entry.pool.name === "Luxor")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((entry) => entry.authKey);

      setSavedSubaccounts(luxorNames);
      setFormData((prev) => ({
        ...prev,
        braiinsAuthKey: braiinsEntry?.authKey || "",
        luxorSubaccountNames: luxorNames,
      }));
    } catch (err) {
      console.error(
        "[EditCustomerModal] Error loading current pool credentials:",
        err,
      );
    } finally {
      setLoadingSubaccounts(false);
    }
  };

  const handleClose = () => {
    onClose();
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    // Segment is required unless a franchise is assigned (which implies Retail)
    if (
      !formData.franchiseeId &&
      formData.segment !== "CORPORATE" &&
      formData.segment !== "SME" &&
      formData.segment !== "SELF_MINING" &&
      formData.segment !== "POTENTIAL_CUSTOMER"
    ) {
      setError(
        "Please select a Type (Corporate, SME, Self Mining, or Potential Customer)",
      );
      setLoading(false);
      return;
    }

    // Subaccount is required for active customer types
    if (
      formData.segment !== "POTENTIAL_CUSTOMER" &&
      formData.luxorSubaccountNames.length === 0
    ) {
      setError(
        "A Luxor subaccount must be assigned for active customer types (Corporate, SME, Self Mining, or Retail)",
      );
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/user/${customerId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          city: formData.city,
          country: formData.country,
          phoneNumber: formData.phoneNumber,
          companyName: formData.companyName,
          streetAddress: formData.streetAddress,
          companyUrl: formData.companyUrl,
          // The full set - the server adds/removes the difference.
          luxorSubaccountNames: formData.luxorSubaccountNames,
          braiinsAuthKey: formData.braiinsAuthKey || null,
          // Leave split group memberships alone unless the admin chose a group.
          groupId:
            groupIsMixed && !groupTouched
              ? undefined
              : formData.groupId || null,
          franchiseeId: formData.franchiseeId || null,
          segment: formData.franchiseeId ? undefined : formData.segment,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update customer");
      }

      setSuccess("Customer updated successfully");
      setTimeout(() => {
        onSuccess("Customer updated successfully");
        handleClose();
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update customer",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
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
        Edit Customer
        <IconButton
          onClick={handleClose}
          sx={{
            color: (theme) => theme.palette.grey[500],
            "&:hover": {
              backgroundColor: "action.hover",
            },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {success && <Alert severity="success">{success}</Alert>}

            <TextField
              fullWidth
              label="Name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
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
              disabled={user ? user.role !== "SUPER_ADMIN" : true}
            />
            <TextField
              fullWidth
              label="Phone Number"
              value={formData.phoneNumber || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  phoneNumber: e.target.value,
                }))
              }
            />
            <TextField
              fullWidth
              label="Company Name"
              value={formData.companyName || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  companyName: e.target.value,
                }))
              }
            />
            <TextField
              fullWidth
              label="Street Address"
              value={formData.streetAddress || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  streetAddress: e.target.value,
                }))
              }
            />
            <TextField
              fullWidth
              label="City"
              value={formData.city || ""}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, city: e.target.value }))
              }
            />
            <TextField
              fullWidth
              label="Country"
              value={formData.country || ""}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, country: e.target.value }))
              }
            />
            <TextField
              fullWidth
              label="Company URL"
              value={formData.companyUrl || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  companyUrl: e.target.value,
                }))
              }
              type="url"
              placeholder="https://example.com"
            />
            {/* Every Luxor subaccount of this client - added/removed
                together when the form is saved. */}
            <LuxorSubaccountMultiSelect
              open={open}
              value={formData.luxorSubaccountNames}
              onChange={(names) =>
                setFormData((prev) => ({
                  ...prev,
                  luxorSubaccountNames: names,
                }))
              }
              ownNames={savedSubaccounts}
              disabled={loadingSubaccounts}
              required={formData.segment !== "POTENTIAL_CUSTOMER"}
              label={
                formData.segment === "POTENTIAL_CUSTOMER"
                  ? "Luxor Subaccounts (Optional)"
                  : "Luxor Subaccounts"
              }
              helperText="Changes are saved when you click Update."
            />

            <TextField
              fullWidth
              label="Braiins Auth Key (Optional)"
              value={formData.braiinsAuthKey || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  braiinsAuthKey: e.target.value,
                }))
              }
              helperText="Braiins API token for this client, if applicable. Leave blank to remove."
            />
            <FormControl fullWidth disabled={fetchingGroups}>
              <InputLabel>Group (Optional)</InputLabel>
              <Select
                value={
                  groupIsMixed && !groupTouched
                    ? MIXED_GROUPS
                    : formData.groupId || ""
                }
                onChange={(e) => {
                  if (e.target.value === MIXED_GROUPS) return;
                  setGroupTouched(true);
                  setFormData((prev) => ({
                    ...prev,
                    groupId: e.target.value,
                  }));
                }}
                label="Group (Optional)"
              >
                {groupIsMixed && !groupTouched && (
                  <MenuItem value={MIXED_GROUPS} disabled>
                    Multiple groups (unchanged)
                  </MenuItem>
                )}
                <MenuItem value="">No Group</MenuItem>
                {groups.map((group) => (
                  <MenuItem key={group.id} value={group.id}>
                    {group.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth disabled={fetchingFranchises}>
              <InputLabel>Franchisee (Optional)</InputLabel>
              <Select
                value={formData.franchiseeId || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    franchiseeId: e.target.value,
                  }))
                }
                label="Franchisee (Optional)"
              >
                <MenuItem value="">Direct BitFactory Customer</MenuItem>
                {franchises.map((franchise) => (
                  <MenuItem key={franchise.id} value={franchise.id}>
                    {franchise.businessName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth disabled={!!formData.franchiseeId} required>
              <InputLabel>Type</InputLabel>
              <Select
                value={
                  formData.franchiseeId ? "RETAIL" : formData.segment || ""
                }
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    segment: e.target.value,
                  }))
                }
                label="Type"
              >
                {formData.franchiseeId ? (
                  <MenuItem value="RETAIL">Retail (via franchise)</MenuItem>
                ) : (
                  [
                    <MenuItem key="CORPORATE" value="CORPORATE">
                      Corporate
                    </MenuItem>,
                    <MenuItem key="SME" value="SME">
                      SME
                    </MenuItem>,
                    <MenuItem key="SELF_MINING" value="SELF_MINING">
                      Self Mining
                    </MenuItem>,
                    <MenuItem
                      key="POTENTIAL_CUSTOMER"
                      value="POTENTIAL_CUSTOMER"
                    >
                      Potential Customer
                    </MenuItem>,
                  ]
                )}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} color="inherit" disabled={loading}>
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
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Update"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
