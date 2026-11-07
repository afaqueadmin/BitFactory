"use client";

import {
  Alert,
  Autocomplete,
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CallMadeIcon from "@mui/icons-material/CallMade";
import CallReceivedIcon from "@mui/icons-material/CallReceived";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import HistoryIcon from "@mui/icons-material/History";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import StatCard from "@/components/daylight/StatCard";
import {
  AccountingBank,
  BankStatementRow,
  useAccountingBanks,
  useBankStatement,
} from "@/lib/hooks/usePaymentAccounts";
import {
  CURRENCY_FORMAT_OPTIONS,
  CURRENCY_LOCALE,
} from "@/lib/constants/accounting";
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
 *
 * The date range lives in the URL (?from=&to=), so it survives a refresh
 * and switching to another bank with the picker.
 */

const COLUMN_COUNT = 9;
const BANKS_HREF = "/accounting/payment-accounts";

const money = new Intl.NumberFormat(CURRENCY_LOCALE, CURRENCY_FORMAT_OPTIONS);
const formatUsd = (value: string | number | undefined) =>
  money.format(Number(value ?? 0));

const isDay = (v: string | null): v is string =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Local yyyy-mm-dd. */
const day = (date: Date) => date.toLocaleDateString("en-CA");

/** "Nov 1, 2026" for a yyyy-mm-dd day. */
const dayLabel = (v: string) =>
  new Date(`${v}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

type Preset = "all" | "thisMonth" | "lastMonth" | "last3" | "thisYear";

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "thisMonth":
      return { from: day(new Date(y, m, 1)), to: day(now) };
    case "lastMonth":
      return { from: day(new Date(y, m - 1, 1)), to: day(new Date(y, m, 0)) };
    case "last3":
      return { from: day(new Date(y, m - 2, 1)), to: day(now) };
    case "thisYear":
      return { from: day(new Date(y, 0, 1)), to: day(now) };
    default:
      return { from: "", to: "" };
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "last3", label: "Last 3 months" },
  { key: "thisYear", label: "This year" },
];

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
      <TableCell sx={sx} colSpan={6}>
        {label}
      </TableCell>
      <TableCell
        align="right"
        sx={{
          ...sx,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          color: Number(value) < 0 ? d.danger : undefined,
        }}
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
  const debit = row.side === "DEBIT";
  return (
    <TableRow hover>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <DateDisplay date={row.date} />
      </TableCell>
      <TableCell>
        {row.invoices.length === 0 ? (
          <Box component="span" sx={{ color: d.muted }}>
            —
          </Box>
        ) : (
          <Stack spacing={0.25}>
            {row.invoices.map((inv) => (
              <Link key={inv.href} href={inv.href} style={link}>
                {inv.number}
              </Link>
            ))}
          </Stack>
        )}
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>{row.invoiceType}</TableCell>
      <TableCell sx={{ minWidth: 140 }}>
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
          <Box component="span" sx={{ color: d.muted }}>
            —
          </Box>
        )}
      </TableCell>
      <TableCell>
        <DaylightStatusPill
          label={debit ? "Debit" : "Credit"}
          tone={debit ? "success" : "danger"}
        />
      </TableCell>
      <TableCell align="right" sx={num}>
        <Box
          sx={{ fontWeight: 650, color: debit ? d.success : d.danger }}
          component="span"
        >
          {debit ? "+" : "−"}
          <CurrencyDisplay value={row.amountUsd} />
        </Box>
        {row.original && (
          <Box sx={{ fontSize: 11.5, color: d.muted, mt: 0.25 }}>
            {row.original}
          </Box>
        )}
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
        <Stack spacing={0.5} alignItems="flex-start">
          {row.partial && <DaylightStatusPill label="Partial" tone="warning" />}
          {row.note && (
            <Typography
              variant="caption"
              sx={{ color: d.text, lineHeight: 1.45 }}
            >
              {row.note}
            </Typography>
          )}
          {row.receiptHref && (
            <MuiLink
              href={row.receiptHref}
              target="_blank"
              rel="noopener noreferrer"
              variant="caption"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                color: d.action,
                fontWeight: 600,
              }}
            >
              <PictureAsPdfIcon sx={{ fontSize: 14 }} /> Receipt
            </MuiLink>
          )}
          {!row.note && !row.receiptHref && !row.partial && (
            <Box component="span" sx={{ color: d.muted }}>
              —
            </Box>
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );
}

/** Switch to another bank's statement, keeping the date range. */
function BankPicker({
  banks,
  current,
  onChange,
}: {
  banks: AccountingBank[];
  current: AccountingBank;
  onChange: (bank: AccountingBank) => void;
}) {
  const ds = useDaylightAdminSx();
  const { d } = useDaylight();
  const options = useMemo(
    () =>
      [...banks].sort(
        (a, b) =>
          a.entity.name.localeCompare(b.entity.name) ||
          Number(b.isActive) - Number(a.isActive) ||
          a.name.localeCompare(b.name),
      ),
    [banks],
  );
  return (
    <Autocomplete<AccountingBank, false, true>
      size="small"
      disableClearable
      options={options}
      value={current}
      groupBy={(b) => b.entity.name}
      getOptionLabel={(b) => b.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, bank) => bank && bank.id !== current.id && onChange(bank)}
      renderOption={({ key, ...props }, b) => (
        <Box
          component="li"
          key={key}
          {...props}
          sx={{
            display: "flex",
            justifyContent: "space-between",
            gap: 2,
            fontSize: 13,
          }}
        >
          <Box
            component="span"
            sx={{ color: b.isActive ? d.text : d.muted, minWidth: 0 }}
          >
            {b.name}
            {!b.isActive && " (inactive)"}
          </Box>
          <Box
            component="span"
            sx={{
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              color: Number(b.balanceUsd ?? 0) < 0 ? d.danger : d.muted,
            }}
          >
            {formatUsd(b.balanceUsd)}
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Bank"
          placeholder="Switch bank"
          sx={ds.inputSx}
        />
      )}
      sx={{ width: { xs: "100%", sm: 320 } }}
    />
  );
}

export default function BankStatementPage() {
  return (
    <Suspense fallback={<DaylightLoading />}>
      <BankStatementContent />
    </Suspense>
  );
}

function BankStatementContent() {
  const ds = useDaylightAdminSx();
  const { d } = useDaylight();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const bankId = typeof params.id === "string" ? params.id : "";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = isDay(fromParam) ? fromParam : "";
  const to = isDay(toParam) ? toParam : "";
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: banks = [] } = useAccountingBanks();
  const rangeError = !!(from && to && from > to);
  const { data, isLoading, error } = useBankStatement(
    bankId,
    rangeError ? "" : from,
    rangeError ? "" : to,
  );
  const hasRange = !!(from || to) && !rangeError;

  const rangeQuery = (f: string, t: string) => {
    const q = new URLSearchParams();
    if (f) q.set("from", f);
    if (t) q.set("to", t);
    const s = q.toString();
    return s ? `?${s}` : "";
  };
  const setRange = (f: string, t: string) =>
    router.replace(
      `/accounting/payment-accounts/banks/${bankId}${rangeQuery(f, t)}`,
      { scroll: false },
    );
  const switchBank = (bank: AccountingBank) =>
    router.push(
      `/accounting/payment-accounts/banks/${bank.id}${rangeQuery(from, to)}`,
      { scroll: false },
    );

  const activePreset =
    PRESETS.find((p) => {
      const r = presetRange(p.key);
      return r.from === from && r.to === to;
    })?.key ?? null;

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
  const debitCount = rows.filter((r) => r.side === "DEBIT").length;
  const creditCount = rows.length - debitCount;
  const currentBank = banks.find((b) => b.id === bankId) ?? null;
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <DaylightAdminPage>
      <Button
        component={Link}
        href={BANKS_HREF}
        startIcon={<ArrowBackIcon />}
        sx={{ ...ds.textBtnSx("action"), mb: 1, px: 0 }}
      >
        Banks
      </Button>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: { xs: "stretch", md: "flex-end" },
          justifyContent: "space-between",
          gap: 2,
          mb: 3,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Typography component="h1" sx={{ ...ds.pageTitleSx, mb: 0 }}>
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
            sx={{ mt: 0.75 }}
          >
            <Typography sx={{ fontSize: 13, color: d.muted }}>
              Bank Statement
              {data && ` · ${data.bank.entity.name}`}
            </Typography>
            {data?.bank.currencies.map((code) => (
              <DaylightStatusPill key={code} label={code} tone="info" />
            ))}
          </Stack>
        </Box>
        {currentBank && (
          <BankPicker
            banks={banks}
            current={currentBank}
            onChange={switchBank}
          />
        )}
      </Box>

      <Paper elevation={0} sx={{ ...ds.listCardSx, p: { xs: 2, sm: 3 } }}>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", lg: "center" }}
          sx={{ mb: 2.5 }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            alignItems={{ xs: "stretch", md: "center" }}
            useFlexGap
            flexWrap="wrap"
          >
            <ToggleButtonGroup
              exclusive
              size="small"
              value={activePreset}
              onChange={(_, p: Preset | null) => {
                if (!p) return;
                const r = presetRange(p);
                setRange(r.from, r.to);
              }}
              sx={{ ...ds.toggleGroupSx, flexWrap: "wrap" }}
            >
              {PRESETS.map((p) => (
                <ToggleButton key={p.key} value={p.key}>
                  {p.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Stack direction="row" spacing={1.5} sx={ds.inputSx}>
              <TextField
                id="statement-from"
                label="From"
                type="date"
                size="small"
                value={from}
                onChange={(e) => setRange(e.target.value, to)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ flex: 1 }}
              />
              <TextField
                id="statement-to"
                label="To"
                type="date"
                size="small"
                value={to}
                onChange={(e) => setRange(from, e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ flex: 1 }}
              />
            </Stack>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<FileDownloadOutlinedIcon />}
              onClick={() => handleExport("csv")}
              disabled={!data || exporting !== null}
              sx={ds.outlineBtnSx}
            >
              {exporting === "csv" ? "Exporting..." : "CSV"}
            </Button>
            <Button
              variant="outlined"
              startIcon={<PictureAsPdfIcon />}
              onClick={() => handleExport("pdf")}
              disabled={!data || exporting !== null}
              sx={ds.outlineBtnSx}
            >
              {exporting === "pdf" ? "Exporting..." : "PDF"}
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
                gridTemplateColumns: {
                  xs: "repeat(2, minmax(0, 1fr))",
                  md: `repeat(${hasRange ? 4 : 3}, minmax(0, 1fr))`,
                },
                gap: { xs: "12px", md: "16px" },
                mb: 3,
              }}
            >
              {hasRange && (
                <StatCard
                  title="Opening balance"
                  value={formatUsd(data.openingBalanceUsd)}
                  caption={
                    from ? `Before ${dayLabel(from)}` : "Start of history"
                  }
                  tone="sky"
                  icon={<HistoryIcon />}
                  valueColor={
                    Number(data.openingBalanceUsd) < 0 ? d.danger : undefined
                  }
                />
              )}
              <StatCard
                title="Total Debit (received)"
                value={formatUsd(data.totals.debitUsd)}
                caption={plural(debitCount, "payment")}
                tone="mint"
                icon={<CallReceivedIcon />}
              />
              <StatCard
                title="Total Credit (sent)"
                value={formatUsd(data.totals.creditUsd)}
                caption={plural(creditCount, "payment")}
                tone="danger"
                icon={<CallMadeIcon />}
              />
              <StatCard
                title={hasRange ? "Closing balance" : "Balance"}
                value={formatUsd(data.closingBalanceUsd)}
                caption={
                  hasRange
                    ? to
                      ? `At end of ${dayLabel(to)}`
                      : "To date"
                    : "Debit − Credit, all time"
                }
                tone="amber"
                icon={<AccountBalanceIcon />}
                valueColor={
                  Number(data.closingBalanceUsd) < 0 ? d.danger : undefined
                }
              />
            </Box>

            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="baseline"
              flexWrap="wrap"
              useFlexGap
              spacing={1}
              sx={{ mb: 1 }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 650, color: d.text }}>
                {plural(rows.length, "transaction")}
                {hasRange && " in this period"}
              </Typography>
              <Typography sx={{ fontSize: 12, color: d.muted }}>
                Oldest first · USD at the rate saved with each payment
              </Typography>
            </Stack>

            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ overflowX: "auto", maxHeight: "70vh" }}
            >
              <Table
                size="small"
                stickyHeader
                sx={{
                  "& .MuiTableCell-stickyHeader": { bgcolor: d.tableHead },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Payment Date</TableCell>
                    <TableCell>Invoice #</TableCell>
                    <TableCell>Invoice Type</TableCell>
                    <TableCell>Vendor / Customer</TableCell>
                    <TableCell align="right">Invoice Amount (USD)</TableCell>
                    <TableCell>Credit/Debit</TableCell>
                    <TableCell align="right">Amount (USD)</TableCell>
                    <TableCell align="right">Balance (USD)</TableCell>
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
                        sx={{ py: 5 }}
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
