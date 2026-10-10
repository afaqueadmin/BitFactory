"use client";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import { useEffect, useState } from "react";
import { Customer, useCustomers } from "@/lib/hooks/useInvoices";
import {
  RepairInvoiceInput,
  RepairLineItemDraft,
  useRepairMiners,
} from "@/lib/hooks/useRepairInvoices";
import { useSpaceLocations } from "@/lib/hooks/useSpaceLocations";
import {
  computeRepairTotals,
  defaultRepairNote,
  REPAIR_NOTE_MAX,
} from "@/lib/accounting/hardwareRepair";
import {
  emptyRepairLine,
  RepairLineItemsEditor,
} from "@/components/accounting/invoices/RepairLineItemsEditor";
import { RepairMinerDetails } from "@/components/accounting/invoices/RepairMinerDetails";
import { LocationsMultiSelect } from "@/components/accounting/invoices/LocationsMultiSelect";

export interface RepairInvoiceFormValues extends RepairInvoiceInput {
  customerId: string;
}

interface RepairInvoiceFormProps {
  mode: "create" | "edit";
  /** Edit mode: the existing invoice's values (customer can't change). */
  initial?: Partial<RepairInvoiceFormValues> & {
    customerName?: string;
    invoiceNumber?: string;
  };
  submitting: boolean;
  onSubmit: (values: RepairInvoiceFormValues) => Promise<void>;
  onCancel: () => void;
}

const today = () => new Date().toISOString().split("T")[0];
const in30Days = () =>
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

