"use client";

import React, { useState } from "react";
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
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { visuallyHidden } from "@mui/utils";

interface ElectricityData {
  id: number;
  date: string;
  type: string;
  consumption: string;
  amount: string;
  balance: string;
}

type Order = "asc" | "desc";
type OrderBy = keyof ElectricityData;

const dummyData: ElectricityData[] = [
  {
    id: 1,
    date: "08/10/2025",
    type: "Payment",
    consumption: "N/A",
    amount: "+ 231,99 $",
    balance: "+ 487,64 $",
  },
  {
    id: 2,
    date: "07/10/2025",
    type: "Electricity Charges",
    consumption: "315.552 kWh",
    amount: "- 23,67 $",
    balance: "+ 255,65 $",
  },
  {
    id: 3,
    date: "06/10/2025",
    type: "Electricity Charges",
    consumption: "315.552 kWh",
    amount: "- 23,67 $",
    balance: "+ 279,32 $",
  },
  {
    id: 4,
    date: "05/10/2025",
    type: "Electricity Charges",
    consumption: "315.552 kWh",
    amount: "- 23,67 $",
    balance: "+ 302,99 $",
  },
  {
    id: 5,
    date: "04/10/2025",
    type: "Electricity Charges",
    consumption: "315.552 kWh",
    amount: "- 23,67 $",
    balance: "+ 326,65 $",
  },
  {
    id: 6,
    date: "03/10/2025",
    type: "Electricity Charges",
    consumption: "315.552 kWh",
    amount: "- 23,67 $",
    balance: "+ 350,32 $",
  },
  {
    id: 7,
    date: "02/10/2025",
    type: "Electricity Charges",
    consumption: "315.552 kWh",
    amount: "- 23,67 $",
    balance: "+ 373,98 $",
  },
  {
    id: 8,
    date: "01/10/2025",
    type: "Electricity Charges",
    consumption: "315.552 kWh",
    amount: "- 23,67 $",
    balance: "+ 397,65 $",
  },
];

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
];

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
  if (b[orderBy] < a[orderBy]) {
    return -1;
  }
  if (b[orderBy] > a[orderBy]) {
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

export default function ElectricityCostTable() {
  const theme = useTheme();
  const [order, setOrder] = useState<Order>("desc");
  const [orderBy, setOrderBy] = useState<OrderBy>("date");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [searchTerm, setSearchTerm] = useState("");

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

  // Filter data based on search term
  const filteredData = React.useMemo(() => {
    if (!searchTerm) return dummyData;

    return dummyData.filter((row) =>
      Object.values(row).some((value) =>
        value.toString().toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    );
  }, [searchTerm]);

  const visibleRows = React.useMemo(
    () =>
      stableSort(filteredData, getComparator(order, orderBy)).slice(
        page * rowsPerPage,
        page * rowsPerPage + rowsPerPage,
      ),
    [order, orderBy, page, rowsPerPage, filteredData],
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
    return theme.palette.error.main;
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
      <Paper
        sx={{
          width: "100%",
          borderRadius: 2,
          overflow: "hidden",
          boxShadow: theme.shadows[2],
        }}
      >
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
                      <Typography variant="body2">{row.consumption}</Typography>
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
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredData.length}
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
      </Paper>
    </Box>
  );
}
