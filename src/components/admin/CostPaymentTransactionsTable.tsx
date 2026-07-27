"use client";

import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TablePagination,
  Typography,
  CircularProgress,
  useTheme,
} from "@mui/material";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";

export interface TransactionRow {
  id: string;
  createdAt: string;
  type: string;
  amount: number;
  consumption: number;
  narration: string | null;
  customer: { id: string; name: string | null; email: string | null } | null;
  invoiceNumber: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  PAYMENT: "Payment",
  ELECTRICITY_CHARGES: "Hosting & electricity charges",
  ADJUSTMENT: "Adjustment",
  HARDWARE_SALES: "Hardware sales payment",
};

type RowsPerPageOption = number | { value: number; label: string };

const HEAD_CELLS: Array<{
  id: string;
  label: string;
  align: "left" | "right";
}> = [
  { id: "createdAt", label: "Date", align: "left" },
  { id: "customer", label: "Customer", align: "left" },
  { id: "type", label: "Type", align: "left" },
  { id: "amount", label: "Amount", align: "right" },
  { id: "invoiceNumber", label: "Invoice #", align: "left" },
  { id: "narration", label: "Narration", align: "left" },
];

interface CostPaymentTransactionsTableProps {
  transactions: TransactionRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  rowsPerPageOptions?: RowsPerPageOption[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSortChange?: (field: string) => void;
}

export default function CostPaymentTransactionsTable({
  transactions,
  loading,
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  rowsPerPageOptions = [10, 25, 50, 100],
  sortBy,
  sortOrder,
  onSortChange,
}: CostPaymentTransactionsTableProps) {
  const theme = useTheme();

  return (
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
      ) : transactions.length === 0 ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography color="text.secondary">No transactions found</Typography>
        </Box>
      ) : (
        <>
          <TableContainer>
            <Table sx={{ minWidth: 750 }} size="small">
              <TableHead>
                <TableRow>
                  {HEAD_CELLS.map((cell) => (
                    <TableCell
                      key={cell.id}
                      align={cell.align}
                      sx={{ fontWeight: "bold" }}
                      sortDirection={sortBy === cell.id ? sortOrder : false}
                    >
                      {onSortChange ? (
                        <TableSortLabel
                          active={sortBy === cell.id}
                          direction={sortBy === cell.id ? sortOrder : "asc"}
                          onClick={() => onSortChange(cell.id)}
                        >
                          {cell.label}
                        </TableSortLabel>
                      ) : (
                        cell.label
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    sx={{
                      "&:nth-of-type(odd)": {
                        backgroundColor: theme.palette.action.hover,
                      },
                    }}
                  >
                    <TableCell>
                      <DateDisplay date={row.createdAt} format="datetime" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.customer?.name || row.customer?.email || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {TYPE_LABELS[row.type] || row.type}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        fontWeight="medium"
                        sx={{
                          color:
                            row.amount < 0
                              ? theme.palette.error.main
                              : theme.palette.success.main,
                        }}
                      >
                        <CurrencyDisplay value={row.amount} />
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.invoiceNumber || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          maxWidth: 260,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={row.narration || undefined}
                      >
                        {row.narration || "—"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={rowsPerPageOptions}
            component="div"
            count={totalCount}
            rowsPerPage={pageSize}
            page={page}
            onPageChange={(_event, newPage) => onPageChange(newPage)}
            onRowsPerPageChange={(event) => {
              onPageSizeChange(parseInt(event.target.value, 10));
            }}
            sx={{ borderTop: `1px solid ${theme.palette.divider}` }}
          />
        </>
      )}
    </Paper>
  );
}
