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
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

/**
 * Miner form data structure
 */
interface MinerFormData {
  name: string;
  model: string;
  powerUsage: number | string;
  hashRate: number | string;
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
interface Miner extends MinerFormData {
  id: string;
  powerUsage: number;
  hashRate: number;
  createdAt: string;
  updatedAt: string;
  user?: User;
  space?: Space;
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
  const [formData, setFormData] = useState<MinerFormData>({
    name: "",
    model: "",
    powerUsage: "",
    hashRate: "",
    userId: "",
    spaceId: "",
    status: "INACTIVE",
  });

  // Initialize form with miner data if editing
  useEffect(() => {
    if (miner) {
      setFormData({
        name: miner.name,
        model: miner.model,
        powerUsage: miner.powerUsage,
        hashRate: miner.hashRate,
        userId: miner.userId,
        spaceId: miner.spaceId,
        status: miner.status,
      });
    } else {
      setFormData({
        name: "",
        model: "",
        powerUsage: "",
        hashRate: "",
        userId: "",
        spaceId: "",
        status: "INACTIVE",
      });
    }
    setError(null);
  }, [miner, open]);

  /**
   * Handle form field changes
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /**
   * Validate form data
   */
  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError("Miner name is required");
      return false;
    }
    if (!formData.model.trim()) {
      setError("Miner model is required");
      return false;
    }
    if (!formData.powerUsage || Number(formData.powerUsage) <= 0) {
      setError("Power usage must be a positive number");
      return false;
    }
    if (!formData.hashRate || Number(formData.hashRate) <= 0) {
      setError("Hash rate must be a positive number");
      return false;
    }
    if (!formData.userId) {
      setError("Please select a user");
      return false;
    }
    if (!formData.spaceId) {
      setError("Please select a space");
      return false;
    }
    return true;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const url = miner ? `/api/machine/${miner.id}` : "/api/machine";
      const method = miner ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          model: formData.model.trim(),
          powerUsage: Number(formData.powerUsage),
          hashRate: Number(formData.hashRate),
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
          <TextField
            fullWidth
            label="Miner Name/ID"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Miner-001"
            margin="normal"
            required
            disabled={loading || isLoading}
          />

          <TextField
            fullWidth
            label="Miner Model"
            name="model"
            value={formData.model}
            onChange={handleChange}
            placeholder="e.g., Bitmain S21 Pro"
            margin="normal"
            required
            disabled={loading || isLoading}
          />

          <TextField
            fullWidth
            label="Power Usage (kWh)"
            name="powerUsage"
            type="number"
            value={formData.powerUsage}
            onChange={handleChange}
            placeholder="e.g., 3.5"
            margin="normal"
            required
            inputProps={{ min: "0.1", step: "0.1" }}
            disabled={loading || isLoading}
          />

          <TextField
            fullWidth
            label="Hash Rate (TH/s)"
            name="hashRate"
            type="number"
            value={formData.hashRate}
            onChange={handleChange}
            placeholder="e.g., 234"
            margin="normal"
            required
            inputProps={{ min: "0.1", step: "0.1" }}
            disabled={loading || isLoading}
          />

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
