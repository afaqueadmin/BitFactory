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
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import { InvoiceStatus } from "@prisma/client";
import {
  useCreateInvoice,
  useCustomers,
  useCustomerMiners,
  Customer,
} from "@/lib/hooks/useInvoices";
import {
  LineItemsEditor,
  LineItem,
} from "@/components/accounting/invoices/LineItemsEditor";

export default function CreateInvoicePage() {
  const router = useRouter();
  const { create: createInvoice, error: createError } = useCreateInvoice();
  const { customers, loading: customersLoading } = useCustomers();

  const now = new Date();

  const [formData, setFormData] = useState({
    customerId: "",
    dueDate: "",
    status: InvoiceStatus.DRAFT,
    invoiceType: "ELECTRICITY_CHARGES",
    hardwareId: "",
    billingMonth: now.getMonth(),
    billingYear: now.getFullYear(),
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [pastDueDateWarningOpen, setPastDueDateWarningOpen] = useState(false);

  // Fetch miners (grouped into suggested line items) only when customerId changes
  const { lineItems: suggestedLineItems, loading: minersLoading } =
    useCustomerMiners(formData.customerId || undefined);

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
  // Confirmo payment toggle (global setting)
  const [confirmoEnabled, setConfirmoEnabled] = useState<boolean>(false);
  const [confirmoLoading, setConfirmoLoading] = useState<boolean>(false);
  const [confirmoError, setConfirmoError] = useState<string | null>(null);

  // Fetch hardware list on mount
  useEffect(() => {
    const fetchHardware = async () => {
      try {
        setHardwareLoading(true);
        const response = await fetch("/api/hardware");
        if (response.ok) {
          const data = await response.json();
          setHardwareList(data.data || []);
        }
      } catch (err) {
        console.error("Error fetching hardware:", err);
      } finally {
        setHardwareLoading(false);
      }
    };

    fetchHardware();
  }, []);

  // Fetch payment settings (confirmoEnabled)
  useEffect(() => {
    let mounted = true;
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings/payment", {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data?.data) {
          setConfirmoEnabled(!!data.data.confirmoEnabled);
        }
      } catch (err) {
        console.error("Failed to fetch payment settings", err);
      }
    };

    fetchSettings();
    return () => {
      mounted = false;
    };
  }, []);

  // When customer changes, auto-populate line items from their AUTO miners,
  // grouped by model + rate, priced via the hosting-formula
  useEffect(() => {
    if (!formData.customerId) {
      setLineItems([]);
      return;
    }
    if (!minersLoading) {
      setLineItems(
        suggestedLineItems.map((li) => ({
          hardwareId: li.hardwareId,
          model: li.model,
          quantity: li.quantity,
          unitPrice: li.suggestedUnitPrice,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.customerId, minersLoading]);

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
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const isPastDate = (dateStr: string) => {
    if (!dateStr) return false;
    const selectedDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selectedDate < today;
  };

  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setFormData((prev) => ({ ...prev, dueDate: value }));
    if (isPastDate(value)) {
      setPastDueDateWarningOpen(true);
    }
  };

  const handleReselectDueDate = () => {
    setFormData((prev) => ({ ...prev, dueDate: "" }));
    setPastDueDateWarningOpen(false);
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
      if (lineItems.length === 0) {
        throw new Error(
          "Add at least one line item (auto-loaded from the customer's miners, or added manually)",
        );
      }
      if (lineItems.some((item) => item.quantity <= 0 || item.unitPrice <= 0)) {
        throw new Error(
          "Every line item must have a miner count and unit price greater than 0",
        );
      }
      if (!formData.dueDate) {
        throw new Error("Due date is required");
      }

      // Build billingMonth as UTC midnight on the first day of the selected month
      const billingMonthDate = new Date(
        Date.UTC(formData.billingYear, formData.billingMonth, 1),
      );

      const totalMiners = lineItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const totalAmount = lineItems.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );

      // Call API to create invoice
      await createInvoice({
        customerId: formData.customerId,
        totalMiners,
        unitPrice: totalMiners > 0 ? totalAmount / totalMiners : 0,
        dueDate: formData.dueDate,
        status: formData.status,
        invoiceType: formData.invoiceType,
        hardwareId: formData.hardwareId || undefined,
        billingMonth: billingMonthDate.toISOString(),
        lineItems,
      });

      // Redirect to accounting dashboard
      router.push("/accounting/Hosting-and-Colocation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Link href="/accounting/Hosting-and-Colocation">
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
                <Typography variant="body2" color="textSecondary">
                  {!formData.customerId
                    ? "Select a customer first to auto-load their miners, grouped by model and priced from the hosting rate formula."
                    : minersLoading
                      ? "Loading miners (status=AUTO) for selected customer..."
                      : "Auto-loaded from this customer's AUTO miners. Adjust quantities/prices or add/remove lines as needed."}
                </Typography>
                <LineItemsEditor
                  lineItems={lineItems}
                  onChange={setLineItems}
                  hardwareList={hardwareList}
                  disabled={minersLoading}
                />

                <Box
                  sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1 }}
                >
                  <Switch
                    checked={confirmoEnabled}
                    onChange={async (_e, checked) => {
                      setConfirmoError(null);
                      setConfirmoLoading(true);
                      try {
                        const res = await fetch("/api/settings/payment", {
                          method: "PUT",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ confirmoEnabled: checked }),
                        });
                        if (!res.ok) {
                          const err = await res.json();
                          const msg =
                            err?.error ||
                            err?.message ||
                            "Failed to update setting";
                          setConfirmoError(msg);
                          throw new Error(msg);
                        }
                        const data = await res.json();
                        setConfirmoEnabled(!!data?.data?.confirmoEnabled);
                      } catch (err) {
                        console.error("Failed to update confirmo setting", err);
                      } finally {
                        setConfirmoLoading(false);
                      }
                    }}
                    disabled={confirmoLoading}
                  />
                  <Typography variant="body2" sx={{ color: "#666" }}>
                    Enable payment via crypto (Confirmo)
                  </Typography>
                </Box>
                {confirmoError && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {confirmoError}
                  </Alert>
                )}
              </Stack>
            </Box>

            {/* Due Date */}
            <Box>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                Additional Information
              </h3>
              <Stack spacing={2}>
                <Stack direction="row" spacing={2}>
                  <TextField
                    select
                    label="Billing Month"
                    value={formData.billingMonth}
                    onChange={(e) => {
                      const selectedMonth = Number(e.target.value);
                      setFormData((prev) => ({
                        ...prev,
                        billingMonth: selectedMonth,
                      }));
                    }}
                    fullWidth
                    helperText={`Year: ${formData.billingYear}`}
                    required
                  >
                    <MenuItem value={0}>January</MenuItem>
                    <MenuItem value={1}>February</MenuItem>
                    <MenuItem value={2}>March</MenuItem>
                    <MenuItem value={3}>April</MenuItem>
                    <MenuItem value={4}>May</MenuItem>
                    <MenuItem value={5}>June</MenuItem>
                    <MenuItem value={6}>July</MenuItem>
                    <MenuItem value={7}>August</MenuItem>
                    <MenuItem value={8}>September</MenuItem>
                    <MenuItem value={9}>October</MenuItem>
                    <MenuItem value={10}>November</MenuItem>
                    <MenuItem value={11}>December</MenuItem>
                  </TextField>
                </Stack>
                <TextField
                  label="Due Date"
                  name="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={handleDueDateChange}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText="Select the due date for this invoice"
                  required
                />
                <TextField
                  select
                  label="Hardware Model (for Hardware Sales invoices)"
                  name="hardwareId"
                  value={formData.hardwareId}
                  onChange={handleInputChange}
                  fullWidth
                  helperText="Select hardware model for Hardware Sales invoice type"
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
                  lineItems.length === 0 ||
                  !formData.dueDate
                }
              >
                {loading ? "Creating..." : "Create Invoice"}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Paper>

      <Dialog
        open={pastDueDateWarningOpen}
        onClose={() => setPastDueDateWarningOpen(false)}
      >
        <DialogTitle>Due Date is in the Past</DialogTitle>
        <DialogContent>
          <Typography>
            The due date you selected is in the past. Do you want to reselect a
            due date, or continue anyway?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleReselectDueDate}>Reselect Due Date</Button>
          <Button
            variant="contained"
            onClick={() => setPastDueDateWarningOpen(false)}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
