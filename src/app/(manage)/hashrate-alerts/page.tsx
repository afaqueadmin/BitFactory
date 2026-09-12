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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import {
  useHashrateAlerts,
  useAcknowledgeHashrateAlert,
  useBulkAcknowledgeHashrateAlerts,
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
  const { mutateAsync: bulkAcknowledge, isPending: bulkAcknowledging } =
    useBulkAcknowledgeHashrateAlerts();

  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [minerFilter, setMinerFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [maxShortfallFilter, setMaxShortfallFilter] = useState("");

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

  const filteredAlerts = alerts.filter((alert) => {
    if (
      minerFilter &&
      !alert.miner.name.toLowerCase().includes(minerFilter.toLowerCase())
    ) {
      return false;
    }
    const customerName =
      alert.miner.user.name || alert.miner.user.companyName || "";
    if (
      customerFilter &&
      !customerName.toLowerCase().includes(customerFilter.toLowerCase())
    ) {
      return false;
    }
    if (dateFilter && alert.date.slice(0, 10) !== dateFilter) {
      return false;
    }
    if (maxShortfallFilter !== "") {
      const maxShortfall = Number(maxShortfallFilter);
      if (!Number.isNaN(maxShortfall) && shortfallPctOf(alert) > maxShortfall) {
        return false;
      }
    }
    return true;
  });

  const sortedAlerts = [...filteredAlerts].sort((a, b) => {
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

  // Bulk Acknowledge applies to whatever the current filters (Status, Miner,
  // Customer, Date) resolve to - not a separate row-selection mechanism -
  // mirroring how Bulk Edit/Delete on the admin miners page always operate
  // on getSortedFilteredMiners().
  const pendingFilteredAlerts = sortedAlerts.filter((a) => !a.acknowledgedAt);

  const handleBulkAcknowledge = async () => {
    setActionError(null);
    try {
      await bulkAcknowledge(pendingFilteredAlerts.map((a) => a.id));
      setBulkDialogOpen(false);
      refetch();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to acknowledge alerts",
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

      <Stack
        direction="row"
        flexWrap="wrap"
        useFlexGap
        justifyContent="space-between"
        alignItems="flex-start"
        sx={{ mb: 3 }}
      >
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
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
          <TextField
            size="small"
            label="Miner"
            value={minerFilter}
            onChange={(e) => setMinerFilter(e.target.value)}
            sx={{ minWidth: 220 }}
          />
          <TextField
            size="small"
            label="Customer"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            sx={{ minWidth: 220 }}
          />
          <TextField
            size="small"
            type="number"
            label="Max Shortfall %"
            value={maxShortfallFilter}
            onChange={(e) => setMaxShortfallFilter(e.target.value)}
            inputProps={{ min: 0, max: 100, step: 0.1 }}
            sx={{ minWidth: 160 }}
          />
          <TextField
            size="small"
            label="Date"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 180 }}
          />
        </Stack>
        <Button
          variant="contained"
          disabled={loading || pendingFilteredAlerts.length === 0}
          onClick={() => setBulkDialogOpen(true)}
        >
          Bulk Acknowledge{" "}
          {pendingFilteredAlerts.length > 0 &&
            `(${pendingFilteredAlerts.length})`}
        </Button>
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
      ) : sortedAlerts.length === 0 ? (
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

      <Dialog
        open={bulkDialogOpen}
        onClose={() => !bulkAcknowledging && setBulkDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Acknowledge {pendingFilteredAlerts.length} Alert
          {pendingFilteredAlerts.length !== 1 ? "s" : ""}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            This will acknowledge every pending alert currently matching your
            filters:
          </DialogContentText>
          <List
            dense
            sx={{
              maxHeight: 240,
              overflowY: "auto",
              bgcolor: "action.hover",
              borderRadius: 1,
            }}
          >
            {pendingFilteredAlerts.slice(0, 10).map((alert) => (
              <ListItem key={alert.id}>
                <ListItemText
                  primary={alert.miner.name}
                  secondary={`${
                    alert.miner.user.name || alert.miner.user.companyName || "—"
                  } · ${alert.date.slice(0, 10)}`}
                />
              </ListItem>
            ))}
          </List>
          {pendingFilteredAlerts.length > 10 && (
            <Typography variant="caption" color="text.secondary">
              ...and {pendingFilteredAlerts.length - 10} more.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBulkDialogOpen(false)}
            disabled={bulkAcknowledging}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleBulkAcknowledge}
            disabled={bulkAcknowledging}
          >
            {bulkAcknowledging ? "Acknowledging..." : "Acknowledge"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
