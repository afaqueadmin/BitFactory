"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useMemos, MemoTransaction } from "@/lib/hooks/admin/useMemos";
import { useCustomers, Customer } from "@/lib/hooks/useInvoices";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import MemoTransactionsTable from "@/components/admin/MemoTransactionsTable";
import CreateMemoModal from "@/components/CreateMemoModal";
import MemoHistoryDialog from "@/components/MemoHistoryDialog";

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

export default function MemosPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MemosContent />
    </Suspense>
  );
}

function MemosContent() {
  const searchParams = useSearchParams();

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [customerId, setCustomerId] = useState(
    searchParams.get("customerId") || "",
  );
  const [category, setCategory] = useState("");
  const [memoType, setMemoType] = useState("");
  const [status, setStatus] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [notification, setNotification] = useState("");
  const [historyMemoId, setHistoryMemoId] = useState<string | null>(null);
  const [voidingMemo, setVoidingMemo] = useState<MemoTransaction | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { customers, loading: customersLoading } = useCustomers();

  const filters = {
    customerId: customerId || undefined,
    category: (category || undefined) as "HOSTING" | "HARDWARE" | undefined,
    memoType: (memoType || undefined) as
      | "CUSTOMER_FACING"
      | "INTERNAL"
      | undefined,
    status: (status || undefined) as "ISSUED" | "VOIDED" | undefined,
    startDate: startDateFilter || undefined,
    endDate: endDateFilter || undefined,
  };

  const { summary, memos, pagination, loading, error, refetch } = useMemos(
    page,
    pageSize,
    filters,
    { sortBy, sortOrder },
  );

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

  const handleViewHistory = (row: MemoTransaction) => {
    setHistoryMemoId(row.id);
  };

  const handleVoidClick = (row: MemoTransaction) => {
    setVoidingMemo(row);
    setVoidReason("");
    setVoidError("");
  };

  const handleVoidConfirm = async () => {
    if (!voidingMemo) return;
    if (!voidReason.trim()) {
      setVoidError("Please enter a reason for voiding this memo");
      return;
    }

    setVoidLoading(true);
    setVoidError("");
    try {
      const response = await fetch(`/api/memos/${voidingMemo.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voidReason: voidReason.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to void memo");
      }

      setNotification(
        voidingMemo.pairedMemoId
          ? "Memo voided successfully (its paired offset was voided too)"
          : "Memo voided successfully",
      );
      setVoidingMemo(null);
      refetch();
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : "Failed to void memo");
    } finally {
      setVoidLoading(false);
    }
  };

  const handleDownload = async (row: MemoTransaction) => {
    try {
      setDownloadingId(row.id);
      const response = await fetch(`/api/memos/${row.id}/download`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to download memo");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `memo-${row.memoNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setNotification(
        err instanceof Error ? err.message : "Failed to download memo",
      );
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
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
            Memos
          </Typography>
          <Typography color="textSecondary">
            Memos issued against Hosting & Colocation or Hardware Sales revenue,
            either sent to the customer (as a Debit or Credit Memo, depending on
            direction) or kept as an internal record only.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddModalOpen(true)}
        >
          Create Memo
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
            Total issued (filtered)
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
            <TextField
              select
              label="Category"
              size="small"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                resetToFirstPage();
              }}
            >
              <MenuItem value="">All categories</MenuItem>
              <MenuItem value="HOSTING">Hosting & Colocation</MenuItem>
              <MenuItem value="HARDWARE">Hardware Sales</MenuItem>
            </TextField>
            <TextField
              select
              label="Memo Type"
              size="small"
              value={memoType}
              onChange={(e) => {
                setMemoType(e.target.value);
                resetToFirstPage();
              }}
            >
              <MenuItem value="">All types</MenuItem>
              <MenuItem value="CUSTOMER_FACING">Customer-facing</MenuItem>
              <MenuItem value="INTERNAL">Internal</MenuItem>
            </TextField>
            <TextField
              select
              label="Status"
              size="small"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                resetToFirstPage();
              }}
            >
              <MenuItem value="">All statuses</MenuItem>
              <MenuItem value="ISSUED">Issued</MenuItem>
              <MenuItem value="VOIDED">Voided</MenuItem>
            </TextField>
          </Box>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mb: 2 }}>
        Memos ({pagination?.totalCount ?? 0})
      </Typography>
      <MemoTransactionsTable
        transactions={memos}
        loading={loading || downloadingId !== null}
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
        onViewHistory={handleViewHistory}
        onVoid={handleVoidClick}
        onDownload={handleDownload}
      />

      <CreateMemoModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />

      <MemoHistoryDialog
        open={Boolean(historyMemoId)}
        onClose={() => setHistoryMemoId(null)}
        memoId={historyMemoId}
      />

      <Dialog open={Boolean(voidingMemo)} onClose={() => setVoidingMemo(null)}>
        <DialogTitle>Void Memo</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, minWidth: 360 }}>
            {voidError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {voidError}
              </Alert>
            )}
            <Typography variant="body2" sx={{ mb: 2 }}>
              Void {voidingMemo?.memoNumber}? This cannot be undone - its amount
              will be excluded from revenue totals going forward.
              {voidingMemo?.pairedMemoId
                ? " Its paired offsetting memo will be voided at the same time."
                : ""}
            </Typography>
            <TextField
              fullWidth
              label="Void Reason"
              multiline
              rows={3}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              required
              inputProps={{ maxLength: 500 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVoidingMemo(null)} disabled={voidLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleVoidConfirm}
            variant="contained"
            color="error"
            disabled={voidLoading}
          >
            {voidLoading ? "Voiding..." : "Void Memo"}
          </Button>
        </DialogActions>
      </Dialog>

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
