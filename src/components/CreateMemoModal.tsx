"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  IconButton,
  CircularProgress,
  Alert,
  MenuItem,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
  Typography,
} from "@mui/material";
import { Close as CloseIcon, Add as AddIcon } from "@mui/icons-material";
import { useCustomers, Customer } from "@/lib/hooks/useInvoices";
import { useInvoices } from "@/lib/hooks/useInvoices";

interface CreateMemoModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (text: string) => void;
  // When opened from an invoice's detail page, these are preset and locked.
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  category?: "HOSTING" | "HARDWARE" | null;
}

const CATEGORY_TO_INVOICE_TYPE: Record<string, string> = {
  HOSTING: "ELECTRICITY_CHARGES",
  HARDWARE: "HARDWARE_SALES",
};

const CATEGORY_LABELS: Record<string, string> = {
  HOSTING: "Hosting & Colocation",
  HARDWARE: "Hardware Sales",
};

const OPPOSITE_CATEGORY: Record<
  "HOSTING" | "HARDWARE",
  "HOSTING" | "HARDWARE"
> = {
  HOSTING: "HARDWARE",
  HARDWARE: "HOSTING",
};

export default function CreateMemoModal({
  open,
  onClose,
  onSuccess,
  invoiceId = null,
  invoiceNumber = null,
  customerId = null,
  customerName = null,
  category: presetCategory = null,
}: CreateMemoModalProps) {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [memoType, setMemoType] = useState<"CUSTOMER_FACING" | "INTERNAL">(
    "INTERNAL",
  );
  const [category, setCategory] = useState<"HOSTING" | "HARDWARE">(
    presetCategory || "HOSTING",
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    customerId || "",
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(invoiceId || "");
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isInvoiceLocked = Boolean(invoiceId);
  const isCategoryLocked = Boolean(presetCategory);
  const needsCustomerPicker = !customerId;

  const { customers, loading: customersLoading } = useCustomers();

  // Optional invoice picker, scoped to the selected customer + category.
  // Only relevant when the memo wasn't opened directly from an invoice.
  const { invoices: customerInvoices, loading: invoicesLoading } = useInvoices(
    1,
    100,
    !isInvoiceLocked ? selectedCustomerId || undefined : undefined,
    undefined,
    CATEGORY_TO_INVOICE_TYPE[category],
  );

  useEffect(() => {
    if (open) {
      setSelectedCustomerId(customerId || "");
      setSelectedInvoiceId(invoiceId || "");
      setCategory(presetCategory || "HOSTING");
      setTransferEnabled(false);
    }
  }, [open, customerId, invoiceId, presetCategory]);

  const handleClose = () => {
    onClose();
    setAmount("");
    setReason("");
    setMemoType("INTERNAL");
    setTransferEnabled(false);
    setError("");
    setSuccess("");
    setSelectedCustomerId(customerId || "");
    setSelectedInvoiceId(invoiceId || "");
  };

  const handleMemoTypeChange = (value: "CUSTOMER_FACING" | "INTERNAL") => {
    setMemoType(value);
    if (value !== "INTERNAL") {
      setTransferEnabled(false);
    }
  };

  const selectedCustomerDisplayName =
    customerName ||
    customers.find((c: Customer) => c.id === selectedCustomerId)?.displayName ||
    "the selected customer";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const targetCustomerId = customerId || selectedCustomerId;
    if (!isInvoiceLocked && !selectedInvoiceId && !targetCustomerId) {
      setError("Please select a customer");
      return;
    }

    const memoAmount = parseFloat(amount);
    if (!amount || isNaN(memoAmount) || memoAmount === 0) {
      setError("Please enter a valid non-zero amount");
      return;
    }

    if (!reason || reason.trim().length === 0) {
      setError("Please enter a reason for this memo");
      return;
    }

    if (reason.length > 500) {
      setError("Reason must not exceed 500 characters");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: isInvoiceLocked ? undefined : targetCustomerId,
          invoiceId: isInvoiceLocked
            ? invoiceId
            : selectedInvoiceId || undefined,
          category,
          memoType,
          amount: memoAmount,
          reason: reason.trim(),
          transfer: memoType === "INTERNAL" ? transferEnabled : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create memo");
      }

      const successText = data.emailWarning
        ? `Memo created. ${data.emailWarning}`
        : data.pairedMemo
          ? "Memo created, with an offsetting entry in the opposite category"
          : "Memo created successfully";

      setSuccess(successText);
      setTimeout(() => {
        onSuccess(successText);
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create memo");
    } finally {
      setLoading(false);
    }
  };

  const charCount = reason.length;
  const charLimit = 500;
  const oppositeCategory = OPPOSITE_CATEGORY[category];

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, rgba(40,40,40,0.95), rgba(30,30,30,0.95))"
              : "linear-gradient(145deg, rgba(255,255,255,0.95), rgba(250,250,250,0.95))",
          backdropFilter: "blur(10px)",
        },
      }}
    >
      <DialogTitle
        sx={{
          m: 0,
          p: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        Create Memo
        <IconButton
          onClick={handleClose}
          sx={{
            color: (theme) => theme.palette.grey[500],
            "&:hover": { backgroundColor: "action.hover" },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {success && <Alert severity="success">{success}</Alert>}

            {(customerName || isInvoiceLocked) && (
              <Box sx={{ mb: 1 }}>
                {customerName && (
                  <Typography variant="body2" color="text.secondary">
                    Customer: <strong>{customerName}</strong>
                  </Typography>
                )}
                {isInvoiceLocked && invoiceNumber && (
                  <Typography variant="body2" color="text.secondary">
                    Invoice: <strong>{invoiceNumber}</strong>
                  </Typography>
                )}
              </Box>
            )}

            {needsCustomerPicker && (
              <TextField
                fullWidth
                select
                label="Customer"
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setSelectedInvoiceId("");
                }}
                required
                disabled={customersLoading}
              >
                {customers.map((c: Customer) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.displayName}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              fullWidth
              select
              label="Category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as "HOSTING" | "HARDWARE");
                setSelectedInvoiceId("");
              }}
              disabled={isCategoryLocked}
              required
            >
              <MenuItem value="HOSTING">Hosting & Colocation</MenuItem>
              <MenuItem value="HARDWARE">Hardware Sales</MenuItem>
            </TextField>

            {!isInvoiceLocked && (
              <TextField
                fullWidth
                select
                label="Related Invoice (optional)"
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                disabled={!selectedCustomerId || invoicesLoading}
                helperText={
                  selectedCustomerId
                    ? "Leave blank for a standalone memo not tied to a specific invoice"
                    : "Select a customer first to link an invoice"
                }
              >
                <MenuItem value="">No linked invoice</MenuItem>
                {customerInvoices.map(
                  (inv: { id: string; invoiceNumber: string }) => (
                    <MenuItem key={inv.id} value={inv.id}>
                      {inv.invoiceNumber}
                    </MenuItem>
                  ),
                )}
              </TextField>
            )}

            <Box>
              <FormLabel
                component="legend"
                sx={{ fontSize: "0.9rem", mb: 0.5 }}
              >
                Memo Type
              </FormLabel>
              <RadioGroup
                row
                value={memoType}
                onChange={(e) =>
                  handleMemoTypeChange(
                    e.target.value as "CUSTOMER_FACING" | "INTERNAL",
                  )
                }
              >
                <FormControlLabel
                  value="INTERNAL"
                  control={<Radio />}
                  label="Internal record only"
                />
                <FormControlLabel
                  value="CUSTOMER_FACING"
                  control={<Radio />}
                  label="Customer-facing (PDF + email)"
                />
              </RadioGroup>
            </Box>

            {memoType === "INTERNAL" && !transferEnabled && (
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setTransferEnabled(true)}
                sx={{ alignSelf: "flex-start" }}
              >
                Also transfer to/from {CATEGORY_LABELS[oppositeCategory]}
              </Button>
            )}

            {memoType === "INTERNAL" && transferEnabled && (
              <Alert
                severity="info"
                onClose={() => setTransferEnabled(false)}
                sx={{ "& .MuiAlert-message": { width: "100%" } }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  This will also create an offsetting memo:
                </Typography>
                <Typography variant="body2">
                  Customer: <strong>{selectedCustomerDisplayName}</strong>
                  <br />
                  Category: <strong>
                    {CATEGORY_LABELS[oppositeCategory]}
                  </strong>{" "}
                  (no invoice)
                  <br />
                  The amount below is mirrored with the opposite sign on this
                  entry.
                </Typography>
              </Alert>
            )}

            <TextField
              fullWidth
              label="Amount (USD)"
              type="number"
              inputProps={{
                step: "0.01",
                placeholder: "e.g., 50.00 or -25.50",
              }}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
              helperText={
                memoType === "CUSTOMER_FACING"
                  ? "Positive: added to customer balance, deducted from this category's revenue (customer receives a Debit Memo). Negative: deducted from customer balance, added back to revenue (customer receives a Credit Memo)."
                  : transferEnabled
                    ? `Positive: added to ${CATEGORY_LABELS[category]}, deducted from ${CATEGORY_LABELS[oppositeCategory]}. Negative: reversed.`
                    : "Positive reduces this category's revenue card; negative adds back to it."
              }
            />

            <TextField
              fullWidth
              label="Reason"
              type="text"
              multiline
              rows={4}
              value={reason}
              onChange={(e) => {
                if (e.target.value.length <= 500) {
                  setReason(e.target.value);
                }
              }}
              required
              helperText={`Describe the reason for this memo (${charCount}/${charLimit} characters)`}
              inputProps={{ maxLength: 500 }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} color="inherit" disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{
              px: 4,
              background: (theme) =>
                `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
              "&:hover": {
                background: (theme) =>
                  `linear-gradient(45deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
              },
            }}
          >
            {loading ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CircularProgress size={20} color="inherit" />
                {memoType === "CUSTOMER_FACING"
                  ? "Generating PDF & sending email…"
                  : "Saving…"}
              </Box>
            ) : (
              "Create Memo"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
