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
  Checkbox,
} from "@mui/material";
import { useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { useMockRecurringInvoices } from "@/lib/mocks/useMockInvoices";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";

export default function RecurringInvoicesPage() {
  const { recurringInvoices, loading, error } = useMockRecurringInvoices();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
      <Box
        sx={{
          mb: 3,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>
          <h1 style={{ margin: 0 }}>Recurring Invoices</h1>
          <p style={{ margin: "8px 0 0 0", color: "#666" }}>
            Manage monthly billing templates
          </p>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />}>
          Create New
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
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
                  {recurring.customerName}
                </TableCell>
                <TableCell>
                  <CurrencyDisplay value={recurring.amount} />
                </TableCell>
                <TableCell>{recurring.dayOfMonth}th</TableCell>
                <TableCell>
                  <DateDisplay date={recurring.startDate} format="date" />
                </TableCell>
                <TableCell>
                  <DateDisplay date={recurring.nextInvoiceDate} format="date" />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditIcon />}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteIcon />}
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
            backgroundColor: "#e8f4f8",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{selectedIds.length} selected</span>
          <Button variant="contained" color="error" startIcon={<DeleteIcon />}>
            Delete Selected
          </Button>
        </Paper>
      )}
    </Container>
  );
}
