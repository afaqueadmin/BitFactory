"use client";

import {
  Box,
  Button,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import {
  computeRepairTotals,
  REPAIR_DESCRIPTION_MAX,
  repairLineAmount,
} from "@/lib/accounting/hardwareRepair";
import { RepairLineItemDraft } from "@/lib/hooks/useRepairInvoices";

interface RepairLineItemsEditorProps {
  lineItems: RepairLineItemDraft[];
  onChange: (lineItems: RepairLineItemDraft[]) => void;
  discount: number;
  onDiscountChange: (discount: number) => void;
  disabled?: boolean;
}

export const emptyRepairLine = (): RepairLineItemDraft => ({
  description: "",
  quantity: 1,
  unitPrice: 0,
});

const money = (value: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** DESCRIPTION | QTY | RATE | AMOUNT rows, with Discount and totals. */
export function RepairLineItemsEditor({
  lineItems,
  onChange,
  discount,
  onDiscountChange,
  disabled = false,
}: RepairLineItemsEditorProps) {
  const { subtotal, total } = computeRepairTotals(lineItems, discount);
  const discountTooHigh = discount > subtotal;

  const updateRow = (index: number, patch: Partial<RepairLineItemDraft>) =>
    onChange(
      lineItems.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  return (
    <Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Description</TableCell>
            <TableCell align="right" sx={{ width: 110 }}>
              Qty
            </TableCell>
            <TableCell align="right" sx={{ width: 150 }}>
              Rate (USD)
            </TableCell>
            <TableCell align="right" sx={{ width: 140 }}>
              Amount (USD)
            </TableCell>
            <TableCell sx={{ width: 48 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {lineItems.map((item, index) => (
            <TableRow key={index}>
              <TableCell>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="e.g. Hashboard replacement"
                  value={item.description}
                  onChange={(e) =>
                    updateRow(index, { description: e.target.value })
                  }
                  inputProps={{ maxLength: REPAIR_DESCRIPTION_MAX }}
                  disabled={disabled}
                />
              </TableCell>
              <TableCell align="right">
                <TextField
                  type="number"
                  size="small"
                  value={item.quantity}
                  onChange={(e) =>
                    updateRow(index, {
                      quantity: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  inputProps={{
                    min: 1,
                    step: 1,
                    style: { textAlign: "right" },
                  }}
                  sx={{ width: 90 }}
                  disabled={disabled}
                />
              </TableCell>
              <TableCell align="right">
                <TextField
                  type="number"
                  size="small"
                  value={item.unitPrice}
                  onChange={(e) =>
                    updateRow(index, {
                      unitPrice: parseFloat(e.target.value) || 0,
                    })
                  }
                  inputProps={{
                    min: 0,
                    step: 0.01,
                    style: { textAlign: "right" },
                  }}
                  sx={{ width: 130 }}
                  disabled={disabled}
                />
              </TableCell>
              <TableCell align="right">
                $
                {money(
                  repairLineAmount(item.quantity || 0, item.unitPrice || 0),
                )}
              </TableCell>
              <TableCell align="right">
                <IconButton
                  size="small"
                  onClick={() =>
                    onChange(lineItems.filter((_, i) => i !== index))
                  }
                  disabled={disabled || lineItems.length === 1}
                  aria-label="Remove line item"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Button
        startIcon={<AddIcon />}
        onClick={() => onChange([...lineItems, emptyRepairLine()])}
        disabled={disabled}
        sx={{ mt: 1 }}
      >
        Add Line Item
      </Button>

      <Box
        sx={{
          mt: 2,
          ml: "auto",
          maxWidth: 360,
          p: 2,
          backgroundColor: "#f5f5f5",
          borderRadius: 1,
        }}
      >
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between">
            <Typography color="textSecondary">Subtotal</Typography>
            <Typography>${money(subtotal)}</Typography>
          </Stack>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography color="textSecondary">Discount (USD)</Typography>
            <TextField
              type="number"
              size="small"
              value={discount}
              onChange={(e) =>
                onDiscountChange(Math.max(0, parseFloat(e.target.value) || 0))
              }
              inputProps={{ min: 0, step: 0.01, style: { textAlign: "right" } }}
              sx={{ width: 140 }}
              error={discountTooHigh}
              helperText={discountTooHigh ? "More than subtotal" : undefined}
              disabled={disabled}
            />
          </Stack>
          <Stack
            direction="row"
            justifyContent="space-between"
            sx={{ borderTop: "1px solid #ddd", pt: 1 }}
          >
            <Typography sx={{ fontWeight: "bold" }}>Total</Typography>
            <Typography sx={{ fontWeight: "bold" }}>${money(total)}</Typography>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
