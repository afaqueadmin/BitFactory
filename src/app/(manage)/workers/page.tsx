/**
 * src/app/(manage)/workers/page.tsx
 * Luxor Workers Management Page
 *
 * Admin page for viewing Luxor workers across multiple subaccounts:
 * - Select one or more subaccounts via multi-select dropdown
 * - View all workers from selected subaccounts in a single table
 * - Display worker details (name, hashrate, efficiency, status)
 * - Paginated results with loading and error handling
 * - Real-time status and feedback
 *
 * This page uses the secure /api/luxor proxy route to fetch worker data
 * with server-side authentication and authorization.
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
} from "@mui/material";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import BuildIcon from "@mui/icons-material/Build";
import GradientStatCard from "@/components/GradientStatCard";
import {
  GetGroupResponse,
  GetSubaccountResponse,
  WorkersResponse,
} from "@/lib/luxor";

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
 * Component state for managing workers
 */
interface WorkersState {
  groups: GetGroupResponse[];
  subaccounts: GetSubaccountResponse[];
  workers: WorkersResponse["workers"];
  selectedGroupIds: string[];
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
    groups: [],
    subaccounts: [],
    workers: [],
    selectedGroupIds: [],
    selectedSubaccountNames: [],
    currentPage: 1,
    pageSize: 20,
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
   * Fetch all workspace groups on component mount
   *
   * Mirrors the same logic as the Subaccounts page
   */
  const fetchGroups = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      console.log("[Luxor Workers] Fetching workspace groups...");

