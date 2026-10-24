"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Stack,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Paper,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PeopleIcon from "@mui/icons-material/People";
import BarChartIcon from "@mui/icons-material/BarChart";
import StatCard from "@/components/daylight/StatCard";
import { useDaylight } from "@/lib/daylight";
import {
  CellNote,
  DaylightAdminPage,
  DaylightLoading,
  DaylightPageHeader,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

interface TabVisit {
  tabKey: string;
  tabName: string;
  visitedAt: string;
}

interface SessionUser {
  name: string | null;
  email: string;
  luxorSubaccounts: string[];
}

interface UserSession {
  id: string;
  loginAt: string;
  logoutAt: string | null;
  duration: number | null;
  ipAddress: string | null;
  user: SessionUser;
  tabVisits: TabVisit[];
  /** The sign-in email used, if known (an account can have two). */
  login: { email: string; isPrimary: boolean } | null;
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
  const { d } = useDaylight();
  const ds = useDaylightAdminSx();
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

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="User Activity Log"
        description="Client sign-in sessions, how long they lasted and which tabs were visited."
      />

      {/* Stats Cards */}
      {data?.stats && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
            gap: { xs: "12px", sm: "16px", md: "20px" },
            mb: { xs: "20px", md: "24px" },
          }}
        >
          <StatCard
            title="Sessions Today"
            value={data.stats.totalSessionsToday}
            tone="sky"
            icon={<PeopleIcon />}
          />
          <StatCard
            title="Avg Session Duration"
            value={formatDuration(data.stats.avgDurationSeconds)}
            tone="mint"
            icon={<AccessTimeIcon />}
          />
          <StatCard
            title="Most Visited Tab"
            value={data.stats.topTabs[0]?.tabName ?? "—"}
            caption={
              data.stats.topTabs[0]
                ? `${data.stats.topTabs[0].count} visits`
                : undefined
            }
            tone="amber"
            icon={<BarChartIcon />}
          />
        </Box>
      )}

      {/* Filters */}
      <Paper
        elevation={0}
        sx={{ ...ds.cardSx, ...ds.inputSx, mb: { xs: "20px", md: "24px" } }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", sm: "center" }}
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
        <DaylightLoading />
      ) : error ? (
        <Alert severity="error" sx={ds.alertSx("error")}>
          Failed to load activity log. Please try again.
        </Alert>
      ) : (
        <Paper elevation={0} sx={ds.listCardSx}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Subaccount</TableCell>
                  <TableCell>Login Time</TableCell>
                  <TableCell>Logout Time</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Tabs Visited</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.sessions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      align="center"
                      sx={{ "&&&": { py: 5, color: d.muted } }}
                    >
                      No sessions found
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <Box component="span" sx={{ fontWeight: 650 }}>
                          {session.user.name ?? "—"}
                        </Box>
                        <CellNote>{session.user.email}</CellNote>
                        {session.login && !session.login.isPrimary && (
                          <CellNote>
                            Signed in as {session.login.email} (second email)
                          </CellNote>
                        )}
                      </TableCell>
                      <TableCell>
                        {session.user.luxorSubaccounts.length > 0
                          ? session.user.luxorSubaccounts.join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell sx={{ "&&&": { whiteSpace: "nowrap" } }}>
                        {formatDateTime(session.loginAt)}
                      </TableCell>
                      <TableCell sx={{ "&&&": { whiteSpace: "nowrap" } }}>
                        {session.logoutAt ? (
                          formatDateTime(session.logoutAt)
                        ) : (
                          <DaylightStatusPill label="Active" tone="success" />
                        )}
                      </TableCell>
                      <TableCell sx={{ "&&&": { whiteSpace: "nowrap" } }}>
                        {formatDuration(session.duration)}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" flexWrap="wrap" gap={0.5}>
                          {uniqueTabs(session.tabVisits).length === 0 ? (
                            <Box component="span" sx={{ color: d.muted }}>
                              None
                            </Box>
                          ) : (
                            uniqueTabs(session.tabVisits).map((name) => (
                              <DaylightStatusPill
                                key={name}
                                label={name}
                                tone="info"
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
            sx={ds.paginationSx}
          />
        </Paper>
      )}
    </DaylightAdminPage>
  );
}
