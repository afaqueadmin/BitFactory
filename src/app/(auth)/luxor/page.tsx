/**
 * Luxor Mining Dashboard Page
 *
 * Displays real-time mining data from the Luxor API including:
 * - Active workers over time (with chart)
 * - Hashrate efficiency metrics
 * - Workspace information
 * - Real-time data synchronization with error handling
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
  Divider,
  Button,
  TextField,
  Stack,
  useTheme,
} from "@mui/material";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import RefreshIcon from "@mui/icons-material/Refresh";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import GroupIcon from "@mui/icons-material/Group";
import SpeedIcon from "@mui/icons-material/Speed";
import GradientStatCard from "@/components/GradientStatCard";
import {
  ActiveWorkersResponse,
  HashrateEfficiencyResponse,
  WorkspaceResponse,
} from "@/lib/luxor";

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
interface LuxorState {
  activeWorkers: ActiveWorkersResponse | null;
  hashrateEfficiency: HashrateEfficiencyResponse | null;
  workspace: WorkspaceResponse | null;
  loading: boolean;
  error: string | null;
}

export default function LuxorPage() {
  const theme = useTheme();
  const [state, setState] = useState<LuxorState>({
    activeWorkers: null,
    hashrateEfficiency: null,
    workspace: null,
    loading: true,
    error: null,
  });

  // Filter parameters
  const [filters, setFilters] = useState({
    currency: "BTC",
    start_date: "2025-01-01",
    end_date: "2025-01-31",
    tick_size: "1d" as "5m" | "1h" | "1d" | "1w" | "1M",
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Fetch data from the Luxor API proxy
   *
   * This function:
   * 1. Calls the /api/luxor endpoint with query parameters
   * 2. Fetches multiple endpoints in parallel
   * 3. Updates state with the results
   * 4. Handles errors gracefully
   */
  const fetchLuxorData = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      // Build query string from filters
      const queryString = new URLSearchParams({
        endpoint: "active-workers",
        currency: filters.currency,
        start_date: filters.start_date,
        end_date: filters.end_date,
        tick_size: filters.tick_size,
      }).toString();

      console.log("[Luxor Dashboard] Fetching data with filters:", filters);

      // Fetch active workers data
      const workersResponse = await fetch(`/api/luxor?${queryString}`);

      if (!workersResponse.ok) {
        throw new Error(`API returned status ${workersResponse.status}`);
      }

      const workersData: ProxyResponse<ActiveWorkersResponse> =
        await workersResponse.json();

      if (!workersData.success) {
        throw new Error(
          workersData.error || "Failed to fetch active workers data",
        );
      }

      // Fetch hashrate efficiency data
      const hashrateParams = new URLSearchParams({
        endpoint: "hashrate-history",
        currency: filters.currency,
        start_date: filters.start_date,
        end_date: filters.end_date,
        tick_size: filters.tick_size,
      }).toString();

      const hashrateResponse = await fetch(`/api/luxor?${hashrateParams}`);

      if (!hashrateResponse.ok) {
        throw new Error(`API returned status ${hashrateResponse.status}`);
      }

      const hashrateData: ProxyResponse<HashrateEfficiencyResponse> =
        await hashrateResponse.json();

      if (!hashrateData.success) {
        throw new Error(hashrateData.error || "Failed to fetch hashrate data");
      }

      // Fetch workspace info
      const workspaceResponse = await fetch("/api/luxor?endpoint=workspace");

      if (!workspaceResponse.ok) {
        console.warn(
          "Failed to fetch workspace data: API returned status",
          workspaceResponse.status,
        );
      } else {
        const workspaceData: ProxyResponse<WorkspaceResponse> =
          await workspaceResponse.json();

        if (!workspaceData.success) {
          console.warn("Failed to fetch workspace data:", workspaceData.error);
        } else {
          setState((prev) => ({
            ...prev,
            workspace: workspaceData.data || null,
          }));
        }
      }

      setState({
        activeWorkers: workersData.data || null,
        hashrateEfficiency: hashrateData.data || null,
        workspace: state.workspace,
        loading: false,
        error: null,
      });

      console.log("[Luxor Dashboard] Data fetched successfully");
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Luxor Dashboard] Error fetching data:", errorMsg);
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
    fetchLuxorData();
  }, [filters]);

  /**
   * Handle filter change
   */
  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  /**
   * Handle manual refresh
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLuxorData();
    setIsRefreshing(false);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (state.loading && !state.activeWorkers) {
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
              Luxor Mining Analytics
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Real-time mining statistics and performance metrics
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
            Filter Data
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
                label="Start Date"
                type="date"
                value={filters.start_date}
                onChange={(e) =>
                  handleFilterChange("start_date", e.target.value)
                }
                InputLabelProps={{ shrink: true }}
              />
            </Box>

            <Box>
              <TextField
                fullWidth
                label="End Date"
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange("end_date", e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Box>

            <Box>
              <TextField
                fullWidth
                label="Granularity"
                value={filters.tick_size}
                onChange={(e) =>
                  handleFilterChange("tick_size", e.target.value)
                }
                select
                SelectProps={{
                  native: true,
                }}
              >
                <option value="5m">5 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="1d">1 Day</option>
                <option value="1w">1 Week</option>
                <option value="1M">1 Month</option>
              </TextField>
            </Box>
          </Box>
        </Paper>

        {/* Stat Cards */}
        {state.activeWorkers && (
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
                title="Total Active Workers"
                value={
                  state.activeWorkers.active_workers.length > 0
                    ? String(
                        state.activeWorkers.active_workers[
                          state.activeWorkers.active_workers.length - 1
                        ].active_workers,
                      )
                    : "0"
                }
                gradient="linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)"
                icon={<GroupIcon fontSize="small" />}
              />
            </Box>

            <Box>
              <GradientStatCard
                title="Currency"
                value={state.activeWorkers.currency_type}
                gradient="linear-gradient(135deg, #FFB300 0%, #FFCA28 100%)"
                icon={<TrendingUpIcon fontSize="small" />}
              />
            </Box>

            <Box>
              <GradientStatCard
                title="Time Period"
                value={state.activeWorkers.tick_size.toUpperCase()}
                gradient="linear-gradient(135deg, #00BFA6 0%, #1DE9B6 100%)"
                icon={<SpeedIcon fontSize="small" />}
              />
            </Box>

            <Box>
              <GradientStatCard
                title="Data Points"
                value={String(state.activeWorkers.active_workers.length)}
                gradient="linear-gradient(135deg, #2196F3 0%, #21CBF3 100%)"
                icon={<GroupIcon fontSize="small" />}
              />
            </Box>
          </Box>
        )}

        {/* Charts Section */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 3,
            mb: 4,
          }}
        >
          {/* Active Workers Chart */}
          {state.activeWorkers &&
            state.activeWorkers.active_workers.length > 0 && (
              <Box>
                <Paper sx={{ p: 3 }}>
                  <Typography
                    variant="h6"
                    sx={{
                      mb: 2,
                      fontWeight: "bold",
                      color: "text.primary",
                    }}
                  >
                    Active Workers Over Time
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={state.activeWorkers.active_workers}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date_time"
                        tick={{ fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="active_workers"
                        stroke={theme.palette.primary.main}
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Paper>
              </Box>
            )}

          {/* Hashrate Efficiency Chart */}
          {state.hashrateEfficiency &&
            state.hashrateEfficiency.hashrate_efficiency?.length > 0 && (
              <Box>
                <Paper sx={{ p: 3 }}>
                  <Typography
                    variant="h6"
                    sx={{
                      mb: 2,
                      fontWeight: "bold",
                      color: "text.primary",
                    }}
                  >
                    Hashrate & Efficiency
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={state.hashrateEfficiency.hashrate_efficiency}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date_time"
                        tick={{ fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="hashrate"
                        fill={theme.palette.primary.main}
                      />
                      <Bar
                        dataKey="efficiency"
                        fill={theme.palette.success.main}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Box>
            )}
        </Box>

        {/* Workspace Information */}
        {state.workspace && (
          <Box sx={{ mt: 1 }}>
            <Paper sx={{ p: 3 }}>
              <Typography
                variant="h6"
                sx={{
                  mb: 2,
                  fontWeight: "bold",
                  color: "text.primary",
                }}
              >
                Workspace Information
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Stack spacing={2}>
                {state.workspace.id && (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Workspace ID
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{ fontFamily: "monospace", mt: 0.5 }}
                    >
                      {state.workspace.id}
                    </Typography>
                  </Box>
                )}

                {state.workspace.name && (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Name
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 0.5 }}>
                      {state.workspace.name}
                    </Typography>
                  </Box>
                )}

                {Object.keys(state.workspace).length > 0 && (
                  <Box
                    sx={{
                      mt: 2,
                      p: 2,
                      backgroundColor: "background.default",
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Raw Data (JSON)
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        mt: 1,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        maxHeight: "200px",
                        overflow: "auto",
                      }}
                    >
                      {JSON.stringify(state.workspace, null, 2)}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Paper>
          </Box>
        )}

        {/* Empty State */}
        {!state.loading && !state.activeWorkers && !state.error && (
          <Paper sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="h6" color="text.secondary">
              No data available
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
