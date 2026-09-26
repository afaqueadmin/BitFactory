"use client";

/**
 * Invoices page (authenticated) - BitFactory Daylight theme (v1.3)
 *
 * Composes:
 * - Page heading + Download Statement button
 * - Daylight data table (guide-style header row, soft-tone status pills)
 *   with the same pagination/memo-badging logic as before
 *
 * Status pills are rendered with a local Daylight tone map rather than the
 * shared <StatusBadge>, which is reused across admin/accounting pages and
 * stays on its MUI Chip colours there.
 */

import React from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Tooltip,
  TablePagination,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/lib/hooks/useUser";
import { InvoiceStatus, Invoice } from "@prisma/client";
import { INVOICE_STATUS_LABELS } from "@/lib/constants/accounting";
import { useRouter } from "next/navigation";
import { calculateDaysUntilDue } from "@/lib/mocks/invoiceMocks";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { useState } from "react";
import { useMemos } from "@/lib/hooks/admin/useMemos";
import { RADIUS_CARD, useDaylight, DaylightPalette } from "@/lib/daylight";

interface InvoicesResponse {
  pagination: {
    limit: number;
    page: number;
    pages: number;
    total: number;
  };
  invoices: Invoice[];
}

/** Daylight soft-tone pill for an invoice status. */
function invoiceStatusTone(d: DaylightPalette, status: InvoiceStatus) {
  switch (status) {
    case "PAID":
      return { bg: d.mint, text: d.success };
    case "ISSUED":
      return { bg: d.skySoft, text: d.action };
    case "OVERDUE":
      return { bg: d.dangerSoft, text: d.danger };
    case "CANCELLED":
      return { bg: d.amber, text: d.warning };
    default:
      // DRAFT, REFUNDED
      return { bg: d.border, text: d.muted };
  }
}

