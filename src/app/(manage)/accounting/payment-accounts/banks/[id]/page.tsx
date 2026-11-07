"use client";

import {
  Alert,
  Box,
  Button,
  Link as MuiLink,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useState } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import {
  BankStatementRow,
  useBankStatement,
} from "@/lib/hooks/usePaymentAccounts";
import { downloadExport } from "@/lib/downloadExport";
import { useDaylight } from "@/lib/daylight";
import {
  DaylightAdminPage,
  DaylightLoading,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

/**
 * Bank Statement: every payment received into (Debit) or sent from (Credit)
 * one bank, oldest first, with a running balance. USD at the rate saved
 * with each payment. Opened from Entities, Banks & Currencies -> Banks.
 */

const COLUMN_COUNT = 10;

function SummaryCard({ label, value }: { label: string; value: string }) {
  const { d, fonts } = useDaylight();
  const ds = useDaylightAdminSx();
  return (
    <Paper
      elevation={0}
      sx={{ ...ds.cardSx, p: { xs: "14px 16px", sm: "16px 18px" } }}
    >
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: d.muted }}>
        {label}
      </Typography>
      <Typography
        sx={{
          mt: "6px",
          fontFamily: fonts.heading,
          fontWeight: 750,
          fontSize: 20,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color: Number(value) < 0 ? d.danger : d.text,
        }}
      >
        <CurrencyDisplay value={value} />
      </Typography>
    </Paper>
  );
}

