"use client";

/**
 * Capital & Income: money added to our banks without an invoice (initial
 * deposit, equity, loan, ...). Each entry is a Debit on its bank's
 * statement; a bank fee is its own Credit row. Rules in
 * lib/accounting/capitalIncome.ts; Heads are under Finance Settings.
 */

import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  Link as MuiLink,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import TableChartIcon from "@mui/icons-material/TableChart";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { formatCurrencyAmount } from "@/components/accounting/common/PaymentAccountFields";
import {
  SortHeader,
  useTableSort,
} from "@/components/accounting/common/SortableHeader";
import { ExportButtons } from "@/components/accounting/bankStatement/StatementParts";
import { TableState } from "@/components/accounting/masterData/MasterDataTable";
import { IncomeDialog } from "@/components/accounting/capitalIncome/IncomeDialog";
import { IncomeReport } from "@/components/accounting/capitalIncome/IncomeReport";
import {
  INCOME_DEFAULT_SORT,
  IncomeSortKey,
  incomeListQuery,
  incomeListRows,
} from "@/lib/accounting/capitalIncomeLists";
import { downloadExport } from "@/lib/downloadExport";
import {
  DaylightAdminPage,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import { useDaylight } from "@/lib/daylight";
import {
  useAccountingBanks,
  useIncomeHeads,
} from "@/lib/hooks/usePaymentAccounts";
import {
  IncomeEntry,
  useCapitalIncome,
  useSaveIncome,
} from "@/lib/hooks/useCapitalIncome";

const PATH = "/accounting/capital-income";
const day = (d: string) => <DateDisplay date={`${d}T12:00:00.000Z`} />;
const statementHref = (bankId: string) =>
  `/accounting/payment-accounts/banks/${bankId}`;
const numSx = {
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
} as const;
const COLS = 11;

export default function CapitalIncomePage() {
  return (
    <Suspense fallback={null}>
      <CapitalIncomeContent />
    </Suspense>
  );
}

function CapitalIncomeContent() {
  const ds = useDaylightAdminSx();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "report" ? "report" : "entries";
  const { data } = useCapitalIncome();

  return (
    <DaylightAdminPage>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={ds.pageTitleSx}>
          Capital &amp; Income
        </Typography>
        <Typography sx={ds.pageDescSx}>
          Money added to our banks without an invoice, such as an initial
          deposit, equity or a loan. Each entry is a Debit on its bank&apos;s
          statement; a bank fee on it is a separate Credit.
        </Typography>
      </Box>
      <Paper elevation={0} sx={{ ...ds.listCardSx, p: { xs: 2, sm: 3 } }}>
        <Tabs
          value={tab}
          onChange={(_, v: string) =>
            router.replace(v === "report" ? `${PATH}?tab=report` : PATH, {
              scroll: false,
            })
          }
          sx={{ ...ds.tabsSx, mb: 3 }}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab
            value="entries"
            label={data ? `Entries (${data.length})` : "Entries"}
          />
          <Tab value="report" label="Report" />
        </Tabs>
        {tab === "entries" ? (
          <EntriesTab focusId={searchParams.get("entry")} />
        ) : (
          <IncomeReport />
        )}
      </Paper>
    </DaylightAdminPage>
  );
}

function FileLinks({ entry }: { entry: IncomeEntry }) {
  const { d } = useDaylight();
  const linkSx = {
    display: "inline-flex",
    alignItems: "center",
    gap: 0.5,
    color: d.action,
    fontWeight: 600,
  };
  if (!entry.pdf && !entry.sheet) return null;
  return (
    <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }}>
      {entry.pdf && (
        <MuiLink
          href={entry.pdf.href}
          target="_blank"
          rel="noopener noreferrer"
          variant="caption"
          sx={linkSx}
        >
          <PictureAsPdfIcon sx={{ fontSize: 14 }} /> PDF
        </MuiLink>
      )}
      {entry.sheet && (
        <MuiLink href={entry.sheet.href} variant="caption" sx={linkSx}>
          <TableChartIcon sx={{ fontSize: 14 }} /> Sheet
        </MuiLink>
      )}
    </Stack>
  );
}

