"use client";

import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
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
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ToggleOnIcon from "@mui/icons-material/ToggleOn";
import ToggleOffIcon from "@mui/icons-material/ToggleOff";
import { ReactNode, useState } from "react";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import {
  AccountingBank,
  AccountingCurrency,
  AccountingEntity,
  useAccountingBanks,
  useAccountingCurrencies,
  useAccountingEntities,
  useSavePaymentAccount,
} from "@/lib/hooks/usePaymentAccounts";

const inactiveRowSx = { opacity: 0.55 };

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function RowActions({
  isActive,
  onEdit,
  onToggle,
  onDelete,
  busy,
}: {
  isActive: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
      <Tooltip title="Edit">
        <IconButton size="small" onClick={onEdit} disabled={busy}>
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={isActive ? "Deactivate" : "Activate"}>
        <IconButton size="small" onClick={onToggle} disabled={busy}>
          {isActive ? (
            <ToggleOnIcon fontSize="small" color="success" />
          ) : (
            <ToggleOffIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete">
        <IconButton size="small" onClick={onDelete} disabled={busy}>
          <DeleteIcon fontSize="small" color="error" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function ConfirmDeleteDialog({
  open,
  label,
  error,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  label: string;
  error: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Delete {label}?</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>
            This can&apos;t be undone. Records in use can only be deactivated.
          </DialogContentText>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Deleting..." : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function FormDialog({
  open,
  title,
  error,
  busy,
  canSave,
  onCancel,
  onSave,
  children,
}: {
  open: boolean;
  title: string;
  error: string | null;
  busy: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {children}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onSave}
          disabled={busy || !canSave}
        >
          {busy ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TableState({
  loading,
  error,
  empty,
  colSpan,
}: {
  loading: boolean;
  error: Error | null;
  empty: boolean;
  colSpan: number;
}) {
  if (!loading && !error && !empty) return null;
  return (
    <TableRow>
      <TableCell colSpan={colSpan} align="center" sx={{ py: 4 }}>
        {loading ? (
          <CircularProgress size={24} />
        ) : error ? (
          <Alert severity="error">{error.message}</Alert>
        ) : (
          <Typography color="text.secondary">Nothing added yet</Typography>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Edit/delete/toggle state shared by the three tabs. `save` and `remove`
 * surface the API's error message (e.g. a 409 "in use") in the dialog.
 */
function useRecordEditor<T extends { id: string }>(
  kind: "entities" | "banks" | "currencies",
) {
  const mutation = useSavePaymentAccount(kind);
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const close = () => {
    setEditing(null);
    setDeleting(null);
    setError(null);
  };

  const save = async (data: Record<string, unknown>) => {
    setError(null);
    try {
      await mutation.mutateAsync(
        editing && editing !== "new"
          ? { id: editing.id, method: "PUT", data }
          : { method: "POST", data },
      );
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setError(null);
    try {
      await mutation.mutateAsync({ id: deleting.id, method: "DELETE" });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const toggle = async (record: T & { isActive: boolean }) => {
    setPageError(null);
    try {
      await mutation.mutateAsync({
        id: record.id,
        method: "PUT",
        data: { isActive: !record.isActive },
      });
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  return {
    editing,
    setEditing,
    deleting,
    setDeleting,
    error,
    pageError,
    busy: mutation.isPending,
    close,
    save,
    remove,
    toggle,
  };
}

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
