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
  TablePagination,
  TextField,
  CircularProgress,
  Alert,
} from "@mui/material";
import { useState, useMemo } from "react";
import Link from "next/link";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useCustomerStatements } from "@/lib/hooks/useStatements";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";

export default function StatementsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");

  const { customers, total, loading, error } = useCustomerStatements(
    page,
    pageSize,
  );

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;

    const lowerSearch = searchTerm.toLowerCase();
    return customers.filter(
      (customer) =>
        (customer.customerName?.toLowerCase() || "").includes(lowerSearch) ||
        customer.customerEmail.toLowerCase().includes(lowerSearch) ||
        (customer.companyName?.toLowerCase() || "").includes(lowerSearch),
    );
  }, [customers, searchTerm]);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage + 1);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setPageSize(parseInt(event.target.value, 10));
    setPage(1);
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
      <Box>
        <h1 style={{ margin: 0 }}>Customer Statements</h1>
        <p style={{ margin: "8px 0 0 0", color: "#666" }}>
          View customer statements and payment history
        </p>
      </Box>

      <Paper sx={{ mb: 3, p: 2, mt: 3 }}>
        <TextField
          label="Search by name, email, or company"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
          variant="outlined"
          size="small"
          fullWidth
          placeholder="Search customers..."
        />
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold" }}>Customer Name</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Email</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Company</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Total Invoiced</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Total Paid</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Outstanding</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Last Payment</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.customerId} hover>
                  <TableCell>
                    {customer.customerName || "Unnamed Customer"}
                  </TableCell>
                  <TableCell>{customer.customerEmail}</TableCell>
                  <TableCell>{customer.companyName || "-"}</TableCell>
                  <TableCell>
                    <CurrencyDisplay value={customer.totalAmount} />
                  </TableCell>
                  <TableCell>
                    <CurrencyDisplay value={customer.totalPaid} />
                  </TableCell>
                  <TableCell>
                    <Box
                      sx={{
                        color:
                          customer.totalOutstanding > 0 ? "#d32f2f" : "#388e3c",
                        fontWeight: "500",
                      }}
                    >
                      <CurrencyDisplay value={customer.totalOutstanding} />
                    </Box>
                  </TableCell>
                  <TableCell>
                    {customer.lastPaymentDate ? (
                      <DateDisplay
                        date={customer.lastPaymentDate}
                        format="date"
                      />
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/accounting/statements/${customer.customerId}`}
                    >
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<VisibilityIcon />}
                      >
                        View
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                  No customers found matching your search
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {filteredCustomers.length > 0 && (
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={total}
            rowsPerPage={pageSize}
            page={page - 1}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        )}
      </TableContainer>
    </Container>
  );
}
