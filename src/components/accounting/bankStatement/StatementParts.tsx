"use client";

/**
 * Pieces shared by the single-bank statement
 * (/accounting/payment-accounts/banks/[id]) and the consolidated one
 * (/accounting/payment-accounts/statement): date range controls, export
 * buttons, summary cards, the statement table and the bank picker.
 */

import {
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
import CallMadeIcon from "@mui/icons-material/CallMade";
import CallReceivedIcon from "@mui/icons-material/CallReceived";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import HistoryIcon from "@mui/icons-material/History";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import Link from "next/link";
import { useMemo } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import {
  SortHeader,
  SortValue,
  sortRows,
  useTableSort,
} from "@/components/accounting/common/SortableHeader";
import StatCard from "@/components/daylight/StatCard";
import {
  AccountingBank,
  BankStatementRow,
} from "@/lib/hooks/usePaymentAccounts";
import {
  CURRENCY_FORMAT_OPTIONS,
  CURRENCY_LOCALE,
} from "@/lib/constants/accounting";
import { useDaylight } from "@/lib/daylight";
import {
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

export const BANKS_HREF = "/accounting/payment-accounts";
export const CONSOLIDATED_HREF = "/accounting/payment-accounts/statement";
export const bankStatementHref = (bankId: string) =>
  `/accounting/payment-accounts/banks/${bankId}`;

const money = new Intl.NumberFormat(CURRENCY_LOCALE, CURRENCY_FORMAT_OPTIONS);
export const formatUsd = (value: string | number | undefined) =>
  money.format(Number(value ?? 0));

export const isDay = (v: string | null): v is string =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Local yyyy-mm-dd. */
const day = (date: Date) => date.toLocaleDateString("en-CA");

/** "Nov 1, 2026" for a yyyy-mm-dd day. */
export const dayLabel = (v: string) =>
  new Date(`${v}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const plural = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

/** "?from=&to=" (only the set ones), or "". */
export function rangeQuery(from: string, to: string, extra?: URLSearchParams) {
  const q = new URLSearchParams(extra);
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const s = q.toString();
  return s ? `?${s}` : "";
}

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

/** Quick ranges plus From / To days. */
export function RangeControls({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const ds = useDaylightAdminSx();
  const active =
    PRESETS.find((p) => {
      const r = presetRange(p.key);
      return r.from === from && r.to === to;
    })?.key ?? null;
  return (
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
        value={active}
        onChange={(_, p: Preset | null) => {
          if (!p) return;
          const r = presetRange(p);
          onChange(r.from, r.to);
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
          onChange={(e) => onChange(e.target.value, to)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ flex: 1 }}
        />
        <TextField
          id="statement-to"
          label="To"
          type="date"
          size="small"
          value={to}
          onChange={(e) => onChange(from, e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ flex: 1 }}
        />
      </Stack>
    </Stack>
  );
}

export function ExportButtons({
  disabled,
  exporting,
  onExport,
}: {
  disabled: boolean;
  exporting: "csv" | "pdf" | null;
  onExport: (format: "csv" | "pdf") => void;
}) {
  const ds = useDaylightAdminSx();
  return (
    <Stack direction="row" spacing={1}>
      <Button
        variant="outlined"
        startIcon={<FileDownloadOutlinedIcon />}
        onClick={() => onExport("csv")}
        disabled={disabled || exporting !== null}
        sx={ds.outlineBtnSx}
      >
        {exporting === "csv" ? "Exporting..." : "CSV"}
      </Button>
      <Button
        variant="outlined"
        startIcon={<PictureAsPdfIcon />}
        onClick={() => onExport("pdf")}
        disabled={disabled || exporting !== null}
        sx={ds.outlineBtnSx}
      >
        {exporting === "pdf" ? "Exporting..." : "PDF"}
      </Button>
    </Stack>
  );
}

interface Figures {
  openingBalanceUsd: string;
  totals: { debitUsd: string; creditUsd: string };
  closingBalanceUsd: string;
  rows: BankStatementRow[];
}

/** Opening (with a range), Total Debit, Total Credit, Balance / Closing. */
export function StatementCards({
  data,
  hasRange,
  from,
  to,
}: {
  data: Figures;
  hasRange: boolean;
  from: string;
  to: string;
}) {
  const { d } = useDaylight();
  const debitCount = data.rows.filter((r) => r.side === "DEBIT").length;
  const creditCount = data.rows.length - debitCount;
  return (
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
          caption={from ? `Before ${dayLabel(from)}` : "Start of history"}
          tone="sky"
          icon={<HistoryIcon />}
          valueColor={Number(data.openingBalanceUsd) < 0 ? d.danger : undefined}
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
        valueColor={Number(data.closingBalanceUsd) < 0 ? d.danger : undefined}
      />
    </Box>
  );
}

/** Name and entity of a bank, for the consolidated table's Bank column. */
export interface BankLabel {
  name: string;
  entityName: string;
  isActive: boolean;
}

/** Bank name with the entity in grey under it. */
export function BankCell({
  bankId,
  bank,
}: {
  bankId: string;
  bank: BankLabel | undefined;
}) {
  const { d } = useDaylight();
  if (!bank) return <>—</>;
  return (
    <Box sx={{ minWidth: 120 }}>
      <Link
        href={bankStatementHref(bankId)}
        style={{ color: d.action, textDecoration: "none", fontWeight: 650 }}
      >
        {bank.name}
      </Link>
      <Box sx={{ fontSize: 12, color: d.muted, mt: 0.25 }}>
        {bank.entityName}
        {!bank.isActive && " · inactive"}
      </Box>
    </Box>
  );
}

function BalanceRow({
  label,
  date,
  value,
  labelSpan,
}: {
  label: string;
  date: string | null;
  value: string;
  labelSpan: number;
}) {
  const { d } = useDaylight();
  const sx = { fontWeight: 700, bgcolor: d.tableHead };
  return (
    <TableRow>
      <TableCell sx={{ ...sx, whiteSpace: "nowrap" }}>
        {date ? <DateDisplay date={date} /> : "—"}
      </TableCell>
      <TableCell sx={sx} colSpan={labelSpan}>
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

function StatementRow({
  row,
  banks,
}: {
  row: BankStatementRow;
  banks?: Map<string, BankLabel>;
}) {
  const { d } = useDaylight();
  const num = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const link = { color: d.action, textDecoration: "none", fontWeight: 650 };
  const dash = (
    <Box component="span" sx={{ color: d.muted }}>
      —
    </Box>
  );
  const debit = row.side === "DEBIT";
  return (
    <TableRow hover>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <DateDisplay date={row.date} />
      </TableCell>
      {banks && (
        <TableCell>
          <BankCell bankId={row.bankId} bank={banks.get(row.bankId)} />
        </TableCell>
      )}
      <TableCell sx={{ minWidth: 130 }}>
        {row.invoices.length === 0 ? (
          row.typeHref ? (
            <Link href={row.typeHref} style={link}>
              {row.invoiceType}
            </Link>
          ) : (
            <Box component="span" sx={{ whiteSpace: "nowrap" }}>
              {row.invoiceType}
            </Box>
          )
        ) : (
          <>
            <Stack spacing={0.25}>
              {row.invoices.map((inv) => (
                <Link key={inv.href} href={inv.href} style={link}>
                  {inv.number}
                </Link>
              ))}
            </Stack>
            <Box
              sx={{
                fontSize: 12,
                color: d.muted,
                mt: 0.25,
                whiteSpace: "nowrap",
              }}
            >
              {row.invoiceType}
            </Box>
          </>
        )}
      </TableCell>
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
          dash
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
          component="span"
          sx={{ fontWeight: 650, color: debit ? d.success : d.danger }}
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
          {!row.note && !row.receiptHref && !row.partial && dash}
        </Stack>
      </TableCell>
    </TableRow>
  );
}

type StatementSortKey =
  "date" | "bank" | "against" | "toFrom" | "type" | "due" | "paid" | "balance";

const SORT_LABELS: Record<StatementSortKey, string> = {
  date: "Payment Date",
  bank: "Bank",
  against: "Transactions Against",
  toFrom: "Transaction To/From",
  type: "Transaction Type",
  due: "Amount Due",
  paid: "Amount Paid",
  balance: "Balance",
};

/**
 * The statement table, oldest first by default, with Opening / Closing
 * balance rows. Every column but Notes sorts; each row keeps the running
 * balance it has in date order, and the Opening / Closing rows show only
 * while sorted by date. Pass `banks` to add the Bank column (consolidated).
 */
export function StatementTable({
  data,
  hasRange,
  from,
  to,
  banks,
  emptyText,
}: {
  data: Figures;
  hasRange: boolean;
  from: string;
  to: string;
  banks?: Map<string, BankLabel>;
  emptyText: string;
}) {
  const { d } = useDaylight();
  const sort = useTableSort<StatementSortKey>("date", "asc");
  // Rows come oldest first; the index is the date order.
  const order = useMemo(
    () => new Map(data.rows.map((r, i) => [r.id, i])),
    [data.rows],
  );
  const rows = useMemo(
    () =>
      sortRows(data.rows, sort, (r, key): SortValue => {
        switch (key) {
          case "date":
            return order.get(r.id);
          case "bank":
            return banks?.get(r.bankId)?.name;
          case "against":
            return [...r.invoices.map((i) => i.number), r.invoiceType].join(
              " ",
            );
          case "toFrom":
            return r.counterparty.name;
          case "type":
            return r.side === "DEBIT" ? "Debit" : "Credit";
          case "due":
            return r.invoiceAmountUsd === null
              ? null
              : Number(r.invoiceAmountUsd);
          case "paid":
            return (r.side === "DEBIT" ? 1 : -1) * Number(r.amountUsd);
          case "balance":
            return Number(r.balanceUsd);
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sort is rebuilt each render; key/dir are what matter
    [data.rows, sort.key, sort.dir, order, banks],
  );
  const byDate = sort.key === "date";
  const newestFirst = byDate && sort.dir === "desc";
  const first = data.rows[0]?.date ?? null;
  const last = data.rows.at(-1)?.date ?? null;
  const columnCount = banks ? 10 : 9;
  // Balance rows: date, label up to the Balance column, balance, notes.
  const labelSpan = columnCount - 3;
  const opening = byDate && hasRange && (
    <BalanceRow
      key="opening"
      label="Opening balance"
      date={from ? `${from}T12:00:00.000Z` : first}
      value={data.openingBalanceUsd}
      labelSpan={labelSpan}
    />
  );
  const closing = byDate && (data.rows.length > 0 || hasRange) && (
    <BalanceRow
      key="closing"
      label="Closing balance"
      date={to ? `${to}T12:00:00.000Z` : last}
      value={data.closingBalanceUsd}
      labelSpan={labelSpan}
    />
  );
  const caption = byDate
    ? newestFirst
      ? "Newest first"
      : "Oldest first"
    : `Sorted by ${SORT_LABELS[sort.key ?? "date"]} (${
        sort.dir === "asc" ? "ascending" : "descending"
      }) · balance as of each row's date`;
  const header = (key: StatementSortKey, label: string, right?: boolean) => (
    <SortHeader
      sort={sort}
      sortKey={key}
      label={label}
      align={right ? "right" : undefined}
    />
  );
  return (
    <>
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
          {caption} · USD at the rate saved with each payment
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
          sx={{ "& .MuiTableCell-stickyHeader": { bgcolor: d.tableHead } }}
        >
          <TableHead>
            <TableRow>
              {header("date", "Payment Date")}
              {banks && header("bank", "Bank")}
              {header("against", "Transactions Against")}
              {header("toFrom", "Transaction To/From")}
              {header("type", "Transaction Type")}
              {header("due", "Amount Due (USD)", true)}
              {header("paid", "Amount Paid (USD)", true)}
              {header("balance", "Balance (USD)", true)}
              <TableCell>Notes / Receipt</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {newestFirst ? closing : opening}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} align="center" sx={{ py: 5 }}>
                  <Typography sx={{ color: d.muted, fontSize: 13 }}>
                    {emptyText}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <StatementRow key={row.id} row={row} banks={banks} />
            ))}
            {newestFirst ? opening : closing}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}

