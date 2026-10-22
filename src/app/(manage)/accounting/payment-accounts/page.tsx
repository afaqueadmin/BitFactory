"use client";

import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Container,
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
import { useState } from "react";
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
} from "@/lib/hooks/usePaymentAccounts";

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

function EntitiesTab() {
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
        >
          Add entity
        </Button>
      </Stack>
      {editor.pageError && (
        <Alert severity="error" sx={{ mb: 2 }}>
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
  const { data = [], isLoading, error } = useAccountingBanks();
  const { data: entities = [] } = useAccountingEntities();
  const { data: currencies = [] } = useAccountingCurrencies();
  const editor = useRecordEditor<AccountingBank>("banks");
  const [entityFilter, setEntityFilter] = useState("");
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
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openForm("new")}
        >
          Add bank
        </Button>
      </Stack>
      {editor.pageError && (
        <Alert severity="error" sx={{ mb: 2 }}>
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
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableState
              loading={isLoading}
              error={error}
              empty={rows.length === 0}
              colSpan={5}
            />
            {rows.map((bank) => (
              <TableRow
                key={bank.id}
                sx={bank.isActive ? undefined : inactiveRowSx}
              >
                <TableCell>{bank.name}</TableCell>
                <TableCell>{bank.entity.name}</TableCell>
                <TableCell>
                  <Stack
                    direction="row"
                    spacing={0.5}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    {bank.currencies.map(({ currency }) => (
                      <Chip
                        key={currency.id}
                        label={currency.code}
                        size="small"
                        variant={currency.isActive ? "filled" : "outlined"}
                      />
                    ))}
                  </Stack>
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
          </TableBody>
        </Table>
      </TableContainer>

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
        >
          Add currency
        </Button>
      </Stack>
      {editor.pageError && (
        <Alert severity="error" sx={{ mb: 2 }}>
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

export default function PaymentAccountsPage() {
  const [tab, setTab] = useState(0);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: "bold" }}>
          Entities, Banks &amp; Currencies
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          The paying and receiving accounts used when recording payments.
          Inactive records are hidden from payment forms but stay on past
          payments.
        </Typography>
      </Box>
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab label="Entities" />
          <Tab label="Banks" />
          <Tab label="Currencies" />
        </Tabs>
        {tab === 0 && <EntitiesTab />}
        {tab === 1 && <BanksTab />}
        {tab === 2 && <CurrenciesTab />}
      </Paper>
    </Container>
  );
}
