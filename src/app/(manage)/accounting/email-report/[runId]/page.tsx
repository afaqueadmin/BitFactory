"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  LinearProgress,
  Link as MuiLink,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import DownloadIcon from "@mui/icons-material/Download";
import SearchIcon from "@mui/icons-material/Search";
import {
  EMAIL_RUN_KIND_LABELS,
  EMAIL_RUN_SOURCE_LABELS,
  MEMO_CATEGORY_LABELS,
  canResendKind,
  emailReportTypeLabel,
  invoiceDetailHref,
  memoHref,
} from "@/lib/accounting/emailReport";

interface EmailSendResult {
  id: string;
  invoiceId: string | null;
  // Invoice emails carry the invoice; memo emails carry the memo (null when
  // the memo was rolled back because its create email failed).
  invoice: {
    id: string;
    invoiceNumber: string;
    totalAmount: string | number;
    dueDate: string;
    invoiceType: string;
    status: string;
  } | null;
  memo: {
    id: string;
    memoNumber: string;
    amount: string | number;
    category: string;
    status: string;
  } | null;
  documentNumber: string | null;
  customerId: string;
  customerName: string;
  customerEmail: string;
  ccEmails: string[];
  success: boolean;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface EmailSendRunDetail {
  id: string;
  type: string;
  kind: string;
  source: string;
  status: string;
  totalInvoices: number;
  // Rows actually stored; fewer than totalInvoices when rows were lost.
  recordedRows: number;
  successCount: number;
  failureCount: number;
  createdBy: { id: string; name: string; email: string };
  startedAt: string;
  completedAt: string | null;
}

interface RunData {
  run: EmailSendRunDetail;
  results: EmailSendResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function SummaryTile({
  label,
  value,
  color,
}: {
  label: string;
  value: ReactNode;
  color?: string;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 600, color }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Invoice or memo number, linked, with its current status underneath. */
function DocumentCell({
  result,
  isMemoRun,
}: {
  result: EmailSendResult;
  isMemoRun: boolean;
}) {
  if (isMemoRun) {
    const number = result.documentNumber ?? result.memo?.memoNumber ?? "—";
    return (
      <>
        <MuiLink
          component={Link}
          href={memoHref(result.customerId)}
          underline="hover"
          sx={{ fontWeight: 500 }}
        >
          {number}
        </MuiLink>
        <Typography variant="caption" color="text.secondary" display="block">
          {result.memo
            ? `${MEMO_CATEGORY_LABELS[result.memo.category] ?? result.memo.category} · ${result.memo.status}`
            : "Not created"}
        </Typography>
      </>
    );
  }

  if (!result.invoice) {
    // The invoice was deleted after the email; the row keeps its number.
    return (
      <>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {result.documentNumber ?? "—"}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          Deleted
        </Typography>
      </>
    );
  }
  return (
    <>
      <MuiLink
        component={Link}
        href={invoiceDetailHref(result.invoice.id, result.invoice.invoiceType)}
        underline="hover"
        sx={{ fontWeight: 500 }}
      >
        {result.invoice.invoiceNumber}
      </MuiLink>
      <Typography variant="caption" color="text.secondary" display="block">
        {result.invoice.status}
      </Typography>
    </>
  );
}

export default function EmailReportDetailPage() {
  const params = useParams();
  const runId = params.runId as string;

  const [data, setData] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | "success" | "failed">(
    "",
  );
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [selectedResults, setSelectedResults] = useState<Set<string>>(
    new Set(),
  );
  const [resending, setResending] = useState(false);
  const [resendDialog, setResendDialog] = useState(false);

  // Debounce the search box so typing doesn't fire a request per key.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const fetchRunDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const searchParams = new URLSearchParams({
        status: statusFilter,
        page: (page + 1).toString(),
        limit: rowsPerPage.toString(),
      });
      if (search) searchParams.set("q", search);

