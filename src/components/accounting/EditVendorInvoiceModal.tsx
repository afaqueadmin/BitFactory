"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Button,
  Box,
  IconButton,
  CircularProgress,
  Alert,
  Stack,
  Typography,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import SaveIcon from "@mui/icons-material/Save";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  VendorInvoice,
  useDeleteVendorInvoice,
} from "@/lib/hooks/useVendorInvoices";
import { VendorInvoiceFormData } from "@/app/(manage)/accounting/vendor-invoices/create/page";

// export interface VendorInvoice {
//   id: string;
//   invoiceNumber: string;
//   billingDate: string;
//   paidDate: string | null;
//   dueDate: string;
//   totalMiners: number;
//   unitPrice: number;
//   miscellaneousCharges: number;
//   totalAmount: number;
//   paymentStatus: "Paid" | "Pending" | "Cancelled";
//   notes: string | null;
//   createdBy: string;
//   updatedBy: string | null;
//   createdAt: string;
//   updatedAt: string;
// }

interface EditVendorInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  invoiceId: string | null;
  invoiceData?: VendorInvoice | null; // Optional prop to pass invoice data directly
}

export default function EditVendorInvoiceModal({
  open,
  onClose,
  onSuccess,
  invoiceId,
  invoiceData,
}: EditVendorInvoiceModalProps) {
  const [formData, setFormData] = useState<Partial<VendorInvoiceFormData>>({
    invoiceNumber: "",
    billingDate: "",
    dueDate: "",
    totalMiners: 0,
    unitPrice: 0,
    miscellaneousCharges: 0,
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteVendorInvoice = useDeleteVendorInvoice();

  // Fetch invoice details when modal opens
  useEffect(() => {
    if (open && invoiceId && !invoiceData) {
      const fetchInvoice = async () => {
        try {
          setLoading(true);
          setError(null);

          const response = await fetch(`/api/vendor-invoices/${invoiceId}`);

          if (!response.ok) {
            setError("Failed to fetch vendor invoice");
            return;
          }

          const data = await response.json();
          const invoice = data.data;

          setFormData({
            invoiceNumber: invoice.invoiceNumber,
            billingDate: invoice.billingDate.split("T")[0],
            dueDate: new Date(invoice.dueDate).toISOString().split("T")[0],
            totalMiners: invoice.totalMiners,
            unitPrice: invoice.unitPrice,
            miscellaneousCharges: invoice.miscellaneousCharges,
            notes: invoice.notes || "",
            // paymentStatus: invoice.paymentStatus,
            // paidDate: invoice.paidDate
            //   ? invoice.paidDate.split("T")[0]
            //   : null,
          });
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to load invoice",
          );
        } finally {
          setLoading(false);
        }
      };

      fetchInvoice();
    } else if (invoiceData) {
      // Use provided invoice data
      setFormData({
        invoiceNumber: invoiceData.invoiceNumber,
        billingDate: new Date(invoiceData.billingDate)
          .toISOString()
          .split("T")[0],
        dueDate: new Date(invoiceData.dueDate).toISOString().split("T")[0],
        totalMiners: invoiceData.totalMiners,
        unitPrice: invoiceData.unitPrice,
        miscellaneousCharges: invoiceData.miscellaneousCharges,
        notes: invoiceData.notes || "",
        // paymentStatus: invoiceData.paymentStatus,
        // paidDate: invoiceData.paidDate
        //   ? new Date(invoiceData.paidDate).toISOString().split("T")[0]
        //   : null,
      });
      setLoading(false);
    }
  }, [open, invoiceId, invoiceData]);

  useEffect(() => {
    if (open) {
      setDeleteConfirmOpen(false);
      setDeleteError(null);
    }
  }, [open, invoiceId]);

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

  const calculateTotalAmount = (): number => {
    const totalMiners = Number(formData.totalMiners) || 0;
    const unitPrice = Number(formData.unitPrice) || 0;
    const miscellaneousCharges = Number(formData.miscellaneousCharges) || 0;
    return totalMiners * unitPrice + miscellaneousCharges;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invoiceId) {
      setError("Invoice ID is missing");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Validate form
      if (!formData.invoiceNumber?.trim()) {
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
      if ((Number(formData.totalMiners) || 0) < 0) {
        setError("Total miners cannot be negative");
        return;
      }
      if ((Number(formData.unitPrice) || 0) < 0) {
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

      const response = await fetch(`/api/vendor-invoices/${invoiceId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceNumber: formData.invoiceNumber,
          billingDate: formData.billingDate,
          dueDate: formData.dueDate,
          totalMiners: Number(formData.totalMiners) || 0,
          unitPrice: Number(formData.unitPrice) || 0,
          miscellaneousCharges: Number(formData.miscellaneousCharges) || 0,
          totalAmount: totalAmount,
          notes: formData.notes || null,
          paymentStatus: invoiceData?.paymentStatus,
          paidDate: invoiceData?.paidDate || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Failed to update vendor invoice");
        return;
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!invoiceId) return;

    setDeleteError(null);

    try {
      await deleteVendorInvoice.mutateAsync(invoiceId);
      setDeleteConfirmOpen(false);
      onSuccess();
      onClose();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete invoice",
      );
    }
  };

  const totalAmount = calculateTotalAmount();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="h6" component="span" sx={{ fontWeight: "bold" }}>
          Edit Vendor Invoice
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          disabled={saving}
          sx={{ color: "text.secondary" }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 8 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
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
                    value={formData.invoiceNumber || ""}
                    onChange={handleInputChange}
                    placeholder="e.g., VI-2026-001"
                    required
                    disabled={saving}
                    size="small"
                  />
                  <TextField
                    fullWidth
                    label="Billing Date"
                    name="billingDate"
                    type="date"
                    value={formData.billingDate || ""}
                    onChange={handleInputChange}
                    required
                    disabled={saving}
                    slotProps={{
                      inputLabel: { shrink: true },
                    }}
                    size="small"
                  />
                </Stack>

                {/* Row 2: Due Date */}
                <TextField
                  fullWidth
                  label="Due Date"
                  name="dueDate"
                  type="date"
                  value={formData.dueDate || ""}
                  onChange={handleInputChange}
                  required
                  disabled={saving}
                  slotProps={{
                    inputLabel: { shrink: true },
                  }}
                  size="small"
                />

                {/* Row 3: Total Miners and Unit Price */}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    fullWidth
                    label="Total Miners"
                    name="totalMiners"
                    type="number"
                    value={formData.totalMiners}
                    onChange={handleInputChange}
                    slotProps={{
                      htmlInput: { min: 0, step: 1 },
                    }}
                    required
                    disabled={saving}
                    size="small"
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
                    }}
                    required
                    disabled={saving}
                    size="small"
                  />
                </Stack>

                {/* Row 4: Miscellaneous Charges */}
                <TextField
                  fullWidth
                  label="Miscellaneous Charges"
                  name="miscellaneousCharges"
                  type="number"
                  value={formData.miscellaneousCharges}
                  onChange={handleInputChange}
                  slotProps={{
                    htmlInput: { step: 0.01 },
                  }}
                  disabled={saving}
                  size="small"
                />

                {/* Row 5: Notes */}
                <TextField
                  fullWidth
                  label="Notes"
                  name="notes"
                  value={formData.notes || ""}
                  onChange={handleInputChange}
                  multiline
                  rows={3}
                  placeholder="Add any additional notes or comments..."
                  disabled={saving}
                  size="small"
                />

                {/* Total Amount Summary */}
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#f5f5f5",
                    borderRadius: 1,
                    border: "1px solid #e0e0e0",
                  }}
                >
                  <Stack spacing={1}>
                    <Box
                      sx={{ display: "flex", justifyContent: "space-between" }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: "500" }}>
                        Unit Total:
                      </Typography>
                      <Typography variant="body2">
                        $
                        {(
                          (Number(formData.totalMiners) || 0) *
                          (Number(formData.unitPrice) || 0)
                        ).toFixed(2)}
                      </Typography>
                    </Box>
                    <Box
                      sx={{ display: "flex", justifyContent: "space-between" }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: "500" }}>
                        Miscellaneous:
                      </Typography>
                      <Typography variant="body2">
                        $
                        {(Number(formData.miscellaneousCharges) || 0).toFixed(
                          2,
                        )}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        pt: 1,
                        borderTop: "1px solid #d0d0d0",
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                        Total Amount:
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: "bold", color: "primary.main" }}
                      >
                        ${totalAmount}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              </Stack>
            </form>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, justifyContent: "space-between" }}>
        <Button
          onClick={() => setDeleteConfirmOpen(true)}
          color="error"
          startIcon={<DeleteIcon />}
          disabled={saving || loading || !invoiceId}
        >
          Delete Invoice
        </Button>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onClose} disabled={saving || loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            disabled={saving || loading}
          >
            {saving ? "Updating..." : "Update Invoice"}
          </Button>
        </Box>
      </DialogActions>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>Delete Invoice</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete invoice{" "}
            <strong>{formData.invoiceNumber}</strong>? This action cannot be
            undone.
          </DialogContentText>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteConfirmOpen(false)}
            disabled={deleteVendorInvoice.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteVendorInvoice.isPending}
          >
            {deleteVendorInvoice.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
