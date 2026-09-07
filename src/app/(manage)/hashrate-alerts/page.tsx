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
  TableSortLabel,
} from "@mui/material";
import {
  useHashrateAlerts,
  useAcknowledgeHashrateAlert,
  type HashrateAlertItem,
} from "@/lib/hooks/useHashrateAlerts";

const FILTERS = [
  { value: "false", label: "Pending" },
  { value: "true", label: "Acknowledged" },
  { value: "", label: "All" },
];

type SortField =
  | "miner"
  | "customer"
  | "date"
  | "actual"
  | "benchmark"
  | "shortfall"
  | "status";

export default function HashrateAlertsPage() {
  const [filter, setFilter] = useState("false");
  const { alerts, loading, error, refetch } = useHashrateAlerts(
    filter ? { acknowledged: filter === "true" } : undefined,
  );
  const { mutateAsync: acknowledge, isPending: acknowledging } =
    useAcknowledgeHashrateAlert();

  const [actionError, setActionError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const shortfallPctOf = (alert: HashrateAlertItem) =>
    ((alert.benchmarkHashrate - alert.actualHashrate) /
      alert.benchmarkHashrate) *
    100;

  const sortedAlerts = [...alerts].sort((a, b) => {
    let compareA: string | number = "";
    let compareB: string | number = "";

    switch (sortField) {
      case "miner":
        compareA = a.miner.name || "";
        compareB = b.miner.name || "";
        break;
      case "customer":
        compareA = a.miner.user.name || a.miner.user.companyName || "";
        compareB = b.miner.user.name || b.miner.user.companyName || "";
        break;
      case "date":
        compareA = new Date(a.date).getTime();
        compareB = new Date(b.date).getTime();
        break;
      case "actual":
        compareA = a.actualHashrate || 0;
        compareB = b.actualHashrate || 0;
        break;
      case "benchmark":
        compareA = a.benchmarkHashrate || 0;
        compareB = b.benchmarkHashrate || 0;
        break;
      case "shortfall":
        compareA = shortfallPctOf(a);
        compareB = shortfallPctOf(b);
        break;
      case "status":
        compareA = a.acknowledgedAt ? 1 : 0;
        compareB = b.acknowledgedAt ? 1 : 0;
        break;
    }

    if (typeof compareA === "string" && typeof compareB === "string") {
      return sortOrder === "asc"
        ? compareA.localeCompare(compareB)
        : compareB.localeCompare(compareA);
    }

    if (typeof compareA === "number" && typeof compareB === "number") {
      return sortOrder === "asc" ? compareA - compareB : compareB - compareA;
    }

    return 0;
  });

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
                <TableCell>
                  <TableSortLabel
                    active={sortField === "miner"}
                    direction={sortField === "miner" ? sortOrder : "asc"}
                    onClick={() => handleSort("miner")}
                  >
                    Miner
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortField === "customer"}
                    direction={sortField === "customer" ? sortOrder : "asc"}
                    onClick={() => handleSort("customer")}
                  >
                    Customer
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortField === "date"}
                    direction={sortField === "date" ? sortOrder : "asc"}
                    onClick={() => handleSort("date")}
                  >
                    Date
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortField === "actual"}
                    direction={sortField === "actual" ? sortOrder : "asc"}
                    onClick={() => handleSort("actual")}
                  >
                    Actual
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortField === "benchmark"}
                    direction={sortField === "benchmark" ? sortOrder : "asc"}
                    onClick={() => handleSort("benchmark")}
                  >
                    Benchmark
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortField === "shortfall"}
                    direction={sortField === "shortfall" ? sortOrder : "asc"}
                    onClick={() => handleSort("shortfall")}
                  >
                    Shortfall
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortField === "status"}
                    direction={sortField === "status" ? sortOrder : "asc"}
                    onClick={() => handleSort("status")}
                  >
                    Status
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedAlerts.map((alert) => {
                const shortfallPct = shortfallPctOf(alert);
                return (
                  <TableRow key={alert.id}>
                    <TableCell>{alert.miner.name}</TableCell>
                    <TableCell>
                      {alert.miner.user.name ||
                        alert.miner.user.companyName ||
                        "—"}
                    </TableCell>
                    <TableCell>{alert.date.slice(0, 10)}</TableCell>
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
