"use client";

/**
 * Payout transactions in the "you've been paid" wallet snapshot PDF: every
 * debit (payments and their transaction fees) on the payout's UTC day, laid
 * out like the /transaction page. Transaction IDs link to mempool.space -
 * Chrome keeps the links clickable in the printed PDF.
 *
 * Reports `onLoaded` once the fetch has settled, success or not, so a
 * failure here never holds up the PDF.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";
import { DEFAULT_PAYOUT_CATEGORIES } from "@/lib/simulation/payouts";

interface SnapshotTransaction {
  pool: "Luxor" | "Braiins";
  date_time: string;
  subaccount_name: string;
  transaction_category: string;
  currency_amount: number;
  usd_equivalent: number;
  transaction_id: string;
  transaction_type: "credit" | "debit";
}

// Payout days are UTC calendar days (pool_transactions are dated 00:00 UTC).
const formatUtcDate = (value: string | Date): string =>
  new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const formatBtc = (btc: number) => `₿ ${btc.toFixed(8)}`;
const formatUsd = (usd: number) =>
  `$${usd.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const COLUMNS: { label: string; align?: "right" }[] = [
  { label: "Date" },
  { label: "Pool" },
  { label: "Subaccount" },
  { label: "Category" },
  { label: "Type" },
  { label: "Amount (BTC)", align: "right" },
  { label: "Amount (USD)", align: "right" },
  { label: "Transaction ID" },
];

export default function WalletSnapshotTransactions({
  customerId,
  payoutDate,
  onLoaded,
}: {
  customerId: string;
  /** The payout's UTC day, YYYY-MM-DD. */
  payoutDate: string;
  onLoaded: () => void;
}) {
  const { d, fonts } = useDaylight();
  const [transactions, setTransactions] = useState<
    SnapshotTransaction[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    const load = async () => {
      try {
        const params = new URLSearchParams({
          customerId,
          type: "debit",
          pool: "total",
          subaccounts: "all",
          export: "true",
          start_date: `${payoutDate}T00:00:00.000Z`,
          end_date: `${payoutDate}T23:59:59.999Z`,
        });
        const response = await fetch(`/api/wallet/transactions?${params}`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`Failed to load transactions (${response.status})`);
        }
        const json = await response.json();
        setTransactions(json.transactions ?? []);
      } catch (e) {
        console.error("[Wallet Snapshot] Transactions failed:", e);
        setError("Transactions could not be loaded for this snapshot.");
      } finally {
        onLoadedRef.current();
      }
    };
    load();
  }, [customerId, payoutDate]);

  const rows = transactions ?? [];
  // "Total paid" counts payments only (fees are listed but not added), so it
  // matches the payout amount stated in the email.
  const payments = rows.filter(
    (tx) => tx.transaction_category === DEFAULT_PAYOUT_CATEGORIES.payment,
  );
  const totalBtc = payments.reduce(
    (s, tx) => s + Math.abs(tx.currency_amount),
    0,
  );
  const totalUsd = payments.reduce(
    (s, tx) => s + Math.abs(tx.usd_equivalent),
    0,
  );

  const headCellSx = {
    fontFamily: fonts.body,
    fontWeight: 600,
    fontSize: 10,
    letterSpacing: ".015em",
    textTransform: "uppercase" as const,
    color: d.muted,
    borderBottomColor: d.border,
  };
  const cellSx = {
    fontFamily: fonts.body,
    fontSize: 12,
    color: d.text,
    borderBottomColor: d.border,
    py: 1.25,
  };

  return (
    <Box
      sx={{
        mt: "22px",
        borderRadius: RADIUS_CARD,
        bgcolor: d.surface,
        border: `1px solid ${d.border}`,
        boxShadow: d.shadow,
        overflow: "hidden",
      }}
    >
      <Box sx={{ p: "20px 24px 12px", breakAfter: "avoid" }}>
        <Typography
          component="h2"
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 750,
            fontSize: 18,
            letterSpacing: "-.035em",
            color: d.text,
          }}
        >
          Payout Transactions
        </Typography>
        <Typography sx={{ fontSize: 12, color: d.muted, mt: "4px" }}>
          Payments and transaction fees on {formatUtcDate(payoutDate)} (UTC).
          Click a transaction ID to view it on mempool.space.
        </Typography>
      </Box>

      {error ? (
        <Typography
          sx={{ px: "24px", pb: "20px", fontSize: 12, color: d.danger }}
        >
          {error}
        </Typography>
      ) : transactions && rows.length === 0 ? (
        <Typography
          sx={{ px: "24px", pb: "20px", fontSize: 12, color: d.muted }}
        >
          No payout transactions were recorded on this day.
        </Typography>
      ) : transactions ? (
        <Table size="small">
          <TableHead>
            <TableRow>
              {COLUMNS.map((col) => (
                <TableCell key={col.label} align={col.align} sx={headCellSx}>
                  {col.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((tx, idx) => (
              <TableRow key={`${tx.transaction_id}-${idx}`}>
                <TableCell sx={cellSx}>{formatUtcDate(tx.date_time)}</TableCell>
                <TableCell sx={cellSx}>
                  <Chip
                    label={tx.pool}
                    size="small"
                    sx={{
                      fontFamily: fonts.body,
                      fontWeight: 600,
                      fontSize: 10,
                      bgcolor: tx.pool === "Luxor" ? d.skySoft : d.amber,
                      color: tx.pool === "Luxor" ? d.action : d.warning,
                    }}
                  />
                </TableCell>
                <TableCell sx={cellSx}>{tx.subaccount_name || "—"}</TableCell>
                <TableCell sx={cellSx}>{tx.transaction_category}</TableCell>
                <TableCell sx={cellSx}>
                  <Chip
                    label={
                      tx.transaction_type === "credit" ? "+ Credit" : "- Debit"
                    }
                    size="small"
                    sx={{
                      fontFamily: fonts.body,
                      fontWeight: 600,
                      fontSize: 10,
                      bgcolor:
                        tx.transaction_type === "credit"
                          ? d.mint
                          : d.dangerSoft,
                      color:
                        tx.transaction_type === "credit" ? d.success : d.danger,
                    }}
                  />
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    ...cellSx,
                    fontWeight: 650,
                    fontVariantNumeric: "tabular-nums",
                    color:
                      tx.transaction_type === "credit" ? d.success : d.danger,
                  }}
                >
                  {formatBtc(Math.abs(tx.currency_amount))}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ ...cellSx, fontVariantNumeric: "tabular-nums" }}
                >
                  {formatUsd(Math.abs(tx.usd_equivalent))}
                </TableCell>
                <TableCell
                  sx={{ ...cellSx, fontSize: 11, fontFamily: "monospace" }}
                >
                  {tx.transaction_id ? (
                    <a
                      href={`https://mempool.space/tx/${tx.transaction_id}`}
                      style={{ textDecoration: "underline", color: d.action }}
                    >
                      {tx.transaction_id.length > 8
                        ? `${tx.transaction_id.substring(0, 8)}...`
                        : tx.transaction_id}
                    </a>
                  ) : (
                    <span style={{ color: d.muted }}>N/A</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ bgcolor: d.hover }}>
              <TableCell
                colSpan={5}
                sx={{ ...cellSx, fontWeight: 700, borderBottom: 0 }}
              >
                Total paid
              </TableCell>
              <TableCell
                align="right"
                sx={{
                  ...cellSx,
                  fontWeight: 750,
                  fontVariantNumeric: "tabular-nums",
                  borderBottom: 0,
                }}
              >
                {formatBtc(totalBtc)}
              </TableCell>
              <TableCell
                align="right"
                sx={{
                  ...cellSx,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  borderBottom: 0,
                }}
              >
                {formatUsd(totalUsd)}
              </TableCell>
              <TableCell sx={{ ...cellSx, borderBottom: 0 }} />
            </TableRow>
          </TableBody>
        </Table>
      ) : null}
    </Box>
  );
}
