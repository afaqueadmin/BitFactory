"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Container,
  Card,
  CardContent,
  CardHeader,
  Box,
  Button,
  Typography,
  Divider,
  Alert,
  CircularProgress,
  Stack,
} from "@mui/material";
import { useInvoice } from "@/lib/hooks/useInvoices";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

export default function CustomerInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { invoice, loading, error } = useInvoice(params.id as string);

  const [groupInfo, setGroupInfo] = useState<{
    id: string;
    name: string;
    relationshipManager: string;
    email: string;
  } | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);

  // Fetch group info when invoice loads
  useEffect(() => {
    if (!invoice?.user?.id) return;

    setGroupLoading(true);
    fetch(`/api/accounting/customer-group?customerId=${invoice.user.id}`)
      .then((res) => res.json())
      .then((data) => {
        setGroupInfo(data.group || null);
      })
      .catch(() => {
        setGroupInfo(null);
      })
      .finally(() => {
        setGroupLoading(false);
      });
  }, [invoice?.user?.id]);

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
          mb: 3,
        }}
      >
        <Button
          startIcon={<ArrowBackIcon />}
          variant="text"
          onClick={() => router.push("/invoices")}
          sx={{ mb: 2 }}
        >
          Back to Invoices
        </Button>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {invoice.invoiceNumber}
        </Typography>
        <Typography color="textSecondary">Invoice Details</Typography>
      </Box>

      {/* Invoice Details Section */}
      <Box sx={{ mb: 3 }}>
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
                  {invoice.totalMiners || 0}
                </Typography>
              </Box>

              {/* Total Amount */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Total Amount
                </Typography>
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  <CurrencyDisplay value={invoice.totalAmount} />
                </Typography>
              </Box>

              {/* Issued Date */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Issued Date
                </Typography>
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  {invoice.issuedDate ? (
                    <DateDisplay date={invoice.issuedDate} />
                  ) : (
                    "Not issued yet"
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

              {/* Start Date */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Period Start
                </Typography>
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  <DateDisplay date={invoice.periodStart} />
                </Typography>
              </Box>

              {/* End Date */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Period End
                </Typography>
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  <DateDisplay date={invoice.periodEnd} />
                </Typography>
              </Box>

              {/* Paid Date (if paid) */}
              {invoice.paidDate && (
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Paid Date
                  </Typography>
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    <DateDisplay date={invoice.paidDate} />
                  </Typography>
                </Box>
              )}

              {/* Payment Method (if paid) */}
              {invoice.paymentMethod && (
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Payment Method
                  </Typography>
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {invoice.paymentMethod}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Summary Section */}
            <Divider sx={{ my: 3 }} />
            <Stack spacing={1.5}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Typography color="textSecondary">Subtotal:</Typography>
                <CurrencyDisplay value={invoice.subtotal} />
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
            </Stack>
          </CardContent>
        </Card>
      </Box>

      {/* Customer & Relationship Manager Information Section */}
      <Box>
        <Card>
          <CardHeader title="Customer & Relationship Manager Information" />
          <Divider />
          <CardContent>
            <Box
              sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}
            >
              {/* Customer Name */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Customer Name
                </Typography>
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  {invoice.user?.name || "N/A"}
                </Typography>
              </Box>

              {/* Customer Email */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Customer Email
                </Typography>
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  {invoice.user?.email || "N/A"}
                </Typography>
              </Box>

              {/* Relationship Manager Name */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Relationship Manager
                </Typography>
                {groupLoading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mt: 0.5,
                    }}
                  >
                    <CircularProgress size={16} />
                    <Typography variant="body2">Loading...</Typography>
                  </Box>
                ) : (
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {groupInfo?.relationshipManager || "Not assigned"}
                  </Typography>
                )}
              </Box>

              {/* Relationship Manager Email */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  RM Email
                </Typography>
                {groupLoading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mt: 0.5,
                    }}
                  >
                    <CircularProgress size={16} />
                    <Typography variant="body2">Loading...</Typography>
                  </Box>
                ) : (
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {groupInfo?.email || "Not assigned"}
                  </Typography>
                )}
              </Box>

              {/* Group Name */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Group Name
                </Typography>
                {groupLoading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mt: 0.5,
                    }}
                  >
                    <CircularProgress size={16} />
                    <Typography variant="body2">Loading...</Typography>
                  </Box>
                ) : (
                  <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                    {groupInfo?.name || "No group assigned"}
                  </Typography>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
