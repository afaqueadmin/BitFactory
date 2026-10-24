"use client";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import {
  ConfirmDeleteDialog,
  FormDialog,
  inactiveRowSx,
  RowActions,
  TableState,
  useRecordEditor,
} from "@/components/accounting/masterData/MasterDataTable";
import {
  AccountingVendor,
  useAccountingVendors,
} from "@/lib/hooks/usePaymentAccounts";

const emptyForm = {
  name: "",
  forHardwarePurchases: true,
  forFarmTariffs: false,
};

export default function VendorsPage() {
  const { data = [], isLoading, error } = useAccountingVendors();
  const editor = useRecordEditor<AccountingVendor>("vendors");
  const [form, setForm] = useState(emptyForm);

  const openForm = (vendor: AccountingVendor | "new") => {
    setForm(
      vendor === "new"
        ? emptyForm
        : {
            name: vendor.name,
            forHardwarePurchases: vendor.forHardwarePurchases,
            forFarmTariffs: vendor.forFarmTariffs,
          },
    );
    editor.setEditing(vendor);
  };

  const hasType = form.forHardwarePurchases || form.forFarmTariffs;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: "bold" }}>
          Vendors
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          The vendors on Hardware Purchase and Farm Tariff invoices. Each form
          lists only active vendors tagged for it; inactive or untagged vendors
          stay on their existing invoices.
        </Typography>
      </Box>
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => openForm("new")}
          >
            Add vendor
          </Button>
        </Stack>
        {editor.pageError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {editor.pageError}
          </Alert>
        )}
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Used for</TableCell>
                <TableCell align="right">Hardware Purchases</TableCell>
                <TableCell align="right">Farm Tariffs</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableState
                loading={isLoading}
                error={error}
                empty={data.length === 0}
                colSpan={6}
              />
              {data.map((vendor) => (
                <TableRow
                  key={vendor.id}
                  sx={vendor.isActive ? undefined : inactiveRowSx}
                >
                  <TableCell>{vendor.name}</TableCell>
                  <TableCell>
                    <Stack
                      direction="row"
                      spacing={0.5}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      {vendor.forHardwarePurchases && (
                        <Chip label="Hardware Purchases" size="small" />
                      )}
                      {vendor.forFarmTariffs && (
                        <Chip label="Farm Tariffs" size="small" />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    {vendor._count.hardwarePurchases}
                  </TableCell>
                  <TableCell align="right">
                    {vendor._count.vendorInvoices}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={vendor.isActive ? "Active" : "Inactive"}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <RowActions
                      isActive={vendor.isActive}
                      busy={editor.busy}
                      onEdit={() => openForm(vendor)}
                      onToggle={() => editor.toggle(vendor)}
                      onDelete={() => editor.setDeleting(vendor)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <FormDialog
        open={editor.editing !== null}
        title={editor.editing === "new" ? "Add vendor" : "Edit vendor"}
        error={editor.error}
        busy={editor.busy}
        canSave={form.name.trim().length > 0 && hasType}
        onCancel={editor.close}
        onSave={() => editor.save(form)}
      >
        <TextField
          label="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          autoFocus
          fullWidth
        />
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Used for
          </Typography>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.forHardwarePurchases}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      forHardwarePurchases: e.target.checked,
                    }))
                  }
                />
              }
              label="Hardware Purchases"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.forFarmTariffs}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, forFarmTariffs: e.target.checked }))
                  }
                />
              }
              label="Farm Tariffs"
            />
          </FormGroup>
          <FormHelperText error={!hasType}>Choose at least one</FormHelperText>
        </Box>
      </FormDialog>
      <ConfirmDeleteDialog
        open={editor.deleting !== null}
        label={editor.deleting?.name ?? ""}
        error={editor.error}
        busy={editor.busy}
        onCancel={editor.close}
        onConfirm={editor.remove}
      />
    </Container>
  );
}
