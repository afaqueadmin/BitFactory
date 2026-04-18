/**
 * src/app/(manage)/braiins/page.tsx
 * Braiins Workers Management Page
 *
 * Admin page for viewing Braiins workers across all miners (all clients):
 * - Fetch all Braiins miners from workspace (admin-only)
 * - Select one or more miners via multi-select dropdown
 * - View all workers from selected miners in a single table
 * - Display worker details (name, status, hashrate, last share)
 * - Paginated and sortable results with loading and error handling
 *
 * This page uses secure API routes to fetch miner and worker data
 * with server-side authentication and role-based access control.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
  OutlinedInput,
  Checkbox,
  ListItemText,
} from "@mui/material";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import BuildIcon from "@mui/icons-material/Build";
import GradientStatCard from "@/components/GradientStatCard";

/**
 * Response structure from API proxy routes
 */
interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

/**
 * Braiins miner info from /api/braiins-miners/all
 */
interface BraiinsMinerInfo {
  id: string;
  name: string;
  userId: string;
  userName: string;
}

interface MinersListData {
  miners: BraiinsMinerInfo[];
}

/**
 * Braiins worker data from API
 */
interface BraiinsWorker {
  name: string;
  minerName?: string; // Miner display name for identification
  minerId?: string; // Miner ID for identification
  state: "ok" | "dis" | "low" | "off";
  last_share: number; // Unix timestamp (seconds)
  hash_rate_unit: string;
  hash_rate_5m: number;
  hash_rate_60m: number;
  hash_rate_24h: number;
  shares_5m: number;
  shares_60m: number;
  shares_24h: number;
}

interface WorkersData {
  workers: BraiinsWorker[];
}

/**
 * Component state
 */
interface WorkersState {
  miners: BraiinsMinerInfo[];
  workers: BraiinsWorker[];
  selectedMinerIds: string[];
  currentPage: number;
  pageSize: number;
  totalItems: number;
  loading: boolean;
  error: string | null;
}

/**
 * Statistics for display
 */
interface WorkerStats {
  totalWorkers: number;
  activeWorkers: number;
  inactiveWorkers: number;
  averageHashrate24h: number;
}

// Helper: Map Braiins state to active/inactive
const isWorkerActive = (state: string): boolean => {
  return state === "ok" || state === "low";
};

// Helper: Get status color based on state
const getStatusColor = (
  state: string,
): "success" | "warning" | "error" | "default" => {
  switch (state) {
    case "ok":
      return "success";
    case "low":
      return "warning";
    case "dis":
    case "off":
      return "error";
    default:
      return "default";
  }
};

// Helper: Get status label
const getStatusLabel = (state: string): string => {
  switch (state) {
    case "ok":
      return "OK";
    case "low":
      return "LOW";
    case "dis":
      return "DISABLED";
    case "off":
      return "OFFLINE";
    default:
      return state.toUpperCase();
  }
};

