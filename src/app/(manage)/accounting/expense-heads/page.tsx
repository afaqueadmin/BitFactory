"use client";

import {
  Alert,
  Box,
  Button,
  Paper,
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
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import {
  ConfirmDeleteDialog,
  FormDialog,
  inactiveRowSx,
  RowActions,
  TableState,
  useRecordEditor,
} from "@/components/accounting/masterData/MasterDataTable";
import { ExpenseHead, useExpenseHeads } from "@/lib/hooks/usePaymentAccounts";
import {
  DaylightAdminPage,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

export default function ExpenseHeadsPage() {
  const ds = useDaylightAdminSx();
  const { data = [], isLoading, error } = useExpenseHeads();
  const editor = useRecordEditor<ExpenseHead>("expense-heads");
  const [name, setName] = useState("");

  const openForm = (head: ExpenseHead | "new") => {
    setName(head === "new" ? "" : head.name);
    editor.setEditing(head);
  };

  return (
    <DaylightAdminPage>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={ds.pageTitleSx}>
          Expense Heads
        </Typography>
        <Typography sx={ds.pageDescSx}>
          The kinds of expense, such as Salary, Maintenance or Fuel. The Add
          expense form lists only active heads. A head used by an expense
          can&apos;t be deleted, only deactivated, so old expenses keep it.
        </Typography>
      </Box>
      <Paper elevation={0} sx={{ ...ds.listCardSx, p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => openForm("new")}
            sx={ds.primaryBtnSx}
          >
            Add head
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
                <TableCell align="right">Expenses</TableCell>
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
              {data.map((head) => (
                <TableRow
                  key={head.id}
                  sx={head.isActive ? undefined : inactiveRowSx}
                >
                  <TableCell>{head.name}</TableCell>
                  <TableCell align="right">{head._count.expenses}</TableCell>
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
      </Paper>

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
          helperText="e.g. Salary, Maintenance, Fuel"
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
    </DaylightAdminPage>
  );
}
