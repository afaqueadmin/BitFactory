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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import { useInvoice, useUpdateInvoice } from "@/lib/hooks/useInvoices";
import {
  LineItemsEditor,
  LineItem,
} from "@/components/accounting/invoices/LineItemsEditor";

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
    billingMonth: 0,
    billingYear: new Date().getFullYear(),
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [hardwareList, setHardwareList] = useState<
    Array<{ id: string; model: string }>
  >([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastDueDateWarningOpen, setPastDueDateWarningOpen] = useState(false);

  // Fetch hardware list on mount (for the "Add Line Item" picker)
  useEffect(() => {
    const fetchHardware = async () => {
      try {
        const response = await fetch("/api/hardware");
        if (response.ok) {
          const data = await response.json();
          setHardwareList(data.hardware || []);
        }
      } catch (err) {
        console.error("Error fetching hardware:", err);
      }
    };

    fetchHardware();
  }, []);

  // Populate form when invoice loads
  useEffect(() => {
    if (invoice) {
      const billingDate = invoice.billingMonth
        ? new Date(invoice.billingMonth)
        : new Date();
      setFormData({
        totalMiners: invoice.totalMiners,
        unitPrice: Number(invoice.unitPrice),
        dueDate: new Date(invoice.dueDate).toISOString().split("T")[0],
        billingMonth: billingDate.getMonth(),
        billingYear: billingDate.getFullYear(),
      });
      setLineItems(
        (invoice.lineItems || []).map(
          (li: {
            hardwareId: string | null;
            model: string;
            quantity: number;
            unitPrice: number | string;
          }) => ({
            hardwareId: li.hardwareId || "",
            model: li.model,
            quantity: li.quantity,
            unitPrice: Number(li.unitPrice),
          }),
        ),
      );
    }
  }, [invoice]);

  const hasLineItems = (invoice?.lineItems?.length ?? 0) > 0;

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

  const handleBillingMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedMonth = Number(e.target.value);
    setFormData((prev) => ({
      ...prev,
      billingMonth: selectedMonth,
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

      // Validate
      if (hasLineItems) {
        if (lineItems.length === 0) {
          throw new Error("Add at least one line item");
        }
        if (
          lineItems.some((item) => item.quantity <= 0 || item.unitPrice <= 0)
        ) {
          throw new Error(
            "Every line item must have a miner count and unit price greater than 0",
          );
        }
      } else if (formData.totalMiners <= 0 || formData.unitPrice <= 0) {
        throw new Error("Miners count and unit price must be greater than 0");
      }

      // Build billingMonth as UTC midnight on the first day of the selected month
      const billingMonthDate = new Date(
        Date.UTC(formData.billingYear, formData.billingMonth, 1),
      );

      // Call API to update invoice
      await updateInvoice(invoiceId, {
        totalMiners: formData.totalMiners,
        unitPrice: formData.unitPrice,
        dueDate: formData.dueDate,
        billingMonth: billingMonthDate.toISOString(),
        lineItems: hasLineItems ? lineItems : undefined,
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
                {hasLineItems ? (
                  <LineItemsEditor
                    lineItems={lineItems}
                    onChange={setLineItems}
                    hardwareList={hardwareList}
                  />
                ) : (
                  <>
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
                  </>
                )}
                <TextField
                  label="Due Date"
                  name="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={handleDueDateChange}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText="When payment is due"
                  required
                />
              </Stack>
            </Box>

            {/* Billing Month */}
            <Box>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                Additional Information
              </h3>
              <Stack spacing={2}>
                <TextField
                  select
                  label="Billing Month"
                  value={formData.billingMonth}
                  onChange={handleBillingMonthChange}
                  fullWidth
                  helperText={`Year: ${formData.billingYear} (auto-calculated)`}
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
