"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Grid as MuiGrid,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  Divider,
} from "@mui/material";
import { Save as SaveIcon, Refresh as RefreshIcon } from "@mui/icons-material";
import type { GridProps } from "@mui/material/Grid";

// Type workaround for MUI Grid component
const Grid = MuiGrid as React.ComponentType<GridProps>;

interface PaybackConfig {
  id: number;
  hostingCharges: string;
  monthlyInvoicingAmount: string;
  powerConsumption: string;
  machineCapitalCost: string;
  poolCommission: string;
  s21proHashrateStockOs: string;
  s21proHashrateLuxos: string;
  breakevenBtcPrice: string;
  createdAt: string;
  updatedAt: string;
}

export default function PaybackAnalysisSettingsPage() {
  const [config, setConfig] = useState<PaybackConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    hostingCharges: "",
    monthlyInvoicingAmount: "",
    powerConsumption: "",
    machineCapitalCost: "",
    poolCommission: "",
    s21proHashrateStockOs: "",
    s21proHashrateLuxos: "",
    breakevenBtcPrice: "",
  });

  // Fetch current configuration
  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/admin/payback-config");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch configuration");
      }

      if (data.success && data.data) {
        setConfig(data.data);
        // Set form data with fetched values
        setFormData({
          hostingCharges: data.data.hostingCharges,
          monthlyInvoicingAmount: data.data.monthlyInvoicingAmount,
          powerConsumption: data.data.powerConsumption,
          machineCapitalCost: data.data.machineCapitalCost,
          poolCommission: data.data.poolCommission,
          s21proHashrateStockOs: data.data.s21proHashrateStockOs,
          s21proHashrateLuxos: data.data.s21proHashrateLuxos,
          breakevenBtcPrice: data.data.breakevenBtcPrice,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load configuration",
      );
    } finally {
      setLoading(false);
    }
  };

  // Save configuration
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch("/api/admin/payback-config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save configuration");
      }

      if (data.success) {
        setSuccess("Configuration saved successfully!");
        setConfig(data.data);
        // Refresh after 2 seconds
        setTimeout(() => {
          setSuccess(null);
        }, 3000);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save configuration",
      );
    } finally {
      setSaving(false);
    }
  };

  // Handle input change
  const handleChange =
    (field: keyof typeof formData) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormData({
        ...formData,
        [field]: event.target.value,
      });
    };

  // Load config on mount
  useEffect(() => {
    fetchConfig();
  }, []);

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "400px",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          mb: 3,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="h4" component="h1">
          Payback Analysis Settings
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchConfig}
          disabled={loading || saving}
        >
          Reload
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          severity="success"
          sx={{ mb: 3 }}
          onClose={() => setSuccess(null)}
        >
          {success}
        </Alert>
      )}

      <Paper elevation={2} sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Configuration Parameters
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Edit the values below to update payback analysis calculations across
          the platform.
        </Typography>

        <Divider sx={{ mb: 3 }} />

        <Grid container spacing={3}>
          {/* Hosting Charges */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Hosting Charges ($/kWh)"
              type="number"
              value={formData.hostingCharges}
              onChange={handleChange("hostingCharges")}
              helperText="Cost per kilowatt-hour for hosting"
              inputProps={{ step: "0.00001", min: "0" }}
            />
          </Grid>

          {/* Monthly Invoicing Amount */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Monthly Invoicing Amount ($)"
              type="number"
              value={formData.monthlyInvoicingAmount}
              onChange={handleChange("monthlyInvoicingAmount")}
              helperText="Total monthly invoice amount"
              inputProps={{ step: "0.01", min: "0" }}
            />
          </Grid>

          {/* Power Consumption */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Power Consumption (kW)"
              type="number"
              value={formData.powerConsumption}
              onChange={handleChange("powerConsumption")}
              helperText="Power consumption per miner"
              inputProps={{ step: "0.0001", min: "0" }}
            />
          </Grid>

          {/* Machine Capital Cost */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Machine Capital Cost ($)"
              type="number"
              value={formData.machineCapitalCost}
              onChange={handleChange("machineCapitalCost")}
              helperText="Initial cost of the mining machine"
              inputProps={{ step: "0.01", min: "0" }}
            />
          </Grid>

          {/* Pool Commission */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Pool Commission (%)"
              type="number"
              value={formData.poolCommission}
              onChange={handleChange("poolCommission")}
              helperText="Mining pool commission percentage"
              inputProps={{ step: "0.01", min: "0", max: "100" }}
            />
          </Grid>

          {/* S21 Pro Hashrate - Stock OS */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="S21 Pro Hashrate - Stock OS (TH/s)"
              type="number"
              value={formData.s21proHashrateStockOs}
              onChange={handleChange("s21proHashrateStockOs")}
              helperText="Hashrate with stock operating system"
              inputProps={{ step: "0.01", min: "0" }}
            />
          </Grid>

          {/* S21 Pro Hashrate - LuxOS */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="S21 Pro Hashrate - LuxOS (TH/s)"
              type="number"
              value={formData.s21proHashrateLuxos}
              onChange={handleChange("s21proHashrateLuxos")}
              helperText="Hashrate with LuxOS firmware"
              inputProps={{ step: "0.01", min: "0" }}
            />
          </Grid>

          {/* Breakeven BTC Price */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Breakeven BTC Price ($)"
              type="number"
              value={formData.breakevenBtcPrice}
              onChange={handleChange("breakevenBtcPrice")}
              helperText="BTC price for breakeven scenario"
              inputProps={{ step: "0.01", min: "0" }}
            />
          </Grid>
        </Grid>

        <Box
          sx={{ mt: 4, display: "flex", justifyContent: "flex-end", gap: 2 }}
        >
          <Button
            variant="outlined"
            onClick={fetchConfig}
            disabled={loading || saving}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </Box>

        {config && (
          <Box sx={{ mt: 3, p: 2, bgcolor: "grey.100", borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Last updated: {new Date(config.updatedAt).toLocaleString()}
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
