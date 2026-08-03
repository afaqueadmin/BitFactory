"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Container,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Button,
} from "@mui/material";
import { formatValue } from "@/lib/helpers/formatValue";

interface PayoutBatch {
  id: string;
  franchise: { id: string; businessName: string };
  createdByUser: { name: string | null; email: string };
  periodFrom: string | null;
  periodTo: string | null;
  totalAmount: string;
  entryCount: number;
  paidDate: string;
  notes: string | null;
}

export default function IncentivePayoutsPage() {
  const router = useRouter();

  const { data, isLoading, error } = useQuery<{ payouts: PayoutBatch[] }>({
    queryKey: ["incentivePayouts"],
    queryFn: async () => {
      const res = await fetch("/api/incentives/payouts");
      if (!res.ok) throw new Error("Failed to fetch incentive payouts");
      return res.json();
    },
  });

  const payouts = data?.payouts ?? [];
  const totalPaidOut = payouts.reduce(
    (sum, p) => sum + Number(p.totalAmount),
    0,
  );

  return (
    <Box
      component="main"
      sx={{ py: 4, backgroundColor: "background.default", minHeight: "100vh" }}
    >
      <Container maxWidth="xl">
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 4,
          }}
        >
          <Box>
            <Typography variant="h3" component="h1" sx={{ fontWeight: "bold" }}>
              Incentive Payouts
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              All franchisee incentive payout batches across the company
            </Typography>
          </Box>
          <Button
            variant="outlined"
            onClick={() => router.push("/franchisees")}
          >
            Go to Franchisees
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error instanceof Error ? error.message : "An error occurred"}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Paper sx={{ p: 3, mb: 4, maxWidth: 320 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Total Paid Out (all franchisees)
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {formatValue(totalPaidOut, "currency")}
              </Typography>
            </Paper>

            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: "background.default" }}>
                    <TableCell sx={{ fontWeight: "bold" }}>Franchise</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Paid Date</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Period</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }} align="right">
                      Entries
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }} align="right">
                      Amount
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>
                      Created By
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payouts.map((batch) => (
                    <TableRow
                      key={batch.id}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() =>
                        router.push(
                          `/franchisees/${batch.franchise.id}/incentives`,
                        )
                      }
                    >
                      <TableCell>{batch.franchise.businessName}</TableCell>
                      <TableCell>
                        {new Date(batch.paidDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {batch.periodFrom && batch.periodTo
                          ? `${new Date(batch.periodFrom).toLocaleDateString()} – ${new Date(
                              batch.periodTo,
                            ).toLocaleDateString()}`
                          : "—"}
                      </TableCell>
                      <TableCell align="right">{batch.entryCount}</TableCell>
                      <TableCell align="right">
                        {formatValue(Number(batch.totalAmount), "currency")}
                      </TableCell>
                      <TableCell>
                        {batch.createdByUser.name || batch.createdByUser.email}
                      </TableCell>
                      <TableCell>{batch.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {payouts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ py: 3 }}
                        >
                          No payouts recorded yet.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Container>
    </Box>
  );
}
