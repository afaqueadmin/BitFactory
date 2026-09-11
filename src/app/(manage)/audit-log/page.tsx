"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
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
  IconButton,
  Collapse,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { AuditAction } from "@prisma/client";
import { AUDIT_ACTION_LABELS } from "@/lib/constants/accounting";

interface AuditLogActor {
  id: string;
  name: string | null;
  email: string;
}

interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  changes: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: AuditLogActor;
}

interface AuditLogResponse {
  logs: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
  entityTypes: string[];
}

interface ClientUser {
  id: string;
  name: string | null;
  email: string;
}

// Converts a stored entityType string (e.g. "WalletChangeRequest") into a
// human-readable label ("Wallet Change Request") without needing a second
// hand-maintained map alongside AUDIT_ACTION_LABELS - new entity types added
// elsewhere in the app show up correctly here automatically.
function formatEntityType(entityType: string): string {
  return entityType.replace(/([a-z])([A-Z])/g, "$1 $2");
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

// Color-codes actions by what they semantically represent, purely as a
// scanning aid - ordered most-specific-first, first match wins.
type ChipColor = "success" | "error" | "warning" | "info" | "default";
const COLOR_KEYWORDS: [string, ChipColor][] = [
  ["REJECTED", "error"],
  ["CANCELLED", "error"],
  ["VOIDED", "error"],
  ["REMOVED", "error"],
  ["REVERSED", "error"],
  ["CLAWBACK", "error"],
  ["DISABLED", "error"],
  ["FAILED", "error"],
  ["DELETED", "error"],
  ["PAUSED", "warning"],
  ["ARCHIVED", "warning"],
  ["RETRY", "warning"],
  ["RESET", "warning"],
  ["CREATED", "success"],
  ["PAID", "success"],
  ["APPROVED", "success"],
  ["ADDED", "success"],
  ["ENABLED", "success"],
  ["ACCRUED", "success"],
  ["RESUMED", "success"],
];

function getActionColor(action: string): ChipColor {
  for (const [keyword, color] of COLOR_KEYWORDS) {
    if (action.includes(keyword)) return color;
  }
  return "default";
}

function AuditLogRowDetails({ log }: { log: AuditLogRow }) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!log.changes || !!log.ipAddress || !!log.userAgent;

  return (
    <>
      <TableRow hover>
        <TableCell>
          <Typography variant="body2">
            {formatDateTime(log.createdAt)}
          </Typography>
        </TableCell>
        <TableCell>
          <Chip
            label={AUDIT_ACTION_LABELS[log.action as AuditAction] ?? log.action}
            color={getActionColor(log.action)}
            size="small"
          />
        </TableCell>
        <TableCell>
          <Typography variant="body2" fontWeight={500}>
            {log.user?.name ?? "—"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {log.user?.email ?? "System"}
          </Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2">
            {formatEntityType(log.entityType)}
          </Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2">{log.description}</Typography>
        </TableCell>
        <TableCell align="right">
          {hasDetails && (
            <IconButton size="small" onClick={() => setOpen((v) => !v)}>
              {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          )}
        </TableCell>
      </TableRow>
      {hasDetails && (
        <TableRow>
          <TableCell
            colSpan={6}
            sx={{ py: 0, borderBottom: open ? undefined : "none" }}
          >
            <Collapse in={open} timeout="auto" unmountOnExit>
              <Box sx={{ py: 2, px: 1 }}>
                <Stack direction="row" spacing={4} flexWrap="wrap">
                  {log.ipAddress && (
                    <Typography variant="caption" color="text.secondary">
                      IP: {log.ipAddress}
                    </Typography>
                  )}
                  {log.userAgent && (
                    <Typography variant="caption" color="text.secondary">
                      Device: {log.userAgent}
                    </Typography>
                  )}
                </Stack>
                {!!log.changes && (
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      bgcolor: "action.hover",
                      borderRadius: 1,
                      fontSize: "0.875rem",
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      Changes:
                    </Typography>
                    <pre
                      style={{
                        margin: "4px 0 0 0",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontFamily: "inherit",
                      }}
                    >
                      {typeof log.changes === "string"
                        ? log.changes
                        : JSON.stringify(log.changes, null, 2)}
                    </pre>
                  </Box>
                )}
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function AuditLogPage() {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  // Light debounce on the free-text search so it doesn't fire a request per
  // keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(qInput);
      setPage(0);
    }, 400);
    return () => clearTimeout(timeout);
  }, [qInput]);

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set("page", String(page + 1));
    params.set("limit", String(rowsPerPage));
    if (action) params.set("action", action);
    if (entityType) params.set("entityType", entityType);
    if (filterUserId) params.set("userId", filterUserId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (q) params.set("q", q);
    return params.toString();
  };

  const { data, isLoading, error } = useQuery<AuditLogResponse>({
    queryKey: [
      "audit-log",
      page,
      rowsPerPage,
      action,
      entityType,
      filterUserId,
      dateFrom,
      dateTo,
      q,
    ],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit-log?${buildQuery()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const { data: usersData } = useQuery<{ users: ClientUser[] }>({
    queryKey: ["all-users-for-audit-log"],
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
        Audit Log
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Action</InputLabel>
            <Select
              value={action}
              label="Action"
              onChange={(e) => {
                setAction(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">All Actions</MenuItem>
              {Object.values(AuditAction).map((a) => (
                <MenuItem key={a} value={a}>
                  {AUDIT_ACTION_LABELS[a]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Entity Type</InputLabel>
            <Select
              value={entityType}
              label="Entity Type"
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">All Types</MenuItem>
              {data?.entityTypes.map((et) => (
                <MenuItem key={et} value={et}>
                  {formatEntityType(et)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Actor</InputLabel>
            <Select
              value={filterUserId}
              label="Actor"
              onChange={(e) => {
                setFilterUserId(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">All Users</MenuItem>
              {usersData?.users?.map((u) => (
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

          <TextField
            size="small"
            label="Search description"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            sx={{ minWidth: 220 }}
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
          Failed to load audit log. Please try again.
        </Alert>
      ) : (
        <>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: headerBg }}>
                  <TableCell sx={{ fontWeight: 600 }}>Date/Time</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Actor</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Entity Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        No audit log entries found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.logs.map((log) => (
                    <AuditLogRowDetails key={log.id} log={log} />
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