      const response = await fetch("/api/luxor?endpoint=workspace");

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: ProxyResponse<Record<string, unknown>> =
        await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch groups");
      }

      // Extract groups array from workspace data
      const workspaceData = data.data as Record<string, unknown>;
      let groupsList: GetGroupResponse[] = [];

      if (workspaceData && Array.isArray(workspaceData.groups)) {
        groupsList = (
          workspaceData.groups as Array<Record<string, unknown>>
        ).map(
          (group: Record<string, unknown>) =>
            ({
              id: String(group.id || ""),
              name: String(group.name || ""),
              type:
                (group.type as
                  | "UNSPECIFIED"
                  | "POOL"
                  | "DERIVATIVES"
                  | "HARDWARE") || "UNSPECIFIED",
              url: String(group.url || ""),
              members: Array.isArray(group.members)
                ? (group.members as Array<Record<string, unknown>>)
                : [],
              subaccounts: Array.isArray(group.subaccounts)
                ? (group.subaccounts as Array<Record<string, unknown>>)
                : [],
            }) as unknown as GetGroupResponse,
        );
      }

      setState((prev) => ({
        ...prev,
        groups: groupsList,
        loading: false,
        error: null,
      }));

      console.log(
        `[Luxor Workers] Successfully fetched ${groupsList.length} groups`,
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Workers] Error fetching groups:", errorMsg);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMsg,
      }));
    }
  }, []);

  /**
   * Fetch subaccounts for selected groups
   *
   * Called when group selection changes
   */
  const fetchSubaccounts = useCallback(async (groupIds: string[]) => {
    if (!groupIds || groupIds.length === 0) {
      setState((prev) => ({
        ...prev,
        subaccounts: [],
        selectedSubaccountNames: [],
        workers: [],
        error: null,
      }));
      return;
    }

    try {
      setState((prev) => ({ ...prev, error: null }));

      console.log("[Luxor Workers] Fetching subaccounts for groups:", groupIds);

      const allSubaccounts: Array<
        GetSubaccountResponse & { _groupId: string }
      > = [];
      let hasErrors = false;
      let lastError: string | null = null;

      // Fetch subaccounts from each group
      for (const groupId of groupIds) {
        try {
          const response = await fetch(
            `/api/luxor?endpoint=subaccount&groupId=${groupId}`,
          );

          if (!response.ok) {
            hasErrors = true;
            lastError = `Group error: API returned status ${response.status}`;
            console.warn(
              `[Luxor Workers] Error fetching for group ${groupId}:`,
              lastError,
            );
            continue;
          }

          const data: ProxyResponse<{ subaccounts: GetSubaccountResponse[] }> =
            await response.json();

          if (!data.success) {
            hasErrors = true;
            lastError = data.error || "Failed to fetch subaccounts";
            console.warn(
              `[Luxor Workers] API error for group ${groupId}:`,
              lastError,
            );
            continue;
          }

          const subaccountsList =
            (data.data as { subaccounts: GetSubaccountResponse[] })
              ?.subaccounts || [];
          const subaccountsWithGroup = subaccountsList.map((sub) => ({
            ...sub,
            _groupId: groupId,
          }));

          allSubaccounts.push(...subaccountsWithGroup);
        } catch (error) {
          hasErrors = true;
          lastError = error instanceof Error ? error.message : "Unknown error";
          console.error(
            `[Luxor Workers] Exception fetching for group ${groupId}:`,
            lastError,
          );
        }
      }

      setState((prev) => ({
        ...prev,
        subaccounts: allSubaccounts,
        error: hasErrors && lastError ? `Partial error: ${lastError}` : null,
      }));

      console.log(
        `[Luxor Workers] Successfully fetched ${allSubaccounts.length} subaccounts`,
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Workers] Error fetching subaccounts:", errorMsg);
      setState((prev) => ({
        ...prev,
        subaccounts: [],
        error: errorMsg,
      }));
    }
  }, []);

  /**
   * Fetch workers for selected subaccounts
   *
   * Called when subaccount selection changes or pagination changes
   */
  const fetchWorkers = useCallback(
    async (
      subaccountNames: string[],
      pageNumber: number,
      pageSize: number,
      currency: string,
    ) => {
      if (!subaccountNames || subaccountNames.length === 0) {
        setState((prev) => ({
          ...prev,
          workers: [],
          totalItems: 0,
          currentPage: 1,
          error: null,
        }));
        return;
      }

      try {
        setState((prev) => ({ ...prev, error: null }));

        console.log(
          "[Luxor Workers] Fetching workers for subaccounts:",
          subaccountNames,
        );

        // Build query string with multiple subaccount names
        const subaccountNamesParam = subaccountNames.join(",");

        const response = await fetch(
          `/api/luxor?endpoint=workers&currency=${currency}&subaccount_names=${subaccountNamesParam}&page_number=${pageNumber}&page_size=${pageSize}&status=ACTIVE`,
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
   * Fetch groups on component mount
   */
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  /**
   * Handle group selection change
   */
  const handleGroupChange = (groupIds: string | string[]) => {
    const selectedIds = Array.isArray(groupIds) ? groupIds : [groupIds];

    setState((prev) => ({
      ...prev,
      selectedGroupIds: selectedIds,
      currentPage: 1, // Reset to first page
    }));

    fetchSubaccounts(selectedIds);
  };

  /**
   * Handle subaccount selection change
   */
  const handleSubaccountChange = (subaccountNames: string | string[]) => {
    const selectedNames = Array.isArray(subaccountNames)
      ? subaccountNames
      : [subaccountNames];

    setState((prev) => ({
      ...prev,
      selectedSubaccountNames: selectedNames,
      currentPage: 1, // Reset to first page
    }));

    fetchWorkers(selectedNames, 1, state.pageSize, state.currency);
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
          <GradientStatCard title="Total Workers" value={stats.totalWorkers} />
          <GradientStatCard
            title="Active Workers"
            value={stats.activeWorkers}
          />
          <GradientStatCard
            title="Inactive Workers"
            value={stats.inactiveWorkers}
          />
          <GradientStatCard
            title="Avg Hashrate"
            value={`${stats.averageHashrate.toFixed(2)} TH/s`}
          />
          <GradientStatCard
            title="Avg Efficiency"
            value={`${stats.averageEfficiency.toFixed(2)}%`}
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
          {/* Groups Multi-Select */}
          <FormControl fullWidth>
            <InputLabel>Groups</InputLabel>
            <Select
              multiple
              value={state.selectedGroupIds}
              onChange={(e) =>
                handleGroupChange(
                  typeof e.target.value === "string"
                    ? e.target.value.split(",")
                    : e.target.value,
                )
              }
              input={<OutlinedInput label="Groups" />}
              disabled={state.groups.length === 0 || state.loading}
            >
              {state.groups.map((group) => (
                <MenuItem key={group.id} value={group.id}>
                  {group.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Subaccounts Multi-Select */}
          <FormControl fullWidth>
            <InputLabel>Subaccounts</InputLabel>
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
              input={<OutlinedInput label="Subaccounts" />}
              disabled={
                state.subaccounts.length === 0 ||
                state.selectedGroupIds.length === 0
              }
            >
              {state.subaccounts.map((subaccount) => (
                <MenuItem key={subaccount.id} value={subaccount.name}>
                  {subaccount.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Currency Select */}
          <FormControl fullWidth>
            <InputLabel>Currency</InputLabel>
            <Select
              value={state.currency}
              label="Currency"
              onChange={(e) =>
                handleCurrencyChange(e as React.ChangeEvent<{ value: unknown }>)
              }
            >
              <MenuItem value="BTC">Bitcoin (BTC)</MenuItem>
              <MenuItem value="LTC">Litecoin (LTC)</MenuItem>
              <MenuItem value="DOGE">Dogecoin (DOGE)</MenuItem>
              <MenuItem value="ZEC">Zcash (ZEC)</MenuItem>
              <MenuItem value="ZEN">Horizen (ZEN)</MenuItem>
              <MenuItem value="LTC_DOGE">LTC/DOGE</MenuItem>
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

          {state.loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
              <CircularProgress />
            </Box>
          ) : state.selectedSubaccountNames.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }}>
              Select at least one subaccount to view workers
            </Typography>
          ) : state.workers.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }}>
              No workers found
            </Typography>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Worker Name</TableCell>
                      <TableCell>Subaccount</TableCell>
                      <TableCell>Firmware</TableCell>
                      <TableCell align="right">Hashrate (TH/s)</TableCell>
                      <TableCell align="right">Efficiency (%)</TableCell>
                      <TableCell align="right">Stale Shares</TableCell>
                      <TableCell align="right">Rejected Shares</TableCell>
                      <TableCell>Last Share</TableCell>
                      <TableCell align="center">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {state.workers.map((worker) => (
                      <TableRow
                        key={worker.id}
                        sx={{
                          "&:last-child td, &:last-child th": { border: 0 },
                          "&:hover": {
                            backgroundColor: "action.hover",
                          },
                        }}
                      >
                        <TableCell component="th" scope="row">
                          {worker.name}
                        </TableCell>
                        <TableCell>{worker.subaccount_name}</TableCell>
                        <TableCell>{worker.firmware}</TableCell>
                        <TableCell align="right">
                          {worker.hashrate?.toFixed(2) || "N/A"}
                        </TableCell>
                        <TableCell align="right">
                          {worker.efficiency?.toFixed(2) || "N/A"}
                        </TableCell>
                        <TableCell align="right">
                          {worker.stale_shares || 0}
                        </TableCell>
                        <TableCell align="right">
                          {worker.rejected_shares || 0}
                        </TableCell>
                        <TableCell>
                          {worker.last_share_time
                            ? new Date(worker.last_share_time).toLocaleString()
                            : "Never"}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={worker.status}
                            color={
                              worker.status === "ACTIVE"
                                ? "success"
                                : worker.status === "INACTIVE"
                                  ? "warning"
                                  : "default"
                            }
                            size="small"
                          />
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
                    pt: 2,
                    borderTop: "1px solid",
                    borderColor: "divider",
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
