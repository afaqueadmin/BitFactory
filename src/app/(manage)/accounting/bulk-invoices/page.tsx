"use client";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import {
  Customer,
  useCreateInvoice,
  useCustomers,
} from "@/lib/hooks/useInvoices";

interface CustomerMinersState {
  count: number;
  loading: boolean;
  error?: string | null;
}

export default function BulkInvoicesPage() {
  const router = useRouter();
  const { customers, loading: customersLoading } = useCustomers();
  const {
    create: createInvoice,
    loading: creating,
    error: createError,
  } = useCreateInvoice();

  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [customerMiners, setCustomerMiners] = useState<
    Record<string, CustomerMinersState>
  >({});
  const [confirmZeroMinersOpen, setConfirmZeroMinersOpen] = useState(false);
  const [customersWithNoMinersNames, setCustomersWithNoMinersNames] = useState<
    string[]
  >([]);

  const allCustomerIds = useMemo(
    () => customers.map((c: Customer) => c.id),
    [customers],
  );

  const allSelected =
    allCustomerIds.length > 0 &&
    selectedCustomerIds.length === allCustomerIds.length;

  // Fetch miners (status=AUTO) for each selected customer, once
  useEffect(() => {
    const fetchMinersForCustomer = async (customerId: string) => {
      try {
        setCustomerMiners((prev) => ({
          ...prev,
          [customerId]: {
            count: prev[customerId]?.count ?? 0,
            loading: true,
            error: null,
          },
        }));

        const res = await fetch(
          `/api/accounting/miners?customerId=${customerId}&status=Auto`,
          {
            method: "GET",
            credentials: "include",
          },
        );

        if (!res.ok) {
          throw new Error("Failed to fetch miners");
        }

        const data = await res.json();
        const count = data?.totalActiveMiners ?? 0;

        setCustomerMiners((prev) => ({
          ...prev,
          [customerId]: {
            count,
            loading: false,
            error: null,
          },
        }));
      } catch (error) {
        setCustomerMiners((prev) => ({
          ...prev,
          [customerId]: {
            count: prev[customerId]?.count ?? 0,
            loading: false,
            error:
              error instanceof Error ? error.message : "Failed to fetch miners",
          },
        }));
      }
    };

    selectedCustomerIds.forEach((customerId) => {
      const state = customerMiners[customerId];
      if (!state || (!state.loading && state.count === 0 && !state.error)) {
        // No data yet for this customer; fetch miners
        void fetchMinersForCustomer(customerId);
      }
    });
  }, [selectedCustomerIds, customerMiners]);

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedCustomerIds([]);
    } else {
      setSelectedCustomerIds(allCustomerIds);
    }
  };

  const handleToggleCustomer = (customerId: string) => {
    setSelectedCustomerIds((prev) => {
      if (prev.includes(customerId)) {
        return prev.filter((id) => id !== customerId);
      }
      return [...prev, customerId];
    });
  };

  const totalInvoices = selectedCustomerIds.length;

  const totalMinersAllSelected = selectedCustomerIds.reduce((sum, id) => {
    const count = customerMiners[id]?.count ?? 0;
    return sum + count;
  }, 0);

  const estimatedTotalAmount = totalMinersAllSelected * (unitPrice || 0);

  const submitBulkInvoices = async (allowZeroMiners: boolean) => {
    setSubmitError(null);
    setSubmitSuccess(null);

    if (selectedCustomerIds.length === 0) {
      setSubmitError("Select at least one customer to create invoices.");
      return;
    }

    if (!unitPrice || unitPrice <= 0) {
      setSubmitError("Unit price must be greater than 0.");
      return;
    }

    const selectedDate = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      setSubmitError("Due date must be in the future (not a past date).");
      return;
    }

    // Check for customers with zero miners
    const customersWithNoMiners: string[] = [];
    selectedCustomerIds.forEach((id) => {
      const minersCount = customerMiners[id]?.count ?? 0;
      if (minersCount <= 0) {
        const customer = customers.find((c: Customer) => c.id === id);
        customersWithNoMiners.push(customer?.displayName || id);
      }
    });

    if (customersWithNoMiners.length > 0 && !allowZeroMiners) {
      setCustomersWithNoMinersNames(customersWithNoMiners);
      setConfirmZeroMinersOpen(true);
      return;
    }

    try {
      for (const customerId of selectedCustomerIds) {
        const minersCount = customerMiners[customerId]?.count ?? 0;

        await createInvoice({
          customerId,
          totalMiners: minersCount,
          unitPrice,
          dueDate,
          invoiceType: "ELECTRICITY_CHARGES",
        });
      }

      setSubmitSuccess(
        `Successfully created ${totalInvoices} draft invoice(s) for selected customers.`,
      );
      setConfirmZeroMinersOpen(false);
      setCustomersWithNoMinersNames([]);
      // After success, navigate back to accounting dashboard
      router.push("/accounting");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to create invoices.",
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitBulkInvoices(false);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Link href="/accounting">
          <Button startIcon={<ArrowBackIcon />}>
            Back to Accounting Dashboard
          </Button>
        </Link>
        <Box flex={1}>
          <Typography variant="h4" sx={{ fontWeight: "bold" }}>
            Bulk Create Invoices
          </Typography>
          <Typography color="textSecondary" sx={{ mt: 0.5 }}>
            Create draft electricity invoices for multiple customers at once.
          </Typography>
        </Box>
      </Stack>

      {submitError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {submitError}
        </Alert>
      )}
      {createError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {createError}
        </Alert>
      )}
      {submitSuccess && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {submitSuccess}
        </Alert>
      )}

      <Paper sx={{ p: 4 }}>
        <form onSubmit={handleSubmit}>
          <Stack spacing={4}>
            {/* Customer selection */}
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Select Customers
              </Typography>
              {customersLoading ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2">Loading customers...</Typography>
                </Box>
              ) : (
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={allSelected}
                        indeterminate={
                          selectedCustomerIds.length > 0 && !allSelected
                        }
                        onChange={handleToggleAll}
                      />
                    }
                    label="Select all customers"
                  />
                  {customers.map((customer: Customer) => {
                    const minersState = customerMiners[customer.id];
                    const isSelected = selectedCustomerIds.includes(
                      customer.id,
                    );

                    return (
                      <FormControlLabel
                        key={customer.id}
                        control={
                          <Checkbox
                            checked={isSelected}
                            onChange={() => handleToggleCustomer(customer.id)}
                          />
                        }
                        label={
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                            }}
                          >
                            <Typography variant="body2">
                              {customer.displayName}
                            </Typography>
                            {isSelected && (
                              <Typography
                                variant="caption"
                                color="textSecondary"
                              >
                                {minersState?.loading
                                  ? "Loading miners (status=AUTO)..."
                                  : minersState?.error
                                    ? `Error: ${minersState.error}`
                                    : `AUTO miners: ${minersState?.count ?? 0}`}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    );
                  })}
                </FormGroup>
              )}
            </Box>

            {/* Invoice configuration */}
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Invoice Configuration
              </Typography>
              <Stack spacing={2}>
                <TextField
                  label="Unit Price (USD)"
                  type="number"
                  value={unitPrice}
                  onChange={(e) =>
                    setUnitPrice(parseFloat(e.target.value) || 0)
                  }
                  fullWidth
                  inputProps={{ min: 0, step: 0.01 }}
                  helperText="Price per miner unit (applied to all selected customers)"
                  required
                />
                <TextField
                  label="Due Date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText="When payment is due (defaults to 30 days from today)"
                  required
                />
              </Stack>
            </Box>

            {/* Summary */}
            <Box
              sx={{
                p: 2,
                backgroundColor: "#f5f5f5",
                borderRadius: 1,
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Summary
              </Typography>
              <Typography variant="body2">
                Selected customers: {totalInvoices}
              </Typography>
              <Typography variant="body2">
                Total AUTO miners across selected customers:{" "}
                {totalMinersAllSelected}
              </Typography>
              <Typography variant="body2">
                Estimated total invoice amount (all customers): $
                {estimatedTotalAmount.toFixed(2)}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Invoices are created with status DRAFT. You can review and issue
                them individually from the Accounting Dashboard.
              </Typography>
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
                  creating ? <CircularProgress size={20} /> : <SaveIcon />
                }
                disabled={
                  creating ||
                  customersLoading ||
                  selectedCustomerIds.length === 0 ||
                  !unitPrice
                }
              >
                {creating ? "Creating Invoices..." : "Create Draft Invoices"}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Paper>

      <Dialog
        open={confirmZeroMinersOpen}
        onClose={() => setConfirmZeroMinersOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Some customers have no AUTO miners</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            The following customers currently have no miners with status=
            <strong>AUTO</strong>:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            {customersWithNoMinersNames.map((name) => (
              <li key={name}>
                <Typography variant="body2">{name}</Typography>
              </li>
            ))}
          </Box>
          <Typography variant="body2">
            If you continue, invoices will still be created for these customers
            with a default miner count of <strong>0</strong>.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Do you want to proceed?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmZeroMinersOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void submitBulkInvoices(true)}
            disabled={creating}
          >
            {creating ? "Creating Invoices..." : "Proceed"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
