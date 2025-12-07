/**
 * Miner Form Modal Component
 *
 * Modal dialog for creating or editing mining machines.
 * Reusable for both create and update operations.
 */

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
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  SelectChangeEvent,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

/**
 * Hardware object from API
 */
interface Hardware {
  id: string;
  model: string;
  powerUsage: number;
  hashRate: number | string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Miner form data structure
 */
interface MinerFormData {
  name: string;
  hardwareId: string;
  userId: string;
  spaceId: string;
  status: "ACTIVE" | "INACTIVE";
}

/**
 * User object from API
 */
interface User {
  id: string;
  name: string | null;
  email: string;
  luxorSubaccountName?: string | null;
}

/**
 * Space object from API
 */
interface Space {
  id: string;
  name: string;
  location: string;
}

/**
 * Miner object (from API)
 */
interface Miner {
  id: string;
  name: string;
  hardwareId: string;
  status: "ACTIVE" | "INACTIVE";
  userId: string;
  spaceId: string;
  createdAt: string;
  updatedAt: string;
  user?: User;
  space?: Space;
  hardware?: Hardware;
}

interface MinerFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  miner?: Miner | null;
  users: User[];
  spaces: Space[];
  isLoading?: boolean;
}

export default function MinerFormModal({
  open,
  onClose,
  onSuccess,
  miner,
  users,
  spaces,
  isLoading = false,
}: MinerFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hardware, setHardware] = useState<Hardware[]>([]);
  const [selectedHardware, setSelectedHardware] = useState<Hardware | null>(
    null,
  );
  const [hardwareLoading, setHardwareLoading] = useState(false);
  const [formData, setFormData] = useState<MinerFormData>({
    name: "",
    hardwareId: "",
    userId: "",
    spaceId: "",
    status: "INACTIVE",
  });

  /**
   * Fetch hardware list on mount
   */
  useEffect(() => {
    const fetchHardware = async () => {
      try {
        setHardwareLoading(true);
        const response = await fetch("/api/hardware");
        const data = await response.json();
        if (data.success) {
          setHardware(data.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch hardware:", err);
      } finally {
        setHardwareLoading(false);
      }
    };

    if (open) {
      fetchHardware();
    }
  }, [open]);

  /**
   * Initialize form data when miner is provided (edit mode) or clear it (create mode)
   */
  useEffect(() => {
    if (miner) {
      setFormData({
        name: miner.name,
        hardwareId: miner.hardwareId,
        userId: miner.userId,
        spaceId: miner.spaceId,
        status: miner.status,
      });
      if (miner.hardware) {
        setSelectedHardware(miner.hardware);
      }
    } else {
      setFormData({
        name: "",
        hardwareId: "",
        userId: "",
        spaceId: "",
        status: "INACTIVE",
      });
      setSelectedHardware(null);
    }
    setError(null);
  }, [miner, open]);

  /**
   * Handle form input change
   */
  const handleChange = (
    e:
      | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      | SelectChangeEvent,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /**
   * Handle hardware selection change
   */
  const handleHardwareChange = (e: SelectChangeEvent) => {
    const hwId = e.target.value;
    const selectedHw = hardware.find((hw) => hw.id === hwId);
    setFormData((prev) => ({
      ...prev,
      hardwareId: hwId,
    }));
    setSelectedHardware(selectedHw || null);
  };

  /**
   * Validate form data
   */
  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError("Miner name is required");
      return false;
    }

    if (!formData.hardwareId) {
      setError("Hardware model is required");
      return false;
    }

    if (!formData.userId) {
      setError("User is required");
      return false;
    }

    if (!formData.spaceId) {
      setError("Space is required");
      return false;
    }

    return true;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      const url = miner ? `/api/machine/${miner.id}` : "/api/machine";
      const method = miner ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          hardwareId: formData.hardwareId,
          userId: formData.userId,
          spaceId: formData.spaceId,
          status: formData.status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || `Failed to ${miner ? "update" : "create"} miner`,
        );
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const isEditMode = !!miner;
  const title = isEditMode ? "Edit Miner" : "Create New Miner";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {title}
          <IconButton
            onClick={onClose}
            size="small"
            sx={{ color: "text.secondary" }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
          <FormControl
            fullWidth
            margin="normal"
            required
            disabled={loading || isLoading}
          >
            <InputLabel>User</InputLabel>
            <Select
              name="userId"
              value={formData.userId}
              onChange={handleChange}
              label="User"
            >
              <MenuItem value="">
                <em>Select a user</em>
              </MenuItem>
              {users.map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl
            fullWidth
            margin="normal"
            required
            disabled={loading || isLoading || hardwareLoading}
          >
            <InputLabel>Hardware Model</InputLabel>
            <Select
              name="hardwareId"
              value={formData.hardwareId}
              onChange={handleHardwareChange}
              label="Hardware Model"
            >
              <MenuItem value="">
                <em>Select a hardware model</em>
              </MenuItem>
              {hardware.map((hw) => (
                <MenuItem key={hw.id} value={hw.id}>
                  {hw.model}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Power Usage (kW)"
            value={selectedHardware?.powerUsage || "—"}
            disabled
            margin="normal"
            inputProps={{ readOnly: true }}
          />

          <TextField
            fullWidth
            label="Hash Rate (TH/s)"
            value={
              selectedHardware
                ? parseFloat(String(selectedHardware.hashRate)).toFixed(2)
                : "—"
            }
            disabled
            margin="normal"
            inputProps={{ readOnly: true }}
          />

          <FormControl
            fullWidth
            margin="normal"
            required
            disabled={loading || isLoading}
          >
            <InputLabel>Space</InputLabel>
            <Select
              name="spaceId"
              value={formData.spaceId}
              onChange={handleChange}
              label="Space"
            >
              <MenuItem value="">
                <em>Select a space</em>
              </MenuItem>
              {spaces.map((space) => (
                <MenuItem key={space.id} value={space.id}>
                  {space.name} ({space.location})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Miner Name/ID"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Miner-001"
            margin="normal"
            required
            disabled={loading || isLoading || hardwareLoading}
          />

          <FormControl
            fullWidth
            margin="normal"
            disabled={loading || isLoading}
          >
            <InputLabel>Status</InputLabel>
            <Select
              name="status"
              value={formData.status}
              onChange={handleChange}
              label="Status"
            >
              <MenuItem value="INACTIVE">Inactive</MenuItem>
              <MenuItem value="ACTIVE">Active</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading || isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || isLoading}
          startIcon={loading && <CircularProgress size={20} />}
        >
          {loading ? "Saving..." : isEditMode ? "Update Miner" : "Create Miner"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
