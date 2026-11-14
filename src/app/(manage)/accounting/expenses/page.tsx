"use client";

/**
 * Expenses: company expenses owed in USD and paid from our banks (one or
 * more payments each). Payments are Credits on the bank statements. Rules
 * in lib/accounting/expense.ts; Heads are under Finance Settings.
 */

import {
  Alert,
  Box,
  Button,
  Collapse,
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
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import PaymentsIcon from "@mui/icons-material/Payments";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import TableChartIcon from "@mui/icons-material/TableChart";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useState } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { formatCurrencyAmount } from "@/components/accounting/common/PaymentAccountFields";
import {
  SortHeader,
  useTableSort,
} from "@/components/accounting/common/SortableHeader";
import { ExportButtons } from "@/components/accounting/bankStatement/StatementParts";
import {
  EXPENSE_DEFAULT_SORT,
  ExpenseSortKey,
  expenseListQuery,
  expenseListRows,
} from "@/lib/accounting/expenseLists";
import { downloadExport } from "@/lib/downloadExport";
import { TableState } from "@/components/accounting/masterData/MasterDataTable";
import { ExpenseDialog } from "@/components/accounting/expenses/ExpenseDialog";
import { ExpensePaymentDialog } from "@/components/accounting/expenses/ExpensePaymentDialog";
import { ExpenseReport } from "@/components/accounting/expenses/ExpenseReport";
import {
  DaylightAdminPage,
  DaylightStatusPill,
  DaylightTone,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import { useDaylight } from "@/lib/daylight";
import { useExpenseHeads } from "@/lib/hooks/usePaymentAccounts";
import {
  Expense,
  ExpensePayment,
  ExpenseStatus,
  useExpenses,
  useSaveExpense,
  useSaveExpensePayment,
} from "@/lib/hooks/useExpenses";

const STATUS: Record<ExpenseStatus, { label: string; tone: DaylightTone }> = {
  PENDING: { label: "Pending", tone: "info" },
  PARTIAL: { label: "Partially paid", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
};

const day = (d: string) => <DateDisplay date={`${d}T12:00:00.000Z`} />;
const statementHref = (bankId: string) =>
  `/accounting/payment-accounts/banks/${bankId}`;
const numSx = {
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
} as const;

export default function ExpensesPage() {
  return (
    <Suspense fallback={null}>
      <ExpensesContent />
    </Suspense>
  );
}

function ExpensesContent() {
  const ds = useDaylightAdminSx();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "report" ? "report" : "expenses";
  const { data } = useExpenses();

  return (
    <DaylightAdminPage>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={ds.pageTitleSx}>
          Expenses
        </Typography>
        <Typography sx={ds.pageDescSx}>
          Company expenses such as salary, maintenance and fuel. Each is owed in
          USD and can be paid in several payments from our banks. Payments and
          their fees are Credits on the bank statements.
        </Typography>
      </Box>
      <Paper elevation={0} sx={{ ...ds.listCardSx, p: { xs: 2, sm: 3 } }}>
        <Tabs
          value={tab}
          onChange={(_, v: string) =>
            router.replace(
              v === "report"
                ? "/accounting/expenses?tab=report"
                : "/accounting/expenses",
              { scroll: false },
            )
          }
          sx={{ ...ds.tabsSx, mb: 3 }}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab
            value="expenses"
            label={data ? `Expenses (${data.length})` : "Expenses"}
          />
          <Tab value="report" label="Report" />
        </Tabs>
        {tab === "expenses" ? (
          <ExpensesTab focusId={searchParams.get("expense")} />
        ) : (
          <ExpenseReport />
        )}
      </Paper>
    </DaylightAdminPage>
  );
}

function FileLinks({ expense }: { expense: Expense }) {
  const { d } = useDaylight();
  const linkSx = {
    display: "inline-flex",
    alignItems: "center",
    gap: 0.5,
    color: d.action,
    fontWeight: 600,
  };
  if (!expense.pdf && !expense.sheet) return null;
  return (
    <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }}>
      {expense.pdf && (
        <MuiLink
          href={expense.pdf.href}
          target="_blank"
          rel="noopener noreferrer"
          variant="caption"
          sx={linkSx}
        >
          <PictureAsPdfIcon sx={{ fontSize: 14 }} /> PDF
        </MuiLink>
      )}
      {expense.sheet && (
        <MuiLink href={expense.sheet.href} variant="caption" sx={linkSx}>
          <TableChartIcon sx={{ fontSize: 14 }} /> Sheet
        </MuiLink>
      )}
    </Stack>
  );
}

