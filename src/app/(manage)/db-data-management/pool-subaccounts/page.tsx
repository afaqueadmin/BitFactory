/**
 * src/app/(manage)/pool-subaccounts/page.tsx
 * Pool Subaccount Records Management Page
 *
 * Read-only admin view of the PoolSubaccount table - our own DB record of a
 * pool account (Luxor subaccount / Braiins account), distinct from the
 * existing "Subaccounts" page which manages live Luxor subaccounts via
 * Luxor's API. Data is populated by the pool sync cron; this page has no
 * add/edit/delete controls.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Container,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Chip,
} from "@mui/material";
import { Refresh as RefreshIcon } from "@mui/icons-material";

interface PoolSubaccount {
  id: string;
  poolId: string;
  subaccountName: string;
  userId: string | null;
  poolAuthId: string | null;
  currency: string;
  walletAddress: string | null;
  paymentFrequency: string | null;
  dayOfWeek: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pool: { id: string; name: string };
  user: { id: string; name: string | null; email: string } | null;
  _count: {
    dailySnapshots: number;
    workerMetrics: number;
    transactions: number;
  };
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export default function PoolSubaccountsPage() {
  const [rows, setRows] = useState<PoolSubaccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/pool-subaccounts");
      const data: ApiResponse<PoolSubaccount[]> = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch pool subaccounts");
      }
      setRows(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchAll();
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Subaccount Records
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Our own DB record of each pool account (Luxor subaccount / Braiins
            account) - the dimension row that daily snapshots, worker metrics
            and transactions attach to. View only.
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper elevation={2} sx={{ borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Pool</TableCell>
                <TableCell>Subaccount</TableCell>
                <TableCell>Client</TableCell>
                <TableCell>Currency</TableCell>
                <TableCell>Wallet</TableCell>
                <TableCell align="center">Snapshots</TableCell>
                <TableCell align="center">Worker Days</TableCell>
                <TableCell align="center">Txns</TableCell>
                <TableCell>Last Synced</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No pool subaccounts yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Chip label={row.pool.name} size="small" />
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 600, fontFamily: "monospace" }}
                    >
                      {row.subaccountName}
                    </TableCell>
                    <TableCell>
                      {row.user ? (
                        <>
                          {row.user.name || "Unnamed"}
                          <Typography
                            variant="caption"
                            display="block"
                            color="text.secondary"
                          >
                            {row.user.email}
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Unlinked
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{row.currency}</TableCell>
                    <TableCell
                      sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                    >
                      {row.walletAddress || "—"}
                    </TableCell>
                    <TableCell align="center">
                      {row._count.dailySnapshots}
                    </TableCell>
                    <TableCell align="center">
                      {row._count.workerMetrics}
                    </TableCell>
                    <TableCell align="center">
                      {row._count.transactions}
                    </TableCell>
                    <TableCell>
                      {row.lastSyncedAt
                        ? new Date(row.lastSyncedAt).toLocaleString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  );
}
