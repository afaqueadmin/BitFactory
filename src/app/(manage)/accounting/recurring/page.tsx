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

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedIds(recurringInvoices.map((inv) => inv.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
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
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Box>
          <h1 style={{ margin: 0 }}>Recurring Invoices</h1>
          <p style={{ margin: "8px 0 0 0", color: "#666" }}>
            Manage recurring invoice templates and schedules
          </p>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />}>
          Create Template
        </Button>
      </Stack>

      <Paper sx={{ mb: 3, p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          {selectedIds.length > 0 && (
            <>
              <span>{selectedIds.length} selected</span>
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DeleteIcon />}
              >
                Delete Selected
              </Button>
            </>
          )}
        </Stack>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={
                    selectedIds.length > 0 &&
                    selectedIds.length < recurringInvoices.length
                  }
                  checked={selectedIds.length === recurringInvoices.length}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Template Name</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Customer</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Amount</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Frequency</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Next Invoice</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recurringInvoices.map((recurring) => (
              <TableRow key={recurring.id} hover>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedIds.includes(recurring.id)}
                    onChange={() => handleSelectRow(recurring.id)}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>
                  {recurring.name}
                </TableCell>
                <TableCell>{recurring.customerName}</TableCell>
                <TableCell>
                  <CurrencyDisplay value={recurring.amount} />
                </TableCell>
                <TableCell>{recurring.frequency}</TableCell>
                <TableCell>
                  <StatusBadge status={recurring.status} />
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
    </Container>
  );
}
