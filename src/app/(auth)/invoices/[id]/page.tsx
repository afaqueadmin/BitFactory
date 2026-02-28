"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
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
} from "@mui/material";
import { useInvoice } from "@/lib/hooks/useInvoices";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";

export default function CustomerInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { invoice, loading, error } = useInvoice(params.id as string);
  const [downloadLoading, setDownloadLoading] = useState(false);

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
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Button
            startIcon={<ArrowBackIcon />}
            variant="text"
            onClick={() => router.push("/invoices")}
          >
            Back to Invoices
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleDownload}
            disabled={downloadLoading}
            sx={{
              bgcolor: "primary.main",
              "&:hover": {
                bgcolor: "primary.dark",
              },
            }}
          >
            {downloadLoading ? "Downloading..." : "Download Invoice"}
          </Button>
        </Box>
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
                  {invoice.totalMiners || 0} units
                </Typography>
              </Box>

              {/* Unit Price */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Unit Price
                </Typography>
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  <CurrencyDisplay value={invoice.unitPrice} />
                </Typography>
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
                    <DateDisplay date={invoice.issuedDate} format="datetime" />
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

              {/* Paid Date */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Paid Date
                </Typography>
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  {invoice.paidDate ? (
                    <DateDisplay date={invoice.paidDate} format="datetime" />
                  ) : (
                    "Not yet paid"
                  )}
                </Typography>
              </Box>
            </Box>
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
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  {invoice.group?.relationshipManager || "Not assigned"}
                </Typography>
              </Box>

              {/* Relationship Manager Email */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  RM Email
                </Typography>
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  {invoice.group?.email || "Not assigned"}
                </Typography>
              </Box>

              {/* Group Name */}
              <Box>
                <Typography color="textSecondary" variant="body2">
                  Group Name
                </Typography>
                <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                  {invoice.group?.name || "No group assigned"}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
