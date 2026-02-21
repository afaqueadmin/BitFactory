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
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";

export interface VendorInvoiceFormData {
  invoiceNumber: string;
  billingDate: string;
  dueDate: string;
  totalMiners: number;
  unitPrice: number;
  miscellaneousCharges: number;
  notes: string;
}

export default function CreateVendorInvoicePage() {
  const router = useRouter();
  const [formData, setFormData] = useState<VendorInvoiceFormData>({
    invoiceNumber: "",
    billingDate: new Date().toISOString().split("T")[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    totalMiners: 0,
    unitPrice: 0,
    miscellaneousCharges: 0,
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // // Fetch existing invoice if editing
  // useEffect(() => {
  //   if (isEditing && invoiceId) {
  //     const fetchInvoice = async () => {
  //       try {
  //         setLoading(true);
  //         setError(null);
  //
  //         const response = await fetch(`/api/vendor-invoices/${invoiceId}`);
  //
  //         if (!response.ok) {
  //           setError("Failed to fetch vendor invoice");
  //           return;
  //         }
  //
  //         const data = await response.json();
  //         setFormData({
  //           invoiceNumber: data.data.invoiceNumber,
  //           billingDate: data.data.billingDate.split("T")[0],
  //           dueDate: new Date(data.data.dueDate).toISOString().split("T")[0],
  //           totalMiners: data.data.totalMiners,
  //           unitPrice: data.data.unitPrice,
  //           miscellaneousCharges: data.data.miscellaneousCharges,
  //           notes: data.data.notes || "",
  //         });
  //       } catch (err) {
  //         setError(err instanceof Error ? err.message : "Failed to load invoice");
  //       } finally {
  //         setLoading(false);
  //       }
  //     };
  //
  //     fetchInvoice();
  //   }
  // }, [invoiceId, isEditing]);

  // Calculate total amount
  const calculateTotalAmount = (): number => {
    const unitTotal = formData.totalMiners * formData.unitPrice;
    return unitTotal + formData.miscellaneousCharges;
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      if (
        name === "totalMiners" ||
        name === "unitPrice" ||
        name === "miscellaneousCharges"
      ) {
        return {
          ...prev,
          [name]: parseFloat(value) || 0,
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
      if (!formData.billingDate) {
        setError("Billing date is required");
        return;
      }
      if (!formData.dueDate) {
        setError("Due date is required");
        return;
      }
      if (formData.totalMiners <= 0) {
        setError("Total miners must be greater than 0");
        return;
      }
      if (formData.unitPrice < 0) {
        setError("Unit price cannot be negative");
        return;
      }

      // Validate dates
      const billingDate = new Date(formData.billingDate);
      const dueDate = new Date(formData.dueDate);

      if (dueDate < billingDate) {
        setError("Due date must be after billing date");
        return;
      }

      const totalAmount = calculateTotalAmount();

      // if (isEditing && invoiceId) {
      //   // Update existing vendor invoice
      //   const response = await fetch(`/api/vendor-invoices/${invoiceId}`, {
      //     method: "PUT",
      //     headers: {
      //       "Content-Type": "application/json",
      //     },
      //     body: JSON.stringify({
      //       invoiceNumber: formData.invoiceNumber,
      //       billingDate: formData.billingDate,
      //       dueDate: formData.dueDate,
      //       totalMiners: formData.totalMiners,
      //       unitPrice: formData.unitPrice,
      //       miscellaneousCharges: formData.miscellaneousCharges,
      //       totalAmount: totalAmount,
      //       notes: formData.notes || null,
      //     }),
      //   });
      //
      //   if (!response.ok) {
      //     const errorData = await response.json();
      //     setError(errorData.error || "Failed to update vendor invoice");
      //     return;
      //   }
      //
      //   setSuccess(true);
      //   // Redirect after a short delay
      //   setTimeout(() => {
      //     router.push("/accounting/farm-tariffs");
      //   }, 1500);
      // } else {
      // Create new vendor invoice
      const response = await fetch("/api/vendor-invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceNumber: formData.invoiceNumber,
          billingDate: formData.billingDate,
          dueDate: formData.dueDate,
          totalMiners: formData.totalMiners,
          unitPrice: formData.unitPrice,
          miscellaneousCharges: formData.miscellaneousCharges,
          totalAmount: totalAmount,
          notes: formData.notes || null,
          paymentStatus: "Pending",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Failed to create vendor invoice");
        return;
      }

      setSuccess(true);
      // Redirect after a short delay
      setTimeout(() => {
        router.push("/accounting/farm-tariffs");
      }, 1500);
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = calculateTotalAmount();

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Link href="/accounting/farm-tariffs">
          <Button startIcon={<ArrowBackIcon />}>Back</Button>
        </Link>
      </Stack>

      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: "bold", mb: 1 }}>
          Create Vendor Invoice
        </Typography>
        <Typography color="textSecondary" sx={{ mb: 3 }}>
          Add a new vendor invoice entry for farm tariffs
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Vendor invoice created successfully! Redirecting...
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Stack spacing={3}>
            {/* Row 1: Invoice Number and Billing Date */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Invoice Number"
                name="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={handleInputChange}
                placeholder="e.g., VI-2026-001"
                required
                disabled={saving}
              />
              <TextField
                fullWidth
                label="Billing Date (Issued Date)"
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
            </Stack>

            {/* Row 2: Due Date and Total Miners */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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
              <TextField
                fullWidth
                label="Total Miners"
                name="totalMiners"
                type="number"
                value={formData.totalMiners}
                onChange={handleInputChange}
                slotProps={{
                  htmlInput: { min: 1, step: 1 },
                }}
                required
                disabled={saving}
              />
            </Stack>

            {/* Row 3: Unit Price and Miscellaneous Charges */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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
              <TextField
                fullWidth
                label="Miscellaneous Charges"
                name="miscellaneousCharges"
                type="number"
                value={formData.miscellaneousCharges}
                onChange={handleInputChange}
                slotProps={{
                  htmlInput: { min: 0, step: 0.01 },
                  input: {
                    startAdornment: "$",
                  },
                }}
                disabled={saving}
              />
            </Stack>

            {/* Row 4: Notes */}
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
                  ${(formData.totalMiners * formData.unitPrice).toFixed(2)}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body1" sx={{ fontWeight: "500" }}>
                  Miscellaneous:
                </Typography>
                <Typography variant="body1">
                  ${formData.miscellaneousCharges.toFixed(2)}
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
            <Link href="/accounting/farm-tariffs">
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
              {saving ? "Creating..." : "Create Vendor Invoice"}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
