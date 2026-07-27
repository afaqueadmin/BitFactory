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
  CircularProgress,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
import {
  useCustomerBalanceDetail,
  CustomerBalanceDetailFilters,
} from "@/lib/hooks/admin/useCustomerBalanceDetail";
import { useCustomers, Customer } from "@/lib/hooks/useInvoices";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import CostPaymentTransactionsTable from "@/components/admin/CostPaymentTransactionsTable";

export default function CustomerBalanceDetailPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<
    "" | "PAYMENT" | "ELECTRICITY_CHARGES" | "ADJUSTMENT"
  >("");
  const [customerId, setCustomerId] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  const { customers, loading: customersLoading } = useCustomers();

  const isFiltered = Boolean(
    typeFilter || customerId || startDateFilter || endDateFilter,
  );

  const filters: CustomerBalanceDetailFilters = {
    type: typeFilter || undefined,
    customerId: customerId || undefined,
    startDate: startDateFilter || undefined,
    endDate: endDateFilter || undefined,
  };

  const { summary, transactions, pagination, loading, error } =
    useCustomerBalanceDetail(page, pageSize, filters, { sortBy, sortOrder });

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

  const handleDownloadPdf = async () => {
    try {
      setDownloadLoading(true);
      setDownloadError(null);

      const params = new URLSearchParams({ sortBy, sortOrder });
      if (typeFilter) params.set("type", typeFilter);
      if (customerId) params.set("customerId", customerId);
      if (startDateFilter) params.set("startDate", startDateFilter);
      if (endDateFilter) params.set("endDate", endDateFilter);

      const response = await fetch(
        `/api/admin/customer-balance/pdf?${params.toString()}`,
        { credentials: "include" },
      );

      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customer-balance-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Failed to download PDF",
      );
    } finally {
      setDownloadLoading(false);
    }
  };

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
        Total Customer Balance
      </Typography>
      <Typography color="textSecondary" sx={{ mb: 3 }}>
        All-time net sum of CostPayment rows (every type except HARDWARE_SALES)
        — a net ledger balance, not a revenue figure, so no sign flip is
        applied.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {downloadError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {downloadError}
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
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
              gap: 2,
            }}
          >
            <Box>
              <Typography color="textSecondary" variant="body2">
                Payments (sum)
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={summary?.sumPayment ?? 0} />
              </Typography>
            </Box>
            <Box>
              <Typography color="textSecondary" variant="body2">
                Electricity Charges (sum)
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={summary?.sumElectricityCharges ?? 0} />
              </Typography>
            </Box>
            <Box>
              <Typography color="textSecondary" variant="body2">
                Adjustments (sum)
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={summary?.sumAdjustment ?? 0} />
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box>
            <Typography color="textSecondary" variant="body2">
              Total (sum of the three buckets above)
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              <CurrencyDisplay value={summary?.displayTotal ?? 0} />
            </Typography>
          </Box>

          <Typography
            variant="caption"
            color="textSecondary"
            sx={{ mt: 2, display: "block" }}
          >
            {isFiltered
              ? "These 4 numbers are recalculated from the filtered transactions below — they no longer match the dashboard card while a filter is active."
              : "No filters applied — this covers every CostPayment row ever created (HARDWARE_SALES excluded) and matches the dashboard card exactly."}
          </Typography>
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
              helperText="No lower bound if left blank"
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
              select
              label="Customer"
              size="small"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                resetToFirstPage();
              }}
              disabled={customersLoading}
            >
              <MenuItem value="">All customers</MenuItem>
              {customers.map((c: Customer) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.displayName}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Type"
              size="small"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(
                  e.target.value as
                    | ""
                    | "PAYMENT"
                    | "ELECTRICITY_CHARGES"
                    | "ADJUSTMENT",
                );
                resetToFirstPage();
              }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="PAYMENT">Payment</MenuItem>
              <MenuItem value="ELECTRICITY_CHARGES">
                Hosting & electricity charges
              </MenuItem>
              <MenuItem value="ADJUSTMENT">Adjustment</MenuItem>
            </TextField>
          </Box>
        </CardContent>
      </Card>

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h6">
          Transactions ({pagination?.totalCount ?? 0})
        </Typography>
        <Button
          startIcon={
            downloadLoading ? <CircularProgress size={16} /> : <DownloadIcon />
          }
          variant="outlined"
          onClick={handleDownloadPdf}
          disabled={downloadLoading}
        >
          {downloadLoading ? "Generating PDF..." : "Download PDF"}
        </Button>
      </Box>
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
