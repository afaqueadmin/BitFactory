"use client";

import {
  Typography,
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
import {
  usePricingConfigs,
  PricingConfigWithDetails,
} from "@/lib/hooks/usePricingConfigs";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { useDaylight } from "@/lib/daylight";
import {
  DaylightAdminPage,
  DaylightLoading,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

export default function PricingPage() {
  const { d } = useDaylight();
  const ds = useDaylightAdminSx();
  const [page, setPage] = useState(1);
  const { pricingConfigs, loading, error } = usePricingConfigs(page);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedPricing, setSelectedPricing] =
    useState<PricingConfigWithDetails | null>(null);
  const [editValues, setEditValues] = useState<
    Partial<PricingConfigWithDetails>
  >({});

  const handleEditClick = (pricing: PricingConfigWithDetails) => {
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
      <DaylightAdminPage>
        <DaylightLoading />
      </DaylightAdminPage>
    );
  }

  if (error) {
    return (
      <DaylightAdminPage>
        <Alert severity="error" sx={{ ...ds.alertSx("error") }}>
          {error}
        </Alert>
      </DaylightAdminPage>
    );
  }

  return (
    <DaylightAdminPage>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={ds.pageTitleSx}>
          Pricing Configuration
        </Typography>
        <Typography sx={ds.pageDescSx}>
          Manage customer-specific unit pricing and discounts
        </Typography>
      </Box>

      <Paper
        elevation={0}
        sx={{
          ...ds.cardSx,
          mb: 3,
          bgcolor: d.skySoft,
          borderColor: d.borderSky,
          boxShadow: "none",
        }}
      >
        <Typography
          component="h2"
          sx={{ ...ds.sectionTitleSx, fontSize: 14, mb: "6px" }}
        >
          About Pricing
        </Typography>
        <p
          style={{ margin: 0, color: d.muted, fontSize: 13, lineHeight: 1.55 }}
        >
          Define unit prices for different service types and apply
          customer-specific discounts. Changes take effect on the next invoice.
        </p>
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={ds.listCardSx}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold" }}>Customer</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                Unit Price (USD)
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Effective From</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pricingConfigs.map((pricing) => (
              <TableRow key={pricing.id} hover>
                <TableCell sx={{ fontWeight: "bold" }}>
                  {pricing.user?.name ||
                    `Customer ${pricing.userId.slice(0, 8)}`}
                </TableCell>
                <TableCell>
                  <CurrencyDisplay value={pricing.defaultUnitPrice} />
                </TableCell>
                <TableCell>
                  {new Date(pricing.effectiveFrom).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={() => handleEditClick(pricing)}
                    sx={ds.outlineBtnSx}
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
                value={
                  selectedPricing.user?.name ||
                  `Customer ${selectedPricing.userId.slice(0, 8)}` ||
                  ""
                }
                disabled
                fullWidth
              />
              <TextField
                label="Unit Price (USD)"
                type="number"
                value={editValues.defaultUnitPrice || ""}
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    defaultUnitPrice: e.target
                      .value as unknown as PricingConfigWithDetails["defaultUnitPrice"],
                  })
                }
                fullWidth
                inputProps={{ step: "0.01" }}
              />
              <TextField
                label="Effective From"
                type="date"
                value={
                  editValues.effectiveFrom instanceof Date
                    ? editValues.effectiveFrom.toISOString().split("T")[0]
                    : ""
                }
                onChange={(e) =>
                  setEditValues({
                    ...editValues,
                    effectiveFrom: new Date(e.target.value),
                  })
                }
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)} sx={ds.textBtnSx()}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            startIcon={<SaveIcon />}
            sx={ds.primaryBtnSx}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </DaylightAdminPage>
  );
}
