"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
  OutlinedInput,
  Checkbox,
  ListItemText,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  Receipt as ReceiptIcon,
} from "@mui/icons-material";
import GradientStatCard from "@/components/GradientStatCard";

// Types
interface Customer {
  id: string;
  email: string;
  name: string | null;
  companyName: string | null;
}

interface ClientTransaction {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  pool: "Luxor" | "Braiins";
  date_time: string;
  transaction_type: "credit" | "debit";
  currency_amount: number;
  usd_equivalent: number;
  transaction_category: string;
  transaction_id: string;
  subaccount_name: string;
  _internalReactKey?: string; // Internal ID for React rendering, independent of API data
}

interface TransactionStats {
  totalCredits: number;
  totalDebits: number;
  netAmount: number;
  totalCreditsUsd: number;
  totalDebitsUsd: number;
  netAmountUsd: number;
}

interface ApiResponse {
  success: boolean;
  data: {
    transactions: ClientTransaction[];
    summary: TransactionStats;
    poolBreakdown: {
      luxor: TransactionStats;
      braiins: TransactionStats;
    };
    customers: Customer[];
  };
  timestamp: string;
  error?: string;
}

interface PageState {
  customers: Customer[];
  transactions: ClientTransaction[];
  selectedCustomerIds: string[];
  poolFilter: "all" | "luxor" | "braiins";
  typeFilter: "all" | "credit" | "debit";
  startDate: string;
  endDate: string;
  currentPage: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
}

// Utility: Format date for API
const formatDateForApi = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

/**
 * Utility: Add unique internal React keys to transactions
 * This ensures React can properly track and reconcile component updates
 * independent of API data which may have missing or duplicate values
 */
const addInternalReactKeys = (
  transactions: ClientTransaction[],
): ClientTransaction[] => {
  return transactions.map((tx, idx) => ({
    ...tx,
    _internalReactKey: `${Date.now()}-${idx}-${Math.random()}`,
  }));
};

