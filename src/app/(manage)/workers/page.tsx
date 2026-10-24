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

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
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
import AdminValueCard from "@/components/admin/AdminValueCard";
import { useDaylight } from "@/lib/daylight";
import {
  DaylightAdminPage,
  DaylightEmptyState,
  DaylightLoading,
  DaylightPageHeader,
  DaylightStatusPill,
  statusLabel,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import { Subaccount, WorkersResponse } from "@/lib/luxor";
import { dedupeWorkers, workerNameKey } from "@/lib/luxorWorkerDedupe";

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
 * Luxor subaccount name -> owning customer's userId, from our PoolAuth rows.
 * Used to collapse a miner that moved between one customer's subaccounts
 * (Luxor keeps the old entry as INACTIVE) without merging two customers'
 * miners that share a name. Empty on failure - rows then fall back to
 * per-subaccount keys, i.e. the shadow stays visible rather than hiding data.
 */
async function loadLuxorSubaccountOwners(): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  try {
    const poolsRes = await fetch("/api/pools");
    if (!poolsRes.ok) return owners;
    const pools: ProxyResponse<Array<{ id: string; name: string }>> =
      await poolsRes.json();
    const luxorPoolId = pools.data?.find((p) => p.name === "Luxor")?.id;
    if (!luxorPoolId) return owners;

    const authsRes = await fetch(`/api/pool-auth?poolId=${luxorPoolId}`);
    if (!authsRes.ok) return owners;
    const auths: ProxyResponse<Array<{ authKey: string; userId: string }>> =
      await authsRes.json();
    for (const a of auths.data || []) owners.set(a.authKey, a.userId);
  } catch (error) {
    console.warn("[Luxor Workers] Could not load subaccount owners:", error);
  }
  return owners;
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
  const { d, fonts } = useDaylight();
  const ds = useDaylightAdminSx();
  const [state, setState] = useState<WorkersState>({
    subaccounts: [],
    workers: [],
    selectedSubaccountNames: [],
    currentPage: 1,
    // Everything in one request: de-duplication and the status filter need
    // the whole list (the table paginates client-side below).
    pageSize: 1000,
    totalItems: 0,
    loading: true,
    error: null,
    statusFilter: "ALL",
  });

  // Subaccount -> owner userId, loaded once on mount (see
  // loadLuxorSubaccountOwners). A ref so fetchWorkers stays stable.
  const subaccountOwnersRef = useRef<Map<string, string>>(new Map());

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
        // The status filter is applied after de-duplication below, not by
        // Luxor: filtering INACTIVE server-side would return a moved miner's
        // stale entry without the ACTIVE twin that should hide it.

        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }

        const data: ProxyResponse<WorkersResponse> = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to fetch workers");
        }

        const workersData = (data.data as WorkersResponse) || {};
        // One row per miner: collapse a stale session in the same subaccount
        // and a moved miner's old-subaccount entry, keyed per owner since
        // names are only unique per customer. Unowned subaccounts key by
        // subaccount.
        const owners = subaccountOwnersRef.current;
        const workersList = dedupeWorkers(
          workersData.workers || [],
          (w) =>
            `${owners.get(w.subaccount_name) ?? `sub:${w.subaccount_name}`}::${workerNameKey(w.name)}`,
        ).filter((w) => statusFilter === "ALL" || w.status === statusFilter);
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

        // Fetch all subaccounts, and who owns each (for de-duplication)
        const [response, owners] = await Promise.all([
          fetch("/api/luxor?endpoint=subaccounts"),
          loadLuxorSubaccountOwners(),
        ]);
        subaccountOwnersRef.current = owners;

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
      <DaylightAdminPage>
        <DaylightLoading />
      </DaylightAdminPage>
    );
  }

  const efficiencyColor = (pct: number) =>
    pct >= 85 ? d.success : pct >= 75 ? d.warning : d.danger;
  // Tabular figures keep the number columns aligned.
  const monoSx = {
    fontSize: 12.5,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
  } as const;

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Workers Management"
        description="Luxor workers across the selected subaccounts."
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={
              isRefreshing || state.selectedSubaccountNames.length === 0
            }
            sx={ds.outlineBtnSx}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      {/* Stats Cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
          gap: { xs: "12px", sm: "16px", md: "20px" },
          mb: { xs: "20px", md: "24px" },
        }}
      >
        <AdminValueCard
          daylight
          title="Total Workers"
          value={stats.totalWorkers}
        />
        <AdminValueCard
          daylight
          title="Active Workers"
          value={stats.activeWorkers}
        />
        <AdminValueCard
          daylight
          title="Inactive Workers"
          value={stats.inactiveWorkers}
        />
        <AdminValueCard
          daylight
          title="Avg Hashrate"
          value={stats.averageHashrate.toFixed(2)}
          subtitle="TH/s"
        />
        <AdminValueCard
          daylight
          title="Avg Efficiency"
          value={`${(stats.averageEfficiency * 100).toFixed(2)}%`}
        />
      </Box>

      {/* Selection Filters */}
      <Box
        component="section"
        aria-labelledby="worker-filters-heading"
        sx={{ ...ds.cardSx, mb: { xs: "20px", md: "24px" } }}
      >
        <Typography
          id="worker-filters-heading"
          component="h2"
          sx={{ ...ds.sectionTitleSx, fontSize: 14, mb: "12px" }}
        >
          Filters
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
            gap: "12px",
            ...ds.inputSx,
          }}
        >
          {/* Subaccounts Multi-Select with Checkboxes */}
          <FormControl fullWidth size="small">
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
          <FormControl fullWidth size="small">
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
        </Box>

        {state.error && (
          <Alert severity="warning" sx={{ mt: 2, ...ds.alertSx("warning") }}>
            {state.error}
          </Alert>
        )}
      </Box>

      {/* Workers Table */}
      {state.selectedSubaccountNames.length === 0 ||
      state.workers.length === 0 ? (
        <DaylightEmptyState>
          <BuildIcon
            sx={{ fontSize: 40, color: d.inputBorder, mb: 1 }}
            aria-hidden
          />
          <Box>
            {state.selectedSubaccountNames.length === 0
              ? "Please select at least one subaccount to view workers."
              : "No workers found for the selected subaccounts."}
          </Box>
        </DaylightEmptyState>
      ) : (
        <Paper elevation={0} sx={{ ...ds.tableCardSx, overflow: "hidden" }}>
          <TableContainer sx={ds.tableSx}>
            <Table>
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
                      direction={sortField === "subaccount" ? sortOrder : "asc"}
                      onClick={() => handleSort("subaccount")}
                    >
                      Subaccount
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={sortField === "hashrate"}
                      direction={sortField === "hashrate" ? sortOrder : "asc"}
                      onClick={() => handleSort("hashrate")}
                    >
                      Hashrate (TH/s)
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={sortField === "efficiency"}
                      direction={sortField === "efficiency" ? sortOrder : "asc"}
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
                      direction={sortField === "lastShare" ? sortOrder : "asc"}
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
                  .map((worker) => {
                    const efficiencyPct = worker.efficiency * 100;
                    return (
                      <TableRow key={worker.id}>
                        <TableCell
                          sx={{ "&&&": { fontWeight: 650, color: d.action } }}
                        >
                          {worker.name}
                        </TableCell>
                        <TableCell sx={{ "&&&": { color: d.muted } }}>
                          {worker.subaccount_name}
                        </TableCell>
                        <TableCell align="right" sx={{ "&&&": monoSx }}>
                          {(worker.hashrate / 1000000000000).toFixed(2)}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            "&&&": {
                              ...monoSx,
                              color: efficiencyColor(efficiencyPct),
                            },
                          }}
                        >
                          {efficiencyPct.toFixed(2)}
                        </TableCell>
                        <TableCell align="center">
                          <DaylightStatusPill
                            label={statusLabel(worker.status)}
                            tone={
                              worker.status === "ACTIVE" ? "success" : "neutral"
                            }
                          />
                        </TableCell>
                        <TableCell
                          sx={{
                            "&&&": {
                              whiteSpace: "nowrap",
                              fontSize: 12,
                              color: d.muted,
                            },
                          }}
                        >
                          {new Date(worker.last_share_time).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination Controls */}
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 1,
              px: "16px",
              py: "10px",
              borderTop: `1px solid ${d.border}`,
            }}
          >
            <Box sx={{ fontSize: 12, color: d.muted }}>
              Showing {Math.min(state.workers.length, tableRowsPerPage)} of{" "}
              {state.workers.length} workers
            </Box>
            <Pagination
              count={Math.ceil(state.workers.length / tableRowsPerPage)}
              page={tableCurrentPage}
              onChange={(_, page) => setTableCurrentPage(page)}
              size="small"
              showFirstButton
              showLastButton
              sx={{
                "& .MuiPaginationItem-root": {
                  fontFamily: fonts.body,
                  fontSize: 12.5,
                  color: d.muted,
                  borderRadius: "8px",
                },
                "& .MuiPaginationItem-root.Mui-selected": {
                  bgcolor: d.skySoft,
                  color: d.action,
                  fontWeight: 650,
                },
              }}
            />
          </Box>
        </Paper>
      )}
    </DaylightAdminPage>
  );
}
