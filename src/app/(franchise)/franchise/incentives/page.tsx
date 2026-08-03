"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  useTheme,
} from "@mui/material";
import AdminValueCard from "@/components/admin/AdminValueCard";
import { formatValue } from "@/lib/helpers/formatValue";

interface IncentiveSummary {
  totalEarned: number;
  totalPaid: number;
  totalUnpaid: number;
  currentMonthTotal: number;
  byType: {
    HARDWARE_SALE: number;
    OWN_MACHINE_HOSTING_REBATE: number;
    CLIENT_HOSTING_COMMISSION: number;
  };
  monthlyTrend: { month: string; amount: number }[];
  topClients: {
    client: { id: string; name: string | null; email: string } | null;
    amount: number;
  }[];
}

interface IncentiveEntry {
  id: string;
  incentiveType: keyof IncentiveSummary["byType"];
  sourceInvoiceNumber: string;
  clientUser: { id: string; name: string | null; email: string } | null;
  basisAmount: string;
  rateApplied: string;
  amount: string;
  status: "ACCRUED" | "REVERSED";
  accrualDate: string;
  payoutBatch: { id: string; paidDate: string } | null;
}

const TYPE_LABELS: Record<keyof IncentiveSummary["byType"], string> = {
  HARDWARE_SALE: "Hardware Sale",
  OWN_MACHINE_HOSTING_REBATE: "Own-Machine Rebate",
  CLIENT_HOSTING_COMMISSION: "Client Hosting Commission",
};

export default function FranchiseIncentivesPage() {
  const theme = useTheme();

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useQuery<IncentiveSummary>({
    queryKey: ["franchiseIncentiveSummary"],
    queryFn: async () => {
      const res = await fetch("/api/franchise/incentives/summary");
      if (!res.ok) throw new Error("Failed to fetch incentive summary");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery<{
    entries: IncentiveEntry[];
  }>({
    queryKey: ["franchiseIncentiveEntries"],
    queryFn: async () => {
      const res = await fetch("/api/franchise/incentives?limit=50");
      if (!res.ok) throw new Error("Failed to fetch incentive entries");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const loading = summaryLoading || ledgerLoading;

  if (loading) {
    return (
      <Box
        sx={{
          p: 4,
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 4,
        backgroundColor:
          theme.palette.mode === "dark"
            ? theme.palette.background.default
            : "#f5f5f7",
        minHeight: "calc(100vh - 64px)",
      }}
    >
      {summaryError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {summaryError instanceof Error
            ? summaryError.message
            : "An error occurred"}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            lg: "repeat(4, 1fr)",
          },
          gap: { xs: 2, sm: 3 },
          maxWidth: { sm: "100%", lg: 1400 },
          mx: "auto",
          mb: 4,
        }}
      >
        <AdminValueCard
          title="Total Earned"
          borderColor="#4CAF50"
          value={summary?.totalEarned ?? 0}
          type="currency"
          infoText="All incentives accrued to date across hardware sales, own-machine hosting rebates, and client hosting commissions."
        />
        <AdminValueCard
          title="Total Unpaid"
          borderColor="#FF9800"
          value={summary?.totalUnpaid ?? 0}
          type="currency"
          infoText="Accrued incentives not yet paid out to you."
        />
        <AdminValueCard
          title="Total Paid"
          borderColor="#757575"
          value={summary?.totalPaid ?? 0}
          type="currency"
        />
        <AdminValueCard
          title="This Month"
          borderColor="#9C27B0"
          value={summary?.currentMonthTotal ?? 0}
          type="currency"
        />
        <AdminValueCard
          title="Hardware Sale Incentives"
          borderColor="#1565C0"
          value={summary?.byType.HARDWARE_SALE ?? 0}
          type="currency"
        />
        <AdminValueCard
          title="Own-Machine Hosting Rebate"
          borderColor="#1565C0"
          value={summary?.byType.OWN_MACHINE_HOSTING_REBATE ?? 0}
          type="currency"
        />
        <AdminValueCard
          title="Client Hosting Commission"
          borderColor="#1565C0"
          value={summary?.byType.CLIENT_HOSTING_COMMISSION ?? 0}
          type="currency"
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" },
          gap: 3,
          maxWidth: { sm: "100%", lg: 1400 },
          mx: "auto",
          mb: 4,
        }}
      >
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Monthly Earnings (last 12 months)
          </Typography>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={summary?.monthlyTrend ?? []}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={theme.palette.divider}
              />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <RechartsTooltip
                formatter={(value) => formatValue(Number(value), "currency")}
              />
              <Bar dataKey="amount" fill="#9C27B0" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Top Earning Clients
          </Typography>
          {summary?.topClients && summary.topClients.length > 0 ? (
            summary.topClients.map((tc, idx) => (
              <Box
                key={tc.client?.id ?? idx}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  py: 1,
                  borderBottom:
                    idx < summary.topClients.length - 1
                      ? `1px solid ${theme.palette.divider}`
                      : "none",
                }}
              >
                <Typography variant="body2">
                  {tc.client?.name || tc.client?.email || "Unknown"}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {formatValue(tc.amount, "currency")}
                </Typography>
              </Box>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              No client commission earnings yet.
            </Typography>
          )}
        </Paper>
      </Box>

      <Paper
        sx={{
          p: 3,
          borderRadius: 2,
          maxWidth: { sm: "100%", lg: 1400 },
          mx: "auto",
        }}
      >
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Incentive Transactions
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Client</TableCell>
                <TableCell>Source Invoice</TableCell>
                <TableCell align="right">Basis</TableCell>
                <TableCell align="right">Rate</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Paid</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(ledger?.entries ?? []).map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {new Date(entry.accrualDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{TYPE_LABELS[entry.incentiveType]}</TableCell>
                  <TableCell>
                    {entry.clientUser
                      ? entry.clientUser.name || entry.clientUser.email
                      : "My Own Machines"}
                  </TableCell>
                  <TableCell>{entry.sourceInvoiceNumber}</TableCell>
                  <TableCell align="right">
                    {formatValue(Number(entry.basisAmount), "currency")}
                  </TableCell>
                  <TableCell align="right">{entry.rateApplied}</TableCell>
                  <TableCell align="right">
                    {formatValue(Number(entry.amount), "currency")}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={entry.status}
                      color={entry.status === "ACCRUED" ? "success" : "default"}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={entry.payoutBatch ? "Paid" : "Unpaid"}
                      color={entry.payoutBatch ? "success" : "warning"}
                      variant={entry.payoutBatch ? "filled" : "outlined"}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {(!ledger?.entries || ledger.entries.length === 0) && (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ py: 3 }}
                    >
                      No incentive transactions yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
