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

interface Group {
  id: string;
  name: string;
  description?: string;
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
    luxorSubaccountName?: string;
    groupId?: string;
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
  const [fetchingSubaccounts, setFetchingSubaccounts] = useState(false);
  const [fetchingGroups, setFetchingGroups] = useState(false);
  const [subaccounts, setSubaccounts] = useState<
    Array<{ name: string; id: number }>
  >([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [formData, setFormData] = useState(
    initialData || {
      id: "",
      name: "",
      email: "",
      city: "",
      country: "",
      phoneNumber: "",
      companyName: "",
      streetAddress: "",
      companyUrl: "",
      luxorSubaccountName: "",
      groupId: "",
    },
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (initialData && open) {
      setFormData(initialData);
      setError("");
      setSuccess("");
      fetchSubaccounts();
      // Pass the subaccount name directly to avoid stale state issues
      fetchGroups(initialData.luxorSubaccountName || "");
    }
  }, [initialData, open]);

  const fetchSubaccounts = async () => {
    try {
      setFetchingSubaccounts(true);
      setSubaccounts([]);

      console.log(
        "[EditCustomerModal] Fetching subaccounts from V2 Luxor API and filtering assigned ones",
      );

      // Fetch all subaccounts from Luxor
      const luxorResponse = await fetch("/api/luxor?endpoint=subaccounts");

      if (!luxorResponse.ok) {
        throw new Error(`Luxor API returned status ${luxorResponse.status}`);
      }

      const luxorData: Record<string, unknown> = await luxorResponse.json();

      if (!(luxorData as Record<string, unknown>).success) {
        const errorMessage = (luxorData as Record<string, unknown>).error;
        throw new Error(
          typeof errorMessage === "string"
            ? errorMessage
            : "Failed to fetch subaccounts",
        );
      }

      // Extract subaccounts array from response
      const responseData = (luxorData as Record<string, unknown>).data as
        | Record<string, unknown>
        | undefined;
      let luxorSubaccountsList: Array<{ name: string; id: number }> = [];

      if (responseData && Array.isArray(responseData.subaccounts)) {
        luxorSubaccountsList = (
          responseData.subaccounts as Array<Record<string, unknown>>
        ).map((sub: Record<string, unknown>) => ({
          id: Number(sub.id || 0),
          name: String(sub.name || ""),
        }));
      }

      console.log(
        `[EditCustomerModal] Fetched ${luxorSubaccountsList.length} subaccounts from Luxor`,
      );

      // Fetch assigned subaccounts from database
      console.log(
        "[EditCustomerModal] Fetching already-assigned subaccounts...",
      );
      const dbResponse = await fetch("/api/user/subaccounts/existing");

      let assignedSubaccountNames: string[] = [];
      if (dbResponse.ok) {
        const dbData: Record<string, unknown> = await dbResponse.json();
        if (
          (dbData as Record<string, unknown>).success &&
          Array.isArray((dbData as Record<string, unknown>).data)
        ) {
          assignedSubaccountNames = (
            (dbData as Record<string, unknown>).data as Array<{
              luxorSubaccountName: string;
            }>
          ).map((item: { luxorSubaccountName: string }) =>
            item.luxorSubaccountName === formData.luxorSubaccountName
              ? "" // Exclude current user's assigned subaccount
              : item.luxorSubaccountName,
          );
        }
      }

      console.log(
        `[EditCustomerModal] Found ${assignedSubaccountNames.length} already-assigned subaccounts:`,
        assignedSubaccountNames,
      );

      // Filter out assigned subaccounts (except current user's)
      const unassignedSubaccounts = luxorSubaccountsList.filter(
        (sub) => !assignedSubaccountNames.includes(sub.name),
      );

      console.log(
        `[EditCustomerModal] Filtered to ${unassignedSubaccounts.length} unassigned subaccounts`,
      );

      setSubaccounts(unassignedSubaccounts);
    } catch (err) {
      console.error("[EditCustomerModal] Error fetching subaccounts:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch subaccounts",
      );
    } finally {
      setFetchingSubaccounts(false);
    }
  };

  /**
   * Fetch groups from API
   */
  const fetchGroups = async (subaccountName: string = "") => {
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

      // Load current group for this user's subaccount (if available)
      if (subaccountName) {
        await loadCurrentGroupForSubaccount(subaccountName, activeGroups);
      }
    } catch (err) {
      console.error("[EditCustomerModal] Error fetching groups:", err);
      // Don't set error for groups, just fail silently
    } finally {
      setFetchingGroups(false);
    }
  };

  /**
   * Load the current group assignment for a subaccount
   */
  const loadCurrentGroupForSubaccount = async (
    subaccountName: string,
    activeGroupsList: Group[],
  ) => {
    try {
      console.log(
        `[EditCustomerModal] Looking for group assignment for subaccount: ${subaccountName}`,
      );

      // Query each group to find which one has this subaccount
      for (const group of activeGroupsList) {
        try {
          const response = await fetch(`/api/groups/${group.id}`);

          if (!response.ok) continue;

          const data = await response.json();

          if (
            data.success &&
            data.data &&
            Array.isArray(data.data.subaccounts)
          ) {
            const hasSubaccount = (
              data.data.subaccounts as Array<{ subaccountName: string }>
            ).some((sub) => sub.subaccountName === subaccountName);

            if (hasSubaccount) {
              console.log(
                `[EditCustomerModal] Found subaccount "${subaccountName}" in group "${group.name}" (${group.id})`,
              );

              // Set the groupId to this group
              setFormData((prev) => ({
                ...prev,
                groupId: group.id,
              }));
              return;
            }
          }
        } catch (err) {
          console.error(
            `[EditCustomerModal] Error checking group ${group.id}:`,
            err,
          );
          continue;
        }
      }

      console.log(
        `[EditCustomerModal] No group found for subaccount "${subaccountName}"`,
      );
      // Subaccount is not in any group, keep groupId as empty
      setFormData((prev) => ({
        ...prev,
        groupId: "",
      }));
    } catch (err) {
      console.error(
        "[EditCustomerModal] Error loading current group for subaccount:",
        err,
      );
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
          luxorSubaccountName: formData.luxorSubaccountName || null,
          groupId: formData.groupId || null,
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
            <FormControl fullWidth disabled={fetchingSubaccounts}>
              <InputLabel>Luxor Subaccount</InputLabel>
              <Select
                value={formData.luxorSubaccountName || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    luxorSubaccountName:
                      e.target.value === "N/A" ? "" : e.target.value,
                  }))
                }
                label="Luxor Subaccount"
              >
                <MenuItem value="N/A">N/A (Unassigned)</MenuItem>
                {subaccounts.map((sub) => (
                  <MenuItem key={sub.id} value={sub.name}>
                    {sub.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth disabled={fetchingGroups}>
              <InputLabel>Group (Optional)</InputLabel>
              <Select
                value={formData.groupId || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    groupId: e.target.value,
                  }))
                }
                label="Group (Optional)"
              >
                <MenuItem value="">No Group</MenuItem>
                {groups.map((group) => (
                  <MenuItem key={group.id} value={group.id}>
                    {group.name}
                  </MenuItem>
                ))}
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
