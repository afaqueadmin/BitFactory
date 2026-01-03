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
  currency: "BTC" | "LTC" | "DOGE" | "ZEC" | "ZEN" | "LTC_DOGE" | "SC";
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
    pageSize: 1000,
    totalItems: 0,
    loading: true,
    error: null,
    currency: "BTC",
  });

  const [stats, setStats] = useState<WorkerStats>({
    totalWorkers: 0,
    activeWorkers: 0,
    inactiveWorkers: 0,
    averageHashrate: 0,
    averageEfficiency: 0,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

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
      currency: string,
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

        const response = await fetch(
          `/api/luxor?endpoint=workers&currency=${currency}&page_number=${pageNumber}&page_size=${pageSize}`,
        );

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }

        const data: ProxyResponse<WorkersResponse> = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to fetch workers");
        }

        const workersData = (data.data as WorkersResponse) || {};
        const workersList = workersData.workers || [];
        const totalItems = workersData.pagination?.item_count || 0;

        // Calculate statistics
        const activeCount = workersList.filter(
          (w) => w.status === "ACTIVE",
        ).length;
        const inactiveCount = workersList.filter(
          (w) => w.status === "INACTIVE",
        ).length;
        // @TODO: These should not be calculated client-side in the long term
        const avgHashrate =
          workersList.length > 0
            ? workersList.reduce((sum, w) => sum + (w.hashrate || 0), 0) /
              workersList.length
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
   * Fetch subaccounts on component mount
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

        setState((prev) => ({
          ...prev,
          subaccounts: subaccountsList,
          selectedSubaccountNames: subaccountsList.map((s) => s.name), // Select all by default
        }));

        // Fetch workers for all subaccounts (no spaces in format)
        if (subaccountsList.length > 0) {
          const subaccountNames = subaccountsList.map((s) => s.name);
          const subaccountNamesParam = subaccountNames.join(",");

          const workersResponse = await fetch(
            `/api/luxor?endpoint=workers&currency=BTC&page_number=1&page_size=1000`,
          );

          if (!workersResponse.ok) {
            throw new Error(`API returned status ${workersResponse.status}`);
          }

          const workersData: ProxyResponse<WorkersResponse> =
            await workersResponse.json();

          if (!workersData.success) {
            throw new Error(workersData.error || "Failed to fetch workers");
          }

          const workersDataObj = (workersData.data as WorkersResponse) || {};
          const workersList = workersDataObj.workers || [];
          const totalItems = workersDataObj.pagination?.item_count || 0;

          // Calculate statistics
          const activeCount = workersList.filter(
            (w) => w.status === "ACTIVE",
          ).length;
          const inactiveCount = workersList.filter(
            (w) => w.status === "INACTIVE",
          ).length;
          const avgHashrate =
            workersList.length > 0
              ? workersList.reduce((sum, w) => sum + (w.hashrate || 0), 0) /
                workersList.length
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
            averageHashrate: avgHashrate / 1000000000000, // Convert from H/s to TH/s,
            averageEfficiency: avgEfficiency,
          });

          setState((prev) => ({
            ...prev,
            workers: workersList,
            totalItems,
            loading: false,
            error: null,
          }));

          console.log(
            `[Luxor Workers] Successfully fetched ${workersList.length} workers`,
          );
        } else {
          setState((prev) => ({
            ...prev,
            workers: [],
            totalItems: 0,
            loading: false,
            error: null,
          }));
        }
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
      fetchWorkers(selectedNames, 1, state.pageSize, state.currency);
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
   * Handle currency change
   */
  const handleCurrencyChange = (
    event: React.ChangeEvent<{ value: unknown }>,
  ) => {
    const currency = event.target.value as WorkersState["currency"];

    setState((prev) => ({
      ...prev,
      currency,
      currentPage: 1, // Reset to first page
    }));

    if (state.selectedSubaccountNames.length > 0) {
      fetchWorkers(state.selectedSubaccountNames, 1, state.pageSize, currency);
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
      state.currency,
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
        state.currency,
      );
    } finally {
      setIsRefreshing(false);
    }
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

          {/* Currency Select */}
          <FormControl fullWidth>
            <InputLabel>Mining Currency</InputLabel>
            <Select
              value={state.currency}
              label="Mining Currency"
              onChange={(e) =>
                handleCurrencyChange(e as React.ChangeEvent<{ value: unknown }>)
              }
            >
              <MenuItem value="BTC">Bitcoin (BTC)</MenuItem>
              <MenuItem value="LTC">Litecoin (LTC)</MenuItem>
              <MenuItem value="DOGE">Dogecoin (DOGE)</MenuItem>
              <MenuItem value="ZEC">Zcash (ZEC)</MenuItem>
              <MenuItem value="ZEN">Horizen (ZEN)</MenuItem>
              <MenuItem value="LTC_DOGE">LTC+DOGE</MenuItem>
              <MenuItem value="SC">Siacoin (SC)</MenuItem>
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
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "background.default" }}>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        Worker Name
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        Subaccount
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        Hashrate (TH/s)
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        Efficiency (%)
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        Last Share
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {state.workers.map((worker) => (
                      <TableRow
                        key={`${worker.subaccount_name}-${worker.name}`}
                        sx={{
                          "&:hover": {
                            backgroundColor: "background.default",
                          },
                        }}
                      >
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {worker.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {worker.subaccount_name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {(worker.hashrate / 1000000000000).toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {(worker.efficiency * 100).toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={worker.status}
                            color={
                              worker.status === "ACTIVE" ? "success" : "default"
                            }
                            variant="outlined"
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {new Date(worker.last_share_time).toLocaleString()}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              {totalPages > 1 && (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    mt: 3,
                  }}
                >
                  <Pagination
                    count={totalPages}
                    page={state.currentPage}
                    onChange={handlePageChange}
                    color="primary"
                  />
                </Box>
              )}
            </>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
