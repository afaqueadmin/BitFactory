"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Button,
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
import AdminValueCard from "@/components/admin/AdminValueCard";
import { useDaylight } from "@/lib/daylight";
import {
  CellNote,
  DaylightAdminPage,
  DaylightPageHeader,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

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
  const { d, fonts } = useDaylight();
  const ds = useDaylightAdminSx();
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
      "customerName" | "dateTime" | "pool" | "type" | "amount" | "amountUsd",
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
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Client Transaction History"
        description="Pool payouts (credits) and charges (debits) for the selected customers."
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={isRefreshing || state.selectedCustomerIds.length === 0}
            sx={ds.outlineBtnSx}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      {/* Stats Cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
          gap: { xs: "12px", sm: "16px", md: "20px" },
          mb: { xs: "20px", md: "24px" },
        }}
      >
        <AdminValueCard
          daylight
          title="Total Credits"
          value={stats.totalCredits.toFixed(8)}
          subtitle="BTC"
        />
        <AdminValueCard
          daylight
          title="Total Debits"
          value={stats.totalDebits.toFixed(8)}
          subtitle="BTC"
        />
        <AdminValueCard
          daylight
          title="Net Amount"
          value={stats.netAmount.toFixed(8)}
          subtitle="BTC"
        />
      </Box>

      {/* Filter Panel */}
      <Paper
        elevation={0}
        sx={{ ...ds.cardSx, ...ds.inputSx, mb: { xs: "20px", md: "24px" } }}
      >
        <Typography
          component="h2"
          sx={{ ...ds.sectionTitleSx, fontSize: 14, mb: "12px" }}
        >
          Filters
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
            <Typography
              sx={{
                mb: "6px",
                fontSize: 12.5,
                fontWeight: 600,
                color: d.muted,
              }}
            >
              Pool
            </Typography>
            <ToggleButtonGroup
              value={state.poolFilter}
              exclusive
              onChange={handlePoolChange}
              fullWidth
              sx={ds.toggleGroupSx}
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
          <Alert severity="error" sx={{ mt: 2, ...ds.alertSx("error") }}>
            {state.error}
          </Alert>
        )}
      </Paper>

      {/* Transactions Table */}
      <Paper elevation={0} sx={ds.listCardSx}>
        <Box sx={{ p: { xs: "16px", sm: "20px 24px" } }}>
          <Typography component="h2" sx={{ ...ds.sectionTitleSx, mb: "12px" }}>
            Transactions
          </Typography>

          {state.selectedCustomerIds.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <ReceiptIcon
                sx={{ fontSize: 40, color: d.inputBorder, mb: 1 }}
                aria-hidden
              />
              <Typography sx={{ color: d.muted, fontSize: 13 }}>
                Please select at least one customer to view transactions
              </Typography>
            </Box>
          ) : state.transactions.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <ReceiptIcon
                sx={{ fontSize: 40, color: d.inputBorder, mb: 1 }}
                aria-hidden
              />
              <Typography sx={{ color: d.muted, fontSize: 13 }}>
                No transactions found for the selected filters
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table>
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
                    {paginatedTransactions.map((tx) => (
                      <TableRow key={tx._internalReactKey}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {tx.customerName}
                          </Typography>
                          <CellNote>{tx.customerEmail}</CellNote>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {new Date(tx.date_time).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <DaylightStatusPill label={tx.pool} tone="neutral" />
                        </TableCell>
                        <TableCell>
                          <DaylightStatusPill
                            label={
                              tx.transaction_type === "credit"
                                ? "Credit"
                                : "Debit"
                            }
                            tone={
                              tx.transaction_type === "credit"
                                ? "success"
                                : "danger"
                            }
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
                                  ? d.success
                                  : d.danger,
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
                                  ? d.success
                                  : d.danger,
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
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                  mt: 2,
                  pt: "10px",
                  borderTop: `1px solid ${d.border}`,
                }}
              >
                <Typography variant="caption" sx={{ color: d.muted }}>
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
                    size="small"
                    showFirstButton
                    showLastButton
                    sx={{
                      "& .MuiPaginationItem-root": {
                        fontFamily: fonts.body,
                        fontSize: 12.5,
                        color: d.muted,
                        borderRadius: "8px",
                      },
                      "& .MuiPaginationItem-root.Mui-selected": {
                        bgcolor: d.skySoft,
                        color: d.action,
                        fontWeight: 650,
                      },
                    }}
                  />
                </Box>
              </Box>
            </>
          )}
        </Box>
      </Paper>
    </DaylightAdminPage>
  );
}
