"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Container,
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  Alert,
  TextField,
  MenuItem,
  Snackbar,
  CircularProgress,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import {
  useAdjustments,
  AdjustmentTransaction,
} from "@/lib/hooks/admin/useAdjustments";
import { useCustomers, Customer } from "@/lib/hooks/useInvoices";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import CostPaymentTransactionsTable, {
  TransactionRow,
} from "@/components/admin/CostPaymentTransactionsTable";
import AddAdjustmentModal from "@/components/AddAdjustmentModal";
import EditAdjustmentModal from "@/components/EditAdjustmentModal";

function LoadingFallback() {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "50vh",
      }}
    >
      <CircularProgress />
    </Box>
  );
}

export default function CreditAdjustmentsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CreditAdjustmentsContent />
    </Suspense>
  );
}

function CreditAdjustmentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [customerId, setCustomerId] = useState(
    searchParams.get("customerId") || "",
  );
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingAdjustment, setEditingAdjustment] =
    useState<AdjustmentTransaction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notification, setNotification] = useState("");

  const { customers, loading: customersLoading } = useCustomers();

  const filters = {
    customerId: customerId || undefined,
    startDate: startDateFilter || undefined,
    endDate: endDateFilter || undefined,
  };

  const { summary, transactions, pagination, loading, error, refetch } =
    useAdjustments(page, pageSize, filters, { sortBy, sortOrder });

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

  const handleAddSuccess = (text: string) => {
    setNotification(text);
    refetch();
  };

  const handleEdit = (row: TransactionRow) => {
    const adjustment = transactions.find((t) => t.id === row.id);
    if (adjustment) setEditingAdjustment(adjustment);
  };

  const handleEditSuccess = (text: string) => {
    setNotification(text);
    setEditingAdjustment(null);
    refetch();
  };

  const handleDelete = async (row: TransactionRow) => {
    if (
      !window.confirm(
        `Delete this adjustment of ${row.amount} for ${row.customer?.name || row.customer?.email || "this customer"}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingId(row.id);
    try {
      const response = await fetch(`/api/admin/adjustments/${row.id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete adjustment");
      }

      setNotification("Adjustment deleted successfully");
      refetch();
    } catch (err) {
      setNotification(
        err instanceof Error ? err.message : "Failed to delete adjustment",
      );
    } finally {
      setDeletingId(null);
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

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 3,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
            Credit Adjustments
          </Typography>
          <Typography color="textSecondary">
            All manual balance adjustments (CostPayment rows of type ADJUSTMENT)
            across customers. Add, edit, or delete an adjustment below.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddModalOpen(true)}
        >
          Add Adjustment
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography color="textSecondary" variant="body2">
            Total adjustments (filtered)
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            <CurrencyDisplay value={summary?.totalAmount ?? 0} />
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
                md: "1fr 1fr 1fr",
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
          </Box>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mb: 2 }}>
        Adjustments ({pagination?.totalCount ?? 0})
      </Typography>
      <CostPaymentTransactionsTable
        transactions={transactions}
        loading={loading || deletingId !== null}
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
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <AddAdjustmentModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={handleAddSuccess}
        customerId={null}
      />

      <EditAdjustmentModal
        open={Boolean(editingAdjustment)}
        onClose={() => setEditingAdjustment(null)}
        onSuccess={handleEditSuccess}
        adjustment={editingAdjustment}
      />

      <Snackbar
        open={Boolean(notification)}
        autoHideDuration={5000}
        onClose={() => setNotification("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setNotification("")}
          severity={
            notification.toLowerCase().includes("failed") ? "error" : "success"
          }
          sx={{ width: "100%" }}
        >
          {notification}
        </Alert>
      </Snackbar>
    </Container>
  );
}
