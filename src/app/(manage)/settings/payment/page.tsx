"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
} from "@mui/material";

interface PaymentSettings {
  confirmoEnabled: boolean;
  confirmoSettlementCurrency: string | null;
  confirmoReturnUrl: string | null;
}

export default function PaymentSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [settings, setSettings] = useState<PaymentSettings>({
    confirmoEnabled: false,
    confirmoSettlementCurrency: "USDC",
    confirmoReturnUrl: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Redirect non-admin users
  useEffect(() => {
    if (user && user.role !== "ADMIN") {
      router.push("/dashboard");
    }
  }, [user, router]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings/payment");
      if (!response.ok) throw new Error("Failed to fetch settings");

      const data = await response.json();
      if (data.success && data.data) {
        setSettings({
          confirmoEnabled: data.data.confirmoEnabled || false,
          confirmoSettlementCurrency:
            data.data.confirmoSettlementCurrency || "USDC",
          confirmoReturnUrl: data.data.confirmoReturnUrl || "",
        });
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/settings/payment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save settings");
      }

      setSuccess("Settings saved successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Payment Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Configure cryptocurrency payment options for invoices
      </Typography>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Confirmo Crypto Payments
          </Typography>
          <Divider sx={{ mb: 3 }} />

          {error && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert
              severity="success"
              sx={{ mb: 3 }}
              onClose={() => setSuccess("")}
            >
              {success}
            </Alert>
          )}

          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Enable/Disable Toggle */}
            <FormControlLabel
              control={
                <Switch
                  checked={settings.confirmoEnabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      confirmoEnabled: e.target.checked,
                    })
                  }
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="body1">
                    Enable Crypto Payments
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Allow customers to pay invoices with cryptocurrency via
                    Confirmo
                  </Typography>
                </Box>
              }
            />

            {/* Settlement Currency */}
            <FormControl fullWidth disabled={!settings.confirmoEnabled}>
              <InputLabel>Settlement Currency</InputLabel>
              <Select
                value={settings.confirmoSettlementCurrency || "USDC"}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    confirmoSettlementCurrency: e.target.value,
                  })
                }
                label="Settlement Currency"
              >
                <MenuItem value="USDC">USDC (USD Coin)</MenuItem>
                <MenuItem value="USDT">USDT (Tether)</MenuItem>
                <MenuItem value="BTC">BTC (Bitcoin)</MenuItem>
                <MenuItem value="ETH">ETH (Ethereum)</MenuItem>
              </Select>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1 }}
              >
                Currency you&apos;ll receive after customer payment is confirmed
              </Typography>
            </FormControl>

            {/* Return URL */}
            <TextField
              fullWidth
              label="Return URL"
              value={settings.confirmoReturnUrl || ""}
              onChange={(e) =>
                setSettings({ ...settings, confirmoReturnUrl: e.target.value })
              }
              disabled={!settings.confirmoEnabled}
              placeholder="https://my.bitfactory.ae/invoices/[id]/payment-success"
              helperText="URL where customers will be redirected after payment (leave empty for default)"
            />

            {/* Configuration Info */}
            {settings.confirmoEnabled && (
              <Alert severity="info">
                <Typography variant="body2" gutterBottom>
                  <strong>Next Steps:</strong>
                </Typography>
                <Typography variant="body2" component="div">
                  1. Configure webhook in Confirmo dashboard: <br />
                  <code
                    style={{
                      backgroundColor: "#f5f5f5",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    https://my.bitfactory.ae/api/webhooks/confirmo
                  </code>
                  <br />
                  2. Add webhook secret to .env file
                  <br />
                  3. Generate payment links from invoice pages
                </Typography>
              </Alert>
            )}

            {/* Save Button */}
            <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
              <Button
                variant="outlined"
                onClick={() => router.push("/dashboard")}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving}
                startIcon={saving && <CircularProgress size={20} />}
              >
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* API Configuration Card */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            API Configuration
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary" paragraph>
            Ensure these environment variables are configured in your .env file:
          </Typography>
          <Box
            component="pre"
            sx={{
              backgroundColor: "#f5f5f5",
              p: 2,
              borderRadius: 1,
              fontSize: "0.875rem",
              overflow: "auto",
            }}
          >
            {`CONFIRMO_API_KEY=your_api_key_from_confirmo
CONFIRMO_WEBHOOK_SECRET=your_webhook_secret
NEXT_PUBLIC_APP_URL=https://my.bitfactory.ae`}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
            Don&apos;t have a Confirmo account? Visit{" "}
            <Link href="https://confirmo.net" target="_blank" rel="noopener">
              confirmo.net
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
