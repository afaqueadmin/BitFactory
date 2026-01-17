"use client";

import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  CircularProgress,
  Alert,
} from "@mui/material";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import { useInvoice, useUpdateInvoice } from "@/lib/hooks/useInvoices";

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const { invoice, loading: invoiceLoading } = useInvoice(invoiceId);
  const {
    update: updateInvoice,
    loading: updateLoading,
    error: updateError,
  } = useUpdateInvoice();

  const [formData, setFormData] = useState({
    totalMiners: 0,
    unitPrice: 0,
    dueDate: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate form when invoice loads
  useEffect(() => {
    if (invoice) {
      setFormData({
        totalMiners: invoice.totalMiners,
        unitPrice: Number(invoice.unitPrice),
        dueDate: new Date(invoice.dueDate).toISOString().split("T")[0],
      });
    }
  }, [invoice]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue =
      name === "totalMiners" || name === "unitPrice"
        ? parseFloat(value) || 0
        : value;

    setFormData((prev) => ({
      ...prev,
      [name]: numValue,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);

      // Validate
      if (formData.totalMiners <= 0 || formData.unitPrice <= 0) {
        throw new Error("Miners count and unit price must be greater than 0");
      }

      const selectedDate = new Date(formData.dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        throw new Error("Due date must be in the future");
      }

      // Call API to update invoice
      await updateInvoice(invoiceId, {
        totalMiners: formData.totalMiners,
        unitPrice: formData.unitPrice,
        dueDate: formData.dueDate,
      });

      // Redirect back to invoice detail
      router.push(`/accounting/${invoiceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update invoice");
    } finally {
      setLoading(false);
    }
  };

  if (invoiceLoading) {
    return (
      <Container sx={{ py: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!invoice) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Invoice not found</Alert>
      </Container>
    );
  }

  if (invoice.status !== "DRAFT") {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="warning">Only DRAFT invoices can be edited</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Link href={`/accounting/${invoiceId}`}>
          <Button startIcon={<ArrowBackIcon />}>Back to Invoice</Button>
        </Link>
        <Box flex={1}>
          <h1 style={{ margin: 0 }}>Edit Invoice</h1>
          <p style={{ margin: "8px 0 0 0", color: "#666" }}>
            Invoice: {invoice.invoiceNumber}
          </p>
        </Box>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {updateError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {updateError}
        </Alert>
      )}

      <Paper sx={{ p: 4 }}>
        <form onSubmit={handleSubmit}>
          <Stack spacing={3}>
            <Box>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                Invoice Details
              </h3>
              <Stack spacing={2}>
                <TextField
                  label="Number of Miners"
                  name="totalMiners"
                  type="number"
                  value={formData.totalMiners}
                  onChange={handleInputChange}
                  fullWidth
                  inputProps={{ min: 0, step: 1 }}
                  helperText="Total active mining units allocated to this customer"
                  required
                />
                <TextField
                  label="Unit Price (USD)"
                  name="unitPrice"
                  type="number"
                  value={formData.unitPrice}
                  onChange={handleInputChange}
                  fullWidth
                  inputProps={{ min: 0, step: 0.01 }}
                  helperText="Price per miner unit"
                  required
                />
                <TextField
                  label="Due Date"
                  name="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={handleInputChange}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText="When payment is due"
                  required
                />
              </Stack>
            </Box>

            <Stack direction="row" spacing={2} sx={{ pt: 2 }}>
              <Button variant="outlined" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                startIcon={
                  loading ? <CircularProgress size={20} /> : <SaveIcon />
                }
                disabled={loading || updateLoading}
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
