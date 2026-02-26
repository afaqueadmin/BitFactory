"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  Typography,
  Chip,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";

interface EmailSendResult {
  id: string;
  invoiceId: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    totalAmount: string | number;
    dueDate: string;
  };
  customerName: string;
  customerEmail: string;
  success: boolean;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface EmailSendRunDetail {
  id: string;
  type: string;
  status: string;
  totalInvoices: number;
  successCount: number;
  failureCount: number;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

export default function EmailReportDetailPage() {
  const params = useParams();
  const runId = params.runId as string;

  const [data, setData] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | "success" | "failed">(
    "",
  );
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedResults, setSelectedResults] = useState<Set<string>>(
    new Set(),
  );
  const [resending, setResending] = useState(false);
  const [resendDialog, setResendDialog] = useState(false);

  const fetchRunDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const searchParams = new URLSearchParams({
        status: statusFilter,
        page: (page + 1).toString(),
        limit: rowsPerPage.toString(),
      });

      const response = await fetch(
        `/api/accounting/email-runs/${runId}?${searchParams}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch email run details");
      }

      const fetchedData = await response.json();
      setData(fetchedData);
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
  };

  useEffect(() => {
    fetchRunDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page, rowsPerPage, runId]);

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
      if (selectedResults.size === data.results.length) {
        setSelectedResults(new Set());
      } else {
        setSelectedResults(new Set(data.results.map((r) => r.id)));
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
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            resultIds: Array.from(selectedResults),
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to resend emails");
      }

      setResendDialog(false);
      setSelectedResults(new Set());
      // Refresh data
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
      <Container maxWidth="lg" sx={{ py: 4 }}>
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
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{error || "Run not found"}</Alert>
        <Button component={Link} href="/accounting/email-report" sx={{ mt: 2 }}>
          Back to Reports
        </Button>
      </Container>
    );
  }

  const { run, results } = data;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Button
            component={Link}
            href="/accounting/email-report"
            variant="text"
            sx={{ mb: 2 }}
          >
            ← Back to Reports
          </Button>
          <Typography variant="h4" component="h1" gutterBottom>
            Email Send Report Details
          </Typography>
        </Box>

        {error && (
          <Alert severity="error">
            {error}
            <Button size="small" onClick={fetchRunDetails} sx={{ ml: 2 }}>
              Retry
            </Button>
          </Alert>
        )}

        {/* Summary Card */}
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
              >
                <Box>
                  <Typography variant="h6">Run Summary</Typography>
                  <Typography variant="caption" color="textSecondary">
                    {run.type}: Started at{" "}
                    <DateDisplay date={run.startedAt} format="datetime" />
                  </Typography>
                </Box>
                <Chip
                  label={run.status}
                  color={
                    run.status === "COMPLETED"
                      ? "success"
                      : run.status === "IN_PROGRESS"
                        ? "warning"
                        : "error"
                  }
                  variant="outlined"
                />
              </Box>

              <Box display="grid" gridTemplateColumns="repeat(4, 1fr)" gap={2}>
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    Total Invoices
                  </Typography>
                  <Typography variant="h6">{run.totalInvoices}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    Success
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{ color: "success.main", fontWeight: 600 }}
                  >
                    {run.successCount}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    Failed
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{
                      color:
                        run.failureCount > 0 ? "error.main" : "textSecondary",
                    }}
                  >
                    {run.failureCount}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    Success Rate
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {run.totalInvoices > 0
                      ? Math.round((run.successCount / run.totalInvoices) * 100)
                      : 0}
                    %
                  </Typography>
                </Box>
              </Box>

              <Box display="flex" gap={1} flexWrap="wrap">
                <TextField
                  select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(
                      e.target.value as "" | "success" | "failed",
                    );
                    setPage(0);
                  }}
                  size="small"
                  sx={{ minWidth: 150 }}
                  SelectProps={{ native: true }}
                >
                  <option value="">All Results</option>
                  <option value="success">Successful Only</option>
                  <option value="failed">Failed Only</option>
                </TextField>
                {selectedResults.size > 0 && (
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setResendDialog(true)}
                    disabled={resending}
                  >
                    Resend {selectedResults.size} Email(s)
                  </Button>
                )}
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Results Table */}
        <TableContainer component={Paper}>
          <Table>
            <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={
                      results.length > 0 &&
                      selectedResults.size === results.length
                    }
                    indeterminate={
                      selectedResults.size > 0 &&
                      selectedResults.size < results.length
                    }
                    onChange={handleSelectAll}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Invoice</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">
                  Status
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Error</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Sent At</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: "center", py: 3 }}>
                    <Typography variant="body2" color="textSecondary">
                      No results match the selected filter
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                results.map((result) => (
                  <TableRow key={result.id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedResults.has(result.id)}
                        onChange={() => handleSelectResult(result.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {result.invoice.invoiceNumber}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {result.invoiceId}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{result.customerName}</TableCell>
                    <TableCell>{result.customerEmail}</TableCell>
                    <TableCell>
                      <CurrencyDisplay value={result.invoice.totalAmount} />
                    </TableCell>
                    <TableCell align="center">
                      {result.success ? (
                        <CheckCircleIcon
                          sx={{ color: "success.main", fontSize: 20 }}
                        />
                      ) : (
                        <CancelIcon
                          sx={{ color: "error.main", fontSize: 20 }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {result.errorMessage ? (
                        <Typography variant="caption" color="error">
                          {result.errorMessage}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="textSecondary">
                          -
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {result.sentAt ? (
                        <DateDisplay date={result.sentAt} format="datetime" />
                      ) : (
                        <Typography variant="caption" color="textSecondary">
                          -
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {results.length > 0 && (
            <TablePagination
              rowsPerPageOptions={[10, 25, 50]}
              component="div"
              count={data.pagination.total}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(e, newPage) => setPage(newPage)}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value));
                setPage(0);
              }}
            />
          )}
        </TableContainer>
      </Stack>

      {/* Resend Confirmation Dialog */}
      <Dialog open={resendDialog} onClose={() => setResendDialog(false)}>
        <DialogTitle>Resend Emails</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to resend {selectedResults.size} email(s)?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResendDialog(false)}>Cancel</Button>
          <Button
            onClick={handleResend}
            variant="contained"
            color="primary"
            disabled={resending}
          >
            {resending ? <CircularProgress size={24} /> : "Resend"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
