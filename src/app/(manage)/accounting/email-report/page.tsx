"use client";

import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Button,
} from "@mui/material";
import { useEffect, useState } from "react";
import Link from "next/link";
import RefreshIcon from "@mui/icons-material/Refresh";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";

interface EmailSendRun {
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

export default function EmailReportPage() {
  const [runs, setRuns] = useState<EmailSendRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchRuns();
  }, []);

  const fetchRuns = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const response = await fetch("/api/accounting/email-runs");

      if (!response.ok) {
        throw new Error("Failed to fetch email runs");
      }

      const data = await response.json();
      setRuns(data.data || []);
    } catch (err) {
      console.error("Error fetching email runs:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch email runs",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getSuccessRate = (run: EmailSendRun) => {
    if (run.totalInvoices === 0) return 0;
    return Math.round((run.successCount / run.totalInvoices) * 100);
  };

  if (loading) {
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

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="flex-start"
        >
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              Email Send Reports
            </Typography>
            <Typography variant="body2" color="textSecondary">
              View and manage all bulk email operations
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchRuns}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </Box>

        {error && (
          <Alert severity="error">
            {error}
            <Button size="small" onClick={fetchRuns} sx={{ ml: 2 }}>
              Retry
            </Button>
          </Alert>
        )}

        {runs.length === 0 ? (
          <Card>
            <CardContent sx={{ textAlign: "center", py: 6 }}>
              <Typography variant="body1" color="textSecondary">
                No email send runs yet
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Invoices
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Success Rate
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Created By</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Started</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Action
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id} hover>
                    <TableCell>
                      <Chip
                        label={run.status}
                        color={
                          run.status === "COMPLETED"
                            ? "success"
                            : run.status === "IN_PROGRESS"
                              ? "warning"
                              : "error"
                        }
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        ✓ {run.successCount} / ✗ {run.failureCount} / Total{" "}
                        {run.totalInvoices}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          color:
                            getSuccessRate(run) === 100
                              ? "success.main"
                              : getSuccessRate(run) >= 75
                                ? "warning.main"
                                : "error.main",
                          fontWeight: 600,
                        }}
                      >
                        {getSuccessRate(run)}%
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2">
                          {run.createdBy.name}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {run.createdBy.email}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <DateDisplay date={run.startedAt} format="datetime" />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        component={Link}
                        href={`/accounting/email-report/${run.id}`}
                        variant="outlined"
                        size="small"
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
    </Container>
  );
}
