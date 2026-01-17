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
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import { InvoiceStatus } from "@/generated/prisma";
import {
  useCreateInvoice,
  useCustomers,
  useCustomerMiners,
} from "@/lib/hooks/useInvoices";

export default function CreateInvoicePage() {
  const router = useRouter();
  const {
    create: createInvoice,
    loading: createLoading,
    error: createError,
  } = useCreateInvoice();
  const { customers, loading: customersLoading } = useCustomers();

  const [formData, setFormData] = useState({
    customerId: "",
    totalMiners: 0,
    unitPrice: 0,
    totalAmount: 0,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    status: InvoiceStatus.DRAFT,
  });

  // Fetch miners only when customerId changes
  const { miners, loading: minersLoading } = useCustomerMiners(
    formData.customerId || undefined,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When customer changes, auto-populate total miners from all their active miners
  useEffect(() => {
    if (formData.customerId && miners.length > 0) {
      // Each miner counts as 1, so totalMiners = number of miners
      setFormData((prev) => ({
        ...prev,
        totalMiners: miners.length,
      }));
    } else if (!formData.customerId) {
      setFormData((prev) => ({
        ...prev,
        totalMiners: 0,
      }));
    }
  }, [formData.customerId, miners]);

  const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setFormData((prev) => ({
      ...prev,
      customerId: value,
      totalMiners: 0,
    }));
  };

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
      if (!formData.customerId) {
        throw new Error("Customer is required");
      }
      if (formData.totalMiners <= 0 || formData.unitPrice <= 0) {
        throw new Error("Miners count and unit price must be greater than 0");
      }

      // Validate due date is not in the past
      const selectedDate = new Date(formData.dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day for fair comparison
      if (selectedDate < today) {
        throw new Error("Due date must be in the future (not a past date)");
      }

      // Call API to create invoice
      await createInvoice({
        customerId: formData.customerId,
        totalMiners: formData.totalMiners,
        unitPrice: formData.unitPrice,
        dueDate: formData.dueDate,
        status: formData.status,
      });

      // Redirect to accounting dashboard
      router.push("/accounting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Link href="/accounting">
          <Button startIcon={<ArrowBackIcon />}>
            Back to Accounting Dashboard
          </Button>
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
      {createError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {createError}
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
                  select
                  label="Select Customer"
                  name="customerId"
                  value={formData.customerId}
                  onChange={handleCustomerChange}
                  fullWidth
                  helperText="Select a customer with their subaccount (shown as: Name (Subaccount))"
                  disabled={customersLoading}
                  required
                >
                  <MenuItem value="">-- Select a Customer --</MenuItem>
                  {customers.map((customer) => (
                    <MenuItem key={customer.id} value={customer.id}>
                      {customer.displayName}
                    </MenuItem>
                  ))}
                </TextField>
                {customersLoading && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CircularProgress size={20} />
                    <span>Loading customers...</span>
                  </Box>
                )}
              </Stack>
            </Box>

            {/* Invoice Details */}
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
                  helperText={
                    !formData.customerId
                      ? "Select a customer first to auto-load their miners"
                      : minersLoading
                        ? "Loading miners (status=AUTO) for selected customer..."
                        : miners.length > 0
                          ? `Auto-loaded: ${miners.length} miner(s) with status=AUTO`
                          : "No miners with status=AUTO found for this customer"
                  }
                  disabled={minersLoading || !formData.customerId}
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
                  helperText="Price per miner unit (total = miners × unit price)"
                  required
                />
                <Box sx={{ p: 2, backgroundColor: "#f5f5f5", borderRadius: 1 }}>
                  <strong>
                    Total Amount: ${(formData.totalAmount || 0).toFixed(2)}
                  </strong>
                </Box>
              </Stack>
            </Box>

            {/* Due Date */}
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
                  helperText="When payment is due (defaults to 30 days from today)"
                  required
                />
                <TextField
                  select
                  label="Status"
                  name="status"
                  value={formData.status}
                  onChange={handleSelectChange}
                  fullWidth
                  helperText="Draft: Not sent yet | Issued: Sent to customer"
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
                disabled={
                  loading ||
                  !formData.customerId ||
                  !formData.totalMiners ||
                  !formData.unitPrice
                }
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
