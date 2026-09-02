/**
 * Franchise Miner Form Modal — create/edit a miner for one of the
 * franchisee's own customers. Independent of admin's MinerFormModal
 * (points at /api/franchise/miners instead of /api/machine).
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

interface Hardware {
  id: string;
  model: string;
  powerUsage: number;
  quantity: number;
  hashRate: number | string;
}

interface MinerFormData {
  name: string;
  hardwareId: string;
  userId: string;
  spaceId: string;
  poolId: string;
  status: "AUTO" | "DEPLOYMENT_IN_PROGRESS" | "UNDER_MAINTENANCE";
  rate_per_kwh: string | number;
  benchmarkHashrate: string | number;
  serialNumber: string;
  macAddress: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
}

interface Space {
  id: string;
  name: string;
  location: string;
}

interface Pool {
  id: string;
  name: string;
  apiUrl: string;
  description?: string | null;
}

interface Miner {
  id: string;
  name: string;
  hardwareId: string;
  status: "AUTO" | "DEPLOYMENT_IN_PROGRESS" | "UNDER_MAINTENANCE";
  userId: string;
  spaceId: string;
  poolId?: string | null;
  rate_per_kwh?: number;
  benchmarkHashrate?: number;
  serialNumber?: string | null;
  macAddress?: string | null;
  hardware?: Hardware;
}

interface FranchiseMinerFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  miner?: Miner | null;
  customers: Customer[];
  spaces: Space[];
  pools: Pool[];
  isLoading?: boolean;
}

export default function FranchiseMinerFormModal({
  open,
  onClose,
  onSuccess,
  miner,
  customers,
  spaces,
  pools,
  isLoading = false,
}: FranchiseMinerFormModalProps) {
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
    poolId: "",
    status: "DEPLOYMENT_IN_PROGRESS",
    rate_per_kwh: "",
    benchmarkHashrate: "",
    serialNumber: "",
    macAddress: "",
  });

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

    if (open) fetchHardware();
  }, [open]);

  useEffect(() => {
    if (miner) {
      setFormData({
        name: miner.name,
        hardwareId: miner.hardwareId,
        userId: miner.userId,
        spaceId: miner.spaceId,
        poolId: miner.poolId || "",
        status: miner.status,
        rate_per_kwh: miner.rate_per_kwh || "",
        benchmarkHashrate: miner.benchmarkHashrate || "",
        serialNumber: miner.serialNumber || "",
        macAddress: miner.macAddress || "",
      });
      if (miner.hardware) setSelectedHardware(miner.hardware);
    } else {
      setFormData({
        name: "",
        hardwareId: "",
        userId: "",
        spaceId: "",
        poolId: "",
        status: "DEPLOYMENT_IN_PROGRESS",
        rate_per_kwh: "",
        benchmarkHashrate: "",
        serialNumber: "",
        macAddress: "",
      });
      setSelectedHardware(null);
    }
    setError(null);
  }, [miner, open]);

  const handleChange = (
    e:
      | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      | SelectChangeEvent,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleHardwareChange = (e: SelectChangeEvent) => {
    const hwId = e.target.value;
    const selectedHw = hardware.find((hw) => hw.id === hwId);
    setFormData((prev) => ({ ...prev, hardwareId: hwId }));
    setSelectedHardware(selectedHw || null);
  };

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
      setError("Customer is required");
      return false;
    }
    if (!formData.spaceId) {
      setError("Space is required");
      return false;
    }
    if (!miner && !formData.rate_per_kwh) {
      setError("Rate per kWh is required for new miners");
      return false;
    }
    if (formData.rate_per_kwh) {
      const rate = Number(formData.rate_per_kwh);
      if (isNaN(rate) || rate <= 0) {
        setError("Rate per kWh must be a positive number");
        return false;
      }
    }
    if (formData.benchmarkHashrate) {
      const benchmark = Number(formData.benchmarkHashrate);
      if (isNaN(benchmark) || benchmark <= 0) {
        setError("Benchmark hashrate must be a positive number");
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      const url = miner
        ? `/api/franchise/miners/${miner.id}`
        : "/api/franchise/miners";
      const method = miner ? "PUT" : "POST";

      const body: Record<string, unknown> = {
        name: formData.name,
        hardwareId: formData.hardwareId,
        userId: formData.userId,
        spaceId: formData.spaceId,
        status: formData.status,
        serialNumber: formData.serialNumber || undefined,
        macAddress: formData.macAddress || undefined,
      };

      if (formData.poolId) body.poolId = formData.poolId;
      if (formData.rate_per_kwh)
        body.rate_per_kwh = Number(formData.rate_per_kwh);
      if (formData.benchmarkHashrate)
        body.benchmarkHashrate = Number(formData.benchmarkHashrate);

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
          {isEditMode ? "Edit Miner" : "Create New Miner"}
          <IconButton onClick={onClose} size="small">
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
            <InputLabel>Customer</InputLabel>
            <Select
              name="userId"
              value={formData.userId}
              onChange={handleChange}
              label="Customer"
            >
              <MenuItem value="">
                <em>Select a customer</em>
              </MenuItem>
              {customers.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name} ({c.email})
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
              {hardware
                .filter((hw) => hw.quantity > 0)
                .map((hw) => (
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

          <FormControl
            fullWidth
            margin="normal"
            disabled={loading || isLoading}
          >
            <InputLabel>Pool (Optional)</InputLabel>
            <Select
              name="poolId"
              value={formData.poolId}
              onChange={handleChange}
              label="Pool (Optional)"
            >
              <MenuItem value="">
                <em>No pool assigned</em>
              </MenuItem>
              {pools.map((pool) => (
                <MenuItem key={pool.id} value={pool.id}>
                  {pool.name}
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
              <MenuItem value="DEPLOYMENT_IN_PROGRESS">
                Deployment in Progress
              </MenuItem>
              <MenuItem value="AUTO">Auto</MenuItem>
              <MenuItem value="UNDER_MAINTENANCE">Under Maintenance</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Rate per kWh (USD)"
            name="rate_per_kwh"
            type="number"
            value={formData.rate_per_kwh}
            onChange={handleChange}
            placeholder="0.12"
            margin="normal"
            disabled={loading || isLoading}
            inputProps={{ step: 0.000001, min: 0, max: 999 }}
            helperText={
              miner
                ? "Optional: leave empty to keep current rate"
                : "Required for cost calculation"
            }
          />

          <TextField
            fullWidth
            label="Benchmark Hashrate (TH/s)"
            name="benchmarkHashrate"
            type="number"
            value={formData.benchmarkHashrate}
            onChange={handleChange}
            placeholder="e.g., 200.00"
            margin="normal"
            disabled={loading || isLoading}
            inputProps={{ step: 0.01, min: 0 }}
            helperText="Optional: expected daily hashrate used to alert admins when this miner underperforms"
          />

          <TextField
            fullWidth
            label="Serial Number"
            name="serialNumber"
            value={formData.serialNumber}
            onChange={handleChange}
            placeholder="e.g., SN123456789"
            margin="normal"
            disabled={loading || isLoading}
          />

          <TextField
            fullWidth
            label="MAC Address"
            name="macAddress"
            value={formData.macAddress}
            onChange={handleChange}
            placeholder="e.g., AA:BB:CC:DD:EE:FF"
            margin="normal"
            disabled={loading || isLoading}
          />
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
