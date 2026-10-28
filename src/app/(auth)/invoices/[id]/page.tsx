"use client";

import { useParams, useRouter } from "next/navigation";
import React, { useState } from "react";
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableContainer,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
} from "@mui/material";
import { useInvoice } from "@/lib/hooks/useInvoices";
import { useMemos, MemoTransaction } from "@/lib/hooks/admin/useMemos";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
import PayWithBitcoinButton from "@/components/PayWithBitcoinButton";
import PayWithBinanceButton from "@/components/PayWithBinanceButton";
import { RepairMinerDetails } from "@/components/accounting/invoices/RepairMinerDetails";
import { SIM_INVOICE_ID } from "@/lib/simulation/config";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";
import { useUser } from "@/lib/hooks/useUser";
import { isReadOnlyRole } from "@/lib/customerRoles";

type RepairLineRow = {
  id: string;
  model: string;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
};

export default function CustomerInvoiceDetailPage() {
  const { d, fonts } = useDaylight();
  const params = useParams();
  const router = useRouter();
  const { invoice, loading, error } = useInvoice(params.id as string);
  // A simulated account's simulated invoice is view only: it can't be paid.
  // Real invoices issued to them are paid like anyone else's.
  const isSimulated = params.id === SIM_INVOICE_ID;
  // Guildmembers see the guild's invoices but the Guildmaster pays them.
  const { user } = useUser();
  const isViewOnly = isReadOnlyRole(user?.role);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [memoDownloadingId, setMemoDownloadingId] = useState<string | null>(
    null,
  );

  const { memos, loading: memosLoading } = useMemos(0, 25, {
    invoiceId: params.id as string,
  });

  const handleMemoDownload = async (memo: MemoTransaction) => {
    try {
      setMemoDownloadingId(memo.id);
      const response = await fetch(`/api/memos/${memo.id}/download`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to download memo");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `memo-${memo.memoNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Memo download error:", err);
      alert("Failed to download memo PDF");
    } finally {
      setMemoDownloadingId(null);
    }
  };

  const handleDownload = async () => {
    try {
      setDownloadLoading(true);
      const response = await fetch(
        `/api/accounting/invoices/${invoice?.id}/download`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to download invoice");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${invoice?.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
      alert("Failed to download invoice PDF");
    } finally {
      setDownloadLoading(false);
    }
  };

  // Shared Daylight pieces for this page.
  const cardSx = {
    bgcolor: d.surface,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS_CARD,
    boxShadow: d.shadow,
    p: { xs: "18px 16px", sm: "22px 24px" },
    mb: { xs: "16px", md: "20px" },
  } as const;
  const sectionTitleSx = {
    m: 0,
    mb: "14px",
    fontFamily: fonts.heading,
    fontWeight: 700,
    fontSize: 16,
    color: d.text,
  } as const;
  const fieldGridSx = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(200px, 100%), 1fr))",
    gap: { xs: "14px", sm: "18px 24px" },
  } as const;
  const Field = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ fontSize: 12, color: d.muted, mb: "4px" }}>{label}</Box>
      <Box
        sx={{
          fontSize: 14,
          fontWeight: 600,
          color: d.text,
          overflowWrap: "anywhere",
        }}
      >
        {children}
      </Box>
    </Box>
  );
  const tableSx = {
    "& .MuiTableCell-head": {
      fontFamily: fonts.body,
      fontWeight: 600,
      fontSize: 10,
      letterSpacing: ".015em",
      textTransform: "uppercase",
      color: d.muted,
      bgcolor: d.tableHead,
      borderBottomColor: d.border,
    },
    "& .MuiTableCell-body": {
      fontFamily: fonts.body,
      fontSize: 13,
      color: d.text,
      borderBottomColor: d.border,
    },
    "& .MuiTableBody-root .MuiTableRow-root:last-of-type .MuiTableCell-body": {
      borderBottom: 0,
    },
  } as const;
  const outlineBtnSx = {
    textTransform: "none",
    fontFamily: fonts.body,
    fontWeight: 600,
    fontSize: 13,
    minHeight: 42,
    px: "16px",
    borderRadius: "8px",
    color: d.text,
    borderColor: d.inputBorder,
    bgcolor: d.surface,
    "&:hover": { bgcolor: d.hover, borderColor: d.action },
  } as const;

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress sx={{ color: d.action }} />
      </Box>
    );
  }

  const alertSx = (tone: "error" | "warning") => ({
    borderRadius: "8px",
    fontFamily: fonts.body,
    fontSize: 13,
    bgcolor: tone === "error" ? d.dangerSoft : d.amber,
    color: tone === "error" ? d.danger : d.warning,
    "& .MuiAlert-icon": { color: tone === "error" ? d.danger : d.warning },
  });

  if (error) {
    return (
      <Box sx={{ maxWidth: 1100, mx: "auto" }}>
        <Alert severity="error" sx={alertSx("error")}>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!invoice) {
    return (
      <Box sx={{ maxWidth: 1100, mx: "auto" }}>
        <Alert severity="warning" sx={alertSx("warning")}>
          Invoice not found
        </Alert>
      </Box>
    );
  }

  // Hardware Repair invoices: one miner, free-text line items and a flat
  // discount; unitPrice holds the line-item subtotal.
  const isRepair = invoice.invoiceType === "HARDWARE_REPAIR";
  const daysPaidLate =
    invoice.status === "PAID" && invoice.paidDate && invoice.dueDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(invoice.paidDate).getTime() -
              new Date(invoice.dueDate).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null;

  return (
    <Box
      sx={{ maxWidth: 1100, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push("/invoices")}
        sx={{
          mb: "14px",
          ml: "-8px",
          textTransform: "none",
          fontFamily: fonts.body,
          fontWeight: 600,
          fontSize: 13,
          color: d.action,
          borderRadius: "8px",
          "&:hover": { bgcolor: d.hover },
        }}
      >
        Back to Invoices
      </Button>

      {/* Summary: what this invoice is, what's owed, and what to do */}
      <Box
        component="section"
        aria-label="Invoice summary"
        sx={{
          ...cardSx,
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: { xs: "stretch", md: "center" },
          justifyContent: "space-between",
          gap: { xs: "18px", md: "24px" },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <Typography
              component="h1"
              sx={{
                fontFamily: fonts.heading,
                fontWeight: 750,
                fontSize: { xs: 24, md: 28 },
                lineHeight: 1.25,
                letterSpacing: "-.03em",
                color: d.text,
              }}
            >
              {invoice.invoiceNumber}
            </Typography>
            <StatusBadge status={invoice.status} daylight />
          </Box>
          <Box sx={{ mt: "6px", fontSize: 13, color: d.muted }}>
            {invoice.issuedDate ? (
              <>
                Issued <DateDisplay date={invoice.issuedDate} />
                {" · "}
              </>
            ) : (
              "Not issued yet · "
            )}
            Due <DateDisplay date={invoice.dueDate} />
          </Box>
          <Box sx={{ mt: "14px" }}>
            <Box sx={{ fontSize: 12, color: d.muted }}>Total amount</Box>
            <Box
              sx={{
                fontFamily: fonts.heading,
                fontWeight: 750,
                fontSize: { xs: 26, md: 30 },
                letterSpacing: "-.03em",
                fontVariantNumeric: "tabular-nums",
                color: d.text,
              }}
            >
              <CurrencyDisplay value={invoice.totalAmount} />
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row", md: "column" },
            alignItems: { xs: "stretch", md: "flex-end" },
            gap: "10px",
            flexShrink: 0,
            "& .MuiButton-root": { width: { xs: "100%", sm: "auto" } },
          }}
        >
          {isSimulated ? (
            <Box sx={{ fontSize: 12, color: d.muted, textAlign: "right" }}>
              Simulated invoice - view only
            </Box>
          ) : isViewOnly ? (
            <Box sx={{ fontSize: 12, color: d.muted, textAlign: "right" }}>
              Guild invoice - your Guildmaster pays it
            </Box>
          ) : (
            <>
              <PayWithBinanceButton
                invoiceId={invoice.id}
                disabled={
                  invoice.status === "PAID" || invoice.status === "CANCELLED"
                }
              />
              {process.env.NEXT_PUBLIC_BTCPAY_ENABLED === "true" &&
                ["sonofaunali@gmail.com", "hamzanajeebmusic@gmail.com"] //@TODO: remove this condition when feature is ready
                  .includes(invoice.user.email) && (
                  <PayWithBitcoinButton
                    invoiceId={invoice.id}
                    disabled={invoice.status === "PAID"}
                  />
                )}
            </>
          )}
          <Button
            variant="outlined"
            startIcon={
              downloadLoading ? (
                <CircularProgress size={14} sx={{ color: d.action }} />
              ) : (
                <DownloadIcon />
              )
            }
            onClick={handleDownload}
            disabled={downloadLoading}
            sx={outlineBtnSx}
          >
            {downloadLoading ? "Downloading..." : "Download Invoice"}
          </Button>
        </Box>
      </Box>

      {/* Invoice Details Section */}
      <Box component="section" sx={cardSx}>
        <Typography component="h2" sx={sectionTitleSx}>
          Invoice Details
        </Typography>
        <Box sx={fieldGridSx}>
          <Field label="Invoice Number">{invoice.invoiceNumber}</Field>
          <Field label="Status">
            <StatusBadge status={invoice.status} daylight />
          </Field>
          {isRepair ? (
            <>
              <Field label="Subtotal">
                <CurrencyDisplay value={invoice.unitPrice} />
              </Field>
              <Field label="Discount">
                {Number(invoice.discountAmount) > 0 ? "- " : ""}
                <CurrencyDisplay value={invoice.discountAmount} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Total Miners">
                {invoice.totalMiners || 0} units
              </Field>
              <Field label="Unit Price">
                <CurrencyDisplay value={invoice.unitPrice} />
              </Field>
            </>
          )}
          <Field label="Total Amount">
            <CurrencyDisplay value={invoice.totalAmount} />
          </Field>
          <Field label="Issued Date">
            {invoice.issuedDate ? (
              <DateDisplay date={invoice.issuedDate} format="datetime" />
            ) : (
              "Not issued yet"
            )}
          </Field>
          <Field label="Due Date">
            <DateDisplay date={invoice.dueDate} />
          </Field>
          <Field label="Paid Date">
            {invoice.paidDate ? (
              <DateDisplay date={invoice.paidDate} format="datetime" />
            ) : (
              "Not yet paid"
            )}
          </Field>
          {daysPaidLate !== null && (
            <Field label="Paid Past Due">
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  px: "9px",
                  py: "2px",
                  borderRadius: "999px",
                  bgcolor: daysPaidLate > 0 ? d.dangerSoft : d.mint,
                  color: daysPaidLate > 0 ? d.danger : d.success,
                  fontSize: 11,
                  fontWeight: 650,
                }}
              >
                {daysPaidLate} {daysPaidLate === 1 ? "day" : "days"}
              </Box>
            </Field>
          )}
        </Box>
      </Box>

      {isRepair && (
        <>
          {/* Repaired Miner */}
          <Box component="section" sx={cardSx}>
            <Typography component="h2" sx={sectionTitleSx}>
              Miner
            </Typography>
            {invoice.miner ? (
              <RepairMinerDetails miner={invoice.miner} daylight />
            ) : (
              <Box sx={{ fontSize: 13, color: d.muted }}>
                The miner on this invoice is no longer available.
              </Box>
            )}
          </Box>

          {/* Repair Line Items (description is stored in `model`) */}
          {invoice.lineItems && invoice.lineItems.length > 0 && (
            <Box component="section" sx={cardSx}>
              <Typography component="h2" sx={sectionTitleSx}>
                Line Items
              </Typography>
              <TableContainer
                sx={{
                  ...tableSx,
                  border: `1px solid ${d.border}`,
                  borderRadius: "10px",
                }}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Description</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Rate (USD)</TableCell>
                      <TableCell align="right">Amount (USD)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {invoice.lineItems.map((item: RepairLineRow) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.model}</TableCell>
                        <TableCell align="right">{item.quantity}</TableCell>
                        <TableCell align="right">
                          <CurrencyDisplay value={item.unitPrice} />
                        </TableCell>
                        <TableCell align="right">
                          <CurrencyDisplay value={item.totalPrice} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* Repair Note (written to the miner's repair history) */}
          {invoice.repairNote?.note && (
            <Box component="section" sx={cardSx}>
              <Typography component="h2" sx={sectionTitleSx}>
                Repair Note
              </Typography>
              <Box
                sx={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.6 }}
              >
                {invoice.repairNote.note}
              </Box>
            </Box>
          )}
        </>
      )}

      {/* Invoice Narration */}
      {invoice.costPayments && invoice.costPayments.length > 0 && (
        <Box component="section" sx={cardSx}>
          <Typography component="h2" sx={sectionTitleSx}>
            Invoice Narration
          </Typography>
          {invoice.costPayments
            .filter(
              (payment: { narration?: string | null }) => payment.narration,
            )
            .map(
              (
                payment: {
                  id: string;
                  amount: number;
                  narration?: string | null;
                  createdAt: string;
                },
                index: number,
                filtered: { id: string }[],
              ) => (
                <Box
                  key={payment.id}
                  sx={{
                    pb: "14px",
                    mb: index < filtered.length - 1 ? "14px" : 0,
                    borderBottom:
                      index < filtered.length - 1
                        ? `1px solid ${d.border}`
                        : "none",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 1,
                      mb: "4px",
                      fontSize: 12,
                      color: d.muted,
                    }}
                  >
                    <span>
                      Payment of <CurrencyDisplay value={payment.amount} />
                    </span>
                    <span>
                      {new Date(payment.createdAt).toLocaleDateString()}
                    </span>
                  </Box>
                  <Box sx={{ fontSize: 14, lineHeight: 1.6 }}>
                    {payment.narration}
                  </Box>
                </Box>
              ),
            )}
          {invoice.costPayments.every(
            (payment: { narration?: string | null }) => !payment.narration,
          ) && (
            <Box sx={{ fontSize: 13, color: d.muted }}>
              No narration added for this invoice
            </Box>
          )}
        </Box>
      )}

      {/* Memos Section */}
      {(memosLoading || memos.length > 0) && (
        <Box component="section" sx={cardSx}>
          <Typography component="h2" sx={sectionTitleSx}>
            Memos
          </Typography>
          {memosLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={28} sx={{ color: d.action }} />
            </Box>
          ) : (
            <TableContainer
              sx={{
                ...tableSx,
                border: `1px solid ${d.border}`,
                borderRadius: "10px",
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Memo #</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">PDF</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {memos.map((memo) => (
                    <TableRow key={memo.id}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {memo.memoNumber}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <DateDisplay date={memo.createdAt} />
                      </TableCell>
                      <TableCell align="right">
                        <CurrencyDisplay value={memo.amount} />
                      </TableCell>
                      <TableCell>
                        <Box
                          component="span"
                          sx={{
                            display: "inline-flex",
                            px: "9px",
                            py: "2px",
                            borderRadius: "999px",
                            fontSize: 11,
                            fontWeight: 650,
                            bgcolor:
                              memo.status === "VOIDED" ? d.hover : d.mint,
                            color:
                              memo.status === "VOIDED" ? d.muted : d.success,
                          }}
                        >
                          {memo.status === "VOIDED" ? "Voided" : "Issued"}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Download PDF">
                          <span>
                            <IconButton
                              size="small"
                              aria-label={`Download memo ${memo.memoNumber}`}
                              onClick={() => handleMemoDownload(memo)}
                              disabled={memoDownloadingId === memo.id}
                              sx={{
                                color: d.muted,
                                borderRadius: "8px",
                                "&:hover": {
                                  bgcolor: d.hover,
                                  color: d.action,
                                },
                              }}
                            >
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {/* Customer & Relationship Manager Information Section */}
      <Box component="section" sx={{ ...cardSx, mb: 0 }}>
        <Typography component="h2" sx={sectionTitleSx}>
          Customer &amp; Relationship Manager
        </Typography>
        <Box sx={fieldGridSx}>
          <Field label="Customer Name">{invoice.user?.name || "N/A"}</Field>
          <Field label="Customer Email">{invoice.user?.email || "N/A"}</Field>
          <Field label="Relationship Manager">
            {invoice.group?.relationshipManager || "Not assigned"}
          </Field>
          <Field label="RM Email">
            {invoice.group?.email || "Not assigned"}
          </Field>
          <Field label="Group Name">
            {invoice.group?.name || "No group assigned"}
          </Field>
        </Box>
      </Box>
    </Box>
  );
}
