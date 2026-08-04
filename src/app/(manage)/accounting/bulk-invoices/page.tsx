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
  MenuItem,
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
  useCheckAlreadyPaidCustomers,
  useCreateInvoice,
  useCustomerBalances,
  useCustomerMonthlyBills,
  useCustomers,
} from "@/lib/hooks/useInvoices";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import {
  LineItemsEditor,
  LineItem,
} from "@/components/accounting/invoices/LineItemsEditor";
import { getMostCommonMinerLocation } from "@/lib/utils/minerLocation";

interface CustomerLineItemsState {
  lineItems: LineItem[];
  loading: boolean;
  error?: string | null;
  machineHostingLocation?: string | null;
}

// Default to current month/year — user must select billing month from dropdown
const now = new Date();

function getBalanceColor(
  balance: number,
  monthlyBill: number,
): "error" | "warning" | "success" {
  if (balance < 0) return "error";
  if (balance < monthlyBill) return "warning";
  return "success";
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function BulkInvoicesPage() {
  const router = useRouter();
  const { customers, loading: customersLoading } = useCustomers();
  const { balances } = useCustomerBalances();
  const { monthlyBills } = useCustomerMonthlyBills();
  const {
    create: createInvoice,
    loading: creating,
    error: createError,
  } = useCreateInvoice();
  const { checkAlreadyPaid } = useCheckAlreadyPaidCustomers();

  const defaultBilling = { month: now.getMonth(), year: now.getFullYear() };

  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [billingMonth, setBillingMonth] = useState<number>(
    defaultBilling.month,
  );
  const [billingYear, setBillingYear] = useState<number>(defaultBilling.year);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [customerLineItems, setCustomerLineItems] = useState<
    Record<string, CustomerLineItemsState>
  >({});
  const [hardwareList, setHardwareList] = useState<
    Array<{ id: string; model: string }>
  >([]);
  const [confirmZeroMinersOpen, setConfirmZeroMinersOpen] = useState(false);
  const [customersWithNoMinersNames, setCustomersWithNoMinersNames] = useState<
    string[]
  >([]);
  const [confirmAlreadyPaidOpen, setConfirmAlreadyPaidOpen] = useState(false);
  const [alreadyPaidCustomers, setAlreadyPaidCustomers] = useState<
    { id: string; name: string }[]
  >([]);
  const [excludedCustomerIds, setExcludedCustomerIds] = useState<string[]>([]);
  const [pastDueDateWarningOpen, setPastDueDateWarningOpen] = useState(false);

  const allCustomerIds = useMemo(
    () => customers.map((c: Customer) => c.id),
    [customers],
  );

  const allSelected =
    allCustomerIds.length > 0 &&
    selectedCustomerIds.length === allCustomerIds.length;

  // Fetch hardware list once (for the "Add Line Item" picker on each customer)
  useEffect(() => {
    const fetchHardware = async () => {
      try {
        const response = await fetch("/api/hardware");
        if (response.ok) {
          const data = await response.json();
          setHardwareList(data.data || []);
        }
      } catch (err) {
        console.error("Error fetching hardware:", err);
      }
    };

    fetchHardware();
  }, []);

  // Fetch suggested line items (miners grouped by model + rate, status=AUTO)
  // for each selected customer, once
  useEffect(() => {
    const fetchLineItemsForCustomer = async (customerId: string) => {
      try {
        setCustomerLineItems((prev) => ({
          ...prev,
          [customerId]: {
            lineItems: prev[customerId]?.lineItems ?? [],
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
        const lineItems: LineItem[] = (data?.lineItems || []).map(
          (li: {
            hardwareId: string;
            model: string;
            quantity: number;
            suggestedUnitPrice: number;
          }) => ({
            hardwareId: li.hardwareId,
            model: li.model,
            quantity: li.quantity,
            unitPrice: li.suggestedUnitPrice,
            lineItemType: "HARDWARE" as const,
          }),
        );

        // Auto-calculate the machine hosting location from the majority of
        // this customer's miners' locations, same as the single-invoice form
        const machineHostingLocation = getMostCommonMinerLocation(
          data?.miners || [],
        );

        setCustomerLineItems((prev) => ({
          ...prev,
          [customerId]: {
            lineItems,
            loading: false,
            error: null,
            machineHostingLocation,
          },
        }));
      } catch (error) {
        setCustomerLineItems((prev) => ({
          ...prev,
          [customerId]: {
            lineItems: prev[customerId]?.lineItems ?? [],
            loading: false,
            error:
              error instanceof Error ? error.message : "Failed to fetch miners",
          },
        }));
      }
    };

    selectedCustomerIds.forEach((customerId) => {
      const state = customerLineItems[customerId];
      if (
        !state ||
        (!state.loading && state.lineItems.length === 0 && !state.error)
      ) {
        // No data yet for this customer; fetch miners
        void fetchLineItemsForCustomer(customerId);
      }
    });
  }, [selectedCustomerIds, customerLineItems]);

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

  const isPastDate = (dateStr: string) => {
    if (!dateStr) return false;
    const selectedDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selectedDate < today;
  };

  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setDueDate(value);
    if (isPastDate(value)) {
      setPastDueDateWarningOpen(true);
    }
  };

  const handleReselectDueDate = () => {
    setDueDate("");
    setPastDueDateWarningOpen(false);
  };

  const totalInvoices = selectedCustomerIds.length;

  const totalMinersAllSelected = selectedCustomerIds.reduce((sum, id) => {
    const items = customerLineItems[id]?.lineItems ?? [];
    return sum + items.reduce((s, item) => s + (item.quantity || 0), 0);
  }, 0);

  const estimatedTotalAmount = selectedCustomerIds.reduce((sum, id) => {
    const items = customerLineItems[id]?.lineItems ?? [];
    return (
      sum +
      items.reduce(
        (s, item) => s + (item.quantity || 0) * (item.unitPrice || 0),
        0,
      )
    );
  }, 0);

  const submitBulkInvoices = async (
    options: {
      allowZeroMiners?: boolean;
      bypassPaidCheck?: boolean;
      excludeCustomerIds?: string[];
    } = {},
  ) => {
    const {
      allowZeroMiners = false,
      bypassPaidCheck = false,
      excludeCustomerIds = excludedCustomerIds,
    } = options;

    setSubmitError(null);
    setSubmitSuccess(null);

    if (selectedCustomerIds.length === 0) {
      setSubmitError("Select at least one customer to create invoices.");
      return;
    }

    if (!dueDate) {
      setSubmitError("Due date is required.");
      return;
    }

    const targetCustomerIds = selectedCustomerIds.filter(
      (id) => !excludeCustomerIds.includes(id),
    );

    if (targetCustomerIds.length === 0) {
      setConfirmAlreadyPaidOpen(false);
      setConfirmZeroMinersOpen(false);
      setAlreadyPaidCustomers([]);
      setCustomersWithNoMinersNames([]);
      setExcludedCustomerIds([]);
      setSubmitError(
        "No customers left to invoice after removing already-paid customers.",
      );
      return;
    }

    const billingMonthDate = new Date(Date.UTC(billingYear, billingMonth, 1));

    // Check for customers who already paid in advance for this billing month
    if (!bypassPaidCheck) {
      try {
        const alreadyPaid = await checkAlreadyPaid(
          targetCustomerIds.map((id) => ({
            customerId: id,
            billingMonth: billingMonthDate.toISOString(),
          })),
        );

        if (alreadyPaid.length > 0) {
          setAlreadyPaidCustomers(
            alreadyPaid.map(({ customerId }) => ({
              id: customerId,
              name:
                customers.find((c: Customer) => c.id === customerId)
                  ?.displayName || customerId,
            })),
          );
          setConfirmAlreadyPaidOpen(true);
          return;
        }
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Failed to check paid status.",
        );
        return;
      }
    }

    // Check for customers with zero line items
    const customersWithNoMiners: string[] = [];
    targetCustomerIds.forEach((id) => {
      const lineItemsCount = customerLineItems[id]?.lineItems.length ?? 0;
      if (lineItemsCount <= 0) {
        const customer = customers.find((c: Customer) => c.id === id);
        customersWithNoMiners.push(customer?.displayName || id);
      }
    });

    if (customersWithNoMiners.length > 0 && !allowZeroMiners) {
      setCustomersWithNoMinersNames(customersWithNoMiners);
      setConfirmZeroMinersOpen(true);
      return;
    }

    const invalidLineItemCustomer = targetCustomerIds.find((id) =>
      (customerLineItems[id]?.lineItems ?? []).some(
        (item) => item.quantity <= 0 || item.unitPrice <= 0,
      ),
    );
    if (invalidLineItemCustomer) {
      const customer = customers.find(
        (c: Customer) => c.id === invalidLineItemCustomer,
      );
      setSubmitError(
        `${customer?.displayName || invalidLineItemCustomer}: every line item must have a miner count and unit price greater than 0.`,
      );
      return;
    }

    try {
      for (const customerId of targetCustomerIds) {
        const lineItems = customerLineItems[customerId]?.lineItems ?? [];
        const totalMiners = lineItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );
        const totalAmount = lineItems.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0,
        );

        await createInvoice({
          customerId,
          totalMiners,
          unitPrice: totalMiners > 0 ? totalAmount / totalMiners : 0,
          dueDate,
          invoiceType: "ELECTRICITY_CHARGES",
          billingMonth: billingMonthDate.toISOString(),
          lineItems,
          machineHostingLocation:
            customerLineItems[customerId]?.machineHostingLocation || undefined,
        });
      }

      setSubmitSuccess(
        `Successfully created ${targetCustomerIds.length} draft invoice(s) for selected customers.`,
      );
      setConfirmZeroMinersOpen(false);
      setCustomersWithNoMinersNames([]);
      setConfirmAlreadyPaidOpen(false);
      setAlreadyPaidCustomers([]);
      setExcludedCustomerIds([]);
      // After success, navigate back to accounting dashboard
      router.push("/accounting/Hosting-and-Colocation");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to create invoices.",
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitBulkInvoices();
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Link href="/accounting/Hosting-and-Colocation">
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
              <Typography variant="h6" sx={{ mb: 1 }}>
                Select Customers
              </Typography>
              <Stack
                direction="row"
                spacing={2.5}
                flexWrap="wrap"
                sx={{ mb: 2 }}
              >
                {(
                  [
                    ["success", "Balance covers monthly bill"],
                    ["warning", "Balance below monthly bill"],
                    ["error", "Negative balance"],
                  ] as const
                ).map(([color, label]) => (
                  <Stack
                    key={color}
                    direction="row"
                    spacing={0.75}
                    alignItems="center"
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: `${color}.main`,
                      }}
                    />
                    <Typography variant="caption" color="textSecondary">
                      {label}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
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
                    const lineItemsState = customerLineItems[customer.id];
                    const isSelected = selectedCustomerIds.includes(
                      customer.id,
                    );

                    return (
                      <Box key={customer.id} sx={{ mb: isSelected ? 2 : 0 }}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={isSelected}
                              onChange={() => handleToggleCustomer(customer.id)}
                            />
                          }
                          label={
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="baseline"
                            >
                              <Typography variant="body2">
                                {customer.displayName}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="textSecondary"
                              >
                                Balance:{" "}
                                <CurrencyDisplay
                                  value={balances[customer.id] ?? 0}
                                  color={getBalanceColor(
                                    balances[customer.id] ?? 0,
                                    monthlyBills[customer.id] ?? 0,
                                  )}
                                  fontWeight="bold"
                                  variant="caption"
                                  standalone
                                />
                              </Typography>
                            </Stack>
                          }
                        />
                        {isSelected && (
                          <Box sx={{ ml: 4, mt: 0.5 }}>
                            {lineItemsState?.loading ? (
                              <Typography
                                variant="caption"
                                color="textSecondary"
                              >
                                Loading miners (status=AUTO)...
                              </Typography>
                            ) : lineItemsState?.error ? (
                              <Typography variant="caption" color="error">
                                Error: {lineItemsState.error}
                              </Typography>
                            ) : (
                              <>
                                <LineItemsEditor
                                  lineItems={lineItemsState?.lineItems ?? []}
                                  onChange={(items) =>
                                    setCustomerLineItems((prev) => ({
                                      ...prev,
                                      [customer.id]: {
                                        ...prev[customer.id],
                                        lineItems: items,
                                        loading: false,
                                        error: null,
                                      },
                                    }))
                                  }
                                  hardwareList={hardwareList}
                                />
                                <Typography
                                  variant="caption"
                                  color="textSecondary"
                                  sx={{ display: "block", mt: 0.5 }}
                                >
                                  Machine Hosting Location on the invoice will
                                  be auto-calculated from the majority of this
                                  customer&apos;s miners&apos; locations
                                  {lineItemsState?.machineHostingLocation
                                    ? `: ${lineItemsState.machineHostingLocation}`
                                    : " (no located miners found)."}
                                </Typography>
                              </>
                            )}
                          </Box>
                        )}
                      </Box>
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
                  select
                  label="Billing Month"
                  value={billingMonth}
                  onChange={(e) => {
                    const selected = Number(e.target.value);
                    setBillingMonth(selected);
                  }}
                  fullWidth
                  helperText={`Year: ${billingYear}`}
                  required
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <MenuItem key={idx} value={idx}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Due Date"
                  type="date"
                  value={dueDate}
                  onChange={handleDueDateChange}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText="Select the due date for these invoices"
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
                  !dueDate
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
          <Button
            onClick={() => {
              setConfirmZeroMinersOpen(false);
              setExcludedCustomerIds([]);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() =>
              void submitBulkInvoices({
                allowZeroMiners: true,
                bypassPaidCheck: true,
              })
            }
            disabled={creating}
          >
            {creating ? "Creating Invoices..." : "Proceed"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmAlreadyPaidOpen}
        onClose={() => setConfirmAlreadyPaidOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Some customers have already paid in advance</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            The following customers have already paid in advance:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            {alreadyPaidCustomers.map(({ id, name }) => (
              <li key={id}>
                <Typography variant="body2">{name}</Typography>
              </li>
            ))}
          </Box>
          <Typography variant="body2">
            Do you still want to send them an invoice?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              const idsToExclude = alreadyPaidCustomers.map((c) => c.id);
              setExcludedCustomerIds(idsToExclude);
              void submitBulkInvoices({
                bypassPaidCheck: true,
                excludeCustomerIds: idsToExclude,
              });
            }}
            disabled={creating}
          >
            No, skip them
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setExcludedCustomerIds([]);
              void submitBulkInvoices({
                bypassPaidCheck: true,
                excludeCustomerIds: [],
              });
            }}
            disabled={creating}
          >
            {creating ? "Creating Invoices..." : "Yes, send anyway"}
          </Button>
        </DialogActions>
      </Dialog>

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