export default function ClientTransactionHistoryPage() {
  const [state, setState] = useState<PageState>({
    customers: [],
    transactions: [],
    selectedCustomerIds: [],
    poolFilter: "all",
    typeFilter: "all",
    startDate: formatDateForApi(new Date("2020-01-01")),
    endDate: formatDateForApi(new Date()),
    currentPage: 1,
    pageSize: 20,
    loading: true,
    error: null,
  });

  const [stats, setStats] = useState<TransactionStats>({
    totalCredits: 0,
    totalDebits: 0,
    netAmount: 0,
    totalCreditsUsd: 0,
    totalDebitsUsd: 0,
    netAmountUsd: 0,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI-only pagination
  const [tableCurrentPage, setTableCurrentPage] = useState(1);
  const tableRowsPerPage = 20;

  // Sort state
  const [sortField, setSortField] = useState<
    "customerName" | "dateTime" | "pool" | "type" | "amount" | "amountUsd"
  >("dateTime");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  /**
   * Fetch transactions for selected customers
   */
  const fetchTransactions = useCallback(
    async (
      customerIds: string[],
      poolFilter: string,
      typeFilter: string,
      startDate: string,
      endDate: string,
    ) => {
      try {
        setState((prev) => ({ ...prev, error: null }));

        const validIds = customerIds.filter((id) => id && id.trim());

        console.log(
          "[Client Transaction History] Fetching transactions for customers:",
          validIds,
        );

        const url = new URL(
          "/api/admin/client-transaction-history",
          window.location.origin,
        );
        if (validIds.length > 0) {
          url.searchParams.set("customerIds", validIds.join(","));
        }
        url.searchParams.set("pool", poolFilter);
        url.searchParams.set("type", typeFilter);
        url.searchParams.set("start_date", startDate);
        url.searchParams.set("end_date", endDate);

        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }

        const data: ApiResponse = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to fetch transactions");
        }

        setStats(data.data.summary);

        setState((prev) => ({
          ...prev,
          transactions: addInternalReactKeys(data.data.transactions),
          currentPage: 1,
          error: null,
        }));

        console.log(
          `[Client Transaction History] Successfully fetched ${data.data.transactions.length} transactions`,
        );
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error occurred";
        console.error(
          "[Client Transaction History] Error fetching transactions:",
          errorMsg,
        );
        setState((prev) => ({
          ...prev,
          transactions: [],
          error: errorMsg,
        }));
      }
    },
    [],
  );

  /**
   * Initialize on component mount
   */
  useEffect(() => {
    const initializeTransactions = async () => {
      try {
        console.log(
          "[Client Transaction History] Initializing - fetching transactions...",
        );

        const response = await fetch(
          `/api/admin/client-transaction-history?pool=all&type=all&start_date=${formatDateForApi(
            new Date("2020-01-01"),
          )}&end_date=${formatDateForApi(new Date())}`,
        );

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }

        const data: ApiResponse = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to fetch transactions");
        }

        // Select all customers by default
        const customerIds = data.data.customers.map((c) => c.id);

        setStats(data.data.summary);

        setState((prev) => ({
          ...prev,
          customers: data.data.customers,
          transactions: addInternalReactKeys(data.data.transactions),
          selectedCustomerIds: customerIds,
          loading: false,
          error: null,
        }));

        console.log(
          `[Client Transaction History] Successfully initialized with ${data.data.customers.length} customers and ${data.data.transactions.length} transactions`,
        );
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error occurred";
        console.error(
          "[Client Transaction History] Error initializing:",
          errorMsg,
        );
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMsg,
        }));
      }
    };

    initializeTransactions();
  }, []);

  /**
   * Handle customer selection change
   */
  const handleCustomerChange = (customerIds: string | string[]) => {
    const selectedIds = Array.isArray(customerIds)
      ? customerIds
      : [customerIds];

    const validIds = selectedIds.filter((id) => id && id.trim());

    setState((prev) => ({
      ...prev,
      selectedCustomerIds: validIds,
      currentPage: 1,
    }));

    fetchTransactions(
      validIds,
      state.poolFilter,
      state.typeFilter,
      state.startDate,
      state.endDate,
    );
  };

  /**
   * Handle pool filter change
   */
  const handlePoolChange = (
    _event: React.MouseEvent<HTMLElement>,
    newPool: string | null,
  ) => {
    if (newPool === null) return; // Prevent deselecting all

    const poolFilter = newPool as "all" | "luxor" | "braiins";

    setState((prev) => ({
      ...prev,
      poolFilter,
      currentPage: 1,
    }));

    fetchTransactions(
      state.selectedCustomerIds,
      poolFilter,
      state.typeFilter,
      state.startDate,
      state.endDate,
    );
  };

  /**
   * Handle transaction type change
   */
  const handleTypeChange = (event: { target: { value: string } }) => {
    const typeFilter = event.target.value as "all" | "credit" | "debit";

    setState((prev) => ({
      ...prev,
      typeFilter,
      currentPage: 1,
    }));

    fetchTransactions(
      state.selectedCustomerIds,
      state.poolFilter,
      typeFilter,
      state.startDate,
      state.endDate,
    );
  };

  /**
   * Handle start date change
   */
  const handleStartDateChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const startDate = event.target.value;

    setState((prev) => ({
      ...prev,
      startDate,
      currentPage: 1,
    }));

    fetchTransactions(
      state.selectedCustomerIds,
      state.poolFilter,
      state.typeFilter,
      startDate,
      state.endDate,
    );
  };

  /**
   * Handle end date change
   */
  const handleEndDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const endDate = event.target.value;

    setState((prev) => ({
      ...prev,
      endDate,
      currentPage: 1,
    }));

    fetchTransactions(
      state.selectedCustomerIds,
      state.poolFilter,
      state.typeFilter,
      state.startDate,
      endDate,
    );
  };

  /**
   * Handle manual refresh
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchTransactions(
        state.selectedCustomerIds,
        state.poolFilter,
        state.typeFilter,
        state.startDate,
        state.endDate,
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  /**
   * Handle table column sorting
   */
  const handleSort = (
    field:
      | "customerName"
      | "dateTime"
      | "pool"
      | "type"
      | "amount"
      | "amountUsd",
  ) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  /**
   * Sort transactions based on current sort field and order
   */
  const getSortedTransactions = () => {
    const sorted = [...state.transactions].sort((a, b) => {
      let compareA: string | number = "";
      let compareB: string | number = "";

      switch (sortField) {
        case "customerName":
          compareA = a.customerName || "";
          compareB = b.customerName || "";
          break;
        case "dateTime":
          compareA = new Date(a.date_time).getTime();
          compareB = new Date(b.date_time).getTime();
          break;
        case "pool":
          compareA = a.pool || "";
          compareB = b.pool || "";
          break;
        case "type":
          compareA = a.transaction_type || "";
          compareB = b.transaction_type || "";
          break;
        case "amount":
          compareA = a.currency_amount || 0;
          compareB = b.currency_amount || 0;
          break;
        case "amountUsd":
          compareA = a.usd_equivalent || 0;
          compareB = b.usd_equivalent || 0;
          break;
        default:
          compareA = "";
          compareB = "";
      }

      // Handle string comparison
      if (typeof compareA === "string" && typeof compareB === "string") {
        return sortOrder === "asc"
          ? compareA.localeCompare(compareB)
          : compareB.localeCompare(compareA);
      }

      // Handle number comparison
      if (typeof compareA === "number" && typeof compareB === "number") {
        return sortOrder === "asc" ? compareA - compareB : compareB - compareA;
      }

      return 0;
    });

    return sorted;
  };

  // Paginate transactions
  const paginatedTransactions = useMemo(() => {
    const sorted = getSortedTransactions();
    const start = (tableCurrentPage - 1) * tableRowsPerPage;
    const end = start + tableRowsPerPage;
    return sorted.slice(start, end);
  }, [
    state.transactions,
    sortField,
    sortOrder,
    tableCurrentPage,
    getSortedTransactions,
  ]);

  const totalPages = Math.ceil(state.transactions.length / tableRowsPerPage);

  if (state.loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Title */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 4,
        }}
      >
        <Typography
          variant="h4"
          sx={{
            fontWeight: "bold",
            color: (theme) =>
              theme.palette.mode === "dark" ? "primary.light" : "primary.dark",
          }}
        >
          Client Transaction History
        </Typography>

        <Tooltip title="Refresh transaction data">
          <IconButton
            onClick={handleRefresh}
            disabled={isRefreshing || state.selectedCustomerIds.length === 0}
            sx={{
              background: (theme) =>
                `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
              color: "white",
              "&:hover": {
                background: (theme) =>
                  `linear-gradient(45deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
              },
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stats Cards */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: "medium" }}>
          Transaction Summary
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 2,
          }}
        >
          <GradientStatCard
            title="Total Credits (BTC)"
            value={`${stats.totalCredits.toFixed(8)}`}
          />
          <GradientStatCard
            title="Total Debits (BTC)"
            value={`${stats.totalDebits.toFixed(8)}`}
          />
          <GradientStatCard
            title="Net Amount (BTC)"
            value={`${stats.netAmount.toFixed(8)}`}
          />
        </Box>
      </Box>

      {/* Filter Panel */}
      <Paper
        elevation={3}
        sx={{
          p: 3,
          mb: 4,
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
              : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
          backdropFilter: "blur(10px)",
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography variant="h6" sx={{ mb: 2, fontWeight: "medium" }}>
          Filter Options
        </Typography>

        <Stack spacing={2}>
          {/* Customer Multi-Select */}
          <FormControl fullWidth>
            <InputLabel>Select Customers</InputLabel>
            <Select
              multiple
              value={state.selectedCustomerIds}
              onChange={(e) =>
                handleCustomerChange(
                  typeof e.target.value === "string"
                    ? e.target.value.split(",")
                    : e.target.value,
                )
              }
              input={<OutlinedInput label="Select Customers" />}
              renderValue={(selected) =>
                `${(selected as string[]).length} customer(s) selected`
              }
            >
              {/* Select All Option */}
              <MenuItem disableRipple>
                <Checkbox
                  checked={
                    state.customers.length > 0 &&
                    state.selectedCustomerIds.length === state.customers.length
                  }
                  indeterminate={
                    state.selectedCustomerIds.length > 0 &&
                    state.selectedCustomerIds.length < state.customers.length
                  }
                  onChange={() => {
                    if (state.selectedCustomerIds.length > 0) {
                      handleCustomerChange([]);
                    } else {
                      const allIds = state.customers.map((c) => c.id);
                      handleCustomerChange(allIds);
                    }
                  }}
                />
                <ListItemText primary="Select All" />
              </MenuItem>

              {/* Individual Customers */}
              {state.customers.map((customer) => (
                <MenuItem key={customer.id} value={customer.id}>
                  <Checkbox
                    checked={state.selectedCustomerIds.includes(customer.id)}
                  />
                  <ListItemText
                    primary={customer.name || customer.email}
                    secondary={customer.companyName || customer.email}
                  />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Pool Filter Toggle */}
          <Box>
            <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
              Pool
            </Typography>
            <ToggleButtonGroup
              value={state.poolFilter}
              exclusive
              onChange={handlePoolChange}
              fullWidth
            >
              <ToggleButton value="all">All Pools</ToggleButton>
              <ToggleButton value="luxor">Luxor</ToggleButton>
              <ToggleButton value="braiins">Braiins</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Date Range */}
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <FormControl>
              <InputLabel>Start Date</InputLabel>
              <OutlinedInput
                type="date"
                value={state.startDate}
                onChange={handleStartDateChange}
                label="Start Date"
                inputProps={{ max: state.endDate }}
              />
            </FormControl>
            <FormControl>
              <InputLabel>End Date</InputLabel>
              <OutlinedInput
                type="date"
                value={state.endDate}
                onChange={handleEndDateChange}
                label="End Date"
                inputProps={{ min: state.startDate }}
              />
            </FormControl>
          </Box>

          {/* Transaction Type */}
          <FormControl fullWidth>
            <InputLabel>Transaction Type</InputLabel>
            <Select
              value={state.typeFilter}
              label="Transaction Type"
              onChange={handleTypeChange}
            >
              <MenuItem value="all">All Transactions</MenuItem>
              <MenuItem value="credit">Credits Only</MenuItem>
              <MenuItem value="debit">Debits Only</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {state.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {state.error}
          </Alert>
        )}
      </Paper>

      {/* Transactions Table */}
      <Paper
        elevation={3}
        sx={{
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
              : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
          backdropFilter: "blur(10px)",
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: "medium" }}>
            Transactions
          </Typography>

          {state.selectedCustomerIds.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <ReceiptIcon
                sx={{
                  fontSize: 64,
                  color: "text.secondary",
                  mb: 2,
                  opacity: 0.5,
                }}
              />
              <Typography color="text.secondary">
                Please select at least one customer to view transactions
              </Typography>
            </Box>
          ) : state.transactions.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <ReceiptIcon
                sx={{
                  fontSize: 64,
                  color: "text.secondary",
                  mb: 2,
                  opacity: 0.5,
                }}
              />
              <Typography color="text.secondary">
                No transactions found for the selected filters
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer
                sx={{
                  borderRadius: 1,
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  overflow: "hidden",
                }}
              >
                <Table
                  sx={{
                    "& .MuiTableCell-head": {
                      backgroundColor: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(33, 150, 243, 0.15)"
                          : "rgba(33, 150, 243, 0.08)",
                      borderBottom: (theme) =>
                        `2px solid ${theme.palette.primary.main}`,
                      fontWeight: 700,
                      fontSize: "0.875rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: (theme) => theme.palette.primary.main,
                      padding: "16px 12px",
                    },
                    "& .MuiTableCell-body": {
                      padding: "14px 12px",
                      borderBottom: (theme) =>
                        `1px solid ${theme.palette.divider}`,
                    },
                    "& .MuiTableRow-root:hover": {
                      backgroundColor: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(33, 150, 243, 0.08)"
                          : "rgba(33, 150, 243, 0.04)",
                      transition: "background-color 0.2s ease-in-out",
                    },
                    "& .MuiTableRow-root:last-child .MuiTableCell-body": {
                      borderBottom: "none",
                    },
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <TableSortLabel
                          active={sortField === "customerName"}
                          direction={
                            sortField === "customerName" ? sortOrder : "asc"
                          }
                          onClick={() => handleSort("customerName")}
                        >
                          Customer
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortField === "dateTime"}
                          direction={
                            sortField === "dateTime" ? sortOrder : "asc"
                          }
                          onClick={() => handleSort("dateTime")}
                        >
                          Date & Time
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortField === "pool"}
                          direction={sortField === "pool" ? sortOrder : "asc"}
                          onClick={() => handleSort("pool")}
                        >
                          Pool
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortField === "type"}
                          direction={sortField === "type" ? sortOrder : "asc"}
                          onClick={() => handleSort("type")}
                        >
                          Type
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">
                        <TableSortLabel
                          active={sortField === "amount"}
                          direction={sortField === "amount" ? sortOrder : "asc"}
                          onClick={() => handleSort("amount")}
                        >
                          Amount (BTC)
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="right">
                        <TableSortLabel
                          active={sortField === "amountUsd"}
                          direction={
                            sortField === "amountUsd" ? sortOrder : "asc"
                          }
                          onClick={() => handleSort("amountUsd")}
                        >
                          Amount (USD)
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>TX ID</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedTransactions.map((tx, idx) => (
                      <TableRow
                        key={tx._internalReactKey}
                        sx={{
                          backgroundColor:
                            idx % 2 === 0
                              ? "transparent"
                              : (theme) =>
                                  theme.palette.mode === "dark"
                                    ? "rgba(255, 255, 255, 0.02)"
                                    : "rgba(0, 0, 0, 0.01)",
                        }}
                      >
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {tx.customerName}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: "text.secondary" }}
                          >
                            {tx.customerEmail}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {new Date(tx.date_time).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={tx.pool}
                            size="small"
                            variant="outlined"
                            sx={{
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={
                              tx.transaction_type === "credit"
                                ? "Credit"
                                : "Debit"
                            }
                            size="small"
                            color={
                              tx.transaction_type === "credit"
                                ? "success"
                                : "error"
                            }
                            variant="filled"
                            sx={{
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ color: "text.secondary" }}
                          >
                            {tx.transaction_category}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500,
                              fontFamily: "monospace",
                              color:
                                tx.transaction_type === "credit"
                                  ? (theme) => theme.palette.success.main
                                  : (theme) => theme.palette.error.main,
                            }}
                          >
                            {tx.currency_amount.toFixed(8)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500,
                              fontFamily: "monospace",
                              color:
                                tx.transaction_type === "credit"
                                  ? (theme) => theme.palette.success.main
                                  : (theme) => theme.palette.error.main,
                            }}
                          >
                            ${tx.usd_equivalent.toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="caption"
                            sx={{
                              color: "text.secondary",
                              display: "block",
                              fontFamily: "monospace",
                              maxWidth: "150px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={tx.transaction_id}
                          >
                            {tx.transaction_id}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination Controls */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mt: 2,
                  px: 2,
                  py: 1.5,
                  backgroundColor: (theme) =>
                    theme.palette.mode === "dark"
                      ? "rgba(33, 150, 243, 0.05)"
                      : "rgba(33, 150, 243, 0.03)",
                  borderRadius: "0 0 4px 4px",
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Showing{" "}
                  {Math.min(state.transactions.length, tableRowsPerPage)} of{" "}
                  {state.transactions.length} transactions
                </Typography>

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Pagination
                    count={totalPages}
                    page={tableCurrentPage}
                    onChange={(_, page) => setTableCurrentPage(page)}
                    color="primary"
                    size="small"
                    showFirstButton
                    showLastButton
                  />
                </Box>
              </Box>
            </>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
