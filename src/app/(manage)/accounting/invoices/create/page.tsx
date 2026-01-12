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
  MenuItem,
} from "@mui/material";
import { useState } from "react";
import { useRouter } from "next/navigation";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import { InvoiceStatus } from "@/lib/types/invoice";

export default function CreateInvoicePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    customerId: "",
    customerName: "",
    invoiceNumber: "",
    totalMiners: 1,
    unitPrice: 0,
    totalAmount: 0,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    description: "",
    status: InvoiceStatus.DRAFT,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue =
      name === "totalMiners" || name === "unitPrice"
        ? parseFloat(value) || 0
        : value;

    const newFormData = {
      ...formData,
      [name]: numValue,
    };

    // Calculate total amount
    if (name === "totalMiners" || name === "unitPrice") {
      newFormData.totalAmount =
        (newFormData.totalMiners || 0) * (newFormData.unitPrice || 0);
    }

    setFormData(newFormData);
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);

      // Validate form
      if (!formData.customerId || !formData.customerName) {
        throw new Error("Customer information is required");
      }
      if (formData.totalMiners <= 0 || formData.unitPrice <= 0) {
        throw new Error("Miners count and unit price must be greater than 0");
      }

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // In Phase 4, this would call: POST /api/accounting/invoices
      console.log("Creating invoice:", formData);

      // Redirect to invoices list
      router.push("/accounting/invoices");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Link href="/accounting/invoices">
          <Button startIcon={<ArrowBackIcon />}>Back to Invoices</Button>
        </Link>
        <Box flex={1}>
          <h1 style={{ margin: 0 }}>Create New Invoice</h1>
          <p style={{ margin: "8px 0 0 0", color: "#666" }}>
            Create a new invoice and send it to a customer
          </p>
        </Box>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 4 }}>
        <form onSubmit={handleSubmit}>
          <Stack spacing={3}>
            {/* Customer Information */}
            <Box>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                Customer Information
              </h3>
              <Stack spacing={2}>
                <TextField
                  label="Customer ID"
                  name="customerId"
                  value={formData.customerId}
                  onChange={handleInputChange}
                  fullWidth
                  placeholder="e.g., cust-123"
                  required
                />
                <TextField
                  label="Customer Name"
                  name="customerName"
                  value={formData.customerName}
                  onChange={handleInputChange}
                  fullWidth
                  placeholder="e.g., Acme Corporation"
                  required
                />
              </Stack>
            </Box>

            {/* Invoice Details */}
            <Box>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                Invoice Details
              </h3>
              <Stack spacing={2}>
                <TextField
                  label="Invoice Number"
                  name="invoiceNumber"
                  value={formData.invoiceNumber}
                  onChange={handleInputChange}
                  fullWidth
                  placeholder="Auto-generated: YYYYMMDDSR"
                  disabled
                />
                <TextField
                  label="Number of Miners"
                  name="totalMiners"
                  type="number"
                  value={formData.totalMiners}
                  onChange={handleInputChange}
                  fullWidth
                  inputProps={{ min: 1, step: 1 }}
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
                  required
                />
                <TextField
                  label="Total Amount (USD)"
                  value={formData.totalAmount.toFixed(2)}
                  fullWidth
                  disabled
                  variant="outlined"
                />
              </Stack>
            </Box>

            {/* Additional Information */}
            <Box>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                Additional Information
              </h3>
              <Stack spacing={2}>
                <TextField
                  label="Due Date"
                  name="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={handleInputChange}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  required
                />
                <TextField
                  label="Description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  fullWidth
                  multiline
                  rows={4}
                  placeholder="Invoice description or notes..."
                />
                <TextField
                  select
                  label="Status"
                  name="status"
                  value={formData.status}
                  onChange={handleSelectChange}
                  fullWidth
                >
                  <MenuItem value={InvoiceStatus.DRAFT}>Draft</MenuItem>
                  <MenuItem value={InvoiceStatus.ISSUED}>Issued</MenuItem>
                </TextField>
              </Stack>
            </Box>

            {/* Actions */}
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
                disabled={loading}
              >
                {loading ? "Creating..." : "Create Invoice"}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
