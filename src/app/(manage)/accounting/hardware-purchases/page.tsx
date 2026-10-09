"use client";

import {
  Box,
  Container,
  CircularProgress,
  Alert,
  Button,
  Stack,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  IconButton,
  Tooltip,
  TextField,
  MenuItem,
} from "@mui/material";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StatsCard } from "@/components/accounting/dashboard/StatsCard";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DownloadIcon from "@mui/icons-material/Download";
import { downloadExport } from "@/lib/downloadExport";
import {
  useHardwarePurchases,
  HardwarePurchaseInvoice,
  VENDOR_NAME_LABELS,
  VENDOR_NAME_OPTIONS,
  VendorNameValue,
} from "@/lib/hooks/useHardwarePurchases";
import EditHardwarePurchaseModal from "@/components/accounting/EditHardwarePurchaseModal";

export default function HardwarePurchases() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  const [selectedInvoiceData, setSelectedInvoiceData] =
    useState<HardwarePurchaseInvoice | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [vendorFilter, setVendorFilter] = useState<"" | VendorNameValue>("");
  const [statusFilter, setStatusFilter] = useState("");
  const [hardwareInput, setHardwareInput] = useState("");
  const [hardwareFilter, setHardwareFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  // Light debounce on the free-text hardware search so it doesn't fire a
  // request per keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setHardwareFilter(hardwareInput.trim());
    }, 400);
    return () => clearTimeout(timeout);
  }, [hardwareInput]);

  const {
    hardwarePurchases,
    total,
    summary,
    loading: invoicesLoading,
    error: invoicesError,
    refetch,
  } = useHardwarePurchases(
    page,
    pageSize,
    statusFilter || undefined,
    sortBy,
    sortOrder,
    {
      vendorName: vendorFilter || undefined,
      hardware: hardwareFilter || undefined,
      startDate: startDateFilter || undefined,
      endDate: endDateFilter || undefined,
    },
  );

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const handleExport = async (format: "csv" | "pdf") => {
    try {
      setExporting(format);
      setExportError(null);
      const params = new URLSearchParams({
        format,
        sortBy,
        sortOrder,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (vendorFilter) params.set("vendorName", vendorFilter);
      if (hardwareFilter) params.set("hardware", hardwareFilter);
      if (statusFilter) params.set("paymentStatus", statusFilter);
      if (startDateFilter) params.set("startDate", startDateFilter);
      if (endDateFilter) params.set("endDate", endDateFilter);
      await downloadExport(
        `/api/hardware-purchases/export?${params.toString()}`,
        `hardware-purchases-${new Date().toLocaleDateString("en-CA")}.${format}`,
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to download export",
      );
    } finally {
      setExporting(null);
    }
  };

  const handleEditClick = (
    invoiceId: string,
    invoiceData: HardwarePurchaseInvoice,
  ) => {
    setSelectedInvoiceId(invoiceId);
    setSelectedInvoiceData(invoiceData);
    setEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setSelectedInvoiceId(null);
    setSelectedInvoiceData(null);
  };

  const handleEditSuccess = () => {
    refetch();
    handleCloseEditModal();
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage + 1);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setPageSize(parseInt(event.target.value, 10));
    setPage(1);
  };

  const calculateDaysUntilDue = (dueDate: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  if (invoicesLoading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (invoicesError) {
    return (
      <Container maxWidth="lg">
        <Alert severity="error">{invoicesError}</Alert>
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
            Hardware Purchases Dashboard
          </Typography>
          <Typography color="textSecondary" sx={{ mt: 0.5 }}>
            Overview of hardware purchase invoices and payments
          </Typography>
        </div>
        <Link href="/accounting/hardware-purchases/create">
          <Button variant="contained" startIcon={<AddIcon />}>
            Record Hardware Purchase
          </Button>
        </Link>
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
          <StatsCard label="Total Invoices" value={total} color="info" />
        </Box>
        <Box>
          <StatsCard
            label="Unpaid Invoices"
            value={summary.unpaidCount}
            color="warning"
          />
        </Box>
        <Box>
          <StatsCard
            label="Overdue Invoices"
            value={summary.overdueCount}
            color="error"
          />
        </Box>
        <Box>
          <StatsCard
            label="Total Outstanding"
            value={summary.totalOutstanding}
            isCurrency
            color="primary"
          />
        </Box>
      </Box>

      {/* Table */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 3 }}>
        <Paper>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 1,
              p: 2,
            }}
          >
            <TextField
              select
              size="small"
              label="Filter by vendor"
              value={vendorFilter}
              onChange={(e) => {
                setVendorFilter(e.target.value as "" | VendorNameValue);
                setPage(1);
              }}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">All vendors</MenuItem>
              {VENDOR_NAME_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Filter by hardware"
              placeholder="e.g. S21"
              value={hardwareInput}
              onChange={(e) => {
                setHardwareInput(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 180 }}
            />
            <TextField
              select
              size="small"
              label="Filter by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">All statuses</MenuItem>
              <MenuItem value="Pending">Pending</MenuItem>
              <MenuItem value="Paid">Paid</MenuItem>
              <MenuItem value="Cancelled">Cancelled</MenuItem>
            </TextField>
            <TextField
              label="Issued from"
              type="date"
              size="small"
              value={startDateFilter}
              onChange={(e) => {
                setStartDateFilter(e.target.value);
                setPage(1);
              }}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: endDateFilter || undefined }}
              sx={{ minWidth: 170 }}
            />
            <TextField
              label="Issued to"
              type="date"
              size="small"
              value={endDateFilter}
              onChange={(e) => {
                setEndDateFilter(e.target.value);
                setPage(1);
              }}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: startDateFilter || undefined }}
              sx={{ minWidth: 170 }}
            />
            <Box sx={{ flexGrow: 1 }} />
            <Button
              variant="outlined"
              size="small"
              startIcon={
                exporting === "csv" ? (
                  <CircularProgress size={16} />
                ) : (
                  <DownloadIcon />
                )
              }
              onClick={() => void handleExport("csv")}
              disabled={exporting !== null || total === 0}
            >
              Download CSV
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={
                exporting === "pdf" ? (
                  <CircularProgress size={16} />
                ) : (
                  <DownloadIcon />
                )
              }
              onClick={() => void handleExport("pdf")}
              disabled={exporting !== null || total === 0}
            >
              Download PDF
            </Button>
          </Box>
          {exportError && (
            <Box sx={{ px: 2 }}>
              <Alert severity="error" sx={{ mb: 1 }}>
                {exportError}
              </Alert>
            </Box>
          )}
          <TableContainer>
            <Table>
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "invoiceNumber"}
                      direction={sortBy === "invoiceNumber" ? sortOrder : "asc"}
                      onClick={() => handleSort("invoiceNumber")}
                    >
                      Invoice
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "vendorName"}
                      direction={sortBy === "vendorName" ? sortOrder : "asc"}
                      onClick={() => handleSort("vendorName")}
                    >
                      Vendor
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Hardware</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "totalAmount"}
                      direction={sortBy === "totalAmount" ? sortOrder : "asc"}
                      onClick={() => handleSort("totalAmount")}
                    >
                      Amount
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "paymentStatus"}
                      direction={sortBy === "paymentStatus" ? sortOrder : "asc"}
                      onClick={() => handleSort("paymentStatus")}
                    >
                      Status
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "billingDate"}
                      direction={sortBy === "billingDate" ? sortOrder : "asc"}
                      onClick={() => handleSort("billingDate")}
                    >
                      Issued Date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "paidDate"}
                      direction={sortBy === "paidDate" ? sortOrder : "asc"}
                      onClick={() => handleSort("paidDate")}
                    >
                      Paid Date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "dueDate"}
                      direction={sortBy === "dueDate" ? sortOrder : "asc"}
                      onClick={() => handleSort("dueDate")}
                    >
                      Due Date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    <TableSortLabel
                      active={sortBy === "dueDate"}
                      direction={sortBy === "dueDate" ? sortOrder : "asc"}
                      onClick={() => handleSort("dueDate")}
                    >
                      Days Until Due
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", textAlign: "center" }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {hardwarePurchases.map((invoice) => {
                  const daysUntilDue = calculateDaysUntilDue(invoice.dueDate);
                  return (
                    <TableRow key={invoice.id} hover>
                      <TableCell>
                        <Link
                          href={`/accounting/hardwarePurchase/${invoice.id}`}
                          style={{ color: "#1976d2", textDecoration: "none" }}
                        >
                          {invoice.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {VENDOR_NAME_LABELS[invoice.vendorName] ||
                          invoice.vendorName}
                      </TableCell>
                      <TableCell>{invoice.hardwareDescription}</TableCell>
                      <TableCell>
                        <CurrencyDisplay value={invoice.totalAmount} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={invoice.paymentStatus} />
                      </TableCell>
                      <TableCell>
                        {invoice.billingDate ? (
                          <DateDisplay
                            date={invoice.billingDate}
                            format="date"
                          />
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {invoice.paymentStatus === "Paid" &&
                        invoice.paidDate ? (
                          <DateDisplay date={invoice.paidDate} format="date" />
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <DateDisplay date={invoice.dueDate} format="date" />
                      </TableCell>
                      <TableCell>
                        {invoice.paymentStatus === "Paid" ? (
                          "-"
                        ) : (
                          <Typography
                            sx={{
                              color:
                                daysUntilDue < 0
                                  ? "error.main"
                                  : daysUntilDue < 7
                                    ? "warning.main"
                                    : "success.main",
                              fontWeight: "500",
                            }}
                          >
                            {daysUntilDue === 0
                              ? "Today"
                              : daysUntilDue === 1
                                ? "1 day"
                                : daysUntilDue < 0
                                  ? `${Math.abs(daysUntilDue)} ${Math.abs(daysUntilDue) === 1 ? "day" : "days"} overdue`
                                  : `${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"}`}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ textAlign: "center" }}>
                        <Tooltip title="Edit Invoice">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleEditClick(invoice.id, invoice)}
                            sx={{
                              "&:hover": {
                                backgroundColor: "rgba(25, 118, 210, 0.08)",
                              },
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TablePagination
              rowsPerPageOptions={[
                5,
                10,
                25,
                50,
                { value: 9999, label: "Max" },
              ]}
              component="div"
              count={total}
              rowsPerPage={pageSize}
              page={page - 1}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </TableContainer>
        </Paper>
      </Box>

      {/* Edit Modal */}
      <EditHardwarePurchaseModal
        open={editModalOpen}
        onClose={handleCloseEditModal}
        onSuccess={handleEditSuccess}
        invoiceId={selectedInvoiceId}
        invoiceData={selectedInvoiceData}
      />
    </Container>
  );
}
