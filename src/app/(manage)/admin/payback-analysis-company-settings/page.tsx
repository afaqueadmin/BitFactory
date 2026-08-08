"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Grid,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  Divider,
  Tabs,
  Tab,
} from "@mui/material";
import { Save as SaveIcon, Refresh as RefreshIcon } from "@mui/icons-material";
import { MinerModel, MINER_LABELS } from "@/lib/helpers/paybackCalculations";

interface PaybackConfig {
  id: number;
  s21proHostingCharges: string;
  s21xpHostingCharges: string;
  s21proMonthlyInvoicingAmount: string;
  s21xpMonthlyInvoicingAmount: string;
  s21proPowerConsumption: string;
  s21xpPowerConsumption: string;
  s21proMachineCost: string;
  s21xpMachineCost: string;
  poolCommissionStockOs: string;
  poolCommissionLuxos: string;
  s21proHashrateStockOs: string;
  s21proHashrateLuxos: string;
  s21xpHashrateStockOs: string;
  s21xpHashrateLuxos: string;
  breakevenBtcPrice: string;
  createdAt: string;
  updatedAt: string;
}

export default function PaybackAnalysisCompanySettingsPage() {
  const [config, setConfig] = useState<PaybackConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedMiner, setSelectedMiner] = useState<MinerModel>("S21PRO");

  // Form state
  const [formData, setFormData] = useState({
    s21proHostingCharges: "",
    s21xpHostingCharges: "",
    s21proMonthlyInvoicingAmount: "",
    s21xpMonthlyInvoicingAmount: "",
    s21proPowerConsumption: "",
    s21xpPowerConsumption: "",
    s21proMachineCost: "",
    s21xpMachineCost: "",
    poolCommissionStockOs: "",
    poolCommissionLuxos: "",
    s21proHashrateStockOs: "",
    s21proHashrateLuxos: "",
    s21xpHashrateStockOs: "",
    s21xpHashrateLuxos: "",
    breakevenBtcPrice: "",
  });

  // Fetch current configuration
  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/admin/payback-config-company");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch configuration");
      }

      if (data.success && data.data) {
        setConfig(data.data);
        // Set form data with fetched values
        setFormData({
          s21proHostingCharges: data.data.s21proHostingCharges,
          s21xpHostingCharges: data.data.s21xpHostingCharges,
          s21proMonthlyInvoicingAmount: data.data.s21proMonthlyInvoicingAmount,
          s21xpMonthlyInvoicingAmount: data.data.s21xpMonthlyInvoicingAmount,
          s21proPowerConsumption: data.data.s21proPowerConsumption,
          s21xpPowerConsumption: data.data.s21xpPowerConsumption,
          s21proMachineCost: data.data.s21proMachineCost,
          s21xpMachineCost: data.data.s21xpMachineCost,
          poolCommissionStockOs: data.data.poolCommissionStockOs,
          poolCommissionLuxos: data.data.poolCommissionLuxos,
          s21proHashrateStockOs: data.data.s21proHashrateStockOs,
          s21proHashrateLuxos: data.data.s21proHashrateLuxos,
          s21xpHashrateStockOs: data.data.s21xpHashrateStockOs,
          s21xpHashrateLuxos: data.data.s21xpHashrateLuxos,
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

      const response = await fetch("/api/admin/payback-config-company", {
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
          Company Payback Analysis Settings
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
          Edit the values below to update the company self-mining payback
          analysis calculations. These values are separate from the client
          payback configuration.
        </Typography>

        <Divider sx={{ mb: 3 }} />

        <Typography variant="h6" gutterBottom>
          Miner Cost, Hashrate &amp; Hosting
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select a miner model to edit its machine cost, hashrate, hosting, and
          power values.
        </Typography>

        <Tabs
          value={selectedMiner}
          onChange={(_event, newValue: MinerModel) =>
            setSelectedMiner(newValue)
          }
          aria-label="Miner model selector"
          sx={{ mb: 2, minHeight: 36 }}
        >
          <Tab
            value="S21PRO"
            label={MINER_LABELS.S21PRO}
            sx={{ minHeight: 36, py: 0.5 }}
          />
          <Tab
            value="S21XP"
            label={MINER_LABELS.S21XP}
            sx={{ minHeight: 36, py: 0.5 }}
          />
        </Tabs>

        <Grid container spacing={3}>
          {selectedMiner === "S21PRO" && (
            <>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="S21 Pro Machine Cost ($)"
                  type="number"
                  value={formData.s21proMachineCost}
                  onChange={handleChange("s21proMachineCost")}
                  helperText="Upfront cost of a company-owned S21 Pro miner"
                  inputProps={{ step: "0.01", min: "0" }}
                  InputLabelProps={{ sx: { color: "#1565c0" } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="S21 Pro Hashrate - Stock OS (TH/s)"
                  type="number"
                  value={formData.s21proHashrateStockOs}
                  onChange={handleChange("s21proHashrateStockOs")}
                  helperText="Hashrate with stock operating system"
                  inputProps={{ step: "0.01", min: "0" }}
                  InputLabelProps={{ sx: { color: "#1565c0" } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="S21 Pro Hashrate - LuxOS (TH/s)"
                  type="number"
                  value={formData.s21proHashrateLuxos}
                  onChange={handleChange("s21proHashrateLuxos")}
                  helperText="Hashrate with LuxOS firmware"
                  inputProps={{ step: "0.01", min: "0" }}
                  InputLabelProps={{ sx: { color: "#1565c0" } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="S21 Pro Hosting Charges ($/kWh)"
                  type="number"
                  value={formData.s21proHostingCharges}
                  onChange={handleChange("s21proHostingCharges")}
                  helperText="Cost per kilowatt-hour for hosting"
                  inputProps={{ step: "0.00001", min: "0" }}
                  InputLabelProps={{ sx: { color: "#1565c0" } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="S21 Pro Monthly Hosting/Operating Cost ($)"
                  type="number"
                  value={formData.s21proMonthlyInvoicingAmount}
                  onChange={handleChange("s21proMonthlyInvoicingAmount")}
                  helperText="Total monthly hosting/electricity cost for company-owned miners"
                  inputProps={{ step: "0.01", min: "0" }}
                  InputLabelProps={{ sx: { color: "#1565c0" } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="S21 Pro Power Consumption (kW)"
                  type="number"
                  value={formData.s21proPowerConsumption}
                  onChange={handleChange("s21proPowerConsumption")}
                  helperText="Power consumption per miner"
                  inputProps={{ step: "0.0001", min: "0" }}
                  InputLabelProps={{ sx: { color: "#1565c0" } }}
                />
              </Grid>
            </>
          )}

          {selectedMiner === "S21XP" && (
            <>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="S21 XP Machine Cost ($)"
                  type="number"
                  value={formData.s21xpMachineCost}
                  onChange={handleChange("s21xpMachineCost")}
                  helperText="Upfront cost of a company-owned S21 XP miner"
                  inputProps={{ step: "0.01", min: "0" }}
                  InputLabelProps={{ sx: { color: "#e65100" } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="S21 XP Hashrate - Stock OS (TH/s)"
                  type="number"
                  value={formData.s21xpHashrateStockOs}
                  onChange={handleChange("s21xpHashrateStockOs")}
                  helperText="Hashrate with stock operating system"
                  inputProps={{ step: "0.01", min: "0" }}
                  InputLabelProps={{ sx: { color: "#e65100" } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="S21 XP Hashrate - LuxOS (TH/s)"
                  type="number"
                  value={formData.s21xpHashrateLuxos}
                  onChange={handleChange("s21xpHashrateLuxos")}
                  helperText="Hashrate with LuxOS firmware"
                  inputProps={{ step: "0.01", min: "0" }}
                  InputLabelProps={{ sx: { color: "#e65100" } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="S21 XP Hosting Charges ($/kWh)"
                  type="number"
                  value={formData.s21xpHostingCharges}
                  onChange={handleChange("s21xpHostingCharges")}
                  helperText="Cost per kilowatt-hour for hosting"
                  inputProps={{ step: "0.00001", min: "0" }}
                  InputLabelProps={{ sx: { color: "#e65100" } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="S21 XP Monthly Hosting/Operating Cost ($)"
                  type="number"
                  value={formData.s21xpMonthlyInvoicingAmount}
                  onChange={handleChange("s21xpMonthlyInvoicingAmount")}
                  helperText="Total monthly hosting/electricity cost for company-owned miners"
                  inputProps={{ step: "0.01", min: "0" }}
                  InputLabelProps={{ sx: { color: "#e65100" } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="S21 XP Power Consumption (kW)"
                  type="number"
                  value={formData.s21xpPowerConsumption}
                  onChange={handleChange("s21xpPowerConsumption")}
                  helperText="Power consumption per miner"
                  inputProps={{ step: "0.0001", min: "0" }}
                  InputLabelProps={{ sx: { color: "#e65100" } }}
                />
              </Grid>
            </>
          )}
        </Grid>

        <Divider sx={{ my: 3 }} />

        <Grid container spacing={3}>
          {/* Pool Commission - Stock OS */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              label="Pool Commission - Stock OS (%)"
              type="number"
              value={formData.poolCommissionStockOs}
              onChange={handleChange("poolCommissionStockOs")}
              helperText="Mining pool commission percentage for Stock OS"
              inputProps={{ step: "0.01", min: "0", max: "100" }}
            />
          </Grid>

          {/* Pool Commission - LuxOS */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              label="Pool Commission - LuxOS (%)"
              type="number"
              value={formData.poolCommissionLuxos}
              onChange={handleChange("poolCommissionLuxos")}
              helperText="Mining pool commission percentage for Custom OS / LuxOS"
              inputProps={{ step: "0.01", min: "0", max: "100" }}
            />
          </Grid>

          {/* Breakeven BTC Price */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
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
