"use client";

import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";

export type LineItemType = "HARDWARE" | "HOSTING_COLOCATION";

export interface LineItem {
  hardwareId: string;
  model: string;
  quantity: number;
  unitPrice: number;
  lineItemType: LineItemType;
}

export interface HardwareOption {
  id: string;
  model: string;
}

interface LineItemsEditorProps {
  lineItems: LineItem[];
  onChange: (lineItems: LineItem[]) => void;
  hardwareList: HardwareOption[];
  disabled?: boolean;
  excludeUsedModels?: boolean;
  enableHostingColocation?: boolean;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// Hardware rows always render/submit above Hosting & Colocation rows,
// regardless of the order they were added in.
const LINE_ITEM_TYPE_RANK: Record<LineItemType, number> = {
  HARDWARE: 0,
  HOSTING_COLOCATION: 1,
};

export function sortLineItems<T extends { lineItemType: LineItemType }>(
  items: T[],
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const rankDiff =
        LINE_ITEM_TYPE_RANK[a.item.lineItemType] -
        LINE_ITEM_TYPE_RANK[b.item.lineItemType];
      return rankDiff !== 0 ? rankDiff : a.index - b.index;
    })
    .map(({ item }) => item);
}

export function LineItemsEditor({
  lineItems,
  onChange,
  hardwareList,
  disabled = false,
  excludeUsedModels = false,
  enableHostingColocation = false,
}: LineItemsEditorProps) {
  const [newHardwareId, setNewHardwareId] = useState("");

  const hardwareRows = lineItems.filter(
    (item) => item.lineItemType === "HARDWARE",
  );
  const usedHardwareIds = new Set(hardwareRows.map((item) => item.hardwareId));
  const addableHardwareList = excludeUsedModels
    ? hardwareList.filter((hw) => !usedHardwareIds.has(hw.id))
    : hardwareList;

  const hostingableHardwareRows = hardwareRows.filter(
    (hw) =>
      !lineItems.some(
        (item) =>
          item.lineItemType === "HOSTING_COLOCATION" &&
          item.hardwareId === hw.hardwareId,
      ),
  );

  const totalMiners = lineItems.reduce(
    (sum, item) => sum + (item.quantity || 0),
    0,
  );
  const totalAmount = round2(
    lineItems.reduce(
      (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
      0,
    ),
  );

  const updateRow = (index: number, patch: Partial<LineItem>) => {
    const next = lineItems.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    onChange(next);
  };

  const removeRow = (index: number) => {
    const removed = lineItems[index];
    // Removing a hardware model also removes its paired hosting row, if any.
    const next = lineItems.filter((item, i) => {
      if (i === index) return false;
      if (
        removed?.lineItemType === "HARDWARE" &&
        item.lineItemType === "HOSTING_COLOCATION" &&
        item.hardwareId === removed.hardwareId
      ) {
        return false;
      }
      return true;
    });
    onChange(next);
  };

  const addRow = () => {
    const hardware = hardwareList.find((h) => h.id === newHardwareId);
    if (!hardware) return;
    onChange([
      ...lineItems,
      {
        hardwareId: hardware.id,
        model: hardware.model,
        quantity: 1,
        unitPrice: 0,
        lineItemType: "HARDWARE",
      },
    ]);
    setNewHardwareId("");
  };

  const addHostingRows = () => {
    const newRows: LineItem[] = hostingableHardwareRows.map((hw) => ({
      hardwareId: hw.hardwareId,
      model: `Hosting & Colocation (${hw.model})`,
      quantity: hw.quantity,
      unitPrice: 0,
      lineItemType: "HOSTING_COLOCATION",
    }));
    if (newRows.length === 0) return;
    onChange([...lineItems, ...newRows]);
  };

  const displayOrder = lineItems
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const rankDiff =
        LINE_ITEM_TYPE_RANK[a.item.lineItemType] -
        LINE_ITEM_TYPE_RANK[b.item.lineItemType];
      return rankDiff !== 0 ? rankDiff : a.index - b.index;
    });

  return (
    <Box>
      <Box
        sx={{
          p: 2,
          backgroundColor: "#f5f5f5",
          borderRadius: 1,
          mb: 2,
        }}
      >
        <strong>Total Number of Miners: {totalMiners}</strong>
      </Box>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Model</TableCell>
            <TableCell align="right">Number of Miners</TableCell>
            <TableCell align="right">Unit Price (USD)</TableCell>
            <TableCell align="right">Total Price (USD)</TableCell>
            <TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {lineItems.length === 0 && (
            <TableRow>
              <TableCell colSpan={5}>
                <Typography variant="body2" color="textSecondary">
                  No line items yet. Select a customer to auto-load their
                  miners, or add a line item manually.
                </Typography>
              </TableCell>
            </TableRow>
          )}
          {displayOrder.map(({ item, index }) => {
            const rowTotal = round2(
              (item.quantity || 0) * (item.unitPrice || 0),
            );
            return (
              <TableRow key={index}>
                <TableCell>{item.model}</TableCell>
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
                      min: 0,
                      step: 1,
                      style: { textAlign: "right" },
                    }}
                    sx={{ width: 110 }}
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
                <TableCell align="right">${rowTotal.toFixed(2)}</TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={() => removeRow(index)}
                    disabled={disabled}
                    aria-label="Remove line item"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 2 }}>
        <TextField
          select
          size="small"
          label="Add hardware model"
          value={newHardwareId}
          onChange={(e) => setNewHardwareId(e.target.value)}
          sx={{ minWidth: 220 }}
          disabled={disabled || addableHardwareList.length === 0}
        >
          <MenuItem value="">-- Select model --</MenuItem>
          {addableHardwareList.map((hw) => (
            <MenuItem key={hw.id} value={hw.id}>
              {hw.model}
            </MenuItem>
          ))}
        </TextField>
        <Button
          startIcon={<AddIcon />}
          onClick={addRow}
          disabled={disabled || !newHardwareId}
        >
          Add Line Item
        </Button>
      </Box>

      {enableHostingColocation && (
        <Box sx={{ mt: 1 }}>
          <Button
            startIcon={<AddIcon />}
            onClick={addHostingRows}
            disabled={disabled || hostingableHardwareRows.length === 0}
          >
            Add Hosting & Colocation
          </Button>
        </Box>
      )}

      <Box sx={{ p: 2, backgroundColor: "#f5f5f5", borderRadius: 1, mt: 2 }}>
        <strong>Total Amount: ${totalAmount.toFixed(2)}</strong>
      </Box>
    </Box>
  );
}
