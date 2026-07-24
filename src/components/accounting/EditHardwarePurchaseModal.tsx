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
  HardwarePurchaseInvoice,
  useDeleteHardwarePurchase,
} from "@/lib/hooks/useHardwarePurchases";
import { HardwarePurchaseFormData } from "@/app/(manage)/accounting/hardware-purchases/create/page";

interface EditHardwarePurchaseModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  invoiceId: string | null;
  invoiceData?: HardwarePurchaseInvoice | null; // Optional prop to pass invoice data directly
}

export default function EditHardwarePurchaseModal({
  open,
  onClose,
  onSuccess,
  invoiceId,
  invoiceData,
}: EditHardwarePurchaseModalProps) {
  const [formData, setFormData] = useState<Partial<HardwarePurchaseFormData>>({
    invoiceNumber: "",
    vendorName: "",
    hardwareDescription: "",
    billingDate: "",
    issuedDate: "",
    dueDate: "",
    quantity: 0,
    unitPrice: 0,
    miscellaneousCharges: 0,
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteHardwarePurchase = useDeleteHardwarePurchase();

  // Fetch invoice details when modal opens
  useEffect(() => {
    if (open && invoiceId && !invoiceData) {
      const fetchInvoice = async () => {
        try {
          setLoading(true);
          setError(null);

          const response = await fetch(`/api/hardware-purchases/${invoiceId}`);

          if (!response.ok) {
            setError("Failed to fetch hardware purchase invoice");
            return;
          }

          const data = await response.json();
          const invoice = data.data;

          setFormData({
            invoiceNumber: invoice.invoiceNumber,
            vendorName: invoice.vendorName,
            hardwareDescription: invoice.hardwareDescription,
            billingDate: invoice.billingDate.split("T")[0],
            issuedDate: invoice.issuedDate
              ? new Date(invoice.issuedDate).toISOString().split("T")[0]
              : "",
            dueDate: new Date(invoice.dueDate).toISOString().split("T")[0],
            quantity: invoice.quantity,
            unitPrice: invoice.unitPrice,
            miscellaneousCharges: invoice.miscellaneousCharges,
            notes: invoice.notes || "",
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
        vendorName: invoiceData.vendorName,
        hardwareDescription: invoiceData.hardwareDescription,
        billingDate: new Date(invoiceData.billingDate)
          .toISOString()
          .split("T")[0],
        issuedDate: invoiceData.issuedDate
          ? new Date(invoiceData.issuedDate).toISOString().split("T")[0]
          : "",
        dueDate: new Date(invoiceData.dueDate).toISOString().split("T")[0],
        quantity: invoiceData.quantity,
        unitPrice: invoiceData.unitPrice,
        miscellaneousCharges: invoiceData.miscellaneousCharges,
        notes: invoiceData.notes || "",
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

  const calculateTotalAmount = (): number => {
    const quantity = Number(formData.quantity) || 0;
    const unitPrice = Number(formData.unitPrice) || 0;
    const miscellaneousCharges = Number(formData.miscellaneousCharges) || 0;
    return quantity * unitPrice + miscellaneousCharges;
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
      if (!formData.vendorName?.trim()) {
        setError("Vendor name is required");
        return;
      }
      if (!formData.hardwareDescription?.trim()) {
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

      const response = await fetch(`/api/hardware-purchases/${invoiceId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceNumber: formData.invoiceNumber,
          vendorName: formData.vendorName,
          hardwareDescription: formData.hardwareDescription,
          billingDate: formData.billingDate,
          issuedDate: formData.issuedDate || null,
          dueDate: formData.dueDate,
          quantity: Number(formData.quantity) || 0,
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
        setError(
          errorData.error || "Failed to update hardware purchase invoice",
        );
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
      await deleteHardwarePurchase.mutateAsync(invoiceId);
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
          Edit Hardware Purchase Invoice
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
                {/* Row 1: Invoice Number and Vendor Name */}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    fullWidth
                    label="Invoice Number"
                    name="invoiceNumber"
                    value={formData.invoiceNumber || ""}
                    onChange={handleInputChange}
                    placeholder="e.g., HW-2026-001"
                    required
                    disabled={saving}
                    size="small"
                  />
                  <TextField
                    fullWidth
                    label="Vendor Name"
                    name="vendorName"
                    value={formData.vendorName || ""}
                    onChange={handleInputChange}
                    placeholder="e.g., Bitmain"
                    required
                    disabled={saving}
                    size="small"
                  />
                </Stack>

                {/* Row 2: Hardware Description */}
                <TextField
                  fullWidth
                  label="Hardware Description"
                  name="hardwareDescription"
                  value={formData.hardwareDescription || ""}
                  onChange={handleInputChange}
                  placeholder="e.g., Antminer S21 x50"
                  required
                  disabled={saving}
                  size="small"
                />

                {/* Row 3: Billing Date and Issue Date */}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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
                  <TextField
                    fullWidth
                    label="Issue Date"
                    name="issuedDate"
                    type="date"
                    value={formData.issuedDate || ""}
                    onChange={handleInputChange}
                    disabled={saving}
                    slotProps={{
                      inputLabel: { shrink: true },
                    }}
                    size="small"
                  />
                </Stack>

                {/* Row 3b: Due Date */}
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
                  }}
                  disabled={saving}
                  size="small"
                />

                {/* Row 6: Notes */}
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
                          (Number(formData.quantity) || 0) *
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
            disabled={deleteHardwarePurchase.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteHardwarePurchase.isPending}
          >
            {deleteHardwarePurchase.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
