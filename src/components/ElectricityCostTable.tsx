//src/components/ElectricityCostTable.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  TableSortLabel,
  TablePagination,
  TextField,
  InputAdornment,
  useTheme,
  CircularProgress,
  Alert,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { visuallyHidden } from "@mui/utils";

interface ElectricityData {
  id: string;
  date: string;
  type: string;
  consumption: string;
  amount: string;
  balance: string;
  rawBalance?: number;
  rawAmount?: number;
  narration?: string | null;
}

type Order = "asc" | "desc";
type OrderBy = keyof ElectricityData;

interface HeadCell {
  id: OrderBy;
  label: string;
  numeric: boolean;
}

const headCells: readonly HeadCell[] = [
  {
    id: "date",
    numeric: false,
    label: "Date",
  },
  {
    id: "type",
    numeric: false,
    label: "Type",
  },
  {
    id: "consumption",
    numeric: false,
    label: "Consumption",
  },
  {
    id: "amount",
    numeric: true,
    label: "Amount",
  },
  {
    id: "balance",
    numeric: true,
    label: "Balance",
  },
  {
    id: "narration",
    numeric: false,
    label: "Description",
  },
];

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
  const aVal = a[orderBy];
  const bVal = b[orderBy];

  // Handle date comparison - check if ordering by date column
  if (orderBy === "date") {
    // Parse dates in DD/MM/YYYY format
    const parseDate = (dateStr: string): Date => {
      const [day, month, year] = String(dateStr).split("/").map(Number);
      return new Date(year, month - 1, day);
    };

    try {
      const aDate = parseDate(String(aVal));
      const bDate = parseDate(String(bVal));

      if (bDate < aDate) {
        return -1;
      }
      if (bDate > aDate) {
        return 1;
      }
      return 0;
    } catch {
      // Fallback to string comparison if parsing fails
      if (bVal < aVal) {
        return -1;
      }
      if (bVal > aVal) {
        return 1;
      }
      return 0;
    }
  }

  // Default comparison for other columns
  if (bVal < aVal) {
    return -1;
  }
  if (bVal > aVal) {
    return 1;
  }
  return 0;
}

function getComparator(
  order: Order,
  orderBy: OrderBy,
): (a: ElectricityData, b: ElectricityData) => number {
  return order === "desc"
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

function stableSort<T>(
  array: readonly T[],
  comparator: (a: T, b: T) => number,
) {
  const stabilizedThis = array.map((el, index) => [el, index] as [T, number]);
  stabilizedThis.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    if (order !== 0) {
      return order;
    }
    return a[1] - b[1];
  });
  return stabilizedThis.map((el) => el[0]);
}

interface EnhancedTableHeadProps {
  onRequestSort: (event: React.MouseEvent<unknown>, property: OrderBy) => void;
  order: Order;
  orderBy: string;
}

