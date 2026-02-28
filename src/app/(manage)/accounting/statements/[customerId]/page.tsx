"use client";

import {
  Box,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Stack,
  Button,
  Card,
  CardContent,
  Typography,
} from "@mui/material";
import { useParams } from "next/navigation";
import { useAccountStatement } from "@/lib/hooks/useStatements";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import DownloadIcon from "@mui/icons-material/Download";
import PrintIcon from "@mui/icons-material/Print";
import Link from "next/link";

export default function CustomerStatementPage() {
  const { customerId } = useParams();
  const { statement, loading, error } = useAccountStatement(
    customerId as string,
  );

  const invoices = statement?.invoices || [];
  const customer = statement?.customer;
  const totals = statement?.stats;

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg">
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!customer) {
    return (
      <Container maxWidth="lg">
        <Alert severity="warning">Customer not found</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 4 }}
      >
        <Box>
          <h1 style={{ margin: 0 }}>{customer.name} - Statement</h1>
          <p style={{ margin: "8px 0 0 0", color: "#666" }}>
            Customer ID: {customer.id}
          </p>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<DownloadIcon />}>
            Download Statement
          </Button>
          <Button variant="outlined" startIcon={<PrintIcon />}>
            Print
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Total Invoices
            </Typography>
            <Typography variant="h5">{invoices.length}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Total Amount
            </Typography>
            <Typography variant="h5">
              <CurrencyDisplay value={totals?.totalAmount || 0} />
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Total Paid
            </Typography>
            <Typography variant="h5">
              <CurrencyDisplay value={totals?.totalPaid || 0} />
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Outstanding
            </Typography>
            <Typography variant="h5" sx={{ color: "#d32f2f" }}>
              <CurrencyDisplay value={totals?.totalPending || 0} />
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      <Box sx={{ mb: 2 }}>
        <h2 style={{ marginTop: 0 }}>Invoice History</h2>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold" }}>Invoice #</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Date</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Due Date</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Type</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Amount</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Paid</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Outstanding</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id} hover>
                <TableCell sx={{ fontWeight: "bold" }}>
                  <Link
                    href={`/accounting/${invoice.id}`}
                    style={{ color: "#1976d2", textDecoration: "none" }}
                  >
                    {invoice.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  <DateDisplay
                    date={invoice.issuedDate || invoice.invoiceGeneratedDate}
                    format="date"
                  />
                </TableCell>
                <TableCell>
                  <DateDisplay date={invoice.dueDate} format="date" />
                </TableCell>
                <TableCell>
                  {invoice.invoiceType === "HARDWARE_PURCHASE"
                    ? "Hardware"
                    : "Hosting & Electricity"}
                </TableCell>
                <TableCell>
                  <CurrencyDisplay value={invoice.totalAmount} />
                </TableCell>
                <TableCell>
                  <CurrencyDisplay
                    value={invoice.status === "PAID" ? invoice.paidAmount : 0}
                  />
                </TableCell>
                <TableCell>
                  <CurrencyDisplay
                    value={
                      invoice.status === "ISSUED" ||
                      invoice.status === "OVERDUE"
                        ? Math.max(0, invoice.totalAmount - invoice.paidAmount)
                        : 0
                    }
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge status={invoice.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {invoices.length === 0 && (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <p style={{ color: "#999" }}>No invoices found for this customer</p>
        </Box>
      )}
    </Container>
  );
}
