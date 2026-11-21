"use client";

/**
 * Pay expense from a bank's statement page: pick an expense that still has
 * a balance (Pending or Partially paid), optionally narrowed by head, then
 * the usual ExpensePaymentDialog opens with this bank pre-filled.
 */

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { dayLabel } from "@/components/accounting/bankStatement/StatementParts";
import { ExpensePaymentDialog } from "@/components/accounting/expenses/ExpensePaymentDialog";
import {
  AccountingBank,
  useExpenseHeads,
} from "@/lib/hooks/usePaymentAccounts";
import { Expense, useExpenses } from "@/lib/hooks/useExpenses";

export function PayExpenseDialog({
  bank,
  onClose,
}: {
  /** The bank whose statement this was opened from. */
  bank?: AccountingBank;
  onClose: () => void;
}) {
  const { data = [], isLoading, error } = useExpenses();
  const { data: heads = [] } = useExpenseHeads();
  const [headFilter, setHeadFilter] = useState("");
  const [picked, setPicked] = useState<Expense | null>(null);

  // Only expenses with something left to pay; newest first, as loaded.
  const unpaid = data.filter((e) => e.status !== "PAID");
  const rows = unpaid.filter((e) => !headFilter || e.head.id === headFilter);
  const headOptions = heads.filter((h) =>
    unpaid.some((e) => e.head.id === h.id),
  );

  if (picked) {
    return (
      <ExpensePaymentDialog
        expense={picked}
        defaultBank={bank}
        onClose={onClose}
      />
    );
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Pay expense
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          Pick the expense to pay{bank ? ` from ${bank.name}` : ""}. Only
          pending and partially paid expenses are listed.
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error.message}</Alert>}
          <FormControl size="small" fullWidth>
            <InputLabel>Account Head</InputLabel>
            <Select
              label="Account Head"
              value={headFilter}
              onChange={(e) => setHeadFilter(e.target.value)}
            >
              <MenuItem value="">All heads</MenuItem>
              {headOptions.map((h) => (
                <MenuItem key={h.id} value={h.id}>
                  {h.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : rows.length === 0 ? (
            <Typography sx={{ color: "text.secondary", py: 2 }}>
              No unpaid expenses
              {headFilter ? " for this head" : ""}. Add one on the Expenses page
              first.
            </Typography>
          ) : (
            <List
              dense
              disablePadding
              sx={{
                maxHeight: 360,
                overflowY: "auto",
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
              }}
            >
              {rows.map((e) => (
                <ListItemButton key={e.id} divider onClick={() => setPicked(e)}>
                  <ListItemText
                    primary={`${e.entryLabel} · ${e.head.name}`}
                    secondary={
                      <>
                        {dayLabel(e.date)}
                        {e.narration ? ` · ${e.narration}` : ""}
                      </>
                    }
                    slotProps={{
                      primary: { sx: { fontWeight: 650 } },
                      secondary: { noWrap: true },
                    }}
                    sx={{ minWidth: 0 }}
                  />
                  <Box sx={{ textAlign: "right", pl: 2, flexShrink: 0 }}>
                    <Typography
                      sx={{
                        fontWeight: 650,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <CurrencyDisplay value={e.balanceUsd} />
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                      {e.status === "PARTIAL" ? "remaining" : "due"}
                    </Typography>
                  </Box>
                </ListItemButton>
              ))}
            </List>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
