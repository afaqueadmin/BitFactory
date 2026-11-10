"use client";

/**
 * Entities, Banks & Currencies -> Transfers: every internal bank transfer,
 * newest first, with Record / Edit / Delete.
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import Link from "next/link";
import { useState } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { formatCurrencyAmount } from "@/components/accounting/common/PaymentAccountFields";
import { TableState } from "@/components/accounting/masterData/MasterDataTable";
import { TransferDialog } from "@/components/accounting/bankTransfer/TransferDialog";
import {
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import { useDaylight } from "@/lib/daylight";
import {
  BankTransfer,
  BankTransferSide,
  useAccountingBanks,
  useAccountingEntities,
  useBankTransfers,
  useSaveBankTransfer,
} from "@/lib/hooks/usePaymentAccounts";

const statementHref = (bankId: string) =>
  `/accounting/payment-accounts/banks/${bankId}`;

function SideCell({ side }: { side: BankTransferSide }) {
  const { d } = useDaylight();
  return (
    <Box sx={{ minWidth: 140 }}>
      <Link
        href={statementHref(side.bankId)}
        style={{ color: d.action, textDecoration: "none", fontWeight: 650 }}
      >
        {side.bankName}
      </Link>
      <Box sx={{ fontSize: 12, color: d.muted, mt: 0.25 }}>
        {side.entityName}
      </Box>
    </Box>
  );
}

function AmountCell({
  side,
  label,
}: {
  side: BankTransferSide;
  label: string;
}) {
  const { d } = useDaylight();
  const fee = Number(side.fee);
  return (
    <Box sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
      {formatCurrencyAmount(side.amount, side.currencyCode)}
      {fee > 0 && (
        <Box sx={{ fontSize: 12, color: d.muted }}>
          {label} fee {formatCurrencyAmount(side.fee, side.currencyCode)} (
          <CurrencyDisplay value={side.feeUsd} />)
        </Box>
      )}
    </Box>
  );
}

export function TransfersTab() {
  const ds = useDaylightAdminSx();
  const { d } = useDaylight();
  const { data = [], isLoading, error } = useBankTransfers();
  const { data: entities = [] } = useAccountingEntities();
  const { data: banks = [] } = useAccountingBanks();
  const save = useSaveBankTransfer();
  const [entityFilter, setEntityFilter] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [editing, setEditing] = useState<BankTransfer | "new" | null>(null);
  const [deleting, setDeleting] = useState<BankTransfer | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const rows = data.filter(
    (t) =>
      (!entityFilter ||
        t.from.entityId === entityFilter ||
        t.to.entityId === entityFilter) &&
      (!bankFilter ||
        t.from.bankId === bankFilter ||
        t.to.bankId === bankFilter),
  );
  const bankOptions = banks.filter(
    (b) => !entityFilter || b.entityId === entityFilter,
  );

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
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Entity</InputLabel>
            <Select
              label="Entity"
              value={entityFilter}
              onChange={(e) => {
                setEntityFilter(e.target.value);
                setBankFilter("");
              }}
            >
              <MenuItem value="">All entities</MenuItem>
              {entities.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Bank</InputLabel>
            <Select
              label="Bank"
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
            >
              <MenuItem value="">All banks</MenuItem>
              {bankOptions.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                  {entityFilter ? "" : ` (${b.entity.name})`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
        <Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setEditing("new")}
            sx={ds.primaryBtnSx}
          >
            Record transfer
          </Button>
        </Box>
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>From</TableCell>
              <TableCell>To</TableCell>
              <TableCell align="right">Sent</TableCell>
              <TableCell align="right">Received</TableCell>
              <TableCell align="right">Value (USD)</TableCell>
              <TableCell>Reference / Note</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableState
              loading={isLoading}
              error={error}
              empty={rows.length === 0}
              colSpan={8}
            />
            {rows.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  <DateDisplay date={`${t.date}T12:00:00.000Z`} />
                </TableCell>
                <TableCell>
                  <SideCell side={t.from} />
                </TableCell>
                <TableCell>
                  <SideCell side={t.to} />
                </TableCell>
                <TableCell align="right">
                  <AmountCell side={t.from} label="Sending" />
                </TableCell>
                <TableCell align="right">
                  <AmountCell side={t.to} label="Receiving" />
                  {t.from.currencyCode !== t.to.currencyCode && (
                    <Box sx={{ fontSize: 12, color: d.muted }}>
                      1 {t.from.currencyCode} = {t.conversionRate}{" "}
                      {t.to.currencyCode}
                    </Box>
                  )}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 650,
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <CurrencyDisplay value={t.amountUsd} />
                </TableCell>
                <TableCell sx={{ minWidth: 180, maxWidth: 320 }}>
                  <Stack spacing={0.5} alignItems="flex-start">
                    {t.interCompany && (
                      <DaylightStatusPill
                        label="Inter-company"
                        tone="warning"
                      />
                    )}
                    {t.reference && (
                      <Typography variant="caption">
                        ref {t.reference}
                      </Typography>
                    )}
                    {t.note && (
                      <Typography variant="caption" sx={{ color: d.muted }}>
                        {t.note}
                      </Typography>
                    )}
                    {t.receiptHref && (
                      <MuiLink
                        href={t.receiptHref}
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
                  </Stack>
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
                        onClick={() => setEditing(t)}
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
                          setDeleting(t);
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
          </TableBody>
        </Table>
      </TableContainer>
      <Typography sx={{ mt: 1.5, fontSize: 12, color: d.muted }}>
        A transfer is a Credit on the sending bank and a Debit on the receiving
        bank, at the same USD value. Each bank&apos;s fee is its own Credit row
        on that bank&apos;s statement.
      </Typography>

      {editing !== null && (
        <TransferDialog
          key={editing === "new" ? "new" : editing.id}
          transfer={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete this transfer?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {deleting && (
              <DialogContentText>
                {formatCurrencyAmount(
                  deleting.from.amount,
                  deleting.from.currencyCode,
                )}{" "}
                from {deleting.from.bankName} to {deleting.to.bankName} on{" "}
                {deleting.date}. Both banks&apos; balances change back, and its
                receipt PDF is deleted. This can&apos;t be undone.
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