export function RepairInvoiceForm({
  mode,
  initial,
  submitting,
  onSubmit,
  onCancel,
}: RepairInvoiceFormProps) {
  const isEdit = mode === "edit";
  const { customers, loading: customersLoading } = useCustomers({
    withMiners: true,
  });
  const { locations: spaceLocations, loading: spaceLocationsLoading } =
    useSpaceLocations();

  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [minerId, setMinerId] = useState(initial?.minerId ?? "");
  const [lineItems, setLineItems] = useState<RepairLineItemDraft[]>(
    initial?.lineItems?.length ? initial.lineItems : [emptyRepairLine()],
  );
  const [discount, setDiscount] = useState(initial?.discountAmount ?? 0);
  const [issueDate, setIssueDate] = useState(
    initial?.invoiceGeneratedDate ?? today(),
  );
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? in30Days());
  const [machineHostingLocation, setMachineHostingLocation] = useState<
    string[]
  >(initial?.machineHostingLocation ?? []);
  const [repairNote, setRepairNote] = useState(initial?.repairNote ?? "");
  // The note follows the line items until the admin edits it themselves.
  const [noteEdited, setNoteEdited] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);

  const { miners, loading: minersLoading } = useRepairMiners(
    customerId || undefined,
  );
  const selectedMiner = miners.find((m) => m.id === minerId);

  useEffect(() => {
    if (!noteEdited) {
      setRepairNote(
        defaultRepairNote(initial?.invoiceNumber ?? null, lineItems),
      );
    }
  }, [lineItems, noteEdited, initial?.invoiceNumber]);

  const handleCustomerChange = (value: string) => {
    setCustomerId(value);
    setMinerId("");
  };

  const handleMinerChange = (value: string) => {
    setMinerId(value);
    // Pre-fill "Machine Hosting Location" from the miner's space.
    const location = miners.find((m) => m.id === value)?.space?.location;
    if (location) setMachineHostingLocation([location]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const { subtotal, total } = computeRepairTotals(lineItems, discount);
    if (!customerId) return setError("Customer is required");
    if (!minerId) return setError("Miner is required");
    if (lineItems.some((li) => !li.description.trim())) {
      return setError("Every line item needs a description");
    }
    if (
      lineItems.some(
        (li) =>
          !Number.isInteger(li.quantity) ||
          li.quantity <= 0 ||
          li.unitPrice <= 0,
      )
    ) {
      return setError(
        "Every line item needs a whole-number QTY and a RATE greater than 0",
      );
    }
    if (discount > subtotal) {
      return setError("Discount can't be more than the subtotal");
    }
    if (total <= 0)
      return setError("Total after discount must be greater than 0");
    if (!repairNote.trim()) return setError("Repair note is required");

    try {
      await onSubmit({
        customerId,
        minerId,
        lineItems: lineItems.map((li) => ({
          ...li,
          description: li.description.trim(),
        })),
        discountAmount: discount,
        repairNote: repairNote.trim(),
        dueDate,
        invoiceGeneratedDate: isEdit ? undefined : issueDate,
        machineHostingLocation,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save invoice");
    }
  };

  return (
    <Paper sx={{ p: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit}>
        <Stack spacing={4}>
          {/* Customer & Miner */}
          <Box>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Customer & Miner</h3>
            <Stack spacing={2}>
              {isEdit ? (
                <TextField
                  label="Customer"
                  value={initial?.customerName ?? ""}
                  fullWidth
                  disabled
                />
              ) : (
                <TextField
                  select
                  label="Select Customer"
                  value={customerId}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  fullWidth
                  helperText="Only customers who own at least one miner are listed"
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
              )}

              <TextField
                select
                label="Select Miner"
                value={minersLoading ? "" : minerId}
                onChange={(e) => handleMinerChange(e.target.value)}
                fullWidth
                disabled={!customerId || minersLoading}
                helperText={
                  !customerId
                    ? "Select a customer first"
                    : minersLoading
                      ? "Loading miners..."
                      : `${miners.length} miner${miners.length === 1 ? "" : "s"}`
                }
                required
              >
                <MenuItem value="">-- Select a Miner --</MenuItem>
                {miners.map((miner) => (
                  <MenuItem key={miner.id} value={miner.id}>
                    {miner.name}
                    {miner.serialNumber ? ` — ${miner.serialNumber}` : ""}
                    {miner.hardware?.model ? ` (${miner.hardware.model})` : ""}
                  </MenuItem>
                ))}
              </TextField>

              {selectedMiner && <RepairMinerDetails miner={selectedMiner} />}
            </Stack>
          </Box>

          {/* Line Items */}
          <Box>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Line Items</h3>
            <RepairLineItemsEditor
              lineItems={lineItems}
              onChange={setLineItems}
              discount={discount}
              onDiscountChange={setDiscount}
              disabled={submitting}
            />
          </Box>

          {/* Repair note */}
          <Box>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Repair Note</h3>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Saved to the miner&apos;s repair history and kept in sync with
              this invoice. Pre-filled from the line items - edit as needed.
            </Typography>
            <TextField
              multiline
              minRows={3}
              fullWidth
              value={repairNote}
              onChange={(e) => {
                setNoteEdited(true);
                setRepairNote(e.target.value);
              }}
              inputProps={{ maxLength: REPAIR_NOTE_MAX }}
              required
              disabled={submitting}
            />
            {noteEdited && !isEdit && (
              <Button
                size="small"
                sx={{ mt: 1 }}
                onClick={() => setNoteEdited(false)}
              >
                Reset to line items
              </Button>
            )}
          </Box>

          {/* Additional Information */}
          <Box>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>
              Additional Information
            </h3>
            <Stack spacing={2}>
              {!isEdit && (
                <TextField
                  label="Issue Date"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText="When the invoice was issued (defaults to today)"
                  required
                />
              )}
              <TextField
                label="Due Date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                helperText="When payment is due"
                required
              />
              <LocationsMultiSelect
                value={machineHostingLocation}
                onChange={setMachineHostingLocation}
                options={spaceLocations}
                disabled={spaceLocationsLoading}
              />
            </Stack>
          </Box>

          <Stack direction="row" spacing={2}>
            <Button variant="outlined" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={
                submitting ? <CircularProgress size={20} /> : <SaveIcon />
              }
              disabled={submitting || !customerId || !minerId}
            >
              {submitting
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save Changes"
                  : "Create Invoice"}
            </Button>
          </Stack>
        </Stack>
      </form>
    </Paper>
  );
}
