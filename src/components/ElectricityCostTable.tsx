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
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

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
  daylight?: boolean;
}

function EnhancedTableHead(props: EnhancedTableHeadProps) {
  const { order, orderBy, onRequestSort, daylight } = props;
  const { d, fonts } = useDaylight();
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
              display:
                headCell.id === "consumption" || headCell.id === "narration"
                  ? { xs: "none", sm: "table-cell" }
                  : "table-cell",
              ...(daylight && {
                borderBottomColor: d.border,
                backgroundColor: "#FBFCFD",
                fontFamily: fonts.body,
                color: d.muted,
                fontSize: 10,
                letterSpacing: ".015em",
                textTransform: "uppercase",
              }),
            }}
          >
            <TableSortLabel
              active={orderBy === headCell.id}
              direction={orderBy === headCell.id ? order : "asc"}
              onClick={createSortHandler(headCell.id)}
              sx={{
                fontWeight: "bold",
                color: "inherit",
                "&.Mui-active": {
                  color: daylight ? d.action : "primary.main",
                },
                "& .MuiTableSortLabel-icon": {
                  color: daylight ? `${d.action} !important` : undefined,
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
  /** Daylight styling: white card chrome, guide-style header row, Manrope
   * title and Inter body text. Data-fetching and sorting are unchanged. */
  daylight?: boolean;
}

export default function ElectricityCostTable({
  customerId,
  daylight = false,
}: ElectricityCostTableProps) {
  const theme = useTheme();
  const { d, fonts } = useDaylight();
  const [order, setOrder] = useState<Order>("desc");
  const [orderBy, setOrderBy] = useState<OrderBy>("date");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
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
      return daylight ? d.danger : theme.palette.error.main;
    }
    return daylight ? d.text : theme.palette.text.primary;
  };

  const getBalanceColor = (balance: string) => {
    if (balance.includes("+")) {
      return daylight ? d.success : theme.palette.success.main;
    }
    if (balance.includes("-")) {
      return daylight ? d.danger : theme.palette.error.main;
    }
    return daylight ? d.text : theme.palette.text.primary;
  };

  return (
    <Box sx={{ width: "100%", mt: { xs: 2, md: 3 } }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          flexDirection: { xs: "column", sm: "row" },
          gap: 1.5,
          mb: 2,
        }}
      >
        <Typography
          variant="h6"
          fontWeight="bold"
          sx={
            daylight
              ? { fontFamily: fonts.heading, fontWeight: 750, color: d.text }
              : undefined
          }
        >
          Account Statement
        </Typography>
        <TextField
          size="small"
          placeholder="Search transactions..."
          value={searchTerm}
          onChange={handleSearchChange}
          fullWidth
          sx={{
            maxWidth: { sm: 280 },
            "& .MuiOutlinedInput-root": {
              backgroundColor: daylight
                ? d.surface
                : theme.palette.background.paper,
              ...(daylight && {
                borderRadius: "8px",
                fontFamily: fonts.body,
                "& fieldset": { borderColor: d.inputBorder },
                "&:hover fieldset": { borderColor: d.action },
              }),
            },
            ...(daylight && {
              "& .MuiOutlinedInput-root.Mui-focused fieldset": {
                borderColor: d.action,
                borderWidth: "2px",
              },
            }),
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon
                  sx={{
                    color: daylight ? d.muted : theme.palette.text.secondary,
                  }}
                />
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
          borderRadius: daylight ? RADIUS_CARD : 2.5,
          overflow: "hidden",
          backgroundColor: daylight ? d.surface : undefined,
          backgroundImage: daylight ? "none" : undefined,
          border: `1px solid ${
            daylight
              ? d.border
              : theme.palette.mode === "dark"
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(0, 0, 0, 0.08)"
          }`,
          boxShadow: daylight ? d.shadow : theme.shadows[1],
        }}
      >
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress
              sx={daylight ? { color: d.action } : undefined}
              size={28}
            />
          </Box>
        ) : data.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography
              color="text.secondary"
              sx={
                daylight
                  ? { fontFamily: fonts.body, color: d.muted }
                  : undefined
              }
            >
              No cost payments found
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table
                sx={{ minWidth: { xs: 300, sm: 700 } }}
                aria-labelledby="tableTitle"
                size="small"
              >
                <EnhancedTableHead
                  order={order}
                  orderBy={orderBy}
                  onRequestSort={handleRequestSort}
                  daylight={daylight}
                />
                <TableBody>
                  {visibleRows.map((row) => {
                    return (
                      <TableRow
                        hover
                        key={row.id}
                        sx={{
                          cursor: "pointer",
                          fontFamily: daylight ? fonts.body : undefined,
                          "&:nth-of-type(odd)": {
                            backgroundColor: daylight
                              ? d.canvas
                              : theme.palette.action.hover,
                          },
                          ...(daylight && {
                            "&:hover": { backgroundColor: d.hover },
                            "& .MuiTableCell-root": {
                              borderBottomColor: d.border,
                            },
                          }),
                        }}
                      >
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{
                            py: { xs: 1.25, sm: 1.75 },
                            px: { xs: 1.25, sm: 2 },
                          }}
                        >
                          <Typography
                            variant="body2"
                            fontWeight="600"
                            sx={{ fontSize: { xs: "0.78rem", sm: "0.875rem" } }}
                          >
                            {row.date}
                          </Typography>
                        </TableCell>
                        <TableCell
                          sx={{
                            py: { xs: 1.25, sm: 1.75 },
                            px: { xs: 1.25, sm: 2 },
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontSize: { xs: "0.78rem", sm: "0.875rem" } }}
                          >
                            {row.type}
                          </Typography>
                        </TableCell>
                        <TableCell
                          sx={{
                            py: { xs: 1.25, sm: 1.75 },
                            display: { xs: "none", sm: "table-cell" },
                          }}
                        >
                          <Typography variant="body2">
                            {row.consumption}
                          </Typography>
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            py: { xs: 1.25, sm: 1.75 },
                            px: { xs: 1.25, sm: 2 },
                          }}
                        >
                          <Typography
                            variant="body2"
                            fontWeight="700"
                            sx={{
                              color: getAmountColor(row.amount),
                              fontSize: { xs: "0.78rem", sm: "0.875rem" },
                            }}
                          >
                            {row.amount}
                          </Typography>
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            py: { xs: 1.25, sm: 1.75 },
                            px: { xs: 1.25, sm: 2 },
                          }}
                        >
                          <Typography
                            variant="body2"
                            fontWeight="700"
                            sx={{
                              color: getBalanceColor(row.balance),
                              fontSize: { xs: "0.78rem", sm: "0.875rem" },
                            }}
                          >
                            {row.balance}
                          </Typography>
                        </TableCell>
                        <TableCell
                          sx={{
                            py: { xs: 1.25, sm: 1.75 },
                            display: { xs: "none", sm: "table-cell" },
                          }}
                        >
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
              rowsPerPageOptions={[10, 25, 50, { value: 9999, label: "All" }]}
              component="div"
              count={totalCount}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              sx={{
                borderTop: `1px solid ${daylight ? d.border : theme.palette.divider}`,
                ...(daylight && {
                  fontFamily: fonts.body,
                  color: d.muted,
                  "& .MuiSelect-select, & .MuiTablePagination-actions button": {
                    color: d.text,
                  },
                }),
                "& .MuiTablePagination-toolbar": {
                  paddingLeft: { xs: 1, sm: 2 },
                  paddingRight: { xs: 1, sm: 1 },
                  flexWrap: "wrap",
                  minHeight: { xs: 48, sm: 52 },
                },
                "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows":
                  {
                    margin: 0,
                    fontSize: { xs: "0.75rem", sm: "0.875rem" },
                  },
                "& .MuiTablePagination-actions": {
                  marginLeft: { xs: 1, sm: 2 },
                },
              }}
            />
          </>
        )}
      </Paper>
    </Box>
  );
}
