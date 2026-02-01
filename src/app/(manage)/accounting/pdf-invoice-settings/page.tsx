"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  TextField,
  Typography,
  Alert,
  Stack,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import ClearIcon from "@mui/icons-material/Clear";

interface PaymentDetailsType {
  id: string;
  companyName: string;
  companyLegalName: string;
  companyLocation: string;
  machineHostingLocation: string;
  logoBase64: string | null;
  paymentOption1Title: string;
  paymentOption1Details: string;
  paymentOption2Title: string;
  paymentOption2Details: string;
  paymentOption3Title: string;
  paymentOption3Details: string;
  billingInquiriesEmail: string;
  billingInquiriesWhatsApp: string;
  supportEmail: string;
  supportWhatsApp: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  updatedByUser?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

export default function PDFInvoiceSettingsPage() {
  const router = useRouter();

  const [paymentDetails, setPaymentDetails] =
    useState<PaymentDetailsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const fetchPaymentDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/admin/payment-details");

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (response.status === 403) {
        setError(
          "You do not have permission to access this page. Admin access required.",
        );
        router.push("/");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch payment details");
      }

      const { data } = await response.json();
      setPaymentDetails(data);
      if (data.logoBase64) {
        setLogoPreview(data.logoBase64);
      }
    } catch (err) {
      console.error("Error fetching payment details:", err);
      setError("Failed to load payment details");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchPaymentDetails();
  }, [fetchPaymentDetails]);

  const handleInputChange = (
    field: keyof PaymentDetailsType,
    value: string,
  ) => {
    if (paymentDetails) {
      setPaymentDetails({
        ...paymentDetails,
        [field]: value,
      });
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLogoPreview(base64);
        handleInputChange("logoBase64", base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!paymentDetails) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const response = await fetch("/api/admin/payment-details", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentDetails),
      });

      if (!response.ok) {
        const { error: errorMsg } = await response.json();
        throw new Error(errorMsg || "Failed to save payment details");
      }

      const { data } = await response.json();
      setPaymentDetails(data);
      setSuccess("Payment details updated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error saving payment details:", err);
      setError(
        err instanceof Error ? err.message : "Failed to save payment details",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    fetchPaymentDetails();
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!paymentDetails) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <Typography variant="h6" color="textSecondary">
          Failed to load payment details
        </Typography>
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box mb={4}>
        <Typography
          variant="h4"
          component="h1"
          gutterBottom
          sx={{ fontWeight: "bold" }}
        >
          PDF Invoice Settings
        </Typography>
        <Typography variant="body1" color="textSecondary">
          Configure invoice PDF fields that will be used in generated invoices
        </Typography>
      </Box>

      {/* Updated By Info */}
      {paymentDetails.updatedByUser && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Last updated by{" "}
          <strong>
            {paymentDetails.updatedByUser.name ||
              paymentDetails.updatedByUser.email}
          </strong>{" "}
          on{" "}
          <strong>{new Date(paymentDetails.updatedAt).toLocaleString()}</strong>
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Success Alert */}
      {success && (
        <Alert
          severity="success"
          onClose={() => setSuccess(null)}
          sx={{ mb: 3 }}
        >
          {success}
        </Alert>
      )}

      <Stack spacing={3}>
        {/* Company Information Section */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: "bold" }}>
            Company Information
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Basic company details for invoices
          </Typography>

          <Stack spacing={2}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 2,
              }}
            >
              <TextField
                fullWidth
                label="Company Name"
                value={paymentDetails.companyName}
                onChange={(e) =>
                  handleInputChange("companyName", e.target.value)
                }
                placeholder="e.g., BitFactory.AE"
              />

              <TextField
                fullWidth
                label="Legal Company Name"
                value={paymentDetails.companyLegalName}
                onChange={(e) =>
                  handleInputChange("companyLegalName", e.target.value)
                }
                placeholder="e.g., Higgs Computing Limited"
              />

              <TextField
                fullWidth
                label="Company Location"
                value={paymentDetails.companyLocation}
                onChange={(e) =>
                  handleInputChange("companyLocation", e.target.value)
                }
                placeholder="e.g., Ras Al Khaimah, UAE"
              />

              <TextField
                fullWidth
                label="Machine Hosting Location"
                value={paymentDetails.machineHostingLocation}
                onChange={(e) =>
                  handleInputChange("machineHostingLocation", e.target.value)
                }
                placeholder="e.g., Addis Ababa, Ethiopia"
              />
            </Box>

            <Box>
              <Typography
                variant="subtitle2"
                sx={{ mb: 1, fontWeight: "bold" }}
              >
                Logo (Base64)
              </Typography>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                sx={{ mb: 1 }}
              >
                Upload Image
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleLogoChange}
                />
              </Button>
              {logoPreview && (
                <Box
                  sx={{
                    mt: 2,
                    p: 1,
                    border: "1px solid #ddd",
                    borderRadius: 1,
                    bgcolor: "#f5f5f5",
                  }}
                >
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    style={{
                      maxWidth: "150px",
                      maxHeight: "150px",
                      objectFit: "contain",
                    }}
                  />
                </Box>
              )}
            </Box>
          </Stack>
        </Paper>

        {/* Payment Options Section */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: "bold" }}>
            Payment Options
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Configure payment methods displayed in invoices
          </Typography>

          <Stack spacing={2}>
            {/* Option 1 */}
            <TextField
              fullWidth
              label="Payment Option 1 - Title"
              value={paymentDetails.paymentOption1Title}
              onChange={(e) =>
                handleInputChange("paymentOption1Title", e.target.value)
              }
              placeholder="e.g., OPTION 1:"
            />

            <TextField
              fullWidth
              multiline
              rows={6}
              label="Payment Option 1 - Details"
              value={paymentDetails.paymentOption1Details}
              onChange={(e) =>
                handleInputChange("paymentOption1Details", e.target.value)
              }
              placeholder="e.g., USDT (Tron): TLNjcYnokhA1UcVsYVKjdeh9HzMS6GQJNe"
            />

            {/* Option 2 */}
            <TextField
              fullWidth
              label="Payment Option 2 - Title"
              value={paymentDetails.paymentOption2Title}
              onChange={(e) =>
                handleInputChange("paymentOption2Title", e.target.value)
              }
              placeholder="e.g., OPTION 2:"
            />

            <TextField
              fullWidth
              multiline
              rows={6}
              label="Payment Option 2 - Details"
              value={paymentDetails.paymentOption2Details}
              onChange={(e) =>
                handleInputChange("paymentOption2Details", e.target.value)
              }
              placeholder="e.g., USDC (ETH): 0x722460E434013075E8cF8dd42c8854424aFa336E"
            />

            {/* Option 3 */}
            <TextField
              fullWidth
              label="Payment Option 3 - Title"
              value={paymentDetails.paymentOption3Title}
              onChange={(e) =>
                handleInputChange("paymentOption3Title", e.target.value)
              }
              placeholder="e.g., OPTION 3:"
            />

            <TextField
              fullWidth
              multiline
              rows={6}
              label="Payment Option 3 - Details"
              value={paymentDetails.paymentOption3Details}
              onChange={(e) =>
                handleInputChange("paymentOption3Details", e.target.value)
              }
              placeholder="e.g., Bank details..."
            />
          </Stack>
        </Paper>

        {/* Contact Information Section */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: "bold" }}>
            Contact Information
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Billing and support contact details
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 2,
            }}
          >
            <TextField
              fullWidth
              type="email"
              label="Billing Inquiries Email"
              value={paymentDetails.billingInquiriesEmail}
              onChange={(e) =>
                handleInputChange("billingInquiriesEmail", e.target.value)
              }
              placeholder="invoices@bitfactory.ae"
            />

            <TextField
              fullWidth
              label="Billing Inquiries WhatsApp"
              value={paymentDetails.billingInquiriesWhatsApp}
              onChange={(e) =>
                handleInputChange("billingInquiriesWhatsApp", e.target.value)
              }
              placeholder="+971-52-6062903"
            />

            <TextField
              fullWidth
              type="email"
              label="Support Email"
              value={paymentDetails.supportEmail}
              onChange={(e) =>
                handleInputChange("supportEmail", e.target.value)
              }
              placeholder="support@bitfactory.ae"
            />

            <TextField
              fullWidth
              label="Support WhatsApp"
              value={paymentDetails.supportWhatsApp}
              onChange={(e) =>
                handleInputChange("supportWhatsApp", e.target.value)
              }
              placeholder="+971-52-6062903"
            />
          </Box>
        </Paper>

        {/* Action Buttons */}
        <Box display="flex" gap={2} justifyContent="flex-end">
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
