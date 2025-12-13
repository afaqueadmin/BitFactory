"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  Box,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  CircularProgress,
  Chip,
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";

interface Hardware {
  id: string;
  model: string;
  powerUsage: number;
  hashRate: number | string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  model: string;
  powerUsage: string | number;
  hashRate: string | number;
  quantity: string | number;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export default function HardwarePage() {
  const [hardware, setHardware] = useState<Hardware[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    model: "",
    powerUsage: "",
    hashRate: "",
    quantity: 1,
  });

  /**
   * Fetch hardware list
   */
  const fetchHardware = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/hardware");
      const data: ApiResponse<Hardware[]> = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch hardware");
      }

      setHardware(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHardware();
  }, [fetchHardware]);

  /**
   * Handle form input change
   */
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setFormError(null);

    if (!formData.model.trim()) {
      setFormError("Model name is required");
      return false;
    }

    const power = parseFloat(String(formData.powerUsage));
    if (isNaN(power) || power <= 0) {
      setFormError("Power usage must be a positive number (in kW)");
      return false;
    }

    const hash = parseFloat(String(formData.hashRate));
    if (isNaN(hash) || hash <= 0) {
      setFormError("Hash rate must be a positive number (in TH/s)");
      return false;
    }

    const qty = parseInt(String(formData.quantity));
    if (isNaN(qty) || qty <= 0) {
      setFormError("Quantity must be a positive number");
      return false;
    }

    return true;
  };

  /**
   * Handle create new hardware
   */
  const handleCreateNew = () => {
    setEditingId(null);
    setFormData({
      model: "",
      powerUsage: "",
      hashRate: "",
      quantity: 1,
    });
    setFormError(null);
    setOpenForm(true);
  };

  /**
   * Handle edit hardware
   */
  const handleEdit = (hw: Hardware) => {
    setEditingId(hw.id);
    setFormData({
      model: hw.model,
      powerUsage: hw.powerUsage,
      hashRate: hw.hashRate,
      quantity: hw.quantity,
    });
    setFormError(null);
    setOpenForm(true);
  };

  /**
   * Handle submit (create or update)
   */
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const url = editingId ? `/api/hardware/${editingId}` : "/api/hardware";
      const method = editingId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: formData.model.trim(),
          powerUsage: parseFloat(String(formData.powerUsage)),
          hashRate: parseFloat(String(formData.hashRate)),
          quantity: parseInt(String(formData.quantity)),
        }),
      });

      const data: ApiResponse<Hardware> = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || `Failed to ${editingId ? "update" : "create"} hardware`,
        );
      }

      setOpenForm(false);
      setFormData({
        model: "",
        powerUsage: "",
        hashRate: "",
        quantity: 1,
      });
      await fetchHardware();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle delete confirmation
   */
  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/hardware/${deleteConfirm}`, {
        method: "DELETE",
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete hardware");
      }

      setDeleteConfirm(null);
      await fetchHardware();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Format date to readable string
   */
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const [averagePowerUsage, averageHashRate] = useMemo(() => {
    const baseValues = ["0.00 kW", "0.00 TH/s"];
    if (hardware.length === 0) return baseValues;
    const denominator = hardware.reduce((sum, hw) => sum + hw.quantity, 0);
    if (denominator === 0) return baseValues;
    const avgPowerUsage = (
      hardware.reduce((sum, hw) => sum + hw.powerUsage * hw.quantity, 0) /
      denominator
    ).toFixed(2);
    const avgHashRate = (
      hardware.reduce(
        (sum, hw) => sum + parseFloat(String(hw.hashRate)) * hw.quantity,
        0,
      ) / denominator
    ).toFixed(2);

    return [`${avgPowerUsage} kW`, `${avgHashRate} TH/s`];
  }, [hardware]);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" sx={{ mb: 0.5 }}>
          Hardware Management
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage mining hardware models and their specifications
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateNew}
          disabled={loading}
        >
          Add Hardware
        </Button>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 2,
          mb: 4,
        }}
      >
        <Paper sx={{ p: 2, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Total Hardware Models
          </Typography>
          <Typography variant="h4" sx={{ mt: 1 }}>
            {hardware.length}
          </Typography>
        </Paper>

        <Paper sx={{ p: 2, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Average Power Usage
          </Typography>
          <Typography variant="h4" sx={{ mt: 1 }}>
            {averagePowerUsage}
          </Typography>
        </Paper>

        <Paper sx={{ p: 2, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Average Hash Rate
          </Typography>
          <Typography variant="h4" sx={{ mt: 1 }}>
            {averageHashRate}
          </Typography>
        </Paper>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: "action.hover" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold" }}>Model</TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="right">
                Power Usage (kW)
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="right">
                Hash Rate (TH/s)
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="center">
                Quantity
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Created</TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="center">
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : hardware.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No hardware found. Create one to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              hardware.map((hw) => (
                <TableRow
                  key={hw.id}
                  hover
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  <TableCell sx={{ fontWeight: "500" }}>{hw.model}</TableCell>
                  <TableCell align="right">
                    {parseFloat(String(hw.powerUsage)).toFixed(2)}
                  </TableCell>
                  <TableCell align="right">
                    {parseFloat(String(hw.hashRate)).toFixed(2)}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={`${hw.quantity} unit${hw.quantity !== 1 ? "s" : ""}`}
                      size="small"
                      color={hw.quantity > 0 ? "success" : "default"}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{formatDate(hw.createdAt)}</TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={1} justifyContent="center">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleEdit(hw)}
                        disabled={loading}
                        title="Edit hardware"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteConfirm(hw.id)}
                        disabled={loading}
                        title="Delete hardware"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Form Dialog */}
      <Dialog
        open={openForm}
        onClose={() => !saving && setOpenForm(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingId ? "Edit Hardware" : "Create New Hardware"}
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Model Name"
            name="model"
            value={formData.model}
            onChange={handleFormChange}
            placeholder="e.g., Bitmain S21 Pro"
            margin="normal"
            disabled={saving}
          />

          <TextField
            fullWidth
            label="Power Usage (kW)"
            name="powerUsage"
            type="number"
            value={formData.powerUsage}
            onChange={handleFormChange}
            placeholder="e.g., 3.25"
            margin="normal"
            inputProps={{ min: "0.1", step: "0.1" }}
            disabled={saving}
          />

          <TextField
            fullWidth
            label="Hash Rate (TH/s)"
            name="hashRate"
            type="number"
            value={formData.hashRate}
            onChange={handleFormChange}
            placeholder="e.g., 234.5"
            margin="normal"
            inputProps={{ min: "0.1", step: "0.1" }}
            disabled={saving}
          />

          <TextField
            fullWidth
            label="Quantity"
            name="quantity"
            type="number"
            value={formData.quantity}
            onChange={handleFormChange}
            placeholder="e.g., 5"
            margin="normal"
            inputProps={{ min: "1", step: "1" }}
            disabled={saving}
            helperText="Number of units available"
          />
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => !saving && setOpenForm(false)}
            disabled={saving}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={saving}
            startIcon={saving && <CircularProgress size={20} />}
          >
            {saving ? "Saving..." : editingId ? "Update" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onClose={() => !deleting && setDeleteConfirm(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningIcon color="error" />
          Delete Hardware
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography>
            Are you sure you want to delete this hardware? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => !deleting && setDeleteConfirm(null)}
            disabled={deleting}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            disabled={deleting}
            startIcon={deleting && <CircularProgress size={20} />}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