function EnhancedTableHead(props: EnhancedTableHeadProps) {
  const { order, orderBy, onRequestSort } = props;
  const createSortHandler =
    (property: OrderBy) => (event: React.MouseEvent<unknown>) => {
      onRequestSort(event, property);
    };

  return (
    <TableHead>
      <TableRow>
        {headCells.map((headCell) => (
          <TableCell
            key={headCell.id}
            align={headCell.numeric ? "right" : "left"}
            sortDirection={orderBy === headCell.id ? order : false}
            sx={{
              fontWeight: "bold",
              borderBottom: "2px solid",
              borderBottomColor: "divider",
              py: 2,
            }}
          >
            <TableSortLabel
              active={orderBy === headCell.id}
              direction={orderBy === headCell.id ? order : "asc"}
              onClick={createSortHandler(headCell.id)}
              sx={{
                fontWeight: "bold",
                "&.Mui-active": {
                  color: "primary.main",
                },
              }}
            >
              {headCell.label}
              {orderBy === headCell.id ? (
                <Box component="span" sx={visuallyHidden}>
                  {order === "desc" ? "sorted descending" : "sorted ascending"}
                </Box>
              ) : null}
            </TableSortLabel>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}

interface ElectricityCostTableProps {
  customerId?: string;
}

export default function ElectricityCostTable({
  customerId,
}: ElectricityCostTableProps) {
  const theme = useTheme();
  const [order, setOrder] = useState<Order>("desc");
  const [orderBy, setOrderBy] = useState<OrderBy>("date");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ElectricityData[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Fetch cost payments data from API
  const fetchCostPayments = async () => {
    try {
      setLoading(true);
      setError(null);

      const url = customerId
        ? `/api/cost-payments?page=${page}&pageSize=${rowsPerPage}&customerId=${customerId}`
        : `/api/cost-payments?page=${page}&pageSize=${rowsPerPage}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch cost payments");
      }

      const result = await response.json();

      if (result.success && result.data) {
        setData(result.data);
        setTotalCount(result.pagination.totalCount);
      }
    } catch (err) {
      console.error("Error fetching cost payments:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load cost payments",
      );
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCostPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage]);

  const handleRequestSort = (
    event: React.MouseEvent<unknown>,
    property: OrderBy,
  ) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(0); // Reset to first page when searching
  };

  // Filter data based on search term (client-side)
  const filteredData = React.useMemo(() => {
    if (!searchTerm) return data;

    return data.filter((row) =>
      Object.values(row).some((value) =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    );
  }, [searchTerm, data]);

  // Sort and paginate filtered data (client-side for search results)
  const visibleRows = React.useMemo(
    () =>
      stableSort(filteredData, getComparator(order, orderBy)).slice(
        0,
        rowsPerPage,
      ),
    [order, orderBy, rowsPerPage, filteredData],
  );

  const getAmountColor = (amount: string) => {
    if (amount.includes("-")) {
      return theme.palette.error.main;
    }
    return theme.palette.text.primary;
  };

  const getBalanceColor = (balance: string) => {
    if (balance.includes("+")) {
      return theme.palette.success.main;
    }
    if (balance.includes("-")) {
      return theme.palette.error.main;
    }
    return theme.palette.text.primary;
  };

  return (
    <Box sx={{ width: "100%", mt: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h6" fontWeight="bold">
          Account Statement
        </Typography>
        <TextField
          size="small"
          placeholder="Search transactions..."
          value={searchTerm}
          onChange={handleSearchChange}
          sx={{
            minWidth: 250,
            "& .MuiOutlinedInput-root": {
              backgroundColor: theme.palette.background.paper,
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: theme.palette.text.secondary }} />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper
        sx={{
          width: "100%",
          borderRadius: 2,
          overflow: "hidden",
          boxShadow: theme.shadows[2],
        }}
      >
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        ) : data.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">
              No cost payments found
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table
                sx={{ minWidth: 750 }}
                aria-labelledby="tableTitle"
                size="medium"
              >
                <EnhancedTableHead
                  order={order}
                  orderBy={orderBy}
                  onRequestSort={handleRequestSort}
                />
                <TableBody>
                  {visibleRows.map((row) => {
                    return (
                      <TableRow
                        hover
                        key={row.id}
                        sx={{
                          cursor: "pointer",
                          "&:nth-of-type(odd)": {
                            backgroundColor: theme.palette.action.hover,
                          },
                        }}
                      >
                        <TableCell component="th" scope="row" sx={{ py: 2 }}>
                          <Typography variant="body2" fontWeight="medium">
                            {row.date}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 2 }}>
                          <Typography variant="body2">{row.type}</Typography>
                        </TableCell>
                        <TableCell sx={{ py: 2 }}>
                          <Typography variant="body2">
                            {row.consumption}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ py: 2 }}>
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            sx={{ color: getAmountColor(row.amount) }}
                          >
                            {row.amount}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ py: 2 }}>
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            sx={{ color: getBalanceColor(row.balance) }}
                          >
                            {row.balance}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 2 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              maxWidth: 300,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={row.narration || undefined}
                          >
                            {row.narration || "-"}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={totalCount}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              sx={{
                borderTop: `1px solid ${theme.palette.divider}`,
                "& .MuiTablePagination-toolbar": {
                  paddingLeft: 2,
                  paddingRight: 1,
                },
                "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows":
                  {
                    margin: 0,
                    fontSize: "0.875rem",
                  },
              }}
            />
          </>
        )}
      </Paper>
    </Box>
  );
}
