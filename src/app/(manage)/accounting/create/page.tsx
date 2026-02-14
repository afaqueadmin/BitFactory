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
  useCustomerMiners,
  Customer,
} from "@/lib/hooks/useInvoices";

export default function CreateInvoicePage() {
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
    invoiceType: "ELECTRICITY_CHARGES",
    hardwareId: "",
  });

  // Fetch miners only when customerId changes
  const { miners, loading: minersLoading } = useCustomerMiners(
    formData.customerId || undefined,
  );

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
  const [hardwareList, setHardwareList] = useState<
    Array<{ id: string; model: string }>
  >([]);
  const [hardwareLoading, setHardwareLoading] = useState(false);

  // Fetch hardware list on mount
  useEffect(() => {
    const fetchHardware = async () => {
      try {
        setHardwareLoading(true);
        const response = await fetch("/api/hardware");
        if (response.ok) {
          const data = await response.json();
          setHardwareList(data.hardware || []);
        }
      } catch (err) {
        console.error("Error fetching hardware:", err);
      } finally {
        setHardwareLoading(false);
      }
    };

    fetchHardware();
  }, []);

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
        invoiceType: formData.invoiceType,
        hardwareId: formData.hardwareId || undefined,
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
                  label="Hardware Model (for Hardware Purchase invoices)"
                  name="hardwareId"
                  value={formData.hardwareId}
                  onChange={handleInputChange}
                  fullWidth
                  helperText="Select hardware model for Hardware Purchase invoice type"
                  disabled={
                    hardwareLoading ||
                    formData.invoiceType === "ELECTRICITY_CHARGES"
                  }
                >
                  <MenuItem value="">-- No Hardware --</MenuItem>
                  {hardwareList.map((hw) => (
                    <MenuItem key={hw.id} value={hw.id}>
                      {hw.model}
                    </MenuItem>
                  ))}
                </TextField>
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
