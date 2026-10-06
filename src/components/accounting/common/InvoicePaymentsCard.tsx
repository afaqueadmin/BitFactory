"use client";

/**
 * Payments card for the admin Hosting & Colocation and Hardware Sales
 * invoice pages: every non-voided payment with its payment date, when it
 * was recorded, the USD amount, the amount as received in its currency, the
 * rate and the receiving entity and bank. Older and automatic payments
 * (Confirmo, memos, franchise, cron) have no account details and show "—".
 */

import {
  Alert,
  Box,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { CostPaymentWithAccount } from "@/lib/hooks/useInvoices";

const DASH = "—";

function typeLabel(type: string, invoiceType?: string | null): string {
  switch (type) {
    case "HARDWARE_SALES":
      return "Hardware Sales";
    case "PAYMENT":
      // On hardware-sales invoices, PAYMENT rows are the hosting part of a
      // split payment.
      return invoiceType === "HARDWARE_SALES"
        ? "Hosting & Colocation"
        : "Payment";
    case "ADJUSTMENT":
      return "Adjustment";
    case "ELECTRICITY_CHARGES":
      return "Electricity Charges";
    default:
      return type;
  }
}

const formatOriginal = (value: unknown, code?: string | null) =>
  value == null || !code
    ? DASH
    : `${Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${code}`;

interface InvoicePaymentsCardProps {
  payments: CostPaymentWithAccount[] | undefined;
  invoiceType?: string | null;
  /** BTCPay settles an invoice without creating a payment row. */
  btcpayStatus?: string | null;
  btcpaySettledAt?: string | Date | null;
}

export function InvoicePaymentsCard({
  payments,
  invoiceType,
  btcpayStatus,
  btcpaySettledAt,
}: InvoicePaymentsCardProps) {
  const rows = (payments ?? []).filter((p) => !p.isDeleted);
  const paidViaBtcpay =
    rows.length === 0 && btcpayStatus === "Settled" && !!btcpaySettledAt;

  return (
    <Box sx={{ mt: 4 }}>
      <Card>
        <CardHeader title="Payments" />
        <Divider />
        <CardContent>
          {paidViaBtcpay && (
            <Alert severity="info" sx={{ mb: rows.length ? 2 : 0 }}>
              Paid via BTCPay on{" "}
              <DateDisplay date={btcpaySettledAt!} format="date" />
            </Alert>
          )}

          {rows.length === 0 && !paidViaBtcpay && (
            <Typography color="textSecondary">
              No payments recorded for this invoice
            </Typography>
          )}

          {rows.length > 0 && (
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Payment date</TableCell>
                    <TableCell>Recorded on</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Amount (USD)</TableCell>
                    <TableCell align="right">Amount received</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell>Entity</TableCell>
                    <TableCell>Bank</TableCell>
                    <TableCell>Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {p.paymentDate ? (
                          <DateDisplay date={p.paymentDate} format="date" />
                        ) : (
                          DASH
                        )}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <DateDisplay date={p.createdAt} format="date" />
                      </TableCell>
                      <TableCell>{typeLabel(p.type, invoiceType)}</TableCell>
                      <TableCell align="right">
                        <CurrencyDisplay value={p.amount} />
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {formatOriginal(p.originalAmount, p.currency?.code)}
                      </TableCell>
                      <TableCell align="right">
                        {p.exchangeRate != null ? Number(p.exchangeRate) : DASH}
                      </TableCell>
                      <TableCell>{p.entity?.name ?? DASH}</TableCell>
                      <TableCell>{p.bank?.name ?? DASH}</TableCell>
                      <TableCell sx={{ maxWidth: 280 }}>
                        {p.narration || DASH}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
