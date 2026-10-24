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
  TablePagination,
  TextField,
  Alert,
} from "@mui/material";
import { useState, useMemo } from "react";
import Link from "next/link";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useCustomerStatements } from "@/lib/hooks/useStatements";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { useDaylight } from "@/lib/daylight";
import {
  DaylightAdminPage,
  DaylightLoading,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

export default function StatementsPage() {
  const { d } = useDaylight();
  const ds = useDaylightAdminSx();
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
      <Box>
        <Typography component="h1" sx={ds.pageTitleSx}>
          Customer Statements
        </Typography>
        <Typography sx={ds.pageDescSx}>
          View customer statements and payment history
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ ...ds.cardSx, ...ds.inputSx, mb: 3, mt: 3 }}>
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

      <TableContainer component={Paper} elevation={0} sx={ds.listCardSx}>
        <Table>
          <TableHead>
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
                          customer.totalOutstanding > 0 ? d.danger : d.success,
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
                        sx={ds.outlineBtnSx}
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
            rowsPerPageOptions={[5, 10, 25, 50, { value: 9999, label: "Max" }]}
            component="div"
            count={total}
            rowsPerPage={pageSize}
            page={page - 1}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            sx={ds.paginationSx}
          />
        )}
      </TableContainer>
    </DaylightAdminPage>
  );
}