function BalanceRow({
  label,
  date,
  value,
}: {
  label: string;
  date: string | null;
  value: string;
}) {
  const { d } = useDaylight();
  const sx = { fontWeight: 700, bgcolor: d.tableHead };
  return (
    <TableRow>
      <TableCell sx={{ ...sx, whiteSpace: "nowrap" }}>
        {date ? <DateDisplay date={date} /> : "—"}
      </TableCell>
      <TableCell sx={sx} colSpan={7}>
        {label}
      </TableCell>
      <TableCell
        align="right"
        sx={{ ...sx, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
      >
        <CurrencyDisplay value={value} />
      </TableCell>
      <TableCell sx={sx} />
    </TableRow>
  );
}

function StatementRow({ row }: { row: BankStatementRow }) {
  const { d } = useDaylight();
  const num = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const link = { color: d.action, textDecoration: "none", fontWeight: 650 };
  return (
    <TableRow hover>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <DateDisplay date={row.date} />
      </TableCell>
      <TableCell>
        {row.invoices.length === 0
          ? "—"
          : row.invoices.map((inv, i) => (
              <Fragment key={inv.href}>
                {i > 0 && ", "}
                <Link href={inv.href} style={link}>
                  {inv.number}
                </Link>
              </Fragment>
            ))}
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>{row.invoiceType}</TableCell>
      <TableCell>
        {row.counterparty.href ? (
          <Link href={row.counterparty.href} style={link}>
            {row.counterparty.name}
          </Link>
        ) : (
          row.counterparty.name
        )}
      </TableCell>
      <TableCell align="right" sx={num}>
        {row.invoiceAmountUsd !== null ? (
          <CurrencyDisplay value={row.invoiceAmountUsd} />
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        <DaylightStatusPill
          label={row.side === "DEBIT" ? "Debit" : "Credit"}
          tone={row.side === "DEBIT" ? "success" : "danger"}
        />
      </TableCell>
      <TableCell align="right" sx={num}>
        <Stack
          direction="row"
          spacing={0.75}
          justifyContent="flex-end"
          alignItems="center"
        >
          {row.partial && <DaylightStatusPill label="Partial" tone="warning" />}
          <Box
            component="span"
            sx={{ color: row.side === "DEBIT" ? d.success : d.danger }}
          >
            {row.side === "CREDIT" && "−"}
            <CurrencyDisplay value={row.amountUsd} />
          </Box>
        </Stack>
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap", color: d.muted }}>
        {row.original ?? "—"}
      </TableCell>
      <TableCell
        align="right"
        sx={{
          ...num,
          fontWeight: 600,
          color: Number(row.balanceUsd) < 0 ? d.danger : undefined,
        }}
      >
        <CurrencyDisplay value={row.balanceUsd} />
      </TableCell>
      <TableCell sx={{ minWidth: 220, maxWidth: 420 }}>
        <Stack spacing={0.25}>
          {row.note && (
            <Typography variant="caption" sx={{ color: d.text }}>
              {row.note}
            </Typography>
          )}
          {row.receiptHref && (
            <MuiLink
              href={row.receiptHref}
              target="_blank"
              rel="noopener noreferrer"
              variant="caption"
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
            >
              <PictureAsPdfIcon sx={{ fontSize: 14 }} /> Receipt
            </MuiLink>
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );
}

export default function BankStatementPage() {
  const ds = useDaylightAdminSx();
  const { d } = useDaylight();
  const params = useParams();
  const bankId = typeof params.id === "string" ? params.id : "";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const rangeError = from && to && from > to;
  const { data, isLoading, error } = useBankStatement(
    bankId,
    rangeError ? "" : from,
    rangeError ? "" : to,
  );
  const hasRange = !!(from || to) && !rangeError;

  const handleExport = async (format: "csv" | "pdf") => {
    try {
      setExporting(format);
      setExportError(null);
      const query = new URLSearchParams({
        format,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (from && !rangeError) query.set("from", from);
      if (to && !rangeError) query.set("to", to);
      const slug =
        data?.bank.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "bank";
      await downloadExport(
        `/api/accounting/banks/${bankId}/statement/export?${query.toString()}`,
        `bank-statement-${slug}-${new Date().toLocaleDateString("en-CA")}.${format}`,
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to download export",
      );
    } finally {
      setExporting(null);
    }
  };

  const rows = data?.rows ?? [];
  const first = rows[0]?.date ?? null;
  const last = rows.at(-1)?.date ?? null;

  return (
    <DaylightAdminPage>
      <Box sx={{ mb: 3 }}>
        <Button
          component={Link}
          href="/accounting/payment-accounts"
          startIcon={<ArrowBackIcon />}
          sx={{ ...ds.textBtnSx("action"), mb: 1, px: 0 }}
        >
          Entities, Banks &amp; Currencies
        </Button>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <Typography component="h1" sx={ds.pageTitleSx}>
            {data ? data.bank.name : "Bank Statement"}
          </Typography>
          {data && !data.bank.isActive && (
            <DaylightStatusPill label="Inactive" tone="neutral" />
          )}
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 0.5 }}
        >
          {data && (
            <Typography sx={{ ...ds.pageDescSx, mb: 0 }}>
              {data.bank.entity.name}
            </Typography>
          )}
          {data?.bank.currencies.map((code) => (
            <DaylightStatusPill key={code} label={code} tone="info" />
          ))}
        </Stack>
        <Typography sx={{ ...ds.pageDescSx, mt: 1 }}>
          Payments received into this bank (Debit) and sent from it (Credit),
          oldest first. Amounts are in USD at the rate saved with each payment.
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ ...ds.listCardSx, p: { xs: 2, sm: 3 } }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", md: "center" }}
          sx={{ mb: 2 }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            alignItems={{ xs: "stretch", sm: "center" }}
          >
            <TextField
              id="statement-from"
              label="From"
              type="date"
              size="small"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              id="statement-to"
              label="To"
              type="date"
              size="small"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            {(from || to) && (
              <Button
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                sx={ds.textBtnSx("action")}
              >
                Clear dates
              </Button>
            )}
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              onClick={() => handleExport("csv")}
              disabled={!data || exporting !== null}
              sx={ds.outlineBtnSx}
            >
              {exporting === "csv" ? "Exporting..." : "Export CSV"}
            </Button>
            <Button
              variant="outlined"
              onClick={() => handleExport("pdf")}
              disabled={!data || exporting !== null}
              sx={ds.outlineBtnSx}
            >
              {exporting === "pdf" ? "Exporting..." : "Export PDF"}
            </Button>
          </Stack>
        </Stack>

        {rangeError && (
          <Alert severity="warning" sx={{ mb: 2, ...ds.alertSx("warning") }}>
            The From date must be on or before the To date.
          </Alert>
        )}
        {exportError && (
          <Alert severity="error" sx={{ mb: 2, ...ds.alertSx("error") }}>
            {exportError}
          </Alert>
        )}

        {isLoading ? (
          <DaylightLoading />
        ) : error || !data ? (
          <Alert severity="error" sx={{ ...ds.alertSx("error") }}>
            {error?.message ?? "Failed to load the bank statement"}
          </Alert>
        ) : (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
                gap: { xs: "12px", md: "16px" },
                mb: 3,
              }}
            >
              <SummaryCard label="Total Debit" value={data.totals.debitUsd} />
              <SummaryCard label="Total Credit" value={data.totals.creditUsd} />
              <SummaryCard
                label={hasRange ? "Closing balance" : "Balance"}
                value={data.closingBalanceUsd}
              />
            </Box>

            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ overflowX: "auto" }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Payment Date</TableCell>
                    <TableCell>Invoice #</TableCell>
                    <TableCell>Invoice Type</TableCell>
                    <TableCell>Vendor / Customer</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      Invoice Amount (USD)
                    </TableCell>
                    <TableCell>Credit/Debit</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      Amount (USD)
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      Original Amount
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      Balance (USD)
                    </TableCell>
                    <TableCell>Notes / Receipt</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {hasRange && (
                    <BalanceRow
                      label="Opening balance"
                      date={from ? `${from}T12:00:00.000Z` : first}
                      value={data.openingBalanceUsd}
                    />
                  )}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={COLUMN_COUNT}
                        align="center"
                        sx={{ py: 4 }}
                      >
                        <Typography sx={{ color: d.muted, fontSize: 13 }}>
                          {hasRange
                            ? "No payments recorded to this bank in this period"
                            : "No payments recorded to this bank yet"}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((row) => (
                    <StatementRow key={row.id} row={row} />
                  ))}
                  {(rows.length > 0 || hasRange) && (
                    <BalanceRow
                      label="Closing balance"
                      date={to ? `${to}T12:00:00.000Z` : last}
                      value={data.closingBalanceUsd}
                    />
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Paper>
    </DaylightAdminPage>
  );
}
