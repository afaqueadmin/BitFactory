"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { formatValue } from "@/lib/helpers/formatValue";

interface MinerOption {
  id: string;
  name: string;
  status: string;
  model: string;
  powerUsageKw: number;
  ownerName: string;
  realRatePerKwh: number;
}

interface SettingsResponse {
  settings: {
    sourceMinerId: string;
    displayName: string;
    welcomeBonusUsd: number;
    ratePerKwh: number | null;
    stored: boolean;
  } | null;
  miners: MinerOption[];
}

/**
 * Simulation settings on the Simulated Accounts page: the real miner every
 * simulated account mirrors, what it's shown as, the welcome bonus and the
 * electricity rate simulated accounts are charged (separate from the real
 * miner's own rate).
 */
export default function SimulationSettingsCard({
  onSaved,
}: {
  onSaved?: () => void;
}) {
  const [miners, setMiners] = useState<MinerOption[]>([]);
  const [minerId, setMinerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bonus, setBonus] = useState("");
  const [rate, setRate] = useState("");
  const [stored, setStored] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulated-accounts/settings", {
        credentials: "include",
      });
      const data: SettingsResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load settings");
      setMiners(data.miners);
      const s = data.settings;
      const source = s
        ? data.miners.find((m) => m.id === s.sourceMinerId)
        : undefined;
      setMinerId(s?.sourceMinerId ?? null);
      setDisplayName(s?.displayName ?? "");
      setBonus(s ? String(s.welcomeBonusUsd) : "");
      setRate(
        s?.ratePerKwh != null
          ? String(s.ratePerKwh)
          : source
            ? String(source.realRatePerKwh)
            : "",
      );
      setStored(s?.stored ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = miners.find((m) => m.id === minerId) ?? null;
  const rateNumber = Number(rate);
  const dailyCost =
    selected && Number.isFinite(rateNumber)
      ? selected.powerUsageKw * rateNumber * 24
      : null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/simulated-accounts/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceMinerId: minerId,
          displayName,
          welcomeBonusUsd: Number(bonus),
          ratePerKwh: Number(rate),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save settings");
      setNotice(data.message);
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" fontWeight={700}>
        Simulation settings
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Every simulated account mirrors this miner&apos;s real earnings and is
        charged electricity at the rate below each day at 00:00 UTC. A new rate
        applies from the next charge; a new bonus applies to accounts that start
        from now on.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}
      {!loading && !stored && (
        <Alert severity="info" sx={{ mb: 2 }}>
          These values still come from the server environment. Save once to
          manage them here.
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Stack spacing={2}>
          <Autocomplete
            options={miners}
            value={selected}
            onChange={(_, value) => setMinerId(value?.id ?? null)}
            getOptionLabel={(m) =>
              `${m.name} - ${m.model} - ${m.ownerName} (${m.status})`
            }
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => (
              <TextField {...params} label="Mirrored miner" size="small" />
            )}
          />
          {selected && (
            <Typography variant="caption" color="text.secondary">
              {selected.model}, {selected.powerUsageKw} kW, status{" "}
              {selected.status}. Its real client rate is{" "}
              {selected.realRatePerKwh} USD/kWh.
            </Typography>
          )}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Shown as"
              size="small"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              helperText="The miner's name on simulated accounts"
              fullWidth
            />
            <TextField
              label="Welcome bonus"
              size="small"
              type="number"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">$</InputAdornment>
                ),
              }}
              fullWidth
            />
            <TextField
              label="Electricity rate"
              size="small"
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">USD/kWh</InputAdornment>
                ),
              }}
              helperText={
                dailyCost !== null
                  ? `${formatValue(dailyCost, "currency")} per day`
                  : " "
              }
              fullWidth
            />
          </Stack>
          <Box>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving || !minerId || bonus === "" || rate === ""}
            >
              {saving ? "Saving..." : "Save settings"}
            </Button>
          </Box>
        </Stack>
      )}
    </Paper>
  );
}