      const response = await fetch(
        `/api/accounting/email-runs/${runId}?${searchParams}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch email run details");
      }

      setData(await response.json());
      setSelectedResults(new Set());
    } catch (err) {
      console.error("Error fetching email run details:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch email run details",
      );
    } finally {
      setLoading(false);
    }
  }, [runId, statusFilter, page, rowsPerPage, search]);

  useEffect(() => {
    fetchRunDetails();
  }, [fetchRunDetails]);

  const handleSelectResult = (resultId: string) => {
    const newSelected = new Set(selectedResults);
    if (newSelected.has(resultId)) {
      newSelected.delete(resultId);
    } else {
      newSelected.add(resultId);
    }
    setSelectedResults(newSelected);
  };

  const handleSelectAll = () => {
    if (data?.results) {
      // Rows whose invoice was deleted can't be resent.
      const resendable = data.results.filter((r) => r.invoice);
      if (selectedResults.size === resendable.length) {
        setSelectedResults(new Set());
      } else {
        setSelectedResults(new Set(resendable.map((r) => r.id)));
      }
    }
  };

  const handleResend = async () => {
    if (selectedResults.size === 0) {
      setError("Please select at least one email to resend");
      return;
    }

    try {
      setResending(true);
      const response = await fetch(
        `/api/accounting/email-runs/${runId}/resend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resultIds: Array.from(selectedResults) }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to resend emails");
      }

