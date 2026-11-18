"use client";

import {
  Alert,
  Autocomplete,
  Box,
  Button,
  FormControl,
  InputLabel,
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
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { TransferDialog } from "@/components/accounting/bankTransfer/TransferDialog";
import { TransfersTab } from "@/components/accounting/bankTransfer/TransfersTab";
import { useDaylight } from "@/lib/daylight";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import {
  ConfirmDeleteDialog,
  FormDialog,
  inactiveRowSx,
  RowActions,
  TableState,
  useRecordEditor,
} from "@/components/accounting/masterData/MasterDataTable";
import {
  AccountingBank,
  AccountingCurrency,
  AccountingEntity,
  useAccountingBanks,
  useAccountingCurrencies,
  useAccountingEntities,
  useBankTransfers,
} from "@/lib/hooks/usePaymentAccounts";
import {
  DaylightAdminPage,
  useDaylightAdminSx,
  DaylightStatusPill,
} from "@/components/daylight/AdminPage";

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

function EntitiesTab() {
  const ds = useDaylightAdminSx();
  const { data = [], isLoading, error } = useAccountingEntities();
  const editor = useRecordEditor<AccountingEntity>("entities");
  const [name, setName] = useState("");

  const openForm = (entity: AccountingEntity | "new") => {
    setName(entity === "new" ? "" : entity.name);
    editor.setEditing(entity);
  };

  return (
    <>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openForm("new")}
          sx={ds.primaryBtnSx}
        >
          Add entity
        </Button>
      </Stack>
      {editor.pageError && (
        <Alert severity="error" sx={{ mb: 2, ...ds.alertSx("error") }}>
          {editor.pageError}
        </Alert>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell align="right"># Banks</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableState
              loading={isLoading}
              error={error}
              empty={data.length === 0}
              colSpan={4}
            />
            {data.map((entity) => (
              <TableRow
                key={entity.id}
                sx={entity.isActive ? undefined : inactiveRowSx}
              >
                <TableCell>{entity.name}</TableCell>
                <TableCell align="right">{entity._count.banks}</TableCell>
                <TableCell>
                  <StatusBadge
                    status={entity.isActive ? "Active" : "Inactive"}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <RowActions
                    isActive={entity.isActive}
                    busy={editor.busy}
                    onEdit={() => openForm(entity)}
                    onToggle={() => editor.toggle(entity)}
                    onDelete={() => editor.setDeleting(entity)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <FormDialog
        open={editor.editing !== null}
        title={editor.editing === "new" ? "Add entity" : "Edit entity"}
        error={editor.error}
        busy={editor.busy}
        canSave={name.trim().length > 0}
        onCancel={editor.close}
        onSave={() => editor.save({ name })}
      >
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          fullWidth
        />
      </FormDialog>
      <ConfirmDeleteDialog
        open={editor.deleting !== null}
        label={editor.deleting?.name ?? ""}
        error={editor.error}
        busy={editor.busy}
        onCancel={editor.close}
        onConfirm={editor.remove}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Banks
// ---------------------------------------------------------------------------

function BanksTab() {
  const ds = useDaylightAdminSx();
  const { d } = useDaylight();
  const { data = [], isLoading, error } = useAccountingBanks();
  const { data: entities = [] } = useAccountingEntities();
  const { data: currencies = [] } = useAccountingCurrencies();
  const editor = useRecordEditor<AccountingBank>("banks");
  const [entityFilter, setEntityFilter] = useState("");
  const [recordingTransfer, setRecordingTransfer] = useState(false);
  const [form, setForm] = useState({
    entityId: "",
    name: "",
    currencyIds: [] as string[],
  });

  const openForm = (bank: AccountingBank | "new") => {
    setForm(
      bank === "new"
        ? { entityId: entityFilter, name: "", currencyIds: [] }
        : {
            entityId: bank.entityId,
            name: bank.name,
            currencyIds: bank.currencies.map((c) => c.currencyId),
          },
    );
    editor.setEditing(bank);
  };

  const editingBank = editor.editing === "new" ? null : editor.editing;
  // Active entities/currencies, plus whatever the bank already uses, so an
  // edit never silently drops an inactive link.
  const entityOptions = entities.filter(
    (e) => e.isActive || e.id === editingBank?.entityId,
  );
  const currencyOptions = currencies.filter(
    (c) => c.isActive || form.currencyIds.includes(c.id),
  );
  const rows = entityFilter
    ? data.filter((b) => b.entityId === entityFilter)
    : data;
  // Balances come as 2 dp strings: sum whole cents to avoid float drift.
  const totalBalance = (
    rows.reduce(
      (cents, b) => cents + Math.round(Number(b.balanceUsd ?? 0) * 100),
      0,
    ) / 100
  ).toFixed(2);

  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 2 }}
      >
        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel>Filter by entity</InputLabel>
          <Select
            label="Filter by entity"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
          >
            <MenuItem value="">All entities</MenuItem>
            {entities.map((e) => (
              <MenuItem key={e.id} value={e.id}>
                {e.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            component={Link}
            href={
              entityFilter
                ? `/accounting/payment-accounts/statement?entity=${encodeURIComponent(entityFilter)}`
                : "/accounting/payment-accounts/statement"
            }
            variant="outlined"
            startIcon={<ReceiptLongIcon />}
            sx={ds.outlineBtnSx}
          >
            Consolidated statement
          </Button>
          <Button
            variant="outlined"
            startIcon={<SwapHorizIcon />}
            onClick={() => setRecordingTransfer(true)}
            sx={ds.outlineBtnSx}
          >
            Record transfer
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => openForm("new")}
            sx={ds.primaryBtnSx}
          >
            Add bank
          </Button>
        </Stack>
      </Stack>
      {editor.pageError && (
        <Alert severity="error" sx={{ mb: 2, ...ds.alertSx("error") }}>
          {editor.pageError}
        </Alert>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Bank</TableCell>
              <TableCell>Entity</TableCell>
              <TableCell>Currencies</TableCell>
              <TableCell align="right">Balance (USD)</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableState
              loading={isLoading}
              error={error}
              empty={rows.length === 0}
              colSpan={6}
            />
            {rows.map((bank) => (
              <TableRow
                key={bank.id}
                sx={bank.isActive ? undefined : inactiveRowSx}
              >
                <TableCell>
                  <Link
                    href={`/accounting/payment-accounts/banks/${bank.id}`}
                    title="Open bank statement"
                    style={{
                      color: d.action,
                      fontWeight: 650,
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {bank.name}
                    <ReceiptLongIcon sx={{ fontSize: 15, opacity: 0.8 }} />
                  </Link>
                </TableCell>
                <TableCell>{bank.entity.name}</TableCell>
                <TableCell>
                  <Stack
                    direction="row"
                    spacing={0.5}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    {bank.currencies.map(({ currency }) => (
                      <DaylightStatusPill
                        key={currency.id}
                        label={currency.code}
                        tone={currency.isActive ? "info" : "neutral"}
                      />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                    fontWeight: 600,
                    color:
                      Number(bank.balanceUsd ?? 0) < 0 ? d.danger : undefined,
                  }}
                >
                  <CurrencyDisplay value={bank.balanceUsd ?? 0} />
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={bank.isActive ? "Active" : "Inactive"}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <RowActions
                    isActive={bank.isActive}
                    busy={editor.busy}
                    onEdit={() => openForm(bank)}
                    onToggle={() => editor.toggle(bank)}
                    onDelete={() => editor.setDeleting(bank)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && !error && rows.length > 1 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  sx={{ fontWeight: 700, bgcolor: d.tableHead }}
                >
                  Total ({rows.length} banks)
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 700,
                    bgcolor: d.tableHead,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                    color: Number(totalBalance) < 0 ? d.danger : undefined,
                  }}
                >
                  <CurrencyDisplay value={totalBalance} />
                </TableCell>
                <TableCell colSpan={2} sx={{ bgcolor: d.tableHead }} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography sx={{ mt: 1.5, fontSize: 12, color: d.muted }}>
        Balance = payments and transfers received into the bank (Debit) minus
        payments, transfers and transfer fees sent from it (Credit), in USD.
        Click a bank to open its statement.
      </Typography>
      {recordingTransfer && (
        <TransferDialog onClose={() => setRecordingTransfer(false)} />
      )}

      <FormDialog
        open={editor.editing !== null}
        title={editor.editing === "new" ? "Add bank" : "Edit bank"}
        error={editor.error}
        busy={editor.busy}
        canSave={
          !!form.entityId &&
          form.name.trim().length > 0 &&
          form.currencyIds.length > 0
        }
        onCancel={editor.close}
        onSave={() => editor.save(form)}
      >
        <FormControl fullWidth required>
          <InputLabel>Entity</InputLabel>
          <Select
            label="Entity"
            value={form.entityId}
            onChange={(e) =>
              setForm((f) => ({ ...f, entityId: e.target.value }))
            }
          >
            {entityOptions.map((e) => (
              <MenuItem key={e.id} value={e.id}>
                {e.name}
                {!e.isActive && " (inactive)"}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Bank name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          fullWidth
        />
        <Autocomplete<AccountingCurrency, true>
          multiple
          options={currencyOptions}
          getOptionLabel={(c) =>
            `${c.code} — ${c.name}${c.isActive ? "" : " (inactive)"}`
          }
          value={currencyOptions.filter((c) => form.currencyIds.includes(c.id))}
          onChange={(_, value) =>
            setForm((f) => ({ ...f, currencyIds: value.map((c) => c.id) }))
          }
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Currencies"
              required={form.currencyIds.length === 0}
              helperText="At least one currency"
            />
          )}
        />
      </FormDialog>
      <ConfirmDeleteDialog
        open={editor.deleting !== null}
        label={
          editor.deleting
            ? `${editor.deleting.name} (${editor.deleting.entity.name})`
            : ""
        }
        error={editor.error}
        busy={editor.busy}
        onCancel={editor.close}
        onConfirm={editor.remove}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------

function CurrenciesTab() {
  const ds = useDaylightAdminSx();
  const { data = [], isLoading, error } = useAccountingCurrencies();
  const editor = useRecordEditor<AccountingCurrency>("currencies");
  const [form, setForm] = useState({ code: "", name: "" });

  const openForm = (currency: AccountingCurrency | "new") => {
    setForm(
      currency === "new"
        ? { code: "", name: "" }
        : { code: currency.code, name: currency.name },
    );
    editor.setEditing(currency);
  };

  return (
    <>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openForm("new")}
          sx={ds.primaryBtnSx}
        >
          Add currency
        </Button>
      </Stack>
      {editor.pageError && (
        <Alert severity="error" sx={{ mb: 2, ...ds.alertSx("error") }}>
          {editor.pageError}
        </Alert>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableState
              loading={isLoading}
              error={error}
              empty={data.length === 0}
              colSpan={4}
            />
            {data.map((currency) => (
              <TableRow
                key={currency.id}
                sx={currency.isActive ? undefined : inactiveRowSx}
              >
                <TableCell sx={{ fontWeight: 600 }}>{currency.code}</TableCell>
                <TableCell>{currency.name}</TableCell>
                <TableCell>
                  <StatusBadge
                    status={currency.isActive ? "Active" : "Inactive"}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <RowActions
                    isActive={currency.isActive}
                    busy={editor.busy}
                    onEdit={() => openForm(currency)}
                    onToggle={() => editor.toggle(currency)}
                    onDelete={() => editor.setDeleting(currency)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <FormDialog
        open={editor.editing !== null}
        title={editor.editing === "new" ? "Add currency" : "Edit currency"}
        error={editor.error}
        busy={editor.busy}
        canSave={
          /^[A-Z0-9]{2,10}$/.test(form.code) && form.name.trim().length > 0
        }
        onCancel={editor.close}
        onSave={() => editor.save(form)}
      >
        <TextField
          label="Code"
          value={form.code}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              code: e.target.value.toUpperCase().replace(/\s/g, ""),
            }))
          }
          helperText="2–10 letters or digits, e.g. USD, AED, USDT"
          required
          autoFocus
          fullWidth
        />
        <TextField
          label="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          fullWidth
        />
      </FormDialog>
      <ConfirmDeleteDialog
        open={editor.deleting !== null}
        label={editor.deleting?.code ?? ""}
        error={editor.error}
        busy={editor.busy}
        onCancel={editor.close}
        onConfirm={editor.remove}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TABS = [
  { key: "banks", label: "Banks" },
  { key: "transfers", label: "Transfers" },
  { key: "entities", label: "Entities" },
  { key: "currencies", label: "Currencies" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function PaymentAccountsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentAccountsContent />
    </Suspense>
  );
}

function PaymentAccountsContent() {
  const ds = useDaylightAdminSx();
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = searchParams.get("tab");
  // Banks first; ?tab= keeps the tab on refresh and back from a statement.
  const tab: TabKey = TABS.some((t) => t.key === param)
    ? (param as TabKey)
    : "banks";
  const { data: banks } = useAccountingBanks();
  const { data: entities } = useAccountingEntities();
  const { data: currencies } = useAccountingCurrencies();
  const { data: transfers } = useBankTransfers();
  const counts: Record<TabKey, number | undefined> = {
    banks: banks?.length,
    transfers: transfers?.length,
    entities: entities?.length,
    currencies: currencies?.length,
  };

  return (
    <DaylightAdminPage>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={ds.pageTitleSx}>
          Entities, Banks &amp; Currencies
        </Typography>
        <Typography sx={ds.pageDescSx}>
          The paying and receiving accounts used when recording payments, and
          the transfers between them. Inactive records are hidden from payment
          forms but stay on past payments.
        </Typography>
      </Box>
      <Paper elevation={0} sx={{ ...ds.listCardSx, p: { xs: 2, sm: 3 } }}>
        <Tabs
          value={tab}
          onChange={(_, v: TabKey) =>
            router.replace(
              v === "banks"
                ? "/accounting/payment-accounts"
                : `/accounting/payment-accounts?tab=${v}`,
              { scroll: false },
            )
          }
          sx={{ ...ds.tabsSx, mb: 3 }}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          {TABS.map((t) => (
            <Tab
              key={t.key}
              value={t.key}
              label={
                counts[t.key] === undefined
                  ? t.label
                  : `${t.label} (${counts[t.key]})`
              }
            />
          ))}
        </Tabs>
        {tab === "banks" && <BanksTab />}
        {tab === "transfers" && <TransfersTab />}
        {tab === "entities" && <EntitiesTab />}
        {tab === "currencies" && <CurrenciesTab />}
      </Paper>
    </DaylightAdminPage>
  );
}