function EntriesTab({ focusId }: { focusId: string | null }) {
  const ds = useDaylightAdminSx();
  const { d } = useDaylight();
  const { data = [], isLoading, error } = useCapitalIncome();
  const { data: heads = [] } = useIncomeHeads();
  const { data: banks = [] } = useAccountingBanks();
  const save = useSaveIncome();

  const [headFilter, setHeadFilter] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<IncomeEntry | "new" | null>(null);
  const [deleting, setDeleting] = useState<IncomeEntry | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Opened from a statement row: scroll to that entry.
  useEffect(() => {
    if (!focusId || isLoading) return;
    document
      .getElementById(`income-${focusId}`)
      ?.scrollIntoView({ block: "center" });
  }, [focusId, isLoading]);

  // Newest first by default, as the list comes from the API. The export
  // gets the same filter and sort, so it holds exactly these rows.
  const sort = useTableSort<IncomeSortKey>(
    INCOME_DEFAULT_SORT.key,
    INCOME_DEFAULT_SORT.dir,
  );
  const filter = { headId: headFilter, bankId: bankFilter, from, to };
  const rows = incomeListRows(data, filter, sort);

  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const handleExport = async (format: "csv" | "pdf") => {
    try {
      setExporting(format);
      setExportError(null);
      const query = incomeListQuery(filter, sort);
      query.set("format", format);
      query.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
      await downloadExport(
        `/api/accounting/capital-income/export?${query.toString()}`,
        `capital-income-${new Date().toLocaleDateString("en-CA")}.${format}`,
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to download export",
      );
    } finally {
      setExporting(null);
    }
  };
  const cents = (v: string) => Math.round(Number(v) * 100);
  const total = (key: "amountUsd" | "feeUsd") =>
    rows.reduce((s, e) => s + cents(e[key]), 0) / 100;

  const remove = async () => {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await save.mutateAsync({ id: deleting.id, method: "DELETE" });
      setDeleting(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          flexWrap="wrap"
          useFlexGap
        >
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Head</InputLabel>
            <Select
              label="Head"
              value={headFilter}
              onChange={(e) => setHeadFilter(e.target.value)}
            >
              <MenuItem value="">All heads</MenuItem>
              {heads.map((h) => (
                <MenuItem key={h.id} value={h.id}>
                  {h.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Bank</InputLabel>
            <Select
              label="Bank"
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
            >
              <MenuItem value="">All banks</MenuItem>
              {banks.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          alignItems="flex-start"
          flexWrap="wrap"
          useFlexGap
        >
          <ExportButtons
            disabled={isLoading || !!error}
            exporting={exporting}
            onExport={handleExport}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setEditing("new")}
            sx={ds.primaryBtnSx}
          >
            Add entry
          </Button>
        </Stack>
      </Stack>
      {exportError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {exportError}
        </Alert>
      )}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortHeader sort={sort} sortKey="entry" label="Entry #" />
              <SortHeader sort={sort} sortKey="date" label="Date" />
              <SortHeader sort={sort} sortKey="head" label="Head" />
              <SortHeader sort={sort} sortKey="from" label="Received from" />
              <SortHeader sort={sort} sortKey="narration" label="Narration" />
              <SortHeader sort={sort} sortKey="bank" label="Entity / Bank" />
              <TableCell align="right">Amount</TableCell>
              <SortHeader
                sort={sort}
                sortKey="received"
                label="Received (USD)"
                align="right"
              />
              <SortHeader
                sort={sort}
                sortKey="fee"
                label="Fee (USD)"
                align="right"
              />
              <TableCell align="right">Net added (USD)</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableState
              loading={isLoading}
              error={error}
              empty={rows.length === 0}
              colSpan={COLS}
            />
            {rows.map((e) => (
              <TableRow
                key={e.id}
                id={`income-${e.id}`}
                hover
                selected={e.id === focusId}
              >
                <TableCell
                  sx={{
                    whiteSpace: "nowrap",
                    fontWeight: 650,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {e.entryLabel}
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {day(e.date)}
                </TableCell>
                <TableCell>{e.head.name}</TableCell>
                <TableCell sx={{ minWidth: 120 }}>
                  {e.receivedFrom ?? "—"}
                </TableCell>
                <TableCell sx={{ minWidth: 180, maxWidth: 320 }}>
                  {e.narration && (
                    <Typography variant="body2">{e.narration}</Typography>
                  )}
                  <FileLinks entry={e} />
                </TableCell>
                <TableCell sx={{ minWidth: 140 }}>
                  <Link
                    href={statementHref(e.bankId)}
                    style={{
                      color: d.action,
                      textDecoration: "none",
                      fontWeight: 650,
                    }}
                  >
                    {e.bankName}
                  </Link>
                  <Box sx={{ fontSize: 12, color: d.muted }}>
                    {e.entityName}
                  </Box>
                </TableCell>
                <TableCell align="right" sx={numSx}>
                  {formatCurrencyAmount(e.amount, e.currencyCode)}
                  {e.currencyCode !== "USD" && (
                    <Box sx={{ fontSize: 12, color: d.muted }}>
                      @ {e.exchangeRate}
                    </Box>
                  )}
                </TableCell>
                <TableCell align="right" sx={numSx}>
                  <CurrencyDisplay value={e.amountUsd} />
                </TableCell>
                <TableCell align="right" sx={numSx}>
                  {Number(e.fee) > 0 ? (
                    <>
                      <CurrencyDisplay value={e.feeUsd} />
                      {e.currencyCode !== "USD" && (
                        <Box sx={{ fontSize: 12, color: d.muted }}>
                          {formatCurrencyAmount(e.fee, e.currencyCode)}
                        </Box>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell align="right" sx={{ ...numSx, fontWeight: 650 }}>
                  <CurrencyDisplay
                    value={(cents(e.amountUsd) - cents(e.feeUsd)) / 100}
                  />
                </TableCell>
                <TableCell align="right">
                  <Stack
                    direction="row"
                    spacing={0.5}
                    justifyContent="flex-end"
                  >
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => setEditing(e)}
                        disabled={save.isPending}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(e);
                        }}
                        disabled={save.isPending}
                      >
                        <DeleteIcon fontSize="small" color="error" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {rows.length > 1 && (
              <TableRow>
                <TableCell colSpan={7} sx={{ fontWeight: 700 }}>
                  Total ({rows.length} entries)
                </TableCell>
                <TableCell align="right" sx={{ ...numSx, fontWeight: 700 }}>
                  <CurrencyDisplay value={total("amountUsd")} />
                </TableCell>
                <TableCell align="right" sx={{ ...numSx, fontWeight: 700 }}>
                  <CurrencyDisplay value={total("feeUsd")} />
                </TableCell>
                <TableCell align="right" sx={{ ...numSx, fontWeight: 700 }}>
                  <CurrencyDisplay
                    value={
                      (Math.round(total("amountUsd") * 100) -
                        Math.round(total("feeUsd") * 100)) /
                      100
                    }
                  />
                </TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography sx={{ mt: 1.5, fontSize: 12, color: d.muted }}>
        Received (USD) is a Debit on the bank&apos;s statement; the fee is a
        separate Credit row. Net added = received − fee.
      </Typography>

      {editing !== null && (
        <IncomeDialog
          key={editing === "new" ? "new" : editing.id}
          entry={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete this entry?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {deleting && (
              <DialogContentText>
                {deleting.entryLabel} · {deleting.head.name}:{" "}
                {formatCurrencyAmount(deleting.amount, deleting.currencyCode)}{" "}
                into {deleting.bankName} on {deleting.date}. The bank&apos;s
                balance changes back, and its attached files are deleted too.
                This can&apos;t be undone.
              </DialogContentText>
            )}
            {deleteError && <Alert severity="error">{deleteError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={remove}
            disabled={save.isPending}
          >
            {save.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
