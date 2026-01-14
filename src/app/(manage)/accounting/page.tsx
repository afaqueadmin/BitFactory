/**
 * Accounting Dashboard
 *
 * Main dashboard showing accounting overview
 */

"use client";

import {
  Box,
  Container,
  CircularProgress,
  Alert,
  Button,
  Stack,
  Typography,
} from "@mui/material";
import { useDashboardStats } from "@/lib/hooks/useDashboard";
import { StatsCard } from "@/components/accounting/dashboard/StatsCard";
import { UpcomingInvoices } from "@/components/accounting/dashboard/UpcomingInvoices";
import { RecentInvoices } from "@/components/accounting/dashboard/RecentInvoices";
import RefreshIcon from "@mui/icons-material/Refresh";

export default function AccountingDashboard() {
  const { dashboard, loading, error, refetch } = useDashboardStats();

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg">
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!dashboard) {
    return (
      <Container maxWidth="lg">
        <Alert severity="warning">No data available</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={4}
      >
        <div>
          <Typography variant="h4" sx={{ fontWeight: "bold" }}>
            Accounting Dashboard
          </Typography>
          <Typography color="textSecondary" sx={{ mt: 0.5 }}>
            Overview of invoices, payments, and recurring income
          </Typography>
        </div>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={refetch}
        >
          Refresh
        </Button>
      </Stack>

      {/* Stats Row */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "1fr 1fr",
            md: "1fr 1fr 1fr 1fr",
          },
          gap: 3,
          mb: 4,
        }}
      >
        <Box>
          <StatsCard
            label="Total Invoices"
            value={dashboard.totalInvoices}
            color="info"
          />
        </Box>
        <Box>
          <StatsCard
            label="Unpaid Invoices"
            value={dashboard.unpaidInvoices}
            color="warning"
          />
        </Box>
        <Box>
          <StatsCard
            label="Overdue Invoices"
            value={dashboard.overdueInvoices}
            color="error"
          />
        </Box>
        <Box>
          <StatsCard
            label="Total Outstanding"
            value={dashboard.totalOutstanding}
            isCurrency
            color="primary"
          />
        </Box>
      </Box>

      {/* Recurring Overview */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 3,
          mb: 4,
        }}
      >
        <Box>
          <StatsCard
            label="Recurring Templates"
            value={dashboard.recurringInvoices.total}
            subtext={`${dashboard.recurringInvoices.active} active`}
            color="success"
          />
        </Box>
        <Box>
          <StatsCard
            label="Active Templates"
            value={dashboard.recurringInvoices.active}
            color="success"
          />
        </Box>
      </Box>

      {/* Tables */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 3 }}>
        <Box>
          <UpcomingInvoices invoices={dashboard.upcomingInvoices} />
        </Box>
        <Box>
          <RecentInvoices invoices={dashboard.recentInvoices} />
        </Box>
      </Box>
    </Container>
  );
}