export default function BraiinsWorkersPage() {
  const [state, setState] = useState<WorkersState>({
    miners: [],
    workers: [],
    selectedMinerIds: [],
    currentPage: 1,
    pageSize: 200,
    totalItems: 0,
    loading: true,
    error: null,
  });

  const [stats, setStats] = useState<WorkerStats>({
    totalWorkers: 0,
    activeWorkers: 0,
    inactiveWorkers: 0,
    averageHashrate24h: 0,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI-only pagination for table display (show 20 rows per page)
  const [tableCurrentPage, setTableCurrentPage] = useState(1);
  const tableRowsPerPage = 20;

  // Sort state
  const [sortField, setSortField] = useState<
    "name" | "miner" | "hashrate24h" | "state" | "lastShare"
  >("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  /**
   * Fetch all Braiins miners from workspace
   */
  const fetchMiners = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      console.log("[Braiins Workers] Fetching all miners...");

      const response = await fetch("/api/braiins-miners/all");

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: ProxyResponse<MinersListData> = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch miners");
      }

      const minersList = (data.data as MinersListData)?.miners || [];

      console.log(
        `[Braiins Workers] Successfully fetched ${minersList.length} miners`,
      );

      setState((prev) => ({
        ...prev,
        miners: minersList,
        selectedMinerIds: minersList.map((m) => m.id), // Select all by default
        error: null,
      }));

      // Auto-fetch workers for all selected miners
      if (minersList.length > 0) {
        await fetchWorkers(minersList.map((m) => m.id));
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Braiins Workers] Error fetching miners:", errorMsg);
      setState((prev) => ({
        ...prev,
        error: errorMsg,
      }));
    }
  }, []);

  /**
   * Fetch workers from selected miners
   */
  const fetchWorkers = useCallback(async (minerIds: string[]) => {
    const validIds = minerIds.filter((id) => id && id.trim().length > 0);

    if (!validIds || validIds.length === 0) {
      console.log("[Braiins Workers] No miners selected, clearing workers");
      setState((prev) => ({
        ...prev,
        workers: [],
        totalItems: 0,
        currentPage: 1,
        error: null,
      }));
      setStats({
        totalWorkers: 0,
        activeWorkers: 0,
        inactiveWorkers: 0,
        averageHashrate24h: 0,
      });
      return;
    }

    try {
      setState((prev) => ({ ...prev, error: null }));

      console.log("[Braiins Workers] Fetching workers for miners:", validIds);

      // Use new admin endpoint that handles multiple miners
      const params = new URLSearchParams({
        minerIds: validIds.join(","),
      });

      const response = await fetch(
        `/api/braiins-workers/all?${params.toString()}`,
      );

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: ProxyResponse<WorkersData> = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch workers");
      }

      const workersList = (data.data as WorkersData)?.workers || [];

      console.log(
        `[Braiins Workers] Successfully fetched ${workersList.length} workers`,
      );

      // Calculate statistics
      const activeCount = workersList.filter((w) =>
        isWorkerActive(w.state),
      ).length;
      const inactiveCount = workersList.filter(
        (w) => !isWorkerActive(w.state),
      ).length;
      const avgHashrate24h =
        workersList.length > 0
          ? workersList.reduce((sum, w) => sum + (w.hash_rate_24h || 0), 0) /
            workersList.length
          : 0;

      setStats({
        totalWorkers: workersList.length,
        activeWorkers: activeCount,
        inactiveWorkers: inactiveCount,
        averageHashrate24h: avgHashrate24h,
      });

      setState((prev) => ({
        ...prev,
        workers: workersList,
        totalItems: workersList.length,
        currentPage: 1,
        error: null,
      }));
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Braiins Workers] Error fetching workers:", errorMsg);
      setState((prev) => ({
        ...prev,
        workers: [],
        error: errorMsg,
      }));
    }
  }, []);

  /**
   * Initialize: Fetch miners on component mount
   */
  useEffect(() => {
    fetchMiners();
  }, [fetchMiners]);

  /**
   * Handle miner selection change
   */
  const handleMinerChange = (minerIds: string | string[]) => {
    let selectedIds = Array.isArray(minerIds) ? minerIds : [minerIds];
    selectedIds = selectedIds.filter((id) => id && id.trim().length > 0);

    setState((prev) => ({
      ...prev,
      selectedMinerIds: selectedIds,
      currentPage: 1,
    }));

    if (selectedIds.length > 0) {
      fetchWorkers(selectedIds);
    } else {
      setState((prev) => ({
        ...prev,
        workers: [],
        totalItems: 0,
        error: null,
      }));
      setStats({
        totalWorkers: 0,
        activeWorkers: 0,
        inactiveWorkers: 0,
        averageHashrate24h: 0,
      });
    }
  };

  /**
   * Handle manual refresh
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchWorkers(state.selectedMinerIds);
    } finally {
      setIsRefreshing(false);
    }
  };

  /**
   * Handle table column sorting
   */
  const handleSort = (
    field: "name" | "miner" | "hashrate24h" | "state" | "lastShare",
  ) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  /**
   * Sort workers based on current sort field and order
   */
  const getSortedWorkers = () => {
    const sorted = [...state.workers].sort((a, b) => {
      let compareA: string | number = "";
      let compareB: string | number = "";

      switch (sortField) {
        case "name":
          compareA = a.name || "";
          compareB = b.name || "";
          break;
        case "miner":
          compareA = a.minerName || "";
          compareB = b.minerName || "";
          break;
        case "hashrate24h":
          compareA = a.hash_rate_24h || 0;
          compareB = b.hash_rate_24h || 0;
          break;
        case "state":
          compareA = a.state || "";
          compareB = b.state || "";
          break;
        case "lastShare":
          compareA = a.last_share || 0;
          compareB = b.last_share || 0;
          break;
        default:
          compareA = "";
          compareB = "";
      }

      // String comparison
      if (typeof compareA === "string" && typeof compareB === "string") {
        return sortOrder === "asc"
          ? compareA.localeCompare(compareB)
          : compareB.localeCompare(compareA);
      }

      // Number comparison
      if (typeof compareA === "number" && typeof compareB === "number") {
        return sortOrder === "asc" ? compareA - compareB : compareB - compareA;
      }

      return 0;
    });

    return sorted;
  };

  if (state.loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Title */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 4,
        }}
      >
        <Typography
          variant="h4"
          sx={{
            fontWeight: "bold",
            color: (theme) =>
              theme.palette.mode === "dark" ? "primary.light" : "primary.dark",
          }}
        >
          Braiins Workers Management
        </Typography>

        <Tooltip title="Refresh worker data">
          <IconButton
            onClick={handleRefresh}
            disabled={isRefreshing || state.selectedMinerIds.length === 0}
            sx={{
              background: (theme) =>
                `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
              color: "white",
              "&:hover": {
                background: (theme) =>
                  `linear-gradient(45deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
              },
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stats Cards */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: "medium" }}>
          Worker Statistics
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 2,
          }}
        >
          <GradientStatCard
            title="Total Workers"
            value={String(stats.totalWorkers)}
          />
          <GradientStatCard
            title="Active Workers"
            value={String(stats.activeWorkers)}
          />
          <GradientStatCard
            title="Inactive Workers"
            value={String(stats.inactiveWorkers)}
          />
          <GradientStatCard
            title="Hashrate 24H"
            value={`${stats.averageHashrate24h.toFixed(2)} H/s`}
          />
        </Box>
      </Box>

      {/* Selection Filters */}
      <Paper
        elevation={3}
        sx={{
          p: 3,
          mb: 4,
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
              : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
          backdropFilter: "blur(10px)",
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography variant="h6" sx={{ mb: 2, fontWeight: "medium" }}>
          Filter Options
        </Typography>

        <Stack spacing={2}>
          {/* Miners Multi-Select with Checkboxes */}
          <FormControl fullWidth>
            <InputLabel>Select Miners</InputLabel>
            <Select
              multiple
              value={state.selectedMinerIds}
              onChange={(e) =>
                handleMinerChange(
                  typeof e.target.value === "string"
                    ? e.target.value.split(",")
                    : e.target.value,
                )
              }
              input={<OutlinedInput label="Select Miners" />}
              renderValue={(selected) =>
                `${(selected as string[]).length} miner(s) selected`
              }
            >
              {/* Select All Option */}
              <MenuItem disableRipple>
                <Checkbox
                  checked={
                    state.miners.length > 0 &&
                    state.selectedMinerIds.length === state.miners.length
                  }
                  indeterminate={
                    state.selectedMinerIds.length > 0 &&
                    state.selectedMinerIds.length < state.miners.length
                  }
                  onChange={() => {
                    // If all are selected or partially selected, deselect all
                    if (state.selectedMinerIds.length > 0) {
                      handleMinerChange([]);
                    } else {
                      // If none selected, select all
                      const allIds = state.miners
                        .map((m) => m.id)
                        .filter((id) => id && id.trim().length > 0);
                      if (allIds.length > 0) {
                        handleMinerChange(allIds);
                      }
                    }
                  }}
                />
                <ListItemText primary="Select All" />
              </MenuItem>

              {/* Individual Miners */}
              {state.miners.map((miner) => (
                <MenuItem key={miner.id} value={miner.id}>
                  <Checkbox
                    checked={state.selectedMinerIds.includes(miner.id)}
                  />
                  <ListItemText
                    primary={miner.name}
                    secondary={miner.userName}
                  />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {state.error && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {state.error}
          </Alert>
        )}
      </Paper>

      {/* Workers Table */}
      <Paper
        elevation={3}
        sx={{
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
              : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
          backdropFilter: "blur(10px)",
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: "medium" }}>
            Workers
          </Typography>

          {state.selectedMinerIds.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <BuildIcon
                sx={{
                  fontSize: 64,
                  color: "text.secondary",
                  mb: 2,
                  opacity: 0.5,
                }}
              />
              <Typography color="text.secondary">
                Please select at least one miner to view workers
              </Typography>
            </Box>
          ) : state.workers.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <BuildIcon
                sx={{
                  fontSize: 64,
                  color: "text.secondary",
                  mb: 2,
                  opacity: 0.5,
                }}
              />
              <Typography color="text.secondary">
                No workers found for the selected miners
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer
                sx={{
                  borderRadius: 1,
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  overflow: "hidden",
                }}
              >
                <Table
                  sx={{
                    "& .MuiTableCell-head": {
                      backgroundColor: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(33, 150, 243, 0.15)"
                          : "rgba(33, 150, 243, 0.08)",
                      borderBottom: (theme) =>
                        `2px solid ${theme.palette.primary.main}`,
                      fontWeight: 700,
                      fontSize: "0.875rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: (theme) => theme.palette.primary.main,
                      padding: "16px 12px",
                    },
                    "& .MuiTableCell-body": {
                      padding: "14px 12px",
                      borderBottom: (theme) =>
                        `1px solid ${theme.palette.divider}`,
                    },
                    "& .MuiTableRow-root:hover": {
                      backgroundColor: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(33, 150, 243, 0.08)"
                          : "rgba(33, 150, 243, 0.04)",
                      transition: "background-color 0.2s ease-in-out",
                    },
                    "& .MuiTableRow-root:last-child .MuiTableCell-body": {
                      borderBottom: "none",
                    },
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <TableSortLabel
                          active={sortField === "name"}
                          direction={sortField === "name" ? sortOrder : "asc"}
                          onClick={() => handleSort("name")}
                        >
                          Worker Name
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortField === "miner"}
                          direction={sortField === "miner" ? sortOrder : "asc"}
                          onClick={() => handleSort("miner")}
                        >
                          Miner
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="right">
                        <TableSortLabel
                          active={sortField === "hashrate24h"}
                          direction={
                            sortField === "hashrate24h" ? sortOrder : "asc"
                          }
                          onClick={() => handleSort("hashrate24h")}
                        >
                          Hashrate 24H (H/s)
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="center">
                        <TableSortLabel
                          active={sortField === "state"}
                          direction={sortField === "state" ? sortOrder : "asc"}
                          onClick={() => handleSort("state")}
                        >
                          State
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortField === "lastShare"}
                          direction={
                            sortField === "lastShare" ? sortOrder : "asc"
                          }
                          onClick={() => handleSort("lastShare")}
                        >
                          Last Share
                        </TableSortLabel>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {getSortedWorkers()
                      .slice(
                        (tableCurrentPage - 1) * tableRowsPerPage,
                        tableCurrentPage * tableRowsPerPage,
                      )
                      .map((worker, idx) => (
                        <TableRow
                          key={`${worker.minerName}-${worker.name}`}
                          sx={{
                            backgroundColor:
                              idx % 2 === 0
                                ? "transparent"
                                : (theme) =>
                                    theme.palette.mode === "dark"
                                      ? "rgba(255, 255, 255, 0.02)"
                                      : "rgba(0, 0, 0, 0.01)",
                          }}
                        >
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                color: (theme) => theme.palette.primary.main,
                              }}
                            >
                              {worker.name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{
                                color: "text.secondary",
                              }}
                            >
                              {worker.minerName}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 500,
                                fontFamily: "monospace",
                                color: (theme) => theme.palette.info.main,
                              }}
                            >
                              {worker.hash_rate_24h.toFixed(2)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={getStatusLabel(worker.state)}
                              color={getStatusColor(worker.state)}
                              variant={
                                isWorkerActive(worker.state)
                                  ? "filled"
                                  : "outlined"
                              }
                              size="small"
                              sx={{
                                fontWeight: 600,
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="caption"
                              sx={{
                                color: "text.secondary",
                                display: "block",
                              }}
                            >
                              {new Date(
                                worker.last_share * 1000,
                              ).toLocaleString()}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination Controls */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mt: 2,
                  px: 2,
                  py: 1.5,
                  backgroundColor: (theme) =>
                    theme.palette.mode === "dark"
                      ? "rgba(33, 150, 243, 0.05)"
                      : "rgba(33, 150, 243, 0.03)",
                  borderRadius: "0 0 4px 4px",
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Showing{" "}
                  {Math.min(
                    state.workers.length -
                      (tableCurrentPage - 1) * tableRowsPerPage,
                    tableRowsPerPage,
                  )}{" "}
                  of {state.workers.length} workers
                </Typography>

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Pagination
                    count={Math.ceil(state.workers.length / tableRowsPerPage)}
                    page={tableCurrentPage}
                    onChange={(_, page) => setTableCurrentPage(page)}
                    color="primary"
                    size="small"
                    showFirstButton
                    showLastButton
                  />
                </Box>
              </Box>
            </>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