/** "All banks" in the picker: opens the consolidated statement. */
export const ALL_BANKS = "__all__";

type PickerOption = { kind: "all" } | { kind: "bank"; bank: AccountingBank };

const optionKey = (o: PickerOption) =>
  o.kind === "all" ? ALL_BANKS : o.bank.id;

/**
 * Bank dropdown on both statement pages: "All banks" first, then the
 * banks grouped by entity with their balance. `current` = a bank id, or
 * ALL_BANKS on the consolidated page.
 */
export function BankPicker({
  banks,
  current,
  onChange,
}: {
  banks: AccountingBank[];
  current: string;
  onChange: (bankIdOrAll: string) => void;
}) {
  const ds = useDaylightAdminSx();
  const { d } = useDaylight();
  const options = useMemo<PickerOption[]>(
    () => [
      { kind: "all" },
      ...[...banks]
        .sort(
          (a, b) =>
            a.entity.name.localeCompare(b.entity.name) ||
            Number(b.isActive) - Number(a.isActive) ||
            a.name.localeCompare(b.name),
        )
        .map((bank): PickerOption => ({ kind: "bank", bank })),
    ],
    [banks],
  );
  const value = options.find((o) => optionKey(o) === current);
  if (!value) return null;
  return (
    <Autocomplete<PickerOption, false, true>
      size="small"
      disableClearable
      options={options}
      value={value}
      groupBy={(o) => (o.kind === "all" ? "Consolidated" : o.bank.entity.name)}
      getOptionLabel={(o) => (o.kind === "all" ? "All banks" : o.bank.name)}
      isOptionEqualToValue={(a, b) => optionKey(a) === optionKey(b)}
      onChange={(_, o) => {
        if (o && optionKey(o) !== current) onChange(optionKey(o));
      }}
      renderOption={({ key, ...props }, o) => (
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
          {o.kind === "all" ? (
            <Box component="span" sx={{ fontWeight: 650, color: d.text }}>
              All banks (consolidated)
            </Box>
          ) : (
            <>
              <Box
                component="span"
                sx={{ color: o.bank.isActive ? d.text : d.muted, minWidth: 0 }}
              >
                {o.bank.name}
                {!o.bank.isActive && " (inactive)"}
              </Box>
              <Box
                component="span"
                sx={{
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  color:
                    Number(o.bank.balanceUsd ?? 0) < 0 ? d.danger : d.muted,
                }}
              >
                {formatUsd(o.bank.balanceUsd)}
              </Box>
            </>
          )}
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Statement"
          placeholder="Switch bank"
          sx={ds.inputSx}
        />
      )}
      sx={{ width: { xs: "100%", sm: 320 } }}
    />
  );
}
