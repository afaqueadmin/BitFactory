"use client";

/**
 * Add / Edit expense: Date, Head, Narration, an optional PDF and an
 * optional Excel sheet, Amount Due (USD) and the Balance (read-only).
 * Payments are recorded separately (ExpensePaymentDialog). The server
 * re-checks everything, including that Amount Due covers what was paid.
 */

import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import {
  PdfUploadField,
  UploadedPdf,
} from "@/components/accounting/common/PdfUploadField";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { dayLabel } from "@/components/accounting/bankStatement/StatementParts";
import { useExpenseHeads } from "@/lib/hooks/usePaymentAccounts";
import { Expense, useSaveExpense } from "@/lib/hooks/useExpenses";

const today = () => new Date().toLocaleDateString("en-CA");

/** A USD amount as typed: > 0, up to 2 decimals. */
const validDue = (v: string) =>
  /^\s*\d+(\.\d{1,2})?\s*$/.test(v) && Number(v) > 0;

export function ExpenseDialog({
  expense,
  onClose,
}: {
  /** Edit this expense; absent = add a new one. */
  expense?: Expense;
  onClose: () => void;
}) {
  const save = useSaveExpense();
  const { data: heads = [], isLoading: headsLoading } = useExpenseHeads(true);
  // Editing keeps a head that has since been deactivated.
  const headOptions =
    expense && !heads.some((h) => h.id === expense.head.id)
      ? [...heads, { ...expense.head, _count: { expenses: 0 } }]
      : heads;

  const [date, setDate] = useState(expense?.date ?? today());
  const [headId, setHeadId] = useState(expense?.head.id ?? "");
  const [narration, setNarration] = useState(expense?.narration ?? "");
  const [due, setDue] = useState(expense?.amountDueUsd ?? "");
  const [pdf, setPdf] = useState<UploadedPdf | null>(
    expense?.pdf
      ? { key: expense.pdf.key, fileName: expense.pdf.fileName }
      : null,
  );
  const [sheet, setSheet] = useState<UploadedPdf | null>(
    expense?.sheet
      ? { key: expense.sheet.key, fileName: expense.sheet.fileName }
      : null,
  );
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paid = Number(expense?.paidUsd ?? 0);
  const dueOk = validDue(due);
  const dueNum = dueOk ? Number(due) : null;
  const belowPaid = dueNum !== null && dueNum < paid;
  // The date can't move after the first payment's (the server checks too).
  const firstPayment =
    expense?.payments.map((p) => p.date).sort()[0] ?? undefined;
  const afterFirstPayment = !!date && !!firstPayment && date > firstPayment;

  const canSave =
    !!date &&
    !afterFirstPayment &&
    !!headId &&
    dueOk &&
    !belowPaid &&
    !uploadingPdf &&
    !uploadingSheet &&
    !save.isPending;

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    try {
      await save.mutateAsync({
        id: expense?.id,
        method: expense ? "PUT" : "POST",
        data: {
          date,
          headId,
          narration,
          amountDueUsd: due.trim(),
          pdf,
          sheet,
        },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the expense");
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{expense ? "Edit expense" : "Add expense"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            fullWidth
            error={afterFirstPayment}
            helperText={
              firstPayment
                ? afterFirstPayment
                  ? `Can't be after the first payment (${dayLabel(firstPayment)})`
                  : `Up to the first payment's date (${dayLabel(firstPayment)})`
                : undefined
            }
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: firstPayment ? { max: firstPayment } : undefined,
            }}
          />
          <FormControl fullWidth required disabled={headsLoading}>
            <InputLabel>Account Head</InputLabel>
            <Select
              label="Account Head"
              value={headId}
              onChange={(e) => setHeadId(e.target.value)}
            >
              {headOptions.map((h) => (
                <MenuItem key={h.id} value={h.id}>
                  {h.name}
                  {h.isActive ? "" : " (inactive)"}
                </MenuItem>
              ))}
            </Select>
            {!headsLoading && headOptions.length === 0 && (
              <FormHelperText>
                No active heads. Add one under Finance Settings → Expense Heads.
              </FormHelperText>
            )}
          </FormControl>
          <TextField
            label="Narration"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            helperText="What the expense is for"
          />
          <PdfUploadField
            label="PDF (optional)"
            purpose="expense-attachment"
            value={pdf}
            onChange={setPdf}
            onUploadingChange={setUploadingPdf}
            disabled={save.isPending}
          />
          <PdfUploadField
            label="Excel sheet (optional)"
            fileKind="sheet"
            purpose="expense-sheet"
            value={sheet}
            onChange={setSheet}
            onUploadingChange={setUploadingSheet}
            disabled={save.isPending}
          />
          <TextField
            label="Amount due"
            type="number"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            required
            fullWidth
            error={(due.trim() !== "" && !dueOk) || belowPaid}
            helperText={
              due.trim() !== "" && !dueOk
                ? "Enter an amount greater than 0, up to 2 decimals"
                : belowPaid
                  ? `Can't be less than the $${paid.toFixed(2)} already paid`
                  : undefined
            }
            slotProps={{
              htmlInput: { min: 0, step: 0.01 },
              input: {
                endAdornment: (
                  <InputAdornment position="end">USD</InputAdornment>
                ),
              },
            }}
          />
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1,
              bgcolor: "action.hover",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 2,
            }}
          >
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 650 }}>
                Balance (USD)
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                Amount due − amount paid
                {paid > 0 && (
                  <>
                    {" "}
                    (<CurrencyDisplay value={paid} /> paid)
                  </>
                )}
              </Typography>
            </Box>
            <Typography
              sx={{
                fontSize: 16,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {dueNum !== null ? (
                <CurrencyDisplay value={dueNum - paid} />
              ) : (
                "—"
              )}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          {save.isPending
            ? "Saving..."
            : expense
              ? "Save changes"
              : "Add expense"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
