"use client";

/**
 * Capital & Income -> Heads tab: the kinds of money added to our banks
 * without an invoice (Initial Deposit, Equity, Loan, ...). The Add entry
 * form lists only active heads. A head used by an entry can't be deleted,
 * only deactivated, so old entries keep it.
 */

import {
  Alert,
  Button,
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
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import {
  SortHeader,
  useTableSort,
} from "@/components/accounting/common/SortableHeader";
import { ExportButtons } from "@/components/accounting/bankStatement/StatementParts";
import {
  INCOME_HEAD_DEFAULT_SORT,
  IncomeHeadSortKey,
  IncomeHeadStatusFilter,
  incomeHeadListQuery,
  incomeHeadListRows,
} from "@/lib/accounting/capitalIncomeLists";
import { downloadExport } from "@/lib/downloadExport";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import {
  ConfirmDeleteDialog,
  FormDialog,
  inactiveRowSx,
  RowActions,
  TableState,
  useRecordEditor,
} from "@/components/accounting/masterData/MasterDataTable";
import { IncomeHead, useIncomeHeads } from "@/lib/hooks/usePaymentAccounts";
import { useDaylightAdminSx } from "@/components/daylight/AdminPage";
import { useDaylight } from "@/lib/daylight";

const numSx = {
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
} as const;

export function IncomeHeadsTab() {
  const ds = useDaylightAdminSx();
  const { d } = useDaylight();
  const { data = [], isLoading, error } = useIncomeHeads();
  const editor = useRecordEditor<IncomeHead>("capital-income-heads");
  const [name, setName] = useState("");
  const [statusFilter, setStatusFilter] = useState<IncomeHeadStatusFilter>("");
  const sort = useTableSort<IncomeHeadSortKey>(
    INCOME_HEAD_DEFAULT_SORT.key,
    INCOME_HEAD_DEFAULT_SORT.dir,
  );
  // The export gets the same filter and sort, so it holds exactly these rows.
  const rows = incomeHeadListRows(data, statusFilter, sort);

  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const handleExport = async (format: "csv" | "pdf") => {
    try {
      setExporting(format);
      setExportError(null);
      const query = incomeHeadListQuery(statusFilter, sort);
      query.set("format", format);
      query.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
      await downloadExport(
        `/api/accounting/capital-income-heads/export?${query.toString()}`,
        `capital-income-heads-${new Date().toLocaleDateString("en-CA")}.${format}`,
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to download export",
      );
    } finally {
      setExporting(null);
    }
  };

  const openForm = (head: IncomeHead | "new") => {
    setName(head === "new" ? "" : head.name);
    editor.setEditing(head);
  };

  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 2 }}
      >
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>Status</InputLabel>
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as IncomeHeadStatusFilter)
            }
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </Select>
        </FormControl>
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
            onClick={() => openForm("new")}
            sx={ds.primaryBtnSx}
          >
            Add head
          </Button>
        </Stack>
      </Stack>
      {exportError && (
        <Alert severity="error" sx={{ mb: 2, ...ds.alertSx("error") }}>
          {exportError}
        </Alert>
      )}
      {editor.pageError && (
        <Alert severity="error" sx={{ mb: 2, ...ds.alertSx("error") }}>
          {editor.pageError}
        </Alert>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortHeader sort={sort} sortKey="name" label="Name" />
              <SortHeader
                sort={sort}
                sortKey="entries"
                label="Entries"
                align="right"
              />
              <SortHeader
                sort={sort}
                sortKey="received"
                label="Received (USD)"
                align="right"
              />
              <SortHeader
                sort={sort}
                sortKey="fees"
                label="Fees (USD)"
                align="right"
              />
              <SortHeader sort={sort} sortKey="status" label="Status" />
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
            {rows.map((head) => (
              <TableRow
                key={head.id}
                sx={head.isActive ? undefined : inactiveRowSx}
              >
                <TableCell>{head.name}</TableCell>
                <TableCell align="right">{head._count.entries}</TableCell>
                <TableCell align="right" sx={numSx}>
                  <CurrencyDisplay value={head.receivedUsd ?? 0} />
                </TableCell>
                <TableCell align="right" sx={numSx}>
                  <CurrencyDisplay value={head.feesUsd ?? 0} />
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={head.isActive ? "Active" : "Inactive"}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <RowActions
                    isActive={head.isActive}
                    busy={editor.busy}
                    onEdit={() => openForm(head)}
                    onToggle={() => editor.toggle(head)}
                    onDelete={() => editor.setDeleting(head)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography sx={{ mt: 1.5, fontSize: 12, color: d.muted }}>
        The kinds of money added to our banks without an invoice, such as
        Initial Deposit, Equity or Loan. The Add entry form lists only active
        heads. A head used by an entry can&apos;t be deleted, only deactivated,
        so old entries keep it.
      </Typography>

      <FormDialog
        open={editor.editing !== null}
        title={editor.editing === "new" ? "Add head" : "Rename head"}
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
          helperText="e.g. Initial Deposit, Equity, Loan"
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