export default function InvoicesPage() {
  const { d, fonts } = useDaylight();
  const { user } = useUser();
  const router = useRouter();
  const [statementDownloading, setStatementDownloading] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Fetch invoices using TanStack Query
  const {
    data: invoicesResponse,
    isLoading: invoicesLoading,
    error: invoicesError,
  } = useQuery<InvoicesResponse>({
    queryKey: ["invoices", user?.id, page, rowsPerPage],
    queryFn: async () => {
      if (!user?.id) {
        throw new Error("User ID is required");
      }
      const response = await fetch(
        `/api/accounting/invoices?customerId=${user.id}&sortBy=issuedDate&sortDirection=desc&page=${page + 1}&limit=${rowsPerPage}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch invoices");
      }
      return response.json();
    },
    enabled: !!user?.id,
  });

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Fetch this customer's own issued memos once, to badge invoice rows that
  // have one - the API force-scopes CLIENT requests to their own
  // customer-facing memos, so no filters need to be passed here.
  const { memos: customerMemos } = useMemos(0, 9999, { status: "ISSUED" });
  const invoiceIdsWithMemo = new Set(
    customerMemos.filter((m) => m.invoice).map((m) => m.invoice!.id),
  );

  const handleDownloadStatement = async () => {
    try {
      setStatementDownloading(true);

      const response = await fetch("/api/accounting/invoices/statement", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to download statement");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      const contentDisposition = response.headers.get("content-disposition");
      let filename = "statement.pdf";
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading statement:", error);
      alert("Failed to download statement. Please try again.");
    } finally {
      setStatementDownloading(false);
    }
  };

  const formatDate = (value: string | Date | null | undefined) =>
    value
      ? new Date(value).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "";

  const headerCellSx = {
    fontFamily: fonts.body,
    fontWeight: 600,
    fontSize: 10,
    letterSpacing: ".015em",
    textTransform: "uppercase" as const,
    color: d.muted,
    borderBottomColor: d.border,
    py: { xs: 1.5, sm: 2 },
    px: { xs: 1.5, sm: 2 },
  };

  const columns = [
    { label: "Invoice", hideBelow: undefined },
    { label: "Amount", hideBelow: undefined, align: "right" as const },
    { label: "Status", hideBelow: undefined },
    { label: "Issued Date", hideBelow: "sm" as const },
    { label: "Due Date", hideBelow: "sm" as const },
    { label: "Paid Date", hideBelow: "md" as const },
    { label: "Paid Past Due", hideBelow: "md" as const },
    { label: "Days Until Due", hideBelow: "md" as const },
  ];

  return (
    <Box
      sx={{ maxWidth: 1600, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      {/* Page heading */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
          mb: { xs: "20px", md: "26px" },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: { xs: 27, md: 32 },
              lineHeight: 1.3,
              letterSpacing: "-.035em",
              color: d.text,
            }}
          >
            Invoices
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: 12, md: 13 },
              lineHeight: { xs: 1.7, md: 1.5 },
              color: d.muted,
              mt: "7px",
            }}
          >
            View and manage your invoices.
          </Typography>
        </Box>

        <Button
          onClick={handleDownloadStatement}
          disabled={statementDownloading || !user?.id || invoicesLoading}
          startIcon={
            statementDownloading ? (
              <CircularProgress size={14} sx={{ color: d.action }} />
            ) : (
              <DownloadOutlinedIcon sx={{ fontSize: 16 }} />
            )
          }
          sx={{
            textTransform: "none",
            fontFamily: fonts.body,
            fontSize: 12,
            fontWeight: 600,
            minHeight: 42,
            borderRadius: "8px",
            border: `1px solid ${d.inputBorder}`,
            color: d.text,
            px: "16px",
            width: { xs: "100%", sm: "auto" },
            "&:hover": { bgcolor: d.hover },
          }}
        >
          {statementDownloading ? "Downloading..." : "Download Statement"}
        </Button>
      </Box>

      {/* Invoices table */}
      <Box
        sx={{
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
          overflow: "hidden",
        }}
      >
        <TableContainer>
          <Table sx={{ minWidth: { xs: 320, sm: 600 } }} size="small">
            <TableHead sx={{ backgroundColor: d.tableHead }}>
              <TableRow>
                {columns.map((col) => (
                  <TableCell
                    key={col.label}
                    align={col.align}
                    sx={{
                      ...headerCellSx,
                      display: col.hideBelow
                        ? { xs: "none", [col.hideBelow]: "table-cell" }
                        : "table-cell",
                    }}
                  >
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {invoicesLoading ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: "center", py: 4 }}>
                    <CircularProgress size={24} sx={{ color: d.action }} />
                  </TableCell>
                </TableRow>
              ) : invoicesError ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: "center", py: 4 }}>
                    <Typography
                      sx={{
                        fontSize: 13,
                        color: d.danger,
                        fontFamily: fonts.body,
                      }}
                    >
                      Failed to load invoices
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : invoicesResponse?.invoices &&
                invoicesResponse.invoices.length > 0 ? (
                invoicesResponse.invoices.map((invoice) => {
                  const daysUntilDue = calculateDaysUntilDue(
                    new Date(invoice.dueDate),
                  );
                  const tone = invoiceStatusTone(d, invoice.status);

                  return (
                    <TableRow
                      hover
                      key={invoice.id}
                      onClick={() => router.push(`/invoices/${invoice.id}`)}
                      sx={{
                        cursor: "pointer",
                        "&:hover": { backgroundColor: d.hover },
                        "& .MuiTableCell-root": {
                          borderBottomColor: d.border,
                          fontFamily: fonts.body,
                        },
                        "&:last-child td, &:last-child th": { border: 0 },
                      }}
                    >
                      <TableCell
                        sx={{ py: { xs: 1, sm: 1.5 }, px: { xs: 1.5, sm: 2 } }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                          <Typography
                            sx={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: d.action,
                              "&:hover": { textDecoration: "underline" },
                            }}
                          >
                            {invoice.invoiceNumber}
                          </Typography>
                          {invoiceIdsWithMemo.has(invoice.id) ? (
                            <Tooltip title="This invoice has a memo">
                              <Chip
                                label="Memo"
                                size="small"
                                sx={{
                                  ml: 1,
                                  height: 18,
                                  fontSize: "0.62rem",
                                  fontFamily: fonts.body,
                                  fontWeight: 600,
                                  bgcolor: d.skySoft,
                                  color: d.action,
                                }}
                              />
                            </Tooltip>
                          ) : null}
                        </Box>
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ py: { xs: 1, sm: 1.5 }, px: { xs: 1.5, sm: 2 } }}
                      >
                        <Typography
                          sx={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: d.text,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          ${Number(invoice.totalAmount).toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={{ py: { xs: 1, sm: 1.5 }, px: { xs: 1.5, sm: 2 } }}
                      >
                        <Chip
                          label={INVOICE_STATUS_LABELS[invoice.status]}
                          size="small"
                          sx={{
                            fontFamily: fonts.body,
                            fontWeight: 600,
                            fontSize: 11,
                            bgcolor: tone.bg,
                            color: tone.text,
                          }}
                        />
                      </TableCell>
                      <TableCell
                        sx={{
                          py: { xs: 1, sm: 1.5 },
                          px: { xs: 1.5, sm: 2 },
                          display: { xs: "none", sm: "table-cell" },
                          fontSize: 12,
                          color: d.text,
                        }}
                      >
                        {formatDate(
                          invoice.issuedDate || invoice.invoiceGeneratedDate,
                        )}
                      </TableCell>
                      <TableCell
                        sx={{
                          py: { xs: 1, sm: 1.5 },
                          px: { xs: 1.5, sm: 2 },
                          display: { xs: "none", sm: "table-cell" },
                          fontSize: 12,
                          color: d.text,
                        }}
                      >
                        {formatDate(invoice.dueDate)}
                      </TableCell>
                      <TableCell
                        sx={{
                          py: { xs: 1, sm: 1.5 },
                          px: { xs: 1.5, sm: 2 },
                          display: { xs: "none", md: "table-cell" },
                          fontSize: 12,
                          color: d.text,
                        }}
                      >
                        {formatDate(invoice.paidDate)}
                      </TableCell>
                      <TableCell
                        sx={{
                          py: { xs: 1, sm: 1.5 },
                          px: { xs: 1.5, sm: 2 },
                          display: { xs: "none", md: "table-cell" },
                        }}
                      >
                        {invoice.status === "PAID" &&
                        invoice.paidDate &&
                        invoice.dueDate ? (
                          <Box
                            sx={{
                              display: "inline-flex",
                              alignItems: "center",
                              px: "9px",
                              py: "3px",
                              borderRadius: "999px",
                              backgroundColor: d.dangerSoft,
                              color: d.danger,
                              fontSize: 11,
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {Math.max(
                              0,
                              Math.ceil(
                                (new Date(invoice.paidDate).getTime() -
                                  new Date(invoice.dueDate).getTime()) /
                                  (1000 * 60 * 60 * 24),
                              ),
                            )}{" "}
                            days
                          </Box>
                        ) : (
                          <span style={{ color: d.muted }}>-</span>
                        )}
                      </TableCell>
                      <TableCell
                        sx={{
                          py: { xs: 1, sm: 1.5 },
                          px: { xs: 1.5, sm: 2 },
                          display: { xs: "none", md: "table-cell" },
                        }}
                      >
                        {invoice.status === "PAID" ? (
                          <span style={{ color: d.muted }}>-</span>
                        ) : (
                          <Typography
                            sx={{
                              fontSize: 12,
                              fontFamily: fonts.body,
                              fontWeight: 600,
                              color:
                                daysUntilDue < 0
                                  ? d.danger
                                  : daysUntilDue < 7
                                    ? d.warning
                                    : d.success,
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
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: "center", py: 4 }}>
                    <Typography
                      sx={{
                        fontSize: 13,
                        color: d.muted,
                        fontFamily: fonts.body,
                      }}
                    >
                      No invoices found
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={invoicesResponse?.pagination.total ?? 0}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 25, 50]}
          sx={{
            borderTop: `1px solid ${d.border}`,
            fontFamily: fonts.body,
            color: d.muted,
            "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows":
              {
                fontFamily: fonts.body,
                fontSize: 12,
              },
            "& .MuiSelect-select": { fontFamily: fonts.body, color: d.text },
            "& .MuiTablePagination-actions button": { color: d.text },
          }}
        />
      </Box>
    </Box>
  );
}
