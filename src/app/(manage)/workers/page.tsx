/**
 * src/app/(manage)/workers/page.tsx
 * Luxor Workers Management Page (V2 API)
 *
 * Admin page for viewing Luxor workers across multiple subaccounts:
 * - Fetch all subaccounts from workspace (V2 API)
 * - Select one or more subaccounts via multi-select dropdown
 * - View all workers from selected subaccounts in a single table
 * - Display worker details (name, hashrate, efficiency, status)
 * - Paginated results with loading and error handling
 * - Real-time status and feedback
 *
 * This page uses the secure /api/luxor proxy route to fetch worker data
 * with server-side authentication and authorization.
 *
 * NOTE: Migrated from V1 Groups API to V2 Sites API
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
import { Subaccount, WorkersResponse } from "@/lib/luxor";

/**
 * Response structure from the /api/luxor proxy route
 */
interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

/**
 * Subaccount list response from GET endpoint
 */
interface SubaccountListData {
  subaccounts: Subaccount[];
}

/**
 * Mining currency is fixed to BTC for this page
 */
const CURRENCY = "BTC";

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

/**
 * Luxor can return more than one worker "session" sharing the same
 * subaccount + name (e.g. a stale disconnected session left behind
 * alongside a live one, often from IP-derived worker names being reused
 * by different hardware). Collapse those down to a single row per name,
 * preferring the ACTIVE session, then the one with the most recent share.
 */
