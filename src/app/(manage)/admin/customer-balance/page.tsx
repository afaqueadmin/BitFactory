"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  Divider,
  Alert,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useCustomerBalanceDetail } from "@/lib/hooks/admin/useCustomerBalanceDetail";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import CostPaymentTransactionsTable from "@/components/admin/CostPaymentTransactionsTable";

export default function CustomerBalanceDetailPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const { summary, transactions, pagination, loading, error } =
    useCustomerBalanceDetail(page, pageSize);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        variant="text"
        onClick={() => router.push("/adminpanel")}
        sx={{ mb: 2 }}
      >
        Back to Dashboard
      </Button>

      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
        Total Customer Balance
      </Typography>
      <Typography color="textSecondary" sx={{ mb: 3 }}>
        All-time net sum of CostPayment rows (every type except HARDWARE_SALES)
        — a net ledger balance, not a revenue figure, so no sign flip is
        applied.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Calculation
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
              gap: 2,
            }}
          >
            <Box>
              <Typography color="textSecondary" variant="body2">
                Payments (all-time, positive)
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={summary?.sumPayment ?? 0} />
              </Typography>
            </Box>
            <Box>
              <Typography color="textSecondary" variant="body2">
                Electricity Charges (all-time, negative)
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={summary?.sumElectricityCharges ?? 0} />
              </Typography>
            </Box>
            <Box>
              <Typography color="textSecondary" variant="body2">
                Adjustments (all-time, either sign)
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={summary?.sumAdjustment ?? 0} />
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box>
            <Typography color="textSecondary" variant="body2">
              Displayed on dashboard card (sum of the three buckets above)
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              <CurrencyDisplay value={summary?.displayTotal ?? 0} />
            </Typography>
          </Box>

          <Typography
            variant="caption"
            color="textSecondary"
            sx={{ mt: 2, display: "block" }}
          >
            No date filter — this total covers every CostPayment row ever
            created (HARDWARE_SALES rows excluded).
          </Typography>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mb: 2 }}>
        Transactions ({pagination?.totalCount ?? 0})
      </Typography>
      <CostPaymentTransactionsTable
        transactions={transactions}
        loading={loading}
        page={page}
        pageSize={pageSize}
        totalCount={pagination?.totalCount ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(0);
        }}
      />
    </Container>
  );
}
