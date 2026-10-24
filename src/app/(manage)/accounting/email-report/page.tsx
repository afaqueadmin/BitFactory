"use client";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import RefreshIcon from "@mui/icons-material/Refresh";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import {
  EMAIL_REPORT_TYPES,
  EMAIL_RUN_KIND_LABELS,
  EMAIL_RUN_SOURCE_LABELS,
  emailReportTypeLabel,
} from "@/lib/accounting/emailReport";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";
import {
  DaylightAdminPage,
  useDaylightAdminSx,
  CellNote,
  DaylightStatusPill,
  statusLabel,
} from "@/components/daylight/AdminPage";

interface EmailSendRun {
  id: string;
  type: string;
  kind: string;
  source: string;
  status: string;
  totalInvoices: number;
  successCount: number;
  failureCount: number;
  createdBy: { id: string; name: string; email: string };
  startedAt: string;
  completedAt: string | null;
}

interface RunsResponse {
  data: EmailSendRun[];
  summary: {
    runs: number;
    sent: number;
    failed: number;
    successRate: number | null;
  };
  creators: { id: string; name: string; email: string }[];
  pagination: { page: number; limit: number; total: number };
}

const TABS = ["all", ...EMAIL_REPORT_TYPES] as const;

/** Local-day bounds as ISO, so the filter matches the dates shown. */
function dayBoundIso(value: string, end: boolean): string {
  const [y, m, d] = value.split("-").map(Number);
  return (
    end
      ? new Date(y, m - 1, d, 23, 59, 59, 999)
      : new Date(y, m - 1, d, 0, 0, 0, 0)
  ).toISOString();
}

function successRate(run: EmailSendRun): number {
  return run.totalInvoices === 0
    ? 0
    : Math.round((run.successCount / run.totalInvoices) * 100);
}

function rateColor(rate: number): "success" | "warning" | "error" {
  return rate === 100 ? "success" : rate >= 75 ? "warning" : "error";
}

function KpiTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  const { d, fonts } = useDaylight();
  return (
    <Box
      role="article"
      aria-label={label}
      sx={{
        bgcolor: d.surface,
        border: `1px solid ${d.border}`,
        borderRadius: RADIUS_CARD,
        boxShadow: d.shadow,
        p: { xs: "14px 16px", sm: "16px 20px" },
        fontFamily: fonts.body,
      }}
    >
      <Box sx={{ fontSize: 13, fontWeight: 600, color: d.muted }}>{label}</Box>
      <Box
        sx={{
          mt: "6px",
          fontFamily: fonts.heading,
          fontWeight: 750,
          fontSize: 24,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color: color ?? d.text,
        }}
      >
        {value}
      </Box>
    </Box>
  );
}

export default function EmailReportPage() {
  return (
    <Suspense
      fallback={
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      }
    >
      <EmailReportContent />
    </Suspense>
  );
}

