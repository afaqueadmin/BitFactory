"use client";

import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useRouter } from "next/navigation";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import {
  useCreateHardwarePurchase,
  VENDOR_NAME_OPTIONS,
  VendorNameValue,
} from "@/lib/hooks/useHardwarePurchases";

export interface HardwarePurchaseFormData {
  invoiceNumber: string;
  vendorName: VendorNameValue | "";
  hardwareDescription: string;
  billingDate: string;
  dueDate: string;
  quantity: number | string;
  unitPrice: number | string;
  miscellaneousCharges: number | string;
  notes: string;
}

export default function CreateHardwarePurchasePage() {
  const router = useRouter();
  const [formData, setFormData] = useState<HardwarePurchaseFormData>({
    invoiceNumber: "",
    vendorName: "",
    hardwareDescription: "",
    billingDate: new Date().toISOString().split("T")[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    quantity: 0,
    unitPrice: 0,
    miscellaneousCharges: 0,
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const createHardwarePurchase = useCreateHardwarePurchase();

  // Calculate total amount
  const calculateTotalAmount = (): number => {
    const quantity = Number(formData.quantity) || 0;
    const unitPrice = Number(formData.unitPrice) || 0;
    const miscellaneousCharges = Number(formData.miscellaneousCharges) || 0;
    return quantity * unitPrice + miscellaneousCharges;
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      if (
        name === "quantity" ||
        name === "unitPrice" ||
        name === "miscellaneousCharges"
      ) {
        return {
          ...prev,
          [name]: value === "" ? "" : value,
        };
      } else {
        return {
          ...prev,
          [name]: value,
        };
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Validate form
      if (!formData.invoiceNumber.trim()) {
        setError("Invoice number is required");
        return;
      }
      if (!formData.vendorName.trim()) {
        setError("Vendor name is required");
        return;
      }
      if (!formData.hardwareDescription.trim()) {
        setError("Hardware description is required");
        return;
      }
      if (!formData.billingDate) {
        setError("Billing date is required");
        return;
      }
      if (!formData.dueDate) {
        setError("Due date is required");
        return;
      }
      if ((Number(formData.quantity) || 0) < 0) {
        setError("Quantity cannot be negative");
        return;
      }
      if ((Number(formData.unitPrice) || 0) < 0) {
        setError("Unit price cannot be negative");
        return;
      }

      const totalAmount = calculateTotalAmount();

      await createHardwarePurchase.mutateAsync({
        invoiceNumber: formData.invoiceNumber,
        vendorName: formData.vendorName as VendorNameValue,
        hardwareDescription: formData.hardwareDescription,
        billingDate: formData.billingDate,
        dueDate: formData.dueDate,
        quantity: Number(formData.quantity) || 0,
        unitPrice: Number(formData.unitPrice) || 0,
        miscellaneousCharges: Number(formData.miscellaneousCharges) || 0,
        totalAmount: totalAmount,
        notes: formData.notes || undefined,
        paymentStatus: "Pending",
      });

      setSuccess(true);
      // Redirect after a short delay
      setTimeout(() => {
        router.push("/accounting/hardware-purchases");
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create hardware purchase invoice",
      );
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = calculateTotalAmount();

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Link href="/accounting/hardware-purchases">
          <Button startIcon={<ArrowBackIcon />}>Back</Button>
        </Link>
      </Stack>

      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: "bold", mb: 1 }}>
          Record Hardware Purchase Invoice
        </Typography>
        <Typography color="textSecondary" sx={{ mb: 3 }}>
          Add a new hardware purchase invoice entry
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Hardware purchase invoice created successfully! Redirecting...
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Stack spacing={3}>
            {/* Row 1: Invoice Number and Vendor Name */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Invoice Number"
                name="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={handleInputChange}
                placeholder="e.g., HW-2026-001"
                required
                disabled={saving}
              />
              <TextField
                select
                fullWidth
                label="Vendor Name"
                name="vendorName"
                value={formData.vendorName}
                onChange={handleInputChange}
                required
                disabled={saving}
              >
                <MenuItem value="">-- Select Vendor --</MenuItem>
                {VENDOR_NAME_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            {/* Row 2: Hardware Description */}
            <TextField
              fullWidth
              label="Hardware Description"
              name="hardwareDescription"
              value={formData.hardwareDescription}
              onChange={handleInputChange}
              placeholder="e.g., Antminer S21 x50"
              required
              disabled={saving}
            />

            {/* Row 3: Billing Date and Due Date */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Billing Date"
                name="billingDate"
                type="date"
                value={formData.billingDate}
                onChange={handleInputChange}
                required
                disabled={saving}
                slotProps={{
                  inputLabel: { shrink: true },
                }}
              />
              <TextField
                fullWidth
                label="Due Date"
                name="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={handleInputChange}
                required
                disabled={saving}
                slotProps={{
                  inputLabel: { shrink: true },
                }}
              />
            </Stack>

            {/* Row 4: Quantity and Unit Price */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Quantity"
                name="quantity"
                type="number"
                value={formData.quantity}
                onChange={handleInputChange}
                slotProps={{
                  htmlInput: { min: 0, step: 1 },
                }}
                required
                disabled={saving}
              />
              <TextField
                fullWidth
                label="Unit Price"
                name="unitPrice"
                type="number"
                value={formData.unitPrice}
                onChange={handleInputChange}
                slotProps={{
                  htmlInput: { min: 0, step: 0.01 },
                  input: {
                    startAdornment: "$",
                  },
                }}
                required
                disabled={saving}
              />
            </Stack>

            {/* Row 5: Miscellaneous Charges */}
            <TextField
              fullWidth
              label="Miscellaneous Charges"
              name="miscellaneousCharges"
              type="number"
              value={formData.miscellaneousCharges}
              onChange={handleInputChange}
              slotProps={{
                htmlInput: { step: 0.01 },
                input: {
                  startAdornment: "$",
                },
              }}
              disabled={saving}
            />

            {/* Row 6: Notes */}
            <TextField
              fullWidth
              label="Notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              multiline
              rows={4}
              placeholder="Add any additional notes or comments..."
              disabled={saving}
            />
          </Stack>

          {/* Total Amount Summary */}
          <Box
            sx={{
              mt: 4,
              p: 3,
              backgroundColor: "#f5f5f5",
              borderRadius: 1,
              border: "1px solid #e0e0e0",
            }}
          >
            <Stack spacing={2}>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body1" sx={{ fontWeight: "500" }}>
                  Unit Total:
                </Typography>
                <Typography variant="body1">
                  $
                  {(
                    (Number(formData.quantity) || 0) *
                    (Number(formData.unitPrice) || 0)
                  ).toFixed(2)}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body1" sx={{ fontWeight: "500" }}>
                  Miscellaneous:
                </Typography>
                <Typography variant="body1">
                  ${(Number(formData.miscellaneousCharges) || 0).toFixed(2)}
                </Typography>
              </Box>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  pt: 2,
                  borderTop: "2px solid #d0d0d0",
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                  Total Amount:
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: "bold", color: "primary.main" }}
                >
                  ${totalAmount.toFixed(2)}
                </Typography>
              </Box>
            </Stack>
          </Box>

          {/* Action Buttons */}
          <Stack
            direction="row"
            spacing={2}
            sx={{ mt: 4, justifyContent: "flex-end" }}
          >
            <Link href="/accounting/hardware-purchases">
              <Button variant="outlined" disabled={saving}>
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              variant="contained"
              startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
              disabled={saving}
            >
              {saving ? "Recording..." : "Record Hardware Purchase"}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
