"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  Divider,
  Alert,
  TextField,
  MenuItem,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  useMonthlyRevenueDetail,
  MonthlyRevenueDetailFilters,
} from "@/lib/hooks/admin/useMonthlyRevenueDetail";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import CostPaymentTransactionsTable from "@/components/admin/CostPaymentTransactionsTable";

export default function MonthlyRevenueDetailPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [typeFilter, setTypeFilter] = useState<
    "" | "ELECTRICITY_CHARGES" | "ADJUSTMENT"
  >("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  const filters: MonthlyRevenueDetailFilters = {
    type: typeFilter || undefined,
    customer: customerFilter || undefined,
    startDate: startDateFilter || undefined,
    endDate: endDateFilter || undefined,
  };

  const { summary, transactions, pagination, loading, error } =
    useMonthlyRevenueDetail(page, pageSize, filters, { sortBy, sortOrder });

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(0);
  };

  const resetToFirstPage = () => setPage(0);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        variant="text"
        onClick={() => router.push("/adminpanel")}
        sx={{ mb: 2 }}
      >
        Back to Dashboard
      </Button>

      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
        Monthly Revenue (30 days)
      </Typography>
      <Typography color="textSecondary" sx={{ mb: 3 }}>
        Sum of CostPayment rows (type: ELECTRICITY_CHARGES or ADJUSTMENT)
        created in the last 30 days, sign-flipped for display.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Calculation
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 2,
            }}
          >
            <Box>
              <Typography color="textSecondary" variant="body2">
                Electricity Charges (sum, last 30 days)
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={summary?.sumElectricityCharges ?? 0} />
              </Typography>
            </Box>
            <Box>
              <Typography color="textSecondary" variant="body2">
                Adjustments (sum, last 30 days)
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={summary?.sumAdjustment ?? 0} />
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 2,
            }}
          >
            <Box>
              <Typography color="textSecondary" variant="body2">
                Raw total (as stored — charges are negative)
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={summary?.rawTotal ?? 0} />
              </Typography>
            </Box>
            <Box>
              <Typography color="textSecondary" variant="body2">
                Displayed on dashboard card (raw total &times; -1)
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                <CurrencyDisplay value={summary?.displayTotal ?? 0} />
              </Typography>
            </Box>
          </Box>

          {summary && (
            <Typography
              variant="caption"
              color="textSecondary"
              sx={{ mt: 2, display: "block" }}
            >
              Period: {new Date(summary.periodStart).toLocaleString()} to{" "}
              {new Date(summary.periodEnd).toLocaleString()} (rolling 30-day
              window, recalculated each time this page loads). The numbers above
              never change based on the filters below — filters only narrow
              which transactions are listed.
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Filters
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                md: "1fr 1fr 1fr 1fr",
              },
              gap: 2,
            }}
          >
            <TextField
              label="From date"
              type="date"
              size="small"
              value={startDateFilter}
              onChange={(e) => {
                setStartDateFilter(e.target.value);
                resetToFirstPage();
              }}
              InputLabelProps={{ shrink: true }}
              helperText="Narrows within the 30-day window"
            />
            <TextField
              label="To date"
              type="date"
              size="small"
              value={endDateFilter}
              onChange={(e) => {
                setEndDateFilter(e.target.value);
                resetToFirstPage();
              }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Customer (name or email)"
              size="small"
              value={customerFilter}
              onChange={(e) => {
                setCustomerFilter(e.target.value);
                resetToFirstPage();
              }}
            />
            <TextField
              select
              label="Type"
              size="small"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(
                  e.target.value as "" | "ELECTRICITY_CHARGES" | "ADJUSTMENT",
                );
                resetToFirstPage();
              }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="ELECTRICITY_CHARGES">
                Hosting & electricity charges
              </MenuItem>
              <MenuItem value="ADJUSTMENT">Adjustment</MenuItem>
            </TextField>
          </Box>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mb: 2 }}>
        Transactions ({pagination?.totalCount ?? 0})
      </Typography>
      <CostPaymentTransactionsTable
        transactions={transactions}
        loading={loading}
        page={page}
        pageSize={pageSize}
        totalCount={pagination?.totalCount ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50, 100, { value: 9999, label: "Max" }]}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
      />
    </Container>
  );
}