function dedupeWorkers(
  workers: WorkersResponse["workers"],
): WorkersResponse["workers"] {
  const byKey = new Map<string, WorkersResponse["workers"][number]>();

  for (const worker of workers) {
    const key = `${worker.subaccount_name}::${worker.name}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, worker);
      continue;
    }

    const existingIsActive = existing.status === "ACTIVE";
    const workerIsActive = worker.status === "ACTIVE";

    if (workerIsActive && !existingIsActive) {
      byKey.set(key, worker);
    } else if (workerIsActive === existingIsActive) {
      const existingTime = new Date(existing.last_share_time).getTime();
      const workerTime = new Date(worker.last_share_time).getTime();
      if (workerTime > existingTime) {
        byKey.set(key, worker);
      }
    }
  }

  return Array.from(byKey.values());
}

/**
 * Component state for managing workers
 */
interface WorkersState {
  subaccounts: Subaccount[];
  workers: WorkersResponse["workers"];
  selectedSubaccountNames: string[];
  currentPage: number;
  pageSize: number;
  totalItems: number;
  loading: boolean;
  error: string | null;
  statusFilter: StatusFilter;
}

/**
 * Statistics for display
 */
interface WorkerStats {
  totalWorkers: number;
  activeWorkers: number;
  inactiveWorkers: number;
  averageHashrate: number;
  averageEfficiency: number;
}

export default function WorkersPage() {
  const [state, setState] = useState<WorkersState>({
    subaccounts: [],
    workers: [],
    selectedSubaccountNames: [],
    currentPage: 1,
    pageSize: 200,
    totalItems: 0,
    loading: true,
    error: null,
    statusFilter: "ALL",
  });

  const [stats, setStats] = useState<WorkerStats>({
    totalWorkers: 0,
    activeWorkers: 0,
    inactiveWorkers: 0,
    averageHashrate: 0,
    averageEfficiency: 0,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI-only pagination for table display (show 20 rows per page)
  const [tableCurrentPage, setTableCurrentPage] = useState(1);
  const tableRowsPerPage = 20;

  // Sort state
  const [sortField, setSortField] = useState<
    "name" | "subaccount" | "hashrate" | "efficiency" | "status" | "lastShare"
  >("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  /**
   * Fetch all subaccounts from workspace
   *
   * Uses V2 API endpoint: GET /pool/subaccounts?page_number=1&page_size=10
   * Fetches all subaccounts across all sites (no site_id filter)
   */
  const fetchSubaccounts = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      console.log("[Luxor Workers] Fetching all subaccounts...");

      const response = await fetch("/api/luxor?endpoint=subaccounts");

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: ProxyResponse<SubaccountListData> = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch subaccounts");
      }

      const subaccountsList =
        (data.data as SubaccountListData)?.subaccounts || [];

      console.log("[Luxor Workers] Response data:", data.data);
      console.log("[Luxor Workers] Parsed subaccounts:", subaccountsList);

      setState((prev) => ({
        ...prev,
        subaccounts: subaccountsList,
        error: null,
      }));

      console.log(
        `[Luxor Workers] Successfully fetched ${subaccountsList.length} subaccounts`,
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Workers] Error fetching subaccounts:", errorMsg);
      setState((prev) => ({
        ...prev,
        error: errorMsg,
      }));
    }
  }, []);

  /**
   * Fetch workers for selected subaccounts
   *
   * Uses V2 API endpoint: GET /pool/workers/{currency}?subaccount_names=...
   * Called when subaccount selection changes or pagination changes
   */
  const fetchWorkers = useCallback(
    async (
      subaccountNames: string[],
      pageNumber: number,
      pageSize: number,
      statusFilter: StatusFilter,
    ) => {
      // Validate input: filter empty strings and ensure we have valid subaccounts
      const validNames = subaccountNames.filter(
        (name) => name && name.trim().length > 0,
      );

      if (!validNames || validNames.length === 0) {
        console.log(
          "[Luxor Workers] No valid subaccounts selected, clearing workers",
        );
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
          averageHashrate: 0,
          averageEfficiency: 0,
        });
        return;
      }

      try {
        setState((prev) => ({ ...prev, error: null }));

        console.log(
          "[Luxor Workers] Fetching workers for subaccounts:",
          validNames,
        );

        // Build query string with validated subaccount names (no spaces, no trailing commas)
        const subaccountNamesParam = validNames.join(",");

        const url = new URL("/api/luxor", window.location.origin);
        url.searchParams.set("endpoint", "workers");
        url.searchParams.set("currency", CURRENCY);
        url.searchParams.set("subaccount_names", subaccountNamesParam);
        url.searchParams.set("page_number", String(pageNumber));
        url.searchParams.set("page_size", String(pageSize));
        if (statusFilter !== "ALL") {
          url.searchParams.set("status", statusFilter);
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }

        const data: ProxyResponse<WorkersResponse> = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to fetch workers");
        }

        const workersData = (data.data as WorkersResponse) || {};
        const workersList = dedupeWorkers(workersData.workers || []);
        const totalItems = workersList.length;

        const activeCount = workersList.filter(
          (w) => w.status === "ACTIVE",
        ).length;
        const inactiveCount = workersList.filter(
          (w) => w.status === "INACTIVE",
        ).length;
        const avgHashrate =
          workersList.length > 0
            ? workersList.reduce((sum, w) => sum + (w.hashrate || 0), 0) /
              workersList.length /
              1000000000000 // Convert from H/s to TH/s
            : 0;
        const avgEfficiency =
          workersList.length > 0
            ? workersList.reduce((sum, w) => sum + (w.efficiency || 0), 0) /
              workersList.length
            : 0;

        setStats({
          totalWorkers: totalItems,
          activeWorkers: activeCount,
          inactiveWorkers: inactiveCount,
          averageHashrate: avgHashrate,
          averageEfficiency: avgEfficiency,
        });

        setState((prev) => ({
          ...prev,
          workers: workersList,
          totalItems,
          currentPage: pageNumber,
          error: null,
        }));

        console.log(
          `[Luxor Workers] Successfully fetched ${workersList.length} workers`,
        );
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error occurred";
        console.error("[Luxor Workers] Error fetching workers:", errorMsg);
        setState((prev) => ({
          ...prev,
          workers: [],
          error: errorMsg,
        }));
      }
    },
    [],
  );

  /**
   * Fetch subaccounts on component mount, then fetch workers for all of them
   */
  useEffect(() => {
    const initializeWorkers = async () => {
      try {
        console.log("[Luxor Workers] Initializing - fetching subaccounts...");

        // Fetch all subaccounts
        const response = await fetch("/api/luxor?endpoint=subaccounts");

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }

        const data: ProxyResponse<SubaccountListData> = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to fetch subaccounts");
        }

        const subaccountsList =
          (data.data as SubaccountListData)?.subaccounts || [];

        console.log(
          `[Luxor Workers] Successfully fetched ${subaccountsList.length} subaccounts`,
        );

        const subaccountNames = subaccountsList.map((s) => s.name); // Select all by default

        setState((prev) => ({
          ...prev,
          subaccounts: subaccountsList,
          selectedSubaccountNames: subaccountNames,
        }));

        if (subaccountNames.length > 0) {
          await fetchWorkers(subaccountNames, 1, state.pageSize, "ALL");
        }

        setState((prev) => ({ ...prev, loading: false }));
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error occurred";
        console.error("[Luxor Workers] Error initializing:", errorMsg);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMsg,
        }));
      }
    };

    initializeWorkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handle subaccount selection change
   */
  const handleSubaccountChange = (subaccountNames: string | string[]) => {
    // Convert to array and filter out empty strings
    let selectedNames = Array.isArray(subaccountNames)
      ? subaccountNames
      : [subaccountNames];

    // Remove empty strings that might result from split operations
    selectedNames = selectedNames.filter(
      (name) => name && name.trim().length > 0,
    );

    // Update state with validated names
    setState((prev) => ({
      ...prev,
      selectedSubaccountNames: selectedNames,
      currentPage: 1, // Reset to first page
    }));

    // Only fetch if we have valid subaccounts selected
    if (selectedNames.length > 0) {
      fetchWorkers(selectedNames, 1, state.pageSize, state.statusFilter);
    } else {
      // Clear workers if no subaccounts selected
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
        averageHashrate: 0,
        averageEfficiency: 0,
      });
    }
  };

  /**
   * Handle status filter change (All / Active / Inactive)
   */
  const handleStatusFilterChange = (
    event: React.ChangeEvent<{ value: unknown }>,
  ) => {
    const statusFilter = event.target.value as StatusFilter;

    setState((prev) => ({
      ...prev,
      statusFilter,
      currentPage: 1, // Reset to first page
    }));

    if (state.selectedSubaccountNames.length > 0) {
      fetchWorkers(
        state.selectedSubaccountNames,
        1,
        state.pageSize,
        statusFilter,
      );
    }
  };

  /**
   * Handle pagination change
   */
  const handlePageChange = (
    _event: React.ChangeEvent<unknown>,
    page: number,
  ) => {
    fetchWorkers(
      state.selectedSubaccountNames,
      page,
      state.pageSize,
      state.statusFilter,
    );
  };

  /**
   * Handle manual refresh
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchWorkers(
        state.selectedSubaccountNames,
        state.currentPage,
        state.pageSize,
        state.statusFilter,
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  /**
   * Handle table column sorting
   */
  const handleSort = (
    field:
      | "name"
      | "subaccount"
      | "hashrate"
      | "efficiency"
      | "status"
      | "lastShare",
  ) => {
    if (sortField === field) {
      // Toggle sort order if clicking the same column
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // Set new sort field and default to ascending
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
        case "subaccount":
          compareA = a.subaccount_name || "";
          compareB = b.subaccount_name || "";
          break;
        case "hashrate":
          compareA = a.hashrate || 0;
          compareB = b.hashrate || 0;
          break;
        case "efficiency":
          compareA = a.efficiency || 0;
          compareB = b.efficiency || 0;
          break;
        case "status":
          compareA = a.status || "";
          compareB = b.status || "";
          break;
        case "lastShare":
          compareA = new Date(a.last_share_time).getTime();
          compareB = new Date(b.last_share_time).getTime();
          break;
        default:
          compareA = "";
          compareB = "";
      }

      // Handle string comparison
      if (typeof compareA === "string" && typeof compareB === "string") {
        return sortOrder === "asc"
          ? compareA.localeCompare(compareB)
          : compareB.localeCompare(compareA);
      }

      // Handle number comparison
      if (typeof compareA === "number" && typeof compareB === "number") {
        return sortOrder === "asc" ? compareA - compareB : compareB - compareA;
      }

      return 0;
    });

    return sorted;
  };

  const totalPages = Math.ceil(state.totalItems / state.pageSize);

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
          Workers Management
        </Typography>

        <Tooltip title="Refresh worker data">
          <IconButton
            onClick={handleRefresh}
            disabled={
              isRefreshing || state.selectedSubaccountNames.length === 0
            }
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
            title="Avg Hashrate"
            value={`${stats.averageHashrate.toFixed(2)} TH/s`}
          />
          <GradientStatCard
            title="Avg Efficiency"
            value={`${(stats.averageEfficiency * 100).toFixed(2)}%`}
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
          {/* Subaccounts Multi-Select with Checkboxes */}
          <FormControl fullWidth>
            <InputLabel>Select Subaccounts</InputLabel>
            <Select
              multiple
              value={state.selectedSubaccountNames}
              onChange={(e) =>
                handleSubaccountChange(
                  typeof e.target.value === "string"
                    ? e.target.value.split(",")
                    : e.target.value,
                )
              }
              input={<OutlinedInput label="Select Subaccounts" />}
              renderValue={(selected) =>
                `${(selected as string[]).length} subaccount(s) selected`
              }
            >
              {/* Select All Option */}
              <MenuItem disableRipple>
                <Checkbox
                  checked={
                    state.subaccounts.length > 0 &&
                    state.selectedSubaccountNames.length ===
                      state.subaccounts.length
                  }
                  indeterminate={
                    state.selectedSubaccountNames.length > 0 &&
                    state.selectedSubaccountNames.length <
                      state.subaccounts.length
                  }
                  onChange={() => {
                    // If all are selected or partially selected, deselect all
                    if (state.selectedSubaccountNames.length > 0) {
                      handleSubaccountChange([]);
                    } else {
                      // If none selected, select all
                      const allNames = state.subaccounts
                        .map((s) => s.name)
                        .filter((name) => name && name.trim().length > 0);
                      if (allNames.length > 0) {
                        handleSubaccountChange(allNames);
                      }
                    }
                  }}
                />
                <ListItemText primary="Select All" />
              </MenuItem>

              {/* Individual Subaccounts */}
              {state.subaccounts.map((subaccount) => (
                <MenuItem key={subaccount.name} value={subaccount.name}>
                  <Checkbox
                    checked={state.selectedSubaccountNames.includes(
                      subaccount.name,
                    )}
                  />
                  <ListItemText primary={subaccount.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Status Select */}
          <FormControl fullWidth>
            <InputLabel>Worker Status</InputLabel>
            <Select
              value={state.statusFilter}
              label="Worker Status"
              onChange={(e) =>
                handleStatusFilterChange(
                  e as React.ChangeEvent<{ value: unknown }>,
                )
              }
            >
              <MenuItem value="ALL">All Statuses</MenuItem>
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="INACTIVE">Inactive</MenuItem>
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

          {state.selectedSubaccountNames.length === 0 ? (
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
                Please select at least one subaccount to view workers
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
                No workers found for the selected subaccounts
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
                          active={sortField === "subaccount"}
                          direction={
                            sortField === "subaccount" ? sortOrder : "asc"
                          }
                          onClick={() => handleSort("subaccount")}
                        >
                          Subaccount
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="right">
                        <TableSortLabel
                          active={sortField === "hashrate"}
                          direction={
                            sortField === "hashrate" ? sortOrder : "asc"
                          }
                          onClick={() => handleSort("hashrate")}
                        >
                          Hashrate (TH/s)
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="right">
                        <TableSortLabel
                          active={sortField === "efficiency"}
                          direction={
                            sortField === "efficiency" ? sortOrder : "asc"
                          }
                          onClick={() => handleSort("efficiency")}
                        >
                          Efficiency (%)
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="center">
                        <TableSortLabel
                          active={sortField === "status"}
                          direction={sortField === "status" ? sortOrder : "asc"}
                          onClick={() => handleSort("status")}
                        >
                          Status
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
                          key={worker.id}
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
                              {worker.subaccount_name}
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
                              {(worker.hashrate / 1000000000000).toFixed(2)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 500,
                                fontFamily: "monospace",
                                color:
                                  worker.efficiency * 100 >= 85
                                    ? (theme) => theme.palette.success.main
                                    : worker.efficiency * 100 >= 75
                                      ? (theme) => theme.palette.warning.main
                                      : (theme) => theme.palette.error.main,
                              }}
                            >
                              {(worker.efficiency * 100).toFixed(2)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={worker.status}
                              color={
                                worker.status === "ACTIVE"
                                  ? "success"
                                  : "default"
                              }
                              variant={
                                worker.status === "ACTIVE"
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
                                worker.last_share_time,
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
                  Showing {Math.min(state.workers.length, tableRowsPerPage)} of{" "}
                  {state.workers.length} workers
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
