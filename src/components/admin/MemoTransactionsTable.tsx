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
  IconButton,
  Tooltip,
  Chip,
  useTheme,
} from "@mui/material";
import {
  History as HistoryIcon,
  Download as DownloadIcon,
  Block as BlockIcon,
} from "@mui/icons-material";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { MemoTransaction } from "@/lib/hooks/admin/useMemos";

const CATEGORY_LABELS: Record<string, string> = {
  HOSTING: "Hosting & Colocation",
  HARDWARE: "Hardware Sales",
};

const MEMO_TYPE_LABELS: Record<string, string> = {
  CUSTOMER_FACING: "Customer-facing",
  INTERNAL: "Internal",
};

type RowsPerPageOption = number | { value: number; label: string };

const HEAD_CELLS: Array<{
  id: string;
  label: string;
  align: "left" | "right";
}> = [
  { id: "createdAt", label: "Date", align: "left" },
  { id: "memoNumber", label: "Memo #", align: "left" },
  { id: "customer", label: "Customer", align: "left" },
  { id: "category", label: "Category", align: "left" },
  { id: "memoType", label: "Type", align: "left" },
  { id: "amount", label: "Amount", align: "right" },
  { id: "invoiceNumber", label: "Invoice #", align: "left" },
  { id: "status", label: "Status", align: "left" },
];

interface MemoTransactionsTableProps {
  transactions: MemoTransaction[];
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
  onViewHistory?: (row: MemoTransaction) => void;
  onVoid?: (row: MemoTransaction) => void;
  onDownload?: (row: MemoTransaction) => void;
}

export default function MemoTransactionsTable({
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
  onViewHistory,
  onVoid,
  onDownload,
}: MemoTransactionsTableProps) {
  const theme = useTheme();
  const showActions = Boolean(onViewHistory || onVoid || onDownload);

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
          <Typography color="text.secondary">No memos found</Typography>
        </Box>
      ) : (
        <>
          <TableContainer>
            <Table sx={{ minWidth: 900 }} size="small">
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
                  {showActions && (
                    <TableCell align="right" sx={{ fontWeight: "bold" }}>
                      Actions
                    </TableCell>
                  )}
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
                      opacity: row.status === "VOIDED" ? 0.6 : 1,
                    }}
                  >
                    <TableCell>
                      <DateDisplay date={row.createdAt} format="datetime" />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center" }}>
                        <Typography variant="body2">
                          {row.memoNumber}
                        </Typography>
                        {row.pairedMemoId ? (
                          <Tooltip title="Part of an internal transfer pair">
                            <Chip
                              label="transfer"
                              size="small"
                              variant="outlined"
                              sx={{ ml: 1, height: 18, fontSize: "0.65rem" }}
                            />
                          </Tooltip>
                        ) : null}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.user?.name || row.user?.email || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {CATEGORY_LABELS[row.category] || row.category}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {MEMO_TYPE_LABELS[row.memoType] || row.memoType}
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
                        {row.invoice?.invoiceNumber || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={row.status}
                        size="small"
                        color={row.status === "VOIDED" ? "default" : "success"}
                        variant={
                          row.status === "VOIDED" ? "outlined" : "filled"
                        }
                      />
                    </TableCell>
                    {showActions && (
                      <TableCell align="right">
                        {onViewHistory && (
                          <Tooltip title="History">
                            <IconButton
                              size="small"
                              onClick={() => onViewHistory(row)}
                            >
                              <HistoryIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {onDownload && row.memoType === "CUSTOMER_FACING" && (
                          <Tooltip title="Download PDF">
                            <IconButton
                              size="small"
                              onClick={() => onDownload(row)}
                            >
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {onVoid && row.status === "ISSUED" && (
                          <Tooltip title="Void">
                            <IconButton
                              size="small"
                              onClick={() => onVoid(row)}
                              sx={{ color: "error.main" }}
                            >
                              <BlockIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    )}
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
