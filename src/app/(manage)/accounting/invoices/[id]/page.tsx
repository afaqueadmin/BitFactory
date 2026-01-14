/**
 * Invoice Detail Page
 *
 * Display full invoice details
 */

"use client";

import { useParams } from "next/navigation";
import {
  Container,
  Card,
  CardContent,
  CardHeader,
  Box,
  Button,
  Stack,
  Typography,
  Divider,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useInvoice } from "@/lib/hooks/useInvoices";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import EditIcon from "@mui/icons-material/Edit";
import DownloadIcon from "@mui/icons-material/Download";

export default function InvoiceDetailPage() {
  const params = useParams();
  const { invoice, loading, error } = useInvoice(params.id as string);

  if (loading) {
    return (
      <Container sx={{ py: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!invoice) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="warning">Invoice not found</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {invoice.invoiceNumber}
          </Typography>
          <Typography color="textSecondary">
            Invoice Details & Payment Tracking
          </Typography>
        </Box>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<EditIcon />} variant="outlined">
            Edit
          </Button>
          <Button startIcon={<DownloadIcon />} variant="contained">
            Download
          </Button>
        </Stack>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
          gap: 3,
        }}
      >
        {/* Main Details */}
        <Box>
          <Card>
            <CardHeader title="Invoice Details" />
            <Divider />
            <CardContent>
              <Box
                sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}
              >
                {/* Invoice Number */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Invoice Number
                  </Typography>
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {invoice.invoiceNumber}
                  </Typography>
                </Box>

                {/* Status */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Status
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <StatusBadge status={invoice.status} />
                  </Box>
                </Box>

                {/* Total Miners */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Total Miners
                  </Typography>
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {invoice.totalMiners} units
                  </Typography>
                </Box>

                {/* Unit Price */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Unit Price
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <CurrencyDisplay
                      value={invoice.unitPrice}
                      fontWeight="bold"
                    />
                  </Box>
                </Box>

                {/* Generated Date */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Generated Date
                  </Typography>
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    <DateDisplay
                      date={invoice.invoiceGeneratedDate}
                      format="datetime"
                    />
                  </Typography>
                </Box>

                {/* Issued Date */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Issued Date
                  </Typography>
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {invoice.issuedDate ? (
                      <DateDisplay
                        date={invoice.issuedDate}
                        format="datetime"
                      />
                    ) : (
                      <Typography color="textSecondary">
                        Not yet issued
                      </Typography>
                    )}
                  </Typography>
                </Box>

                {/* Due Date */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Due Date
                  </Typography>
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    <DateDisplay date={invoice.dueDate} />
                  </Typography>
                </Box>

                {/* Paid Date */}
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Paid Date
                  </Typography>
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {invoice.paidDate ? (
                      <DateDisplay date={invoice.paidDate} />
                    ) : (
                      <Typography color="textSecondary">
                        Not yet paid
                      </Typography>
                    )}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Summary Sidebar */}
        <Box>
          <Card>
            <CardHeader title="Summary" />
            <Divider />
            <CardContent>
              <Stack spacing={2}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography color="textSecondary">Subtotal:</Typography>
                  <CurrencyDisplay
                    value={invoice.totalAmount}
                    fontWeight="bold"
                  />
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography color="textSecondary">Tax:</Typography>
                  <Typography sx={{ fontWeight: 600 }}>$0.00</Typography>
                </Box>

                <Divider sx={{ my: 1 }} />

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography sx={{ fontWeight: 600, fontSize: "1.1rem" }}>
                    Total Due:
                  </Typography>
                  <CurrencyDisplay
                    value={invoice.totalAmount}
                    variant="h6"
                    fontWeight="bold"
                  />
                </Box>

                <Divider sx={{ my: 1 }} />

                {invoice.paidDate && (
                  <Alert severity="success" sx={{ my: 1 }}>
                    Invoice has been paid
                  </Alert>
                )}

                {invoice.status === "OVERDUE" && (
                  <Alert severity="error" sx={{ my: 1 }}>
                    Invoice is overdue
                  </Alert>
                )}

                <Button variant="contained" fullWidth size="large">
                  Record Payment
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Container>
  );
}
