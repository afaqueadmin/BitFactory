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
    useTheme,
} from "@mui/material";
import { visuallyHidden } from "@mui/utils";

interface ElectricityData {
    id: number;
    date: string;
    type: string;
    consumption: string;
    amount: string;
    balance: string;
}

type Order = 'asc' | 'desc';
type OrderBy = keyof ElectricityData;

const dummyData: ElectricityData[] = [
    {
        id: 1,
        date: "08/10/2025",
        type: "Electricity cost",
        consumption: "315.552 kWh",
        amount: "- 23,67 €",
        balance: "+ 231,99 €",
    },
    {
        id: 2,
        date: "07/10/2025",
        type: "Electricity cost",
        consumption: "315.552 kWh",
        amount: "- 23,67 €",
        balance: "+ 255,65 €",
    },
    {
        id: 3,
        date: "06/10/2025",
        type: "Electricity cost",
        consumption: "315.552 kWh",
        amount: "- 23,67 €",
        balance: "+ 279,32 €",
    },
    {
        id: 4,
        date: "05/10/2025",
        type: "Electricity cost",
        consumption: "315.552 kWh",
        amount: "- 23,67 €",
        balance: "+ 302,99 €",
    },
    {
        id: 5,
        date: "04/10/2025",
        type: "Electricity cost",
        consumption: "315.552 kWh",
        amount: "- 23,67 €",
        balance: "+ 326,65 €",
    },
    {
        id: 6,
        date: "03/10/2025",
        type: "Electricity cost",
        consumption: "315.552 kWh",
        amount: "- 23,67 €",
        balance: "+ 350,32 €",
    },
    {
        id: 7,
        date: "02/10/2025",
        type: "Electricity cost",
        consumption: "315.552 kWh",
        amount: "- 23,67 €",
        balance: "+ 373,98 €",
    },
    {
        id: 8,
        date: "01/10/2025",
        type: "Electricity cost",
        consumption: "315.552 kWh",
        amount: "- 23,67 €",
        balance: "+ 397,65 €",
    },
];

interface HeadCell {
    id: OrderBy;
    label: string;
    numeric: boolean;
}

const headCells: readonly HeadCell[] = [
    {
        id: 'date',
        numeric: false,
        label: 'Date',
    },
    {
        id: 'type',
        numeric: false,
        label: 'Type',
    },
    {
        id: 'consumption',
        numeric: false,
        label: 'Consumption',
    },
    {
        id: 'amount',
        numeric: true,
        label: 'Amount',
    },
    {
        id: 'balance',
        numeric: true,
        label: 'Balance',
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

function getComparator<Key extends keyof any>(
    order: Order,
    orderBy: Key,
): (
    a: { [key in Key]: number | string },
    b: { [key in Key]: number | string },
) => number {
    return order === 'desc'
        ? (a, b) => descendingComparator(a, b, orderBy)
        : (a, b) => -descendingComparator(a, b, orderBy);
}

function stableSort<T>(array: readonly T[], comparator: (a: T, b: T) => number) {
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
                        align={headCell.numeric ? 'right' : 'left'}
                        sortDirection={orderBy === headCell.id ? order : false}
                        sx={{
                            fontWeight: 'bold',
                            borderBottom: '2px solid',
                            borderBottomColor: 'divider',
                            py: 2,
                        }}
                    >
                        <TableSortLabel
                            active={orderBy === headCell.id}
                            direction={orderBy === headCell.id ? order : 'asc'}
                            onClick={createSortHandler(headCell.id)}
                            sx={{
                                fontWeight: 'bold',
                                '&.Mui-active': {
                                    color: 'primary.main',
                                },
                            }}
                        >
                            {headCell.label}
                            {orderBy === headCell.id ? (
                                <Box component="span" sx={visuallyHidden}>
                                    {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
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
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<OrderBy>('date');

    const handleRequestSort = (
        event: React.MouseEvent<unknown>,
        property: OrderBy,
    ) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const visibleRows = React.useMemo(
        () =>
            stableSort(dummyData, getComparator(order, orderBy)),
        [order, orderBy],
    );

    const getAmountColor = (amount: string) => {
        if (amount.includes('-')) {
            return theme.palette.error.main;
        }
        return theme.palette.text.primary;
    };

    const getBalanceColor = (balance: string) => {
        if (balance.includes('+')) {
            return theme.palette.success.main;
        }
        return theme.palette.error.main;
    };

    return (
        <Box sx={{ width: '100%', mt: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
                Electricity Cost History
            </Typography>
            <Paper
                sx={{
                    width: '100%',
                    borderRadius: 2,
                    overflow: 'hidden',
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
                            {visibleRows.map((row, index) => {
                                return (
                                    <TableRow
                                        hover
                                        key={row.id}
                                        sx={{
                                            cursor: 'pointer',
                                            '&:nth-of-type(odd)': {
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
                                            <Typography variant="body2">
                                                {row.type}
                                            </Typography>
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
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Box>
    );
}