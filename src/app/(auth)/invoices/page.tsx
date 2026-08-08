"use client";

import React from "react";
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  Button,
  Chip,
  Tooltip,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/lib/hooks/useUser";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { Invoice } from "@prisma/client";
import { useRouter } from "next/navigation";
import { calculateDaysUntilDue } from "@/lib/mocks/invoiceMocks";
import DownloadIcon from "@mui/icons-material/Download";
import { useState } from "react";
import { useMemos } from "@/lib/hooks/admin/useMemos";

interface InvoicesResponse {
  pagination: {
    limit: number;
    page: number;
    pages: number;
    total: number;
  };
  invoices: Invoice[];
}

export default function InvoicesPage() {
  const theme = useTheme();
  const { user } = useUser();
  const router = useRouter();
  const [statementDownloading, setStatementDownloading] = useState(false);

  // Fetch invoices using TanStack Query
  const {
    data: invoicesResponse,
    isLoading: invoicesLoading,
    error: invoicesError,
  } = useQuery<InvoicesResponse>({
    queryKey: ["invoices", user?.id],
    queryFn: async () => {
      if (!user?.id) {
        throw new Error("User ID is required");
      }
      const response = await fetch(
        `/api/accounting/invoices?customerId=${user.id}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch invoices");
      }
      return response.json();
    },
    enabled: !!user?.id,
  });

  // Fetch this customer's own issued memos once, to badge invoice rows that
  // have one - the API force-scopes CLIENT requests to their own
  // customer-facing memos, so no filters need to be passed here.
  const { memos: customerMemos } = useMemos(0, 9999, { status: "ISSUED" });
  const invoiceIdsWithMemo = new Set(
    customerMemos.filter((m) => m.invoice).map((m) => m.invoice!.id),
  );

  const headerCellSx = {
    fontWeight: "bold",
    borderBottom: "2px solid",
    borderBottomColor: "divider",
    py: { xs: 1.5, sm: 2 },
    px: { xs: 1.5, sm: 2 },
  };

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

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, mt: { xs: 1, md: 2 } }}>
      {/* Header */}
      <Box sx={{ mb: { xs: 2, md: 4 } }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: { xs: "flex-start", sm: "center" },
            gap: 2,
            flexDirection: { xs: "column", sm: "row" },
            mb: 1,
          }}
        >
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontWeight: "bold",
              mb: 0.5,
              fontSize: { xs: "1.6rem", sm: "2rem", md: "2.125rem" },
            }}
          >
            Invoices
          </Typography>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadStatement}
            disabled={statementDownloading || !user?.id || invoicesLoading}
            sx={{
              whiteSpace: "nowrap",
              minWidth: { xs: "100%", sm: "auto" },
            }}
          >
            {statementDownloading ? "Downloading..." : "Download Statement"}
          </Button>
        </Box>
        <Typography variant="body2" color="textSecondary">
          View and manage your invoices
        </Typography>
      </Box>

      {/* Invoices Table */}
      <Paper
        sx={{
          width: "100%",
          borderRadius: 2,
          overflow: "hidden",
          boxShadow: theme.shadows[2],
        }}
      >
        <TableContainer>
          <Table sx={{ minWidth: { xs: 320, sm: 600 } }} size="small">
            <TableHead
              sx={{
                backgroundColor:
                  theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.03)",
              }}
            >
              <TableRow>
                <TableCell sx={headerCellSx}>Invoice</TableCell>
                <TableCell align="right" sx={headerCellSx}>
                  Amount
                </TableCell>
                <TableCell sx={headerCellSx}>Status</TableCell>
                <TableCell
                  sx={{
                    ...headerCellSx,
                    display: { xs: "none", sm: "table-cell" },
                  }}
                >
                  Issued Date
                </TableCell>
                <TableCell
                  sx={{
                    ...headerCellSx,
                    display: { xs: "none", sm: "table-cell" },
                  }}
                >
                  Due Date
                </TableCell>
                <TableCell
                  sx={{
                    ...headerCellSx,
                    display: { xs: "none", md: "table-cell" },
                  }}
                >
                  Paid Date
                </TableCell>
                <TableCell
                  sx={{
                    ...headerCellSx,
                    display: { xs: "none", md: "table-cell" },
                  }}
                >
                  Paid Past Due
                </TableCell>
                <TableCell
                  sx={{
                    ...headerCellSx,
                    display: { xs: "none", md: "table-cell" },
                  }}
                >
                  Days Until Due
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoicesLoading ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: "center", py: 3 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : invoicesError ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    sx={{ textAlign: "center", py: 3, color: "error.main" }}
                  >
                    <Typography variant="body2">
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

                  return (
                    <TableRow
                      hover
                      key={invoice.id}
                      sx={{
                        cursor: "pointer",
                        "&:nth-of-type(odd)": {
                          backgroundColor: theme.palette.action.hover,
                        },
                      }}
                      onClick={() => router.push(`/invoices/${invoice.id}`)}
                    >
                      <TableCell
                        sx={{ py: { xs: 1, sm: 1.5 }, px: { xs: 1.5, sm: 2 } }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            sx={{
                              color: "primary.main",
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
                                variant="outlined"
                                color="primary"
                                sx={{ ml: 1, height: 18, fontSize: "0.65rem" }}
                              />
                            </Tooltip>
                          ) : null}
                        </Box>
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ py: { xs: 1, sm: 1.5 }, px: { xs: 1.5, sm: 2 } }}
                      >
                        <Typography variant="body2" fontWeight="medium">
                          ${Number(invoice.totalAmount).toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={{ py: { xs: 1, sm: 1.5 }, px: { xs: 1.5, sm: 2 } }}
                      >
                        <StatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell
                        sx={{
                          py: { xs: 1, sm: 1.5 },
                          px: { xs: 1.5, sm: 2 },
                          display: { xs: "none", sm: "table-cell" },
                        }}
                      >
                        <Typography variant="body2">
                          {(invoice.issuedDate ||
                            invoice.invoiceGeneratedDate) &&
                            new Date(
                              invoice.issuedDate ||
                                invoice.invoiceGeneratedDate,
                            ).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={{
                          py: { xs: 1, sm: 1.5 },
                          px: { xs: 1.5, sm: 2 },
                          display: { xs: "none", sm: "table-cell" },
                        }}
                      >
                        <Typography variant="body2">
                          {new Date(invoice.dueDate).toLocaleDateString(
                            "en-US",
                            { year: "numeric", month: "short", day: "numeric" },
                          )}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={{
                          py: { xs: 1, sm: 1.5 },
                          px: { xs: 1.5, sm: 2 },
                          display: { xs: "none", md: "table-cell" },
                        }}
                      >
                        <Typography variant="body2">
                          {invoice.paidDate &&
                            new Date(invoice.paidDate).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )}
                        </Typography>
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
                              px: 1,
                              py: 0.25,
                              borderRadius: "999px",
                              backgroundColor: "#fdecea",
                              border: "1px solid #f44336",
                              color: "#c62828",
                              fontSize: "0.75rem",
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
                          "-"
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
                          "-"
                        ) : (
                          <Typography
                            variant="body2"
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
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: "center", py: 3 }}>
                    <Typography variant="body2">No invoices found</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
