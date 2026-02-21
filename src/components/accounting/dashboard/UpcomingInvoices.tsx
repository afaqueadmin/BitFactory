/**
 * Upcoming Invoices Card
 *
 * Displays list of upcoming invoices due soon
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
  Chip,
} from "@mui/material";
import { DashboardResponse } from "@/lib/types/invoice";
import { CurrencyDisplay } from "../common/CurrencyDisplay";
import { DateDisplay } from "../common/DateDisplay";

interface UpcomingInvoicesProps {
  invoices: DashboardResponse["upcomingInvoices"];
}

export function UpcomingInvoices({ invoices }: UpcomingInvoicesProps) {
  if (invoices.length === 0) {
    return (
      <Card>
        <CardHeader title="Upcoming Invoices" />
        <CardContent>
          <Typography color="textSecondary">No upcoming invoices</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Upcoming Invoices" />
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
              <TableCell>Invoice #</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Due Date</TableCell>
              <TableCell align="center">Days Until Due</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow
                key={invoice.invoiceId}
                hover
                sx={{
                  backgroundColor:
                    invoice.daysUntilDue < 7
                      ? "#FEF3C7"
                      : invoice.daysUntilDue < 14
                        ? "#F0FDFB"
                        : "transparent",
                }}
              >
                <TableCell sx={{ fontWeight: 600 }}>
                  {invoice.invoiceNumber}
                </TableCell>
                <TableCell>{invoice.customerName}</TableCell>
                <TableCell align="right">
                  <CurrencyDisplay value={invoice.amount} standalone={true} />
                </TableCell>
                <TableCell>
                  <DateDisplay date={invoice.dueDate} />
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={`${invoice.daysUntilDue} days`}
                    color={invoice.daysUntilDue < 7 ? "warning" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
