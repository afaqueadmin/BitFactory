"use client";

import React, { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  TextField,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  CircularProgress,
  Alert,
} from "@mui/material";
import {
  useHashrateAlerts,
  useAcknowledgeHashrateAlert,
} from "@/lib/hooks/useHashrateAlerts";

const FILTERS = [
  { value: "false", label: "Pending" },
  { value: "true", label: "Acknowledged" },
  { value: "", label: "All" },
];

export default function HashrateAlertsPage() {
  const [filter, setFilter] = useState("false");
  const { alerts, loading, error, refetch } = useHashrateAlerts(
    filter ? { acknowledged: filter === "true" } : undefined,
  );
  const { mutateAsync: acknowledge, isPending: acknowledging } =
    useAcknowledgeHashrateAlert();

  const [actionError, setActionError] = useState<string | null>(null);

  const handleAcknowledge = async (id: string) => {
    setActionError(null);
    try {
      await acknowledge(id);
      refetch();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to acknowledge alert",
      );
    }
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
        Hashrate Alerts
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Miners whose previous day&apos;s hashrate fell below their configured
        benchmark, as detected by cron_hashrate_benchmark_alert.
      </Typography>

      <Stack direction="row" sx={{ mb: 3 }}>
        <TextField
          select
          size="small"
          label="Status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          {FILTERS.map((f) => (
            <MenuItem key={f.value} value={f.value}>
              {f.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : alerts.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No alerts found.
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Miner</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Actual</TableCell>
                <TableCell align="right">Benchmark</TableCell>
                <TableCell align="right">Shortfall</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.map((alert) => {
                const shortfallPct =
                  ((alert.benchmarkHashrate - alert.actualHashrate) /
                    alert.benchmarkHashrate) *
                  100;
                return (
                  <TableRow key={alert.id}>
                    <TableCell>{alert.miner.name}</TableCell>
                    <TableCell>
                      {alert.miner.user.companyName ||
                        alert.miner.user.name ||
                        "—"}
                    </TableCell>
                    <TableCell>{alert.date}</TableCell>
                    <TableCell align="right">
                      {Number(alert.actualHashrate).toFixed(2)} TH/s
                    </TableCell>
                    <TableCell align="right">
                      {Number(alert.benchmarkHashrate).toFixed(2)} TH/s
                    </TableCell>
                    <TableCell align="right">
                      {shortfallPct.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      {alert.acknowledgedAt ? (
                        <Chip
                          label="Acknowledged"
                          size="small"
                          color="success"
                        />
                      ) : (
                        <Chip label="Pending" size="small" color="warning" />
                      )}
                      {alert.acknowledgedBy && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                        >
                          by{" "}
                          {alert.acknowledgedBy.name ||
                            alert.acknowledgedBy.email}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {!alert.acknowledgedAt && (
                        <Button
                          size="small"
                          variant="contained"
                          disabled={acknowledging}
                          onClick={() => handleAcknowledge(alert.id)}
                        >
                          Acknowledge
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
