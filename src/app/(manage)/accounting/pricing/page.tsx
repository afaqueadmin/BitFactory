"use client";

import {
  Box,
  Button,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from "@mui/material";
import { useState } from "react";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import { useMockCustomerPricingConfigs } from "@/lib/mocks/useMockInvoices";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";

interface PricingConfig {
  id: string;
  userId: string;
  defaultUnitPrice: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export default function PricingPage() {
  const { pricingConfigs, loading, error } = useMockCustomerPricingConfigs();
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedPricing, setSelectedPricing] = useState<PricingConfig | null>(
    null,
  );
  const [editValues, setEditValues] = useState<Partial<PricingConfig>>({});

  const handleEditClick = (pricing: PricingConfig) => {
    setSelectedPricing(pricing);
    setEditValues({ ...pricing });
    setOpenDialog(true);
  };

  const handleSave = () => {
    // In Phase 3, this would call an API
    console.log("Saving pricing:", editValues);
    setOpenDialog(false);
  };

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg">
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <h1 style={{ margin: 0 }}>Pricing Configuration</h1>
        <p style={{ margin: "8px 0 0 0", color: "#666" }}>
          Manage customer-specific unit pricing and discounts
        </p>
      </Box>

      <Paper sx={{ mb: 3, p: 3, backgroundColor: "#e8f4f8" }}>
        <h3 style={{ margin: "0 0 12px 0" }}>About Pricing</h3>
        <p style={{ margin: 0, color: "#666" }}>
          Define unit prices for different service types and apply
          customer-specific discounts. Changes take effect on the next invoice.
        </p>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold" }}>Customer</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Base Unit Price</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Discount (%)</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Effective Rate</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Currency</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Effective From</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pricingConfigs.map((pricing) => (
              <TableRow key={pricing.id} hover>
                <TableCell sx={{ fontWeight: "bold" }}>
                  {pricing.customerName}
                </TableCell>
                <TableCell>
                  <CurrencyDisplay value={pricing.unitPrice} />
                </TableCell>
                <TableCell>{pricing.discountPercentage}%</TableCell>
                <TableCell>
                  <CurrencyDisplay
                    value={
                      pricing.unitPrice * (1 - pricing.discountPercentage / 100)
                    }
                  />
                </TableCell>
                <TableCell>{pricing.currency}</TableCell>
                <TableCell>
                  {new Date(pricing.effectiveFrom).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={() => handleEditClick(pricing)}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Pricing Configuration</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedPricing && (
            <Stack spacing={2}>
              <TextField
                label="Customer Name"
                value={editValues.customerName || ""}
                disabled
                fullWidth
              />
              <TextField
                label="Unit Price"
                type="number"
                value={editValues.unitPrice || ""}
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    unitPrice: parseFloat(e.target.value),
                  })
                }
                fullWidth
                inputProps={{ step: "0.01" }}
              />
              <TextField
                label="Discount (%)"
                type="number"
                value={editValues.discountPercentage || ""}
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    discountPercentage: parseFloat(e.target.value),
                  })
                }
                fullWidth
                inputProps={{ min: "0", max: "100", step: "0.01" }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            startIcon={<SaveIcon />}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
