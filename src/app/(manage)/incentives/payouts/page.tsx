"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Paper,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Button,
} from "@mui/material";
import { formatValue } from "@/lib/helpers/formatValue";
import { useDaylight } from "@/lib/daylight";
import AdminValueCard from "@/components/admin/AdminValueCard";
import {
  DaylightAdminPage,
  DaylightLoading,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

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
  const { d } = useDaylight();
  const ds = useDaylightAdminSx();
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
      <DaylightAdminPage>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 4,
          }}
        >
          <Box>
            <Typography component="h1" sx={ds.pageTitleSx}>
              Incentive Payouts
            </Typography>
            <Typography sx={ds.pageDescSx}>
              All franchisee incentive payout batches across the company
            </Typography>
          </Box>
          <Button
            variant="outlined"
            onClick={() => router.push("/franchisees")}
            sx={ds.outlineBtnSx}
          >
            Go to Franchisees
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3, ...ds.alertSx("error") }}>
            {error instanceof Error ? error.message : "An error occurred"}
          </Alert>
        )}

        {isLoading ? (
          <DaylightLoading />
        ) : (
          <>
            <Box sx={{ maxWidth: 320, mb: { xs: "20px", md: "24px" } }}>
              <AdminValueCard
                daylight
                title="Total Paid Out (all franchisees)"
                value={totalPaidOut}
                type="currency"
              />
            </Box>

            <TableContainer component={Paper} elevation={0} sx={ds.listCardSx}>
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
                          sx={{ py: 3, color: d.muted }}
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
      </DaylightAdminPage>
    </Box>
  );
}
