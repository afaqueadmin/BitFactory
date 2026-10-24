"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Typography,
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
} from "@mui/material";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import BuildIcon from "@mui/icons-material/Build";
import AdminValueCard from "@/components/admin/AdminValueCard";
import { useDaylight } from "@/lib/daylight";
import {
  CellNote,
  DaylightAdminPage,
  DaylightEmptyState,
  DaylightLoading,
  DaylightPageHeader,
  DaylightStatusPill,
  type DaylightTone,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

/** MUI chip colour -> Daylight pill tone. */
const PILL_TONE: Record<string, DaylightTone> = {
  success: "success",
  warning: "warning",
  error: "danger",
  default: "neutral",
};

interface Customer {
  id: string;
  poolAuthId: string;
  userId: string;
  name: string;
  email: string;
  hasAuthKey: boolean;
  createdAt: string;
}

interface WorkerStats {
  totalWorkers: number;
  activeWorkers: number;
  inactiveWorkers: number;
  averageHashrate: number;
  lowStatusWorkers: number;
  disabledWorkers: number;
  offlineWorkers: number;
}

interface Worker {
  name: string;
  username: string;
  workerName: string;
  state: "ok" | "dis" | "low" | "off";
  hashrate_5m_gh: number;
  hashrate_5m_th: number;
  hashrate_24h_th: number;
  shares_5m: number;
  shares_24h: number;
  last_share: number;
  last_share_formatted: string;
}

interface PageState {
  customers: Customer[];
  selectedCustomerId: string | null;
  workers: Worker[];
  stats: WorkerStats | null;
  currentPage: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
}

export default function BraiinsWorkersPage() {
  const { d, fonts } = useDaylight();
  const ds = useDaylightAdminSx();
  const [state, setState] = useState<PageState>({
    customers: [],
    selectedCustomerId: null,
    workers: [],
    stats: null,
    currentPage: 1,
    pageSize: 20,
    loading: true,
    error: null,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI-only pagination for table display
  const [tableCurrentPage, setTableCurrentPage] = useState(1);
  const tableRowsPerPage = 20;

  // Sort state
  const [sortField, setSortField] = useState<
    "name" | "hashrate" | "status" | "lastShare"
  >("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  /**
   * Fetch all Braiins customers on component mount
   */
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        console.log("[Braiins Workers] Fetching customers...");

        const response = await fetch("/api/braiins-customers");

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.message || "Failed to fetch customers");
        }

        const customers = data.data?.customers || [];

        console.log(`[Braiins Workers] Found ${customers.length} customers`);

        setState((prev) => ({
          ...prev,
          customers,
          loading: false,
          error: null,
        }));
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error occurred";
        console.error("[Braiins Workers] Error fetching customers:", errorMsg);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMsg,
        }));
      }
    };

    fetchCustomers();
  }, []);

  /**
   * Fetch workers for selected customer
   */
  const fetchWorkers = useCallback(async (poolAuthId: string) => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      console.log(
        `[Braiins Workers] Fetching workers for customer: ${poolAuthId}`,
      );

      const response = await fetch(
        `/api/braiins-workers?poolAuthId=${poolAuthId}`,
      );

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch workers");
      }

      const workers = data.data?.workers || [];
      const stats = data.data?.stats || null;

      console.log(`[Braiins Workers] Fetched ${workers.length} workers`);

      setState((prev) => ({
        ...prev,
        workers,
        stats,
        currentPage: 1,
        error: null,
      }));

      setTableCurrentPage(1);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Braiins Workers] Error fetching workers:", errorMsg);
      setState((prev) => ({
        ...prev,
        workers: [],
        stats: null,
        error: errorMsg,
      }));
    }
  }, []);

  /**
   * Handle customer selection
   */
  const handleCustomerChange = (event: { target: { value: string } }) => {
    const customerId = event.target.value;
    setState((prev) => ({
      ...prev,
      selectedCustomerId: customerId,
    }));

    if (customerId) {
      fetchWorkers(customerId);
    } else {
      setState((prev) => ({
        ...prev,
        workers: [],
        stats: null,
      }));
    }
  };

  /**
   * Handle manual refresh
   */
  const handleRefresh = async () => {
    if (!state.selectedCustomerId) return;

    setIsRefreshing(true);
    try {
      await fetchWorkers(state.selectedCustomerId);
    } finally {
      setIsRefreshing(false);
    }
  };

  /**
   * Handle table column sorting
   */
  const handleSort = (field: "name" | "hashrate" | "status" | "lastShare") => {
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
          compareA = a.workerName || "";
          compareB = b.workerName || "";
          break;
        case "hashrate":
          compareA = a.hashrate_5m_th || 0;
          compareB = b.hashrate_5m_th || 0;
          break;
        case "status":
          compareA = a.state || "";
          compareB = b.state || "";
          break;
        case "lastShare":
          compareA = a.last_share;
          compareB = b.last_share;
          break;
        default:
          compareA = "";
          compareB = "";
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

    return sorted;
  };

  /**
   * Get status color and label
   */
  const getStatusColor = (state: string) => {
    switch (state) {
      case "ok":
        return { color: "success", label: "Active" };
      case "low":
        return { color: "warning", label: "Low" };
      case "dis":
        return { color: "default", label: "Disabled" };
      case "off":
        return { color: "error", label: "Offline" };
      default:
        return { color: "default", label: state };
    }
  };

  const totalPages = Math.ceil(state.workers.length / tableRowsPerPage);

  if (state.loading) {
    return (
      <DaylightAdminPage>
        <DaylightLoading />
      </DaylightAdminPage>
    );
  }

  const numSx = {
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  } as const;

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Braiins Workers Management"
        description="Braiins workers for the selected customer."
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={isRefreshing || !state.selectedCustomerId}
            sx={ds.outlineBtnSx}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      {/* Stats Cards - Only show if workers loaded */}
      {state.selectedCustomerId && state.stats && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
            gap: { xs: "12px", sm: "16px", md: "20px" },
            mb: { xs: "20px", md: "24px" },
          }}
        >
          <AdminValueCard
            daylight
            title="Total Workers"
            value={state.stats.totalWorkers}
          />
          <AdminValueCard
            daylight
            title="Active Workers"
            value={state.stats.activeWorkers}
          />
          <AdminValueCard
            daylight
            title="Inactive Workers"
            value={state.stats.inactiveWorkers}
          />
          <AdminValueCard
            daylight
            title="Avg Hashrate (5M)"
            value={state.stats.averageHashrate.toFixed(2)}
            subtitle="TH/s"
          />
        </Box>
      )}

      {/* Customer Selection */}
      <Box
        component="section"
        aria-labelledby="braiins-customer-heading"
        sx={{ ...ds.cardSx, mb: { xs: "20px", md: "24px" } }}
      >
        <Typography
          id="braiins-customer-heading"
          component="h2"
          sx={{ ...ds.sectionTitleSx, fontSize: 14, mb: "12px" }}
        >
          Select Braiins Customer
        </Typography>
        <Box sx={{ maxWidth: 560, ...ds.inputSx }}>
          <FormControl fullWidth size="small">
            <InputLabel>Braiins Customer</InputLabel>
            <Select
              value={state.selectedCustomerId || ""}
              label="Braiins Customer"
              onChange={handleCustomerChange}
            >
              <MenuItem value="">
                <em>Select a customer...</em>
              </MenuItem>
              {state.customers.map((customer) => (
                <MenuItem key={customer.poolAuthId} value={customer.poolAuthId}>
                  {customer.name} ({customer.email})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {state.error && (
          <Alert severity="error" sx={{ mt: 2, ...ds.alertSx("error") }}>
            {state.error}
          </Alert>
        )}
      </Box>

      {/* Workers Table */}
      {!state.selectedCustomerId || state.workers.length === 0 ? (
        <DaylightEmptyState>
          <BuildIcon
            sx={{ fontSize: 40, color: d.inputBorder, mb: 1 }}
            aria-hidden
          />
          <Box>
            {!state.selectedCustomerId
              ? "Please select a customer to view their workers."
              : "No workers found for the selected customer."}
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
                  <TableCell align="right">
                    <TableSortLabel
                      active={sortField === "hashrate"}
                      direction={sortField === "hashrate" ? sortOrder : "asc"}
                      onClick={() => handleSort("hashrate")}
                    >
                      Hashrate (5m)
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">Hashrate (24h)</TableCell>
                  <TableCell align="right">Shares (5m)</TableCell>
                  <TableCell align="right">Shares (24h)</TableCell>
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
                    const statusInfo = getStatusColor(worker.state);
                    return (
                      <TableRow key={worker.name}>
                        <TableCell>
                          <Box
                            component="span"
                            sx={{ fontWeight: 650, color: d.action }}
                          >
                            {worker.workerName}
                          </Box>
                          <CellNote>{worker.username}</CellNote>
                        </TableCell>
                        <TableCell align="right" sx={{ "&&&": numSx }}>
                          {worker.hashrate_5m_th.toFixed(2)} TH/s
                        </TableCell>
                        <TableCell align="right" sx={{ "&&&": numSx }}>
                          {worker.hashrate_24h_th.toFixed(2)} TH/s
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{ "&&&": { ...numSx, fontWeight: 500 } }}
                        >
                          {worker.shares_5m}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{ "&&&": { ...numSx, fontWeight: 500 } }}
                        >
                          {worker.shares_24h}
                        </TableCell>
                        <TableCell align="center">
                          <DaylightStatusPill
                            label={statusInfo.label}
                            tone={PILL_TONE[statusInfo.color] ?? "neutral"}
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
                          {worker.last_share_formatted}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          {totalPages > 1 && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                px: "16px",
                py: "10px",
                borderTop: `1px solid ${d.border}`,
              }}
            >
              <Pagination
                count={totalPages}
                page={tableCurrentPage}
                onChange={(_e, page) => setTableCurrentPage(page)}
                size="small"
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
          )}
        </Paper>
      )}
    </DaylightAdminPage>
  );
}