function ExpensesTab({ focusId }: { focusId: string | null }) {
  const ds = useDaylightAdminSx();
  const { d } = useDaylight();
  const { data = [], isLoading, error } = useExpenses();
  const { data: heads = [] } = useExpenseHeads();
  const saveExpense = useSaveExpense();
  const savePayment = useSaveExpensePayment();

  const [headFilter, setHeadFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(focusId ? [focusId] : []),
  );
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [paying, setPaying] = useState<{
    expense: Expense;
    payment?: ExpensePayment;
  } | null>(null);
  const [deleting, setDeleting] = useState<
    | { kind: "expense"; expense: Expense }
    | { kind: "payment"; expense: Expense; payment: ExpensePayment }
    | null
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Opened from a statement row: show that expense's payments.
  useEffect(() => {
    if (!focusId || isLoading) return;
    setOpen((s) => new Set(s).add(focusId));
    document
      .getElementById(`expense-${focusId}`)
      ?.scrollIntoView({ block: "center" });
  }, [focusId, isLoading]);

  // Newest first by default, as the list comes from the API. The export
  // gets the same filter and sort, so it holds exactly these rows.
  const sort = useTableSort<ExpenseSortKey>(
    EXPENSE_DEFAULT_SORT.key,
    EXPENSE_DEFAULT_SORT.dir,
  );
  const filter = { headId: headFilter, status: statusFilter, from, to };
  const rows = expenseListRows(data, filter, sort);

  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const handleExport = async (format: "csv" | "pdf") => {
    try {
      setExporting(format);
      setExportError(null);
      const query = expenseListQuery(filter, sort);
      query.set("format", format);
      query.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
      await downloadExport(
        `/api/accounting/expenses/export?${query.toString()}`,
        `expenses-${new Date().toLocaleDateString("en-CA")}.${format}`,
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to download export",
      );
    } finally {
      setExporting(null);
    }
  };
  const total = (key: "amountDueUsd" | "paidUsd" | "balanceUsd") =>
    rows.reduce((s, e) => s + Number(e[key]), 0);

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Clicking the head pays the expense; a paid one shows its payments.
  const onHead = (e: Expense) =>
    e.status === "PAID" ? toggle(e.id) : setPaying({ expense: e });

  const busy = saveExpense.isPending || savePayment.isPending;

  const remove = async () => {
    if (!deleting) return;
    setDeleteError(null);
    try {
      if (deleting.kind === "expense") {
        await saveExpense.mutateAsync({
          id: deleting.expense.id,
          method: "DELETE",
        });
      } else {
        await savePayment.mutateAsync({
          id: deleting.payment.id,
          method: "DELETE",
        });
      }
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
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as ExpenseStatus | "")
              }
            >
              <MenuItem value="">All</MenuItem>
              {(Object.keys(STATUS) as ExpenseStatus[]).map((s) => (
                <MenuItem key={s} value={s}>
                  {STATUS[s].label}
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
            Add expense
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
              <TableCell padding="checkbox" />
              <SortHeader sort={sort} sortKey="date" label="Date" />
              <SortHeader sort={sort} sortKey="head" label="Head" />
              <SortHeader sort={sort} sortKey="narration" label="Narration" />
              <SortHeader
                sort={sort}
                sortKey="due"
                label="Amount Due (USD)"
                align="right"
              />
              <SortHeader
                sort={sort}
                sortKey="paid"
                label="Amount Paid (USD)"
                align="right"
              />
              <SortHeader
                sort={sort}
                sortKey="balance"
                label="Balance (USD)"
                align="right"
              />
              <TableCell>Entity / Bank</TableCell>
              <SortHeader sort={sort} sortKey="status" label="Status" />
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableState
              loading={isLoading}
              error={error}
              empty={rows.length === 0}
              colSpan={10}
            />
            {rows.map((e) => {
              const isOpen = open.has(e.id);
              return (
                <Fragment key={e.id}>
                  <TableRow
                    id={`expense-${e.id}`}
                    hover
                    selected={e.id === focusId}
                    sx={{ "& > td": { borderBottom: isOpen ? 0 : undefined } }}
                  >
                    <TableCell padding="checkbox">
                      <Tooltip
                        title={
                          e.payments.length
                            ? `${isOpen ? "Hide" : "Show"} payments`
                            : "No payments yet"
                        }
                      >
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => toggle(e.id)}
                            disabled={e.payments.length === 0}
                          >
                            {isOpen ? (
                              <KeyboardArrowUpIcon fontSize="small" />
                            ) : (
                              <KeyboardArrowDownIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {day(e.date)}
                    </TableCell>
                    <TableCell>
                      <MuiLink
                        component="button"
                        type="button"
                        onClick={() => onHead(e)}
                        sx={{
                          color: d.action,
                          fontWeight: 650,
                          textDecoration: "none",
                          textAlign: "left",
                        }}
                      >
                        {e.head.name}
                      </MuiLink>
                    </TableCell>
                    <TableCell sx={{ minWidth: 180, maxWidth: 320 }}>
                      {e.narration && (
                        <Typography variant="body2">{e.narration}</Typography>
                      )}
                      <FileLinks expense={e} />
                    </TableCell>
                    <TableCell align="right" sx={numSx}>
                      <CurrencyDisplay value={e.amountDueUsd} />
                    </TableCell>
                    <TableCell align="right" sx={numSx}>
                      <CurrencyDisplay value={e.paidUsd} />
                      {Number(e.feesUsd) > 0 && (
                        <Box sx={{ fontSize: 12, color: d.muted }}>
                          + fees <CurrencyDisplay value={e.feesUsd} />
                        </Box>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ ...numSx, fontWeight: 650 }}>
                      <CurrencyDisplay value={e.balanceUsd} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 140 }}>
                      {e.banks.length === 0
                        ? "—"
                        : e.banks.map((b) => (
                            <Box key={b.id} sx={{ mb: 0.5 }}>
                              <Link
                                href={statementHref(b.id)}
                                style={{
                                  color: d.action,
                                  textDecoration: "none",
                                  fontWeight: 650,
                                }}
                              >
                                {b.name}
                              </Link>
                              <Box sx={{ fontSize: 12, color: d.muted }}>
                                {b.entityName}
                              </Box>
                            </Box>
                          ))}
                    </TableCell>
                    <TableCell>
                      <DaylightStatusPill
                        label={STATUS[e.status].label}
                        tone={STATUS[e.status].tone}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={0.5}
                        justifyContent="flex-end"
                      >
                        <Tooltip
                          title={
                            e.status === "PAID"
                              ? "Fully paid"
                              : "Record payment"
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => setPaying({ expense: e })}
                              disabled={busy || e.status === "PAID"}
                            >
                              <PaymentsIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => setEditing(e)}
                            disabled={busy}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip
                          title={
                            e.payments.length
                              ? "Delete its payments first"
                              : "Delete"
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleting({ kind: "expense", expense: e });
                              }}
                              disabled={busy || e.payments.length > 0}
                            >
                              <DeleteIcon
                                fontSize="small"
                                color={e.payments.length ? "disabled" : "error"}
                              />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      sx={{ py: 0, ...(isOpen ? {} : { borderBottom: 0 }) }}
                    >
                      <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <PaymentsTable
                          expense={e}
                          busy={busy}
                          onEdit={(p) => setPaying({ expense: e, payment: p })}
                          onDelete={(p) => {
                            setDeleteError(null);
                            setDeleting({
                              kind: "payment",
                              expense: e,
                              payment: p,
                            });
                          }}
                        />
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
            {rows.length > 1 && (
              <TableRow>
                <TableCell />
                <TableCell colSpan={3} sx={{ fontWeight: 700 }}>
                  Total ({rows.length} expenses)
                </TableCell>
                <TableCell align="right" sx={{ ...numSx, fontWeight: 700 }}>
                  <CurrencyDisplay value={total("amountDueUsd")} />
                </TableCell>
                <TableCell align="right" sx={{ ...numSx, fontWeight: 700 }}>
                  <CurrencyDisplay value={total("paidUsd")} />
                </TableCell>
                <TableCell align="right" sx={{ ...numSx, fontWeight: 700 }}>
                  <CurrencyDisplay value={total("balanceUsd")} />
                </TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography sx={{ mt: 1.5, fontSize: 12, color: d.muted }}>
        Balance = Amount Due − Amount Paid. Fees don&apos;t reduce the balance;
        each payment and its fee are Credit rows on the paying bank&apos;s
        statement. Click a head to record a payment.
      </Typography>

      {editing !== null && (
        <ExpenseDialog
          key={editing === "new" ? "new" : editing.id}
          expense={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {paying && (
        <ExpensePaymentDialog
          key={paying.payment?.id ?? `new-${paying.expense.id}`}
          expense={paying.expense}
          payment={paying.payment}
          onClose={() => setPaying(null)}
        />
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {deleting?.kind === "payment"
            ? "Delete this payment?"
            : "Delete this expense?"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {deleting?.kind === "expense" && (
              <DialogContentText>
                {deleting.expense.head.name} of{" "}
                <CurrencyDisplay value={deleting.expense.amountDueUsd} /> on{" "}
                {deleting.expense.date}. Its attached files are deleted too.
                This can&apos;t be undone.
              </DialogContentText>
            )}
            {deleting?.kind === "payment" && (
              <DialogContentText>
                {formatCurrencyAmount(
                  deleting.payment.amount,
                  deleting.payment.currencyCode,
                )}{" "}
                from {deleting.payment.bankName} on {deleting.payment.date}. The
                bank&apos;s balance and the expense&apos;s balance change back,
                and its receipt PDF is deleted. This can&apos;t be undone.
              </DialogContentText>
            )}
            {deleteError && <Alert severity="error">{deleteError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={remove}
            disabled={busy}
          >
            {busy ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function PaymentsTable({
  expense,
  busy,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  busy: boolean;
  onEdit: (p: ExpensePayment) => void;
  onDelete: (p: ExpensePayment) => void;
}) {
  const { d } = useDaylight();
  return (
    <Box sx={{ py: 1.5, pl: { sm: 6 } }}>
      <Typography sx={{ fontSize: 13, fontWeight: 650, mb: 1 }}>
        Payments
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Payment date</TableCell>
            <TableCell>Bank</TableCell>
            <TableCell align="right">Amount</TableCell>
            <TableCell align="right">Paid (USD)</TableCell>
            <TableCell align="right">Fee</TableCell>
            <TableCell>Note / Receipt</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {expense.payments.map((p) => (
            <TableRow key={p.id}>
              <TableCell sx={{ whiteSpace: "nowrap" }}>{day(p.date)}</TableCell>
              <TableCell>
                <Link
                  href={statementHref(p.bankId)}
                  style={{
                    color: d.action,
                    textDecoration: "none",
                    fontWeight: 650,
                  }}
                >
                  {p.bankName}
                </Link>
                <Box sx={{ fontSize: 12, color: d.muted }}>{p.entityName}</Box>
              </TableCell>
              <TableCell align="right" sx={numSx}>
                {formatCurrencyAmount(p.amount, p.currencyCode)}
                {p.currencyCode !== "USD" && (
                  <Box sx={{ fontSize: 12, color: d.muted }}>
                    @ {p.exchangeRate}
                  </Box>
                )}
              </TableCell>
              <TableCell align="right" sx={numSx}>
                <CurrencyDisplay value={p.amountUsd} />
              </TableCell>
              <TableCell align="right" sx={numSx}>
                {Number(p.fee) > 0 ? (
                  <>
                    {formatCurrencyAmount(p.fee, p.currencyCode)}
                    <Box sx={{ fontSize: 12, color: d.muted }}>
                      <CurrencyDisplay value={p.feeUsd} />
                    </Box>
                  </>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell sx={{ minWidth: 140, maxWidth: 280 }}>
                {p.note && (
                  <Typography variant="caption" sx={{ display: "block" }}>
                    {p.note}
                  </Typography>
                )}
                {p.receiptHref && (
                  <MuiLink
                    href={p.receiptHref}
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
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                  <Tooltip title="Edit payment">
                    <IconButton
                      size="small"
                      onClick={() => onEdit(p)}
                      disabled={busy}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete payment">
                    <IconButton
                      size="small"
                      onClick={() => onDelete(p)}
                      disabled={busy}
                    >
                      <DeleteIcon fontSize="small" color="error" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
