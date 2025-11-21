/**
 * Workers Management Page
 *
 * Displays detailed information about mining workers including:
 * - Worker list with real-time status
 * - Hashrate and efficiency metrics
 * - Pagination and filtering
 * - Search functionality
 * - Status indicators (Active/Inactive)
 *
 * This is a client-side page that fetches data from /api/luxor proxy route.
 */

"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Box,
  Container,
  Typography,
  CircularProgress,
  Alert,
  Paper,
  Button,
  TextField,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Pagination,
  useTheme,
  Card,
  CardContent,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import StorageIcon from "@mui/icons-material/Storage";
import SpeedIcon from "@mui/icons-material/Speed";
import ElectricBoltIcon from "@mui/icons-material/ElectricBolt";
import GradientStatCard from "@/components/GradientStatCard";
import { WorkersResponse } from "@/lib/luxor";

/**
 * Response structure from the /api/luxor proxy route
 */
interface ProxyResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

/**
 * Component state for managing API data
 */
interface WorkersState {
  workers: WorkersResponse | null;
  loading: boolean;
  error: string | null;
}

export default function WorkersPage() {
  const theme = useTheme();
  const [state, setState] = useState<WorkersState>({
    workers: null,
    loading: true,
    error: null,
  });

  // Filter parameters
  const [filters, setFilters] = useState({
    currency: "BTC",
    status: "ACTIVE",
    page_number: "1",
    page_size: "10",
    search: "",
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Fetch workers data from the Luxor API proxy
   */
  const fetchWorkersData = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      // Build query string from filters
      const queryString = new URLSearchParams({
        endpoint: "workers",
        currency: filters.currency,
        status: filters.status,
        page_number: filters.page_number,
        page_size: filters.page_size,
      }).toString();

      console.log("[Workers Page] Fetching data with filters:", filters);

      const response = await fetch(`/api/luxor?${queryString}`);

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: ProxyResponse<WorkersResponse> = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch workers data");
      }

      setState({
        workers: data.data || null,
        loading: false,
        error: null,
      });

      console.log("[Workers Page] Data fetched successfully");
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Workers Page] Error fetching data:", errorMsg);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMsg,
      }));
    }
  }, [filters]);

  /**
   * Fetch data on component mount and when filters change
   */
  useEffect(() => {
    fetchWorkersData();
  }, [filters, fetchWorkersData]);

  /**
   * Handle filter change
   */
  const handleFilterChange = (
    key: keyof typeof filters,
    value: string,
  ): void => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "status" || key === "currency" ? { page_number: "1" } : {}), // Reset page when filter changes
    }));
  };

  /**
   * Handle page change
   */
  const handlePageChange = (
    event: React.ChangeEvent<unknown>,
    page: number,
  ): void => {
    setFilters((prev) => ({
      ...prev,
      page_number: String(page),
    }));
  };

  /**
   * Handle manual refresh
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchWorkersData();
    setIsRefreshing(false);
  };

  /**
   * Filter workers by search term
   */
  const filteredWorkers = state.workers?.workers.filter((worker) =>
    worker.name.toLowerCase().includes(filters.search.toLowerCase()),
  );

  /**
   * Get status color
   */
  const getStatusColor = (status: string): "success" | "error" | "default" => {
    switch (status) {
      case "ACTIVE":
        return "success";
      case "INACTIVE":
        return "error";
      default:
        return "default";
    }
  };

  /**
   * Format hashrate with appropriate units
   */
  const formatHashrate = (hashrate: number): string => {
    if (hashrate >= 1e9) return (hashrate / 1e9).toFixed(2) + " GH/s";
    if (hashrate >= 1e6) return (hashrate / 1e6).toFixed(2) + " MH/s";
    if (hashrate >= 1e3) return (hashrate / 1e3).toFixed(2) + " KH/s";
    return hashrate.toFixed(2) + " H/s";
  };

  /**
   * Format efficiency as percentage
   */
  const formatEfficiency = (efficiency: number): string => {
    return (efficiency * 100).toFixed(2) + "%";
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (state.loading && !state.workers) {
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
    <Box
      component="main"
      sx={{ py: 4, backgroundColor: "background.default", minHeight: "100vh" }}
    >
      <Container maxWidth="xl">
        {/* Page Header */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 4,
          }}
        >
          <Box>
            <Typography
              variant="h3"
              component="h1"
              sx={{
                fontWeight: "bold",
                color: "text.primary",
              }}
            >
              Mining Workers
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Manage and monitor your mining workers in real-time
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </Box>

        {/* Error Alert */}
        {state.error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
              Error Loading Data
            </Typography>
            <Typography variant="body2">{state.error}</Typography>
          </Alert>
        )}

        {/* Stat Cards */}
        {state.workers && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                md: "repeat(4, 1fr)",
              },
              gap: 3,
              mb: 4,
            }}
          >
            <Box>
              <GradientStatCard
                title="Total Active"
                value={String(state.workers.total_active)}
                gradient="linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)"
                icon={<StorageIcon fontSize="small" />}
              />
            </Box>

            <Box>
              <GradientStatCard
                title="Total Inactive"
                value={String(state.workers.total_inactive)}
                gradient="linear-gradient(135deg, #FF6B6B 0%, #FF5252 100%)"
                icon={<StorageIcon fontSize="small" />}
              />
            </Box>

            <Box>
              <GradientStatCard
                title="Currency"
                value={state.workers.currency_type}
                gradient="linear-gradient(135deg, #FFB300 0%, #FFCA28 100%)"
                icon={<ElectricBoltIcon fontSize="small" />}
              />
            </Box>

            <Box>
              <GradientStatCard
                title="Total Workers"
                value={String(state.workers.workers.length)}
                gradient="linear-gradient(135deg, #2196F3 0%, #21CBF3 100%)"
                icon={<SpeedIcon fontSize="small" />}
              />
            </Box>
          </Box>
        )}

        {/* Filters Card */}
        <Paper sx={{ p: 3, mb: 4, backgroundColor: "background.paper" }}>
          <Typography
            variant="h6"
            sx={{
              mb: 2,
              fontWeight: "bold",
              color: "text.primary",
            }}
          >
            Filter Workers
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                md: "repeat(4, 1fr)",
              },
              gap: 2,
            }}
          >
            <Box>
              <TextField
                fullWidth
                label="Currency"
                value={filters.currency}
                onChange={(e) => handleFilterChange("currency", e.target.value)}
                select
                SelectProps={{
                  native: true,
                }}
              >
                <option value="BTC">BTC (Bitcoin)</option>
                <option value="LTC">LTC (Litecoin)</option>
                <option value="DOGE">DOGE (Dogecoin)</option>
                <option value="ZEC">ZEC (Zcash)</option>
                <option value="SC">SC (Siacoin)</option>
              </TextField>
            </Box>

            <Box>
              <TextField
                fullWidth
                label="Status"
                value={filters.status}
                onChange={(e) => handleFilterChange("status", e.target.value)}
                select
                SelectProps={{
                  native: true,
                }}
              >
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Inactive Only</option>
              </TextField>
            </Box>

            <Box>
              <TextField
                fullWidth
                label="Page Size"
                value={filters.page_size}
                onChange={(e) =>
                  handleFilterChange("page_size", e.target.value)
                }
                select
                SelectProps={{
                  native: true,
                }}
              >
                <option value="5">5 per page</option>
                <option value="10">10 per page</option>
                <option value="25">25 per page</option>
                <option value="50">50 per page</option>
              </TextField>
            </Box>

            <Box>
              <TextField
                fullWidth
                label="Search Workers"
                placeholder="Search by name..."
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1 }} />,
                }}
              />
            </Box>
          </Box>
        </Paper>

        {/* Workers Table */}
        {state.workers && state.workers.workers.length > 0 ? (
          <Box>
            <TableContainer component={Paper} sx={{ mb: 3 }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: "background.default" }}>
                    <TableCell sx={{ fontWeight: "bold" }}>
                      Worker Name
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Hashrate</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>
                      Efficiency
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Firmware</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>
                      Stale Shares
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>
                      Rejected Shares
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>
                      Last Share
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredWorkers?.map((worker, idx) => (
                    <TableRow
                      key={idx}
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
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontFamily: "monospace" }}
                        >
                          {worker.subaccount_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={worker.status}
                          color={getStatusColor(worker.status)}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {formatHashrate(worker.hashrate)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 500,
                            color:
                              worker.efficiency > 0.95
                                ? theme.palette.success.main
                                : worker.efficiency > 0.85
                                  ? theme.palette.warning.main
                                  : theme.palette.error.main,
                          }}
                        >
                          {formatEfficiency(worker.efficiency)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: "monospace" }}
                        >
                          {worker.firmware}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatHashrate(worker.stale_shares)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatHashrate(worker.rejected_shares)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: "block",
                          }}
                        >
                          {new Date(worker.last_share_time).toLocaleString()}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            {state.workers.pagination &&
              state.workers.pagination.item_count && (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 2,
                    mt: 3,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Page {filters.page_number} of{" "}
                    {Math.ceil(
                      (state.workers.pagination.item_count || 1) /
                        parseInt(filters.page_size),
                    )}
                    {" | Total: "}
                    {state.workers.pagination.item_count} workers
                  </Typography>
                  <Pagination
                    count={Math.ceil(
                      (state.workers.pagination.item_count || 1) /
                        parseInt(filters.page_size),
                    )}
                    page={parseInt(filters.page_number)}
                    onChange={handlePageChange}
                    color="primary"
                  />
                </Box>
              )}
          </Box>
        ) : (
          <Paper sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="h6" color="text.secondary">
              No workers found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Try adjusting your filters or refresh the page
            </Typography>
          </Paper>
        )}
      </Container>
    </Box>
  );
}
