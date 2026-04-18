"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
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
} from "@mui/material";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import BuildIcon from "@mui/icons-material/Build";
import GradientStatCard from "@/components/GradientStatCard";

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
            disabled={isRefreshing || !state.selectedCustomerId}
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

      {/* Stats Cards - Only show if workers loaded */}
      {state.selectedCustomerId && state.stats && (
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
              value={String(state.stats.totalWorkers)}
            />
            <GradientStatCard
              title="Active Workers"
              value={String(state.stats.activeWorkers)}
            />
            <GradientStatCard
              title="Inactive Workers"
              value={String(state.stats.inactiveWorkers)}
            />
            <GradientStatCard
              title="Avg Hashrate (5M)"
              value={`${state.stats.averageHashrate.toFixed(2)} TH/s`}
            />
          </Box>
        </Box>
      )}

      {/* Customer Selection */}
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
          Select Braiins Customer
        </Typography>

        <Stack spacing={2}>
          <FormControl fullWidth>
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
        </Stack>

        {state.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
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

          {!state.selectedCustomerId ? (
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
                Please select a customer to view their workers
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
                No workers found for the selected customer
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer
                sx={{
                  borderRadius: 1,
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  overflow: "hidden",
                  mb: 2,
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
                      <TableCell align="right">
                        <TableSortLabel
                          active={sortField === "hashrate"}
                          direction={
                            sortField === "hashrate" ? sortOrder : "asc"
                          }
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
                      .map((worker, idx) => {
                        const statusInfo = getStatusColor(worker.state);
                        return (
                          <TableRow
                            key={worker.name}
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
                                {worker.workerName}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: "text.secondary",
                                }}
                              >
                                {worker.username}
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
                                {worker.hashrate_5m_th.toFixed(2)} TH/s
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
                                {worker.hashrate_24h_th.toFixed(2)} TH/s
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography
                                variant="body2"
                                sx={{
                                  fontFamily: "monospace",
                                }}
                              >
                                {worker.shares_5m}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography
                                variant="body2"
                                sx={{
                                  fontFamily: "monospace",
                                }}
                              >
                                {worker.shares_24h}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={statusInfo.label}
                                color={
                                  statusInfo.color as
                                    | "success"
                                    | "warning"
                                    | "error"
                                    | "default"
                                }
                                variant="outlined"
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{
                                  color: "text.secondary",
                                }}
                              >
                                {worker.last_share_formatted}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              {totalPages > 1 && (
                <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
                  <Pagination
                    count={totalPages}
                    page={tableCurrentPage}
                    onChange={(_e, page) => setTableCurrentPage(page)}
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
