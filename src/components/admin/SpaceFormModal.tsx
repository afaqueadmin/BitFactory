/**
 * Space Form Modal Component
 *
 * Modal dialog for creating or editing mining spaces.
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
 * Space form data structure
 */
interface SpaceFormData {
  name: string;
  location: string;
  capacity: number | string;
  powerCapacity: number | string;
  status: "AVAILABLE" | "OCCUPIED";
}

/**
 * Space object (from API)
 */
interface Space extends SpaceFormData {
  id: string;
  createdAt: string;
  updatedAt: string;
  minerCount?: number;
  activeMinerCount?: number;
}

interface SpaceFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  space?: Space | null;
  isLoading?: boolean;
}

export default function SpaceFormModal({
  open,
  onClose,
  onSuccess,
  space,
  isLoading = false,
}: SpaceFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<SpaceFormData>({
    name: "",
    location: "",
    capacity: "",
    powerCapacity: "",
    status: "AVAILABLE",
  });

  // Initialize form with space data if editing
  useEffect(() => {
    if (space) {
      setFormData({
        name: space.name,
        location: space.location,
        capacity: space.capacity,
        powerCapacity: space.powerCapacity,
        status: space.status,
      });
    } else {
      setFormData({
        name: "",
        location: "",
        capacity: "",
        powerCapacity: "",
        status: "AVAILABLE",
      });
    }
    setError(null);
  }, [space, open]);

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
      setError("Space name is required");
      return false;
    }
    if (!formData.location.trim()) {
      setError("Location is required");
      return false;
    }
    if (!formData.capacity || Number(formData.capacity) <= 0) {
      setError("Capacity must be a positive number");
      return false;
    }
    if (!formData.powerCapacity || Number(formData.powerCapacity) <= 0) {
      setError("Power capacity must be a positive number");
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
      const url = space ? `/api/spaces/${space.id}` : "/api/spaces";
      const method = space ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          location: formData.location.trim(),
          capacity: Number(formData.capacity),
          powerCapacity: Number(formData.powerCapacity),
          status: formData.status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || `Failed to ${space ? "update" : "create"} space`,
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

  const isEditMode = !!space;
  const title = isEditMode ? "Edit Space" : "Create New Space";

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
            label="Pool"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Mining Farm 1"
            margin="normal"
            required
            disabled={loading || isLoading}
          />

          <TextField
            fullWidth
            label="Location"
            name="location"
            value={formData.location}
            onChange={handleChange}
            placeholder="e.g., New York, USA"
            margin="normal"
            required
            disabled={loading || isLoading}
          />

          <TextField
            fullWidth
            label="Total Capacity (Mining Spots)"
            name="capacity"
            type="number"
            value={formData.capacity}
            onChange={handleChange}
            placeholder="e.g., 100"
            margin="normal"
            required
            inputProps={{ min: "1", step: "1" }}
            disabled={loading || isLoading}
          />

          <TextField
            fullWidth
            label="Power Capacity (kW)"
            name="powerCapacity"
            type="number"
            value={formData.powerCapacity}
            onChange={handleChange}
            placeholder="e.g., 500.5"
            margin="normal"
            required
            inputProps={{ min: "0.1", step: "0.1" }}
            disabled={loading || isLoading}
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
              <MenuItem value="AVAILABLE">Available</MenuItem>
              <MenuItem value="OCCUPIED">Occupied</MenuItem>
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
          {loading ? "Saving..." : isEditMode ? "Update Space" : "Create Space"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
