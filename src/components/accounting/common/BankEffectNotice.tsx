"use client";

/**
 * The warning an unpaid action shows before it runs: which bank statement
 * rows it removes (payments, the Bank Reconciliation entry, a consolidated
 * vendor payment), and that it is audit logged (decided 2026-11-19).
 */

import { Alert, Box, CircularProgress, Stack, Typography } from "@mui/material";
import { BankEffect } from "@/lib/hooks/useBankEffect";

const usd = (v: string) =>
  Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" });
const dmy = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
};

export function BankEffectNotice({
  effect,
  loading,
  error,
}: {
  effect?: BankEffect;
  loading: boolean;
  error?: Error | null;
}) {
  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ my: 1 }}>
        <CircularProgress size={16} />
        <Typography sx={{ fontSize: 13 }}>
          Checking the bank statements…
        </Typography>
      </Stack>
    );
  }
  if (error) {
    return (
      <Alert severity="error" sx={{ my: 1 }}>
        {error.message}
      </Alert>
    );
  }
  if (!effect) return null;

  return (
    <Stack spacing={1} sx={{ my: 1 }}>
      {effect.rows.length > 0 ? (
        <Alert severity="warning">
          <Typography sx={{ fontSize: 14, fontWeight: 650, mb: 0.5 }}>
            This also changes the bank statements. These rows will be removed:
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 13 }}>
            {effect.rows.map((r, i) => (
              <li key={i}>
                {r.label} · {r.bankName} ·{" "}
                {r.side === "DEBIT" ? "Debit" : "Credit"} {usd(r.amountUsd)}
                {r.date ? ` · ${dmy(r.date)}` : ""}
              </li>
            ))}
          </Box>
          {effect.reconciliation && (
            <Typography sx={{ fontSize: 13, mt: 0.5 }}>
              Bank Reconciliation entry {effect.reconciliation.entryLabel} will
              be deleted.
            </Typography>
          )}
          {effect.otherInvoices.length > 0 && (
            <Typography sx={{ fontSize: 13, mt: 0.5 }}>
              It also marks {effect.otherInvoices.join(", ")} as unpaid (same
              consolidated payment).
            </Typography>
          )}
        </Alert>
      ) : (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          No bank statement rows change.
        </Typography>
      )}
      <Typography sx={{ fontSize: 13, fontWeight: 650 }}>
        This action is audit logged.
      </Typography>
    </Stack>
  );
}
