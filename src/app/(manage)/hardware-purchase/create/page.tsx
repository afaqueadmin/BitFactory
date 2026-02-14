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
  Typography,
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
  Customer,
} from "@/lib/hooks/useInvoices";

export default function CreateHardwarePurchaseInvoicePage() {
  const router = useRouter();
  const { create: createInvoice, error: createError } = useCreateInvoice();
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
    invoiceType: "HARDWARE_PURCHASE",
  });

  // Fetch group/RM info when customerId changes
  const [groupInfo, setGroupInfo] = useState<{
    id: string;
    name: string;
    relationshipManager: string;
    email: string;
  } | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch group/RM info when customerId changes
  useEffect(() => {
    if (!formData.customerId) {
      setGroupInfo(null);
      return;
    }

    setGroupLoading(true);
    fetch(`/api/accounting/customer-group?customerId=${formData.customerId}`)
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
  }, [formData.customerId]);

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
        throw new Error("Quantity and unit price must be greater than 0");
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
        invoiceType: formData.invoiceType,
      });

      // Redirect to hardware-purchase dashboard
      router.push("/hardware-purchase");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Link href="/hardware-purchase">
          <Button startIcon={<ArrowBackIcon />}>
            Back to Hardware Purchase Dashboard
          </Button>
        </Link>
        <Box flex={1}>
          <h1 style={{ margin: 0 }}>Create New Hardware Purchase Invoice</h1>
          <p style={{ margin: "8px 0 0 0", color: "#666" }}>
            Create a new hardware purchase invoice and send it to a customer
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
                  {customers.map((customer: Customer) => (
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

                {/* Relationship Manager Info Section */}
                {formData.customerId && (
                  <Box
                    sx={{
                      p: 2,
                      backgroundColor: "#f5f5f5",
                      borderRadius: 1,
                      mt: 2,
                    }}
                  >
                    <Typography sx={{ fontWeight: 600, mb: 1.5 }}>
                      💼 Relationship Manager Information
                    </Typography>
                    <Box sx={{ ml: 1 }}>
                      {groupLoading ? (
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <CircularProgress size={16} />
                          <Typography variant="body2">
                            Loading RM details...
                          </Typography>
                        </Box>
                      ) : groupInfo ? (
                        <Box>
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            <strong>Name:</strong>{" "}
                            {groupInfo.relationshipManager}
                          </Typography>
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            <strong>Email:</strong> {groupInfo.email}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Group:</strong> {groupInfo.name}
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="body2" sx={{ color: "#d32f2f" }}>
                          ⚠️ No RM assigned to this customer&apos;s group
                        </Typography>
                      )}
                    </Box>
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
                  label="Quantity"
                  name="totalMiners"
                  type="number"
                  value={formData.totalMiners}
                  onChange={handleInputChange}
                  fullWidth
                  inputProps={{ min: 0, step: 1 }}
                  helperText="Number of hardware units"
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
                  helperText="Price per hardware unit (total = quantity × unit price)"
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
                {/* Status is automatically set to DRAFT when creating invoices */}
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
