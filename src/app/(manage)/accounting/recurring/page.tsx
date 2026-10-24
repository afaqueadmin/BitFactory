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
  CircularProgress,
  Alert,
  Stack,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
} from "@mui/material";
import { useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { useRecurringInvoices } from "@/lib/hooks/useRecurringInvoices";
import { Customer, useCustomers } from "@/lib/hooks/useInvoices";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { useDaylight } from "@/lib/daylight";
import {
  DaylightAdminPage,
  DaylightLoading,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

export default function RecurringInvoicesPage() {
  const { d } = useDaylight();
  const ds = useDaylightAdminSx();
  const [page, setPage] = useState(1);
  const { recurringInvoices, loading, error } = useRecurringInvoices(page);
  // Fetch customers for dropdown
  const { customers, loading: customersLoading } = useCustomers({
    hostingOnly: true,
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    customerId: "",
    dayOfMonth: 1,
    unitPrice: 190,
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(recurringInvoices.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((rid) => rid !== id) : [...prev, id],
    );
  };

  const handleOpenDialog = () => {
    setFormData({
      customerId: "",
      dayOfMonth: 1,
      unitPrice: 190,
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
    });
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  // Handle changes to both customer dropdown and regular inputs
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue =
      name === "dayOfMonth" || name === "unitPrice"
        ? parseFloat(value) || 0
        : value;

    setFormData({
      ...formData,
      [name]: numValue,
    });
  };

  // Handle customer selection from dropdown
  const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setFormData((prev) => ({
      ...prev,
      customerId: value,
    }));
  };

  const handleSubmit = async () => {
    try {
      if (!formData.customerId) {
        alert("Customer is required");
        return;
      }
      if (formData.dayOfMonth < 1 || formData.dayOfMonth > 31) {
        alert("Day of month must be between 1 and 31");
        return;
      }

      const response = await fetch("/api/accounting/recurring-invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: formData.customerId,
          dayOfMonth: formData.dayOfMonth,
          unitPrice: formData.unitPrice || null,
          startDate: formData.startDate,
          endDate: formData.endDate || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create recurring invoice");
      }

      setOpenDialog(false);
      window.location.reload(); // Refresh to show new data
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Error creating recurring invoice",
      );
    }
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
      <Box
        sx={{
          mb: 3,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>
          <Typography component="h1" sx={ds.pageTitleSx}>
            Customer Recurring Invoices
          </Typography>
          <Typography sx={ds.pageDescSx}>
            Manage monthly billing templates
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenDialog}
          sx={ds.primaryBtnSx}
        >
          Create New
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={ds.listCardSx}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 50 }}>
                <Checkbox
                  checked={
                    selectedIds.length === recurringInvoices.length &&
                    recurringInvoices.length > 0
                  }
                  indeterminate={
                    selectedIds.length > 0 &&
                    selectedIds.length < recurringInvoices.length
                  }
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Customer</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                Monthly Amount (USD)
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Day of Month</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Start Date</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Next Invoice</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recurringInvoices.map((recurring) => (
              <TableRow
                key={recurring.id}
                hover
                selected={selectedIds.includes(recurring.id)}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.includes(recurring.id)}
                    onChange={() => handleSelectRow(recurring.id)}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>
                  {recurring.user?.name ||
                    `Customer ${recurring.userId.slice(0, 8)}`}
                </TableCell>
                <TableCell>
                  <CurrencyDisplay value={recurring.unitPrice || 0} />
                </TableCell>
                <TableCell>{recurring.dayOfMonth}th</TableCell>
                <TableCell>
                  <DateDisplay date={recurring.startDate} format="date" />
                </TableCell>
                <TableCell>
                  <DateDisplay
                    date={recurring.lastGeneratedDate || recurring.startDate}
                    format="date"
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditIcon />}
                      sx={ds.outlineBtnSx}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<DeleteIcon />}
                      sx={ds.dangerOutlineBtnSx}
                    >
                      Delete
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {selectedIds.length > 0 && (
        <Paper
          sx={{
            mt: 3,
            p: 2,
            backgroundColor: d.skySoft,
            border: `1px solid ${d.borderSky}`,
            borderRadius: "12px",
            boxShadow: "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{selectedIds.length} selected</span>
          <Button
            variant="contained"
            startIcon={<DeleteIcon />}
            sx={ds.dangerBtnSx}
          >
            Delete Selected
          </Button>
        </Paper>
      )}

      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Recurring Invoice</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={2}>
            {/* Customer dropdown - replaces text input for customer ID */}
            <TextField
              select
              label="Select Customer"
              name="customerId"
              value={formData.customerId}
              onChange={handleCustomerChange}
              fullWidth
              helperText="Select a customer with their subaccount (shown as: Name (Subaccount))"
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
            {customersLoading && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CircularProgress size={20} />
                <span>Loading customers...</span>
              </Box>
            )}

            <TextField
              label="Day of Month (1-31)"
              type="number"
              value={formData.dayOfMonth}
              onChange={handleInputChange}
              name="dayOfMonth"
              inputProps={{ min: 1, max: 31 }}
              fullWidth
              required
            />
            <TextField
              label="Unit Price (USD)"
              type="number"
              value={formData.unitPrice}
              onChange={handleInputChange}
              name="unitPrice"
              inputProps={{ step: "0.01" }}
              fullWidth
            />
            <TextField
              label="Start Date"
              type="date"
              value={formData.startDate}
              onChange={handleInputChange}
              name="startDate"
              InputLabelProps={{ shrink: true }}
              fullWidth
              required
            />
            <TextField
              label="End Date (Optional)"
              type="date"
              value={formData.endDate}
              onChange={handleInputChange}
              name="endDate"
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} sx={ds.textBtnSx()}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            sx={ds.primaryBtnSx}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </DaylightAdminPage>
  );
}
