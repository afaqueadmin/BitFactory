"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Typography,
  Stack,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Paper,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PeopleIcon from "@mui/icons-material/People";
import BarChartIcon from "@mui/icons-material/BarChart";

interface TabVisit {
  tabKey: string;
  tabName: string;
  visitedAt: string;
}

interface SessionUser {
  name: string | null;
  email: string;
  luxorSubaccountName: string | null;
}

interface UserSession {
  id: string;
  loginAt: string;
  logoutAt: string | null;
  duration: number | null;
  ipAddress: string | null;
  user: SessionUser;
  tabVisits: TabVisit[];
}

interface ActivityLogResponse {
  sessions: UserSession[];
  total: number;
  page: number;
  limit: number;
  stats: {
    totalSessionsToday: number;
    avgDurationSeconds: number;
    topTabs: { tabKey: string; tabName: string; count: number }[];
  };
}

interface ClientUser {
  id: string;
  name: string | null;
  email: string;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function uniqueTabs(visits: TabVisit[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of visits) {
    if (!seen.has(v.tabKey)) {
      seen.add(v.tabKey);
      result.push(v.tabName);
    }
  }
  return result;
}

export default function ActivityLogPage() {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filterUserId, setFilterUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set("page", String(page + 1));
    params.set("limit", String(rowsPerPage));
    if (filterUserId) params.set("userId", filterUserId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  };

  const { data, isLoading, error } = useQuery<ActivityLogResponse>({
    queryKey: [
      "activity-log",
      page,
      rowsPerPage,
      filterUserId,
      dateFrom,
      dateTo,
    ],
    queryFn: async () => {
      const res = await fetch(`/api/admin/activity-log?${buildQuery()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch activity log");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const { data: clientsData } = useQuery<{ users: ClientUser[] }>({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const res = await fetch("/api/user/all", { credentials: "include" });
      if (!res.ok) return { users: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const headerBg = theme.palette.mode === "dark" ? "grey.800" : "grey.100";

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" fontWeight={600} mb={3}>
        User Activity Log
      </Typography>

      {/* Stats Cards */}
      {data?.stats && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mb={3}>
          <Card sx={{ flex: 1 }}>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <PeopleIcon color="primary" fontSize="large" />
              <Box>
                <Typography variant="h4" fontWeight={700}>
                  {data.stats.totalSessionsToday}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Sessions Today
                </Typography>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1 }}>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <AccessTimeIcon color="secondary" fontSize="large" />
              <Box>
                <Typography variant="h4" fontWeight={700}>
                  {formatDuration(data.stats.avgDurationSeconds)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Avg Session Duration
                </Typography>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1 }}>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <BarChartIcon color="success" fontSize="large" />
              <Box>
                <Typography variant="h6" fontWeight={700}>
                  {data.stats.topTabs[0]?.tabName ?? "—"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Most Visited Tab
                  {data.stats.topTabs[0]
                    ? ` (${data.stats.topTabs[0].count}x)`
                    : ""}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Stack>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems="center"
        >
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Filter by User</InputLabel>
            <Select
              value={filterUserId}
              label="Filter by User"
              onChange={(e) => {
                setFilterUserId(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">All Users</MenuItem>
              {clientsData?.users?.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="From"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(0);
            }}
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            size="small"
            label="To"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(0);
            }}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      </Paper>

      {/* Table */}
      {isLoading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">
          Failed to load activity log. Please try again.
        </Alert>
      ) : (
        <>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: headerBg }}>
                  <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Subaccount</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Login Time</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Logout Time</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Tabs Visited</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        No sessions found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.sessions.map((session) => (
                    <TableRow key={session.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {session.user.name ?? "—"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {session.user.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {session.user.luxorSubaccountName ?? "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatDateTime(session.loginAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {session.logoutAt ? (
                            formatDateTime(session.logoutAt)
                          ) : (
                            <Chip label="Active" color="success" size="small" />
                          )}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatDuration(session.duration)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" flexWrap="wrap" gap={0.5}>
                          {uniqueTabs(session.tabVisits).length === 0 ? (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              None
                            </Typography>
                          ) : (
                            uniqueTabs(session.tabVisits).map((name) => (
                              <Chip
                                key={name}
                                label={name}
                                size="small"
                                variant="outlined"
                              />
                            ))
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={data?.total ?? 0}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </>
      )}
    </Box>
  );
}