function EmailReportContent() {
  const { d } = useDaylight();
  const ds = useDaylightAdminSx();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const typeParam = searchParams.get("type");
  const tab = (TABS as readonly string[]).includes(typeParam ?? "")
    ? (typeParam as string)
    : "all";

  const [kind, setKind] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const [data, setData] = useState<RunsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page + 1),
        limit: String(rowsPerPage),
      });
      if (tab !== "all") params.set("type", tab);
      if (kind) params.set("kind", kind);
      if (source) params.set("source", source);
      if (status) params.set("status", status);
      if (createdBy) params.set("createdBy", createdBy);
      if (from) params.set("from", dayBoundIso(from, false));
      if (to) params.set("to", dayBoundIso(to, true));

      const response = await fetch(`/api/accounting/email-runs?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch email runs");
      }
      setData(await response.json());
    } catch (err) {
      console.error("Error fetching email runs:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch email runs",
      );
    } finally {
      setLoading(false);
    }
  }, [tab, kind, source, status, createdBy, from, to, page, rowsPerPage]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("type");
    else params.set("type", value);
    setPage(0);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const resetPage =
    <T,>(setter: (v: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(0);
    };

  const hasFilters = Boolean(
    kind || source || status || createdBy || from || to,
  );
  const clearFilters = () => {
    setKind("");
    setSource("");
    setStatus("");
    setCreatedBy("");
    setFrom("");
    setTo("");
    setPage(0);
  };

  const runs = data?.data ?? [];
  const summary = data?.summary;

  return (
    <DaylightAdminPage>
      <Stack spacing={3}>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="flex-start"
          gap={2}
          flexWrap="wrap"
        >
          <Box>
            <Typography component="h1" sx={ds.pageTitleSx}>
              Email Send Reports
            </Typography>
            <Typography sx={ds.pageDescSx}>
              Every invoice, cancellation and customer-facing memo email sent
              from Hosting &amp; Colocation, Hardware Sales and Hardware Repair
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchRuns}
            disabled={loading}
            sx={ds.outlineBtnSx}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </Box>

        <Box>
          <Tabs
            value={tab}
            onChange={(_, value) => handleTabChange(value)}
            variant="scrollable"
            allowScrollButtonsMobile
            sx={ds.tabsSx}
          >
            <Tab value="all" label="All" />
            {EMAIL_REPORT_TYPES.map((type) => (
              <Tab key={type} value={type} label={emailReportTypeLabel(type)} />
            ))}
          </Tabs>
        </Box>

        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))"
          gap={2}
        >
          <KpiTile label="Runs" value={summary?.runs ?? "—"} />
          <KpiTile
            label="Emails sent"
            value={summary?.sent ?? "—"}
            color={d.success}
          />
          <KpiTile
            label="Failed"
            value={summary?.failed ?? "—"}
            color={summary && summary.failed > 0 ? d.danger : undefined}
          />
          <KpiTile
            label="Success rate"
            value={
              summary?.successRate != null ? `${summary.successRate}%` : "—"
            }
          />
        </Box>

        <Paper elevation={0} sx={{ ...ds.cardSx, ...ds.inputSx }}>
          <Box
            display="grid"
            gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))"
            gap={2}
            alignItems="center"
          >
            <TextField
              select
              size="small"
              label="Email"
              value={kind}
              onChange={(e) => resetPage(setKind)(e.target.value)}
            >
              <MenuItem value="">All emails</MenuItem>
              {Object.entries(EMAIL_RUN_KIND_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Source"
              value={source}
              onChange={(e) => resetPage(setSource)(e.target.value)}
            >
              <MenuItem value="">All sources</MenuItem>
              {Object.entries(EMAIL_RUN_SOURCE_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Status"
              value={status}
              onChange={(e) => resetPage(setStatus)(e.target.value)}
            >
              <MenuItem value="">All statuses</MenuItem>
              <MenuItem value="COMPLETED">Completed</MenuItem>
              <MenuItem value="IN_PROGRESS">In progress</MenuItem>
              <MenuItem value="FAILED">Failed</MenuItem>
            </TextField>
            <TextField
              select
              size="small"
              label="Created by"
              value={createdBy}
              onChange={(e) => resetPage(setCreatedBy)(e.target.value)}
            >
              <MenuItem value="">Anyone</MenuItem>
              {(data?.creators ?? []).map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name || c.email}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              size="small"
              label="From"
              value={from}
              onChange={(e) => resetPage(setFrom)(e.target.value)}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { max: to || undefined },
              }}
            />
            <TextField
              type="date"
              size="small"
              label="To"
              value={to}
              onChange={(e) => resetPage(setTo)(e.target.value)}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: from || undefined },
              }}
            />
            {hasFilters && (
              <Button size="small" onClick={clearFilters} sx={ds.textBtnSx()}>
                Clear filters
              </Button>
            )}
          </Box>
        </Paper>

        {error && (
          <Alert
            severity="error"
            sx={{ ...ds.alertSx("error") }}
            action={
              <Button size="small" onClick={fetchRuns} sx={ds.textBtnSx()}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        <TableContainer component={Paper} elevation={0} sx={ds.listCardSx}>
          {loading && <LinearProgress />}
          <Table size="small">
            <TableHead>
              <TableRow
                sx={{
                  "& th": {
                    fontWeight: 600,
                    bgcolor: "action.hover",
                    whiteSpace: "nowrap",
                  },
                }}
              >
                <TableCell>Started</TableCell>
                <TableCell>Invoice type</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Sent / Failed / Total</TableCell>
                <TableCell sx={{ minWidth: 160 }}>Success rate</TableCell>
                <TableCell>Created by</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: "center", py: 6 }}>
                    <Typography variant="body2" sx={{ color: d.muted }}>
                      {hasFilters
                        ? "No email runs match these filters"
                        : "No email runs yet"}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((run) => {
                  const rate = successRate(run);
                  return (
                    <TableRow key={run.id} hover>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <DateDisplay date={run.startedAt} format="datetime" />
                      </TableCell>
                      <TableCell>{emailReportTypeLabel(run.type)}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          <DaylightStatusPill
                            label={EMAIL_RUN_KIND_LABELS[run.kind] ?? run.kind}
                            tone={
                              run.kind === "CANCELLATION" ? "warning" : "info"
                            }
                          />
                          <DaylightStatusPill
                            label={
                              EMAIL_RUN_SOURCE_LABELS[run.source] ?? run.source
                            }
                            tone="neutral"
                          />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <DaylightStatusPill
                          label={statusLabel(run.status).replace("_", " ")}
                          tone={
                            run.status === "COMPLETED"
                              ? "success"
                              : run.status === "IN_PROGRESS"
                                ? "warning"
                                : "danger"
                          }
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        <Typography
                          component="span"
                          variant="body2"
                          color={d.success}
                        >
                          {run.successCount}
                        </Typography>
                        {" / "}
                        <Typography
                          component="span"
                          variant="body2"
                          color={run.failureCount > 0 ? d.danger : d.muted}
                        >
                          {run.failureCount}
                        </Typography>
                        {" / "}
                        {run.totalInvoices}
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <LinearProgress
                            variant="determinate"
                            value={rate}
                            color={rateColor(rate)}
                            sx={{ flex: 1, height: 6, borderRadius: 3 }}
                          />
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, minWidth: 40 }}
                            align="right"
                          >
                            {rate}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {run.createdBy.name}
                        </Typography>
                        <CellNote>{run.createdBy.email}</CellNote>
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          component={Link}
                          href={`/accounting/email-report/${run.id}`}
                          variant="outlined"
                          size="small"
                          sx={ds.outlineBtnSx}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <TablePagination
            rowsPerPageOptions={[10, 25, 50, 100]}
            component="div"
            count={data?.pagination.total ?? 0}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            sx={ds.paginationSx}
          />
        </TableContainer>
      </Stack>
    </DaylightAdminPage>
  );
}