      setResendDialog(false);
      setSelectedResults(new Set());
      await fetchRunDetails();
    } catch (err) {
      console.error("Error resending emails:", err);
      setError(err instanceof Error ? err.message : "Failed to resend emails");
    } finally {
      setResending(false);
    }
  };

  if (loading && !data) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          minHeight="400px"
        >
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!data) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">{error || "Run not found"}</Alert>
        <Button component={Link} href="/accounting/email-report" sx={{ mt: 2 }}>
          Back to Reports
        </Button>
      </Container>
    );
  }

  const { run, results } = data;
  const canResend = canResendKind(run.kind);
  const isMemoRun = run.type === "MEMO";
  const resendableCount = results.filter((r) => r.invoice).length;
  const rate =
    run.totalInvoices > 0
      ? Math.round((run.successCount / run.totalInvoices) * 100)
      : 0;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Button
            component={Link}
            href={`/accounting/email-report?type=${encodeURIComponent(run.type)}`}
            variant="text"
            sx={{ mb: 2 }}
          >
            ← Back to Reports
          </Button>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="flex-start"
            gap={2}
            flexWrap="wrap"
          >
            <Box>
              <Typography variant="h4" component="h1" gutterBottom>
                Email Send Report
              </Typography>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                flexWrap="wrap"
                useFlexGap
              >
                <Chip size="small" label={emailReportTypeLabel(run.type)} />
                <Chip
                  size="small"
                  variant="outlined"
                  color={run.kind === "CANCELLATION" ? "warning" : "primary"}
                  label={EMAIL_RUN_KIND_LABELS[run.kind] ?? run.kind}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={EMAIL_RUN_SOURCE_LABELS[run.source] ?? run.source}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={run.status.replace("_", " ")}
                  color={
                    run.status === "COMPLETED"
                      ? "success"
                      : run.status === "IN_PROGRESS"
                        ? "warning"
                        : "error"
                  }
                />
              </Stack>
            </Box>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              href={`/api/accounting/email-runs/${runId}/export`}
            >
              Export CSV
            </Button>
          </Box>
        </Box>

        {run.recordedRows < run.totalInvoices && (
          <Alert severity="info">
            {run.totalInvoices - run.recordedRows} of {run.totalInvoices}{" "}
            {isMemoRun ? "rows" : "invoice rows"} in this run were removed
            before deleted invoices kept their email history.
          </Alert>
        )}

        {error && (
          <Alert
            severity="error"
            onClose={() => setError(null)}
            action={
              <Button color="inherit" size="small" onClick={fetchRunDetails}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        <Card variant="outlined">
          <CardContent>
            <Box
              display="grid"
              gridTemplateColumns="repeat(auto-fit, minmax(140px, 1fr))"
              gap={2}
            >
              <SummaryTile
                label={isMemoRun ? "Memos" : "Invoices"}
                value={run.totalInvoices}
              />
              <SummaryTile
                label="Sent"
                value={run.successCount}
                color="success.main"
              />
              <SummaryTile
                label="Failed"
                value={run.failureCount}
                color={run.failureCount > 0 ? "error.main" : undefined}
              />
              <SummaryTile label="Success rate" value={`${rate}%`} />
              <SummaryTile
                label="Started"
                value={<DateDisplay date={run.startedAt} format="datetime" />}
              />
              <SummaryTile
                label="Created by"
                value={
                  <Typography variant="body2">
                    {run.createdBy.name || run.createdBy.email}
                  </Typography>
                }
              />
            </Box>
            <LinearProgress
              variant="determinate"
              value={rate}
              color={
                rate === 100 ? "success" : rate >= 75 ? "warning" : "error"
              }
              sx={{ mt: 2, height: 6, borderRadius: 3 }}
            />
          </CardContent>
        </Card>

        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <TextField
            size="small"
            placeholder={
              isMemoRun
                ? "Search memo #, customer or email"
                : "Search invoice #, customer or email"
            }
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            sx={{ minWidth: { xs: "100%", sm: 320 } }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            select
            size="small"
            label="Result"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "" | "success" | "failed");
              setPage(0);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All results</MenuItem>
            <MenuItem value="success">Sent only</MenuItem>
            <MenuItem value="failed">Failed only</MenuItem>
          </TextField>
          {canResend && selectedResults.size > 0 && (
            <Button
              variant="contained"
              onClick={() => setResendDialog(true)}
              disabled={resending}
            >
              Resend {selectedResults.size} email(s)
            </Button>
          )}
        </Box>

        <TableContainer component={Paper} variant="outlined">
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
                {canResend && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={
                        resendableCount > 0 &&
                        selectedResults.size === resendableCount
                      }
                      indeterminate={
                        selectedResults.size > 0 &&
                        selectedResults.size < resendableCount
                      }
                      disabled={resendableCount === 0}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                )}
                <TableCell>{isMemoRun ? "Memo" : "Invoice"}</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>CC</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="center">Result</TableCell>
                <TableCell>Error</TableCell>
                <TableCell>Sent at</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canResend ? 8 : 7}
                    sx={{ textAlign: "center", py: 4 }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      No results match the selected filter
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                results.map((result) => (
                  <TableRow key={result.id} hover>
                    {canResend && (
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedResults.has(result.id)}
                          onChange={() => handleSelectResult(result.id)}
                          disabled={!result.invoice}
                        />
                      </TableCell>
                    )}
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      <DocumentCell result={result} isMemoRun={isMemoRun} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {result.customerName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {result.customerEmail}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {result.ccEmails.length > 0 ? (
                        result.ccEmails.map((cc) => (
                          <Typography
                            key={cc}
                            variant="caption"
                            display="block"
                            color="text.secondary"
                          >
                            {cc}
                          </Typography>
                        ))
                      ) : (
                        <Tooltip title="CC wasn't recorded for emails sent before CC tracking was added">
                          <Typography variant="caption" color="text.secondary">
                            —
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {isMemoRun ? (
                        result.memo ? (
                          <CurrencyDisplay value={result.memo.amount} />
                        ) : (
                          "—"
                        )
                      ) : result.invoice ? (
                        <CurrencyDisplay value={result.invoice.totalAmount} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {result.success ? (
                        <Tooltip title="Sent">
                          <CheckCircleIcon
                            sx={{ color: "success.main", fontSize: 20 }}
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Failed">
                          <CancelIcon
                            sx={{ color: "error.main", fontSize: 20 }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      {result.errorMessage ? (
                        <Typography variant="caption" color="error">
                          {result.errorMessage}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {result.sentAt ? (
                        <DateDisplay date={result.sentAt} format="datetime" />
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            rowsPerPageOptions={[10, 25, 50]}
            component="div"
            count={data.pagination.total}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
          />
        </TableContainer>
      </Stack>

      <Dialog open={resendDialog} onClose={() => setResendDialog(false)}>
        <DialogTitle>Resend Emails</DialogTitle>
        <DialogContent>
          <Typography>
            Resend the invoice email (with PDF) for {selectedResults.size}{" "}
            selected invoice(s)? The customer, their RM and the invoices inbox
            will receive it again.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResendDialog(false)}>Cancel</Button>
          <Button
            onClick={handleResend}
            variant="contained"
            disabled={resending}
          >
            {resending ? <CircularProgress size={24} /> : "Resend"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
