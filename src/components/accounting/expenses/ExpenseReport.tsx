"use client";

/**
 * Expenses -> Report: totals per head (rows) and month (columns). An
 * expense counts in the month of its date (Due, Paid, Balance); fees count
 * in the month they were paid. One measure at a time keeps it readable.
 */

import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { TableState } from "@/components/accounting/masterData/MasterDataTable";
import { useDaylight } from "@/lib/daylight";
import { useExpenseHeads } from "@/lib/hooks/usePaymentAccounts";
import { ExpenseReportCell, useExpenseReport } from "@/lib/hooks/useExpenses";

const MEASURES = [
  { key: "dueUsd", label: "Amount due" },
  { key: "paidUsd", label: "Paid" },
  { key: "balanceUsd", label: "Balance" },
  { key: "feesUsd", label: "Fees" },
] as const;
type Measure = (typeof MEASURES)[number]["key"];

const monthLabel = (ym: string) =>
  new Date(`${ym}-01T12:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export function ExpenseReport() {
  const { d } = useDaylight();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [headId, setHeadId] = useState("");
  const [measure, setMeasure] = useState<Measure>("dueUsd");
  const { data: heads = [] } = useExpenseHeads();
  const { data, isLoading, error } = useExpenseReport(from, to, headId);

  const months = data?.months ?? [];
  const rows = data?.rows ?? [];
  const value = (c: ExpenseReportCell | undefined) =>
    c && Number(c[measure]) !== 0 ? (
      <CurrencyDisplay value={c[measure]} />
    ) : (
      <Box component="span" sx={{ color: d.muted }}>
        —
      </Box>
    );
  const numSx = {
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  } as const;

  return (
    <>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ mb: 2 }}
        alignItems={{ md: "center" }}
        flexWrap="wrap"
        useFlexGap
      >
        <TextField
          label="From"
          type="date"
          size="small"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="To"
          type="date"
          size="small"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Head</InputLabel>
          <Select
            label="Head"
            value={headId}
            onChange={(e) => setHeadId(e.target.value)}
          >
            <MenuItem value="">All heads</MenuItem>
            {heads.map((h) => (
              <MenuItem key={h.id} value={h.id}>
                {h.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={measure}
          onChange={(_, v: Measure | null) => v && setMeasure(v)}
          sx={{ flexWrap: "wrap" }}
        >
          {MEASURES.map((m) => (
            <ToggleButton key={m.key} value={m.key}>
              {m.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Head</TableCell>
              {months.map((m) => (
                <TableCell key={m} align="right" sx={numSx}>
                  {monthLabel(m)}
                </TableCell>
              ))}
              <TableCell align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableState
              loading={isLoading}
              error={error}
              empty={rows.length === 0}
              colSpan={months.length + 2}
            />
            {rows.map((r) => (
              <TableRow key={r.head} hover>
                <TableCell>{r.head}</TableCell>
                {months.map((m) => (
                  <TableCell key={m} align="right" sx={numSx}>
                    {value(r.cells[m])}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ ...numSx, fontWeight: 650 }}>
                  {value(r.total)}
                </TableCell>
              </TableRow>
            ))}
            {rows.length > 1 && data && (
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                {months.map((m) => (
                  <TableCell
                    key={m}
                    align="right"
                    sx={{ ...numSx, fontWeight: 700 }}
                  >
                    {value(data.totals[m])}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ ...numSx, fontWeight: 700 }}>
                  {value(data.grandTotal)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography sx={{ mt: 1.5, fontSize: 12, color: d.muted }}>
        Amount due, Paid and Balance count in the month of the expense date.
        Fees count in the month they were paid. All in USD.
      </Typography>
    </>
  );
}
