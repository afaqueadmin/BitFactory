/**
 * Recent Invoices Card
 *
 * Displays recent invoice activity
 */

import {
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { DashboardResponse } from "@/lib/types/invoice";
import { StatusBadge } from "../common/StatusBadge";
import { CurrencyDisplay } from "../common/CurrencyDisplay";
import { DateDisplay } from "../common/DateDisplay";

interface RecentInvoicesProps {
  invoices: DashboardResponse["recentInvoices"];
}

export function RecentInvoices({ invoices }: RecentInvoicesProps) {
  if (invoices.length === 0) {
    return (
      <Card>
        <CardHeader title="Recent Invoices" />
        <CardContent>
          <Typography color="textSecondary">No invoices yet</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Recent Invoices" />
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
              <TableCell>Invoice #</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Issued</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.invoiceId} hover>
                <TableCell sx={{ fontWeight: 600 }}>
                  {invoice.invoiceNumber}
                </TableCell>
                <TableCell>{invoice.customerName}</TableCell>
                <TableCell align="right">
                  <CurrencyDisplay value={invoice.amount} standalone={true} />
                </TableCell>
                <TableCell>
                  <DateDisplay date={invoice.issuedDate} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={invoice.status} size="small" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
