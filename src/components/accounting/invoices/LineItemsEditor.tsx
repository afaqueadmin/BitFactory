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
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import SubdirectoryArrowRightIcon from "@mui/icons-material/SubdirectoryArrowRight";
import {
  consecutiveBillingMonths,
  hostingLineItemLabel,
  sortInvoiceLineItems,
  startOfBillingMonth,
} from "@/lib/accounting/hostingMonths";

export type LineItemType = "HARDWARE" | "HOSTING_COLOCATION" | "DISCOUNT";

export interface LineItem {
  // Client-side id for the row; a DISCOUNT points at its row's key through
  // parentKey. Saved rows reuse their database id.
  key: string;
  parentKey?: string | null;
  // Empty on DISCOUNT rows.
  hardwareId: string;
  // The row label; on a DISCOUNT row, the admin's own wording.
  model: string;
  quantity: number;
  // On a DISCOUNT row, the (positive) amount taken off.
  unitPrice: number;
  lineItemType: LineItemType;
  // HOSTING_COLOCATION rows only: ISO date of the first day of the month
  // the row bills for. Null/absent on HARDWARE rows and older hosting rows.
  billingMonth?: string | null;
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
  enableDiscounts?: boolean;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

const DISCOUNT_LABEL_MAX_LENGTH = 100;
const DEFAULT_DISCOUNT_LABEL = "Discount";

export const newLineItemKey = () =>
  `li-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const keyLinks = {
  idOf: (item: LineItem) => item.key,
  parentOf: (item: LineItem) => item.parentKey,
};

const isDiscount = (item: LineItem) => item.lineItemType === "DISCOUNT";

/** Every row except discounts. */
export const chargeLineItems = (items: LineItem[]) =>
  items.filter((item) => !isDiscount(item));

const rowTotal = (item: LineItem) =>
  round2((item.quantity || 0) * (item.unitPrice || 0));

/** Subtotal, discounts (positive) and net total of the rows. */
export function lineItemTotals(items: LineItem[]) {
  const subtotal = round2(
    chargeLineItems(items).reduce((sum, item) => sum + rowTotal(item), 0),
  );
  const discounts = round2(
    items
      .filter(isDiscount)
      .reduce((sum, item) => sum + (item.unitPrice || 0), 0),
  );
  return { subtotal, discounts, total: round2(subtotal - discounts) };
}

/**
 * Editor rows from an invoice's saved line items. Saved ids become the
 * keys, so each discount stays under its row; discounts are stored negative
 * and edited as a positive amount.
 */
export function lineItemsFromSaved(
  rows: Array<{
    id: string;
    parentLineItemId?: string | null;
    hardwareId: string | null;
    model: string;
    quantity: number;
    unitPrice: number | string;
    lineItemType?: LineItemType | null;
    billingMonth?: string | null;
  }>,
): LineItem[] {
  return rows.map((li) => {
    const lineItemType = li.lineItemType || "HARDWARE";
    return {
      key: li.id,
      parentKey: li.parentLineItemId ?? null,
      hardwareId: li.hardwareId || "",
      model: li.model,
      quantity: li.quantity,
      unitPrice:
        lineItemType === "DISCOUNT"
          ? Math.abs(Number(li.unitPrice))
          : Number(li.unitPrice),
      lineItemType,
      billingMonth: li.billingMonth ?? null,
    };
  });
}

/** Why a discount row can't be saved, or null. */
function discountRowError(item: LineItem, items: LineItem[]): string | null {
  const label = item.model.trim();
  if (!label) return "Enter a description";
  if (!(item.unitPrice > 0)) return "Enter an amount";
  const parent = items.find((other) => other.key === item.parentKey);
  if (!parent) return "This discount's line was removed";
  if (item.unitPrice > rowTotal(parent) + 1e-9) {
    return `Max $${rowTotal(parent).toFixed(2)}`;
  }
  return null;
}

/** The first discount problem on the invoice, as a form error, or null. */
export function discountLineItemsError(items: LineItem[]): string | null {
  for (const item of items.filter(isDiscount)) {
    const error = discountRowError(item, items);
    if (error) {
      const label = item.model.trim() || DEFAULT_DISCOUNT_LABEL;
      return `${label}: ${error}`;
    }
  }
  return null;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MAX_HOSTING_MONTHS = 12;

// Hardware rows always render/submit above Hosting & Colocation rows,
// regardless of the order they were added in; hosting rows are grouped by
// model and ordered by month.
// Discounts follow the row they belong to (by id/parentLineItemId).
export function sortLineItems<
  T extends {
    lineItemType: LineItemType;
    hardwareId?: string | null;
    billingMonth?: string | Date | null;
  },
>(items: T[]): T[] {
  return sortInvoiceLineItems(items);
}

export function LineItemsEditor({
  lineItems,
  onChange,
  hardwareList,
  disabled = false,
  excludeUsedModels = false,
  enableHostingColocation = false,
  enableDiscounts = false,
}: LineItemsEditorProps) {
  const [newHardwareId, setNewHardwareId] = useState("");
  const today = new Date();
  const [hostingStartYear, setHostingStartYear] = useState(today.getFullYear());
  const [hostingStartMonth, setHostingStartMonth] = useState(today.getMonth());
  const [hostingMonthCount, setHostingMonthCount] = useState(1);
  const hostingYearOptions = [
    today.getFullYear() - 1,
    today.getFullYear(),
    today.getFullYear() + 1,
    today.getFullYear() + 2,
  ];

  const hardwareRows = lineItems.filter(
    (item) => item.lineItemType === "HARDWARE",
  );
  const usedHardwareIds = new Set(hardwareRows.map((item) => item.hardwareId));
  const addableHardwareList = excludeUsedModels
    ? hardwareList.filter((hw) => !usedHardwareIds.has(hw.id))
    : hardwareList;

  // One hosting row per hardware model per selected month, skipping
  // (model, month) pairs that are already on the invoice.
  const existingHostingKeys = new Set(
    lineItems
      .filter(
        (item) =>
          item.lineItemType === "HOSTING_COLOCATION" && item.billingMonth,
      )
      .map(
        (item) =>
          `${item.hardwareId}|${startOfBillingMonth(item.billingMonth as string).getTime()}`,
      ),
  );
  const selectedHostingMonths = consecutiveBillingMonths(
    hostingStartYear,
    hostingStartMonth,
    hostingMonthCount,
  );
  const newHostingRows: LineItem[] = hardwareRows.flatMap((hw) =>
    selectedHostingMonths
      .filter(
        (month) =>
          !existingHostingKeys.has(`${hw.hardwareId}|${month.getTime()}`),
      )
      .map((month) => ({
        key: newLineItemKey(),
        hardwareId: hw.hardwareId,
        model: hostingLineItemLabel(hw.model, month),
        quantity: hw.quantity,
        unitPrice: 0,
        lineItemType: "HOSTING_COLOCATION" as const,
        billingMonth: month.toISOString(),
      })),
  );

  const totalMiners = chargeLineItems(lineItems).reduce(
    (sum, item) => sum + (item.quantity || 0),
    0,
  );
  const totals = lineItemTotals(lineItems);
  const discountedKeys = new Set(
    lineItems.filter(isDiscount).map((item) => item.parentKey),
  );

  const updateRow = (index: number, patch: Partial<LineItem>) => {
    const next = lineItems.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    onChange(next);
  };

  const removeRow = (index: number) => {
    const removed = lineItems[index];
    if (!removed) return;
    // Removing a hardware model also removes its paired hosting rows, and
    // removing any row removes the discount under it.
    const removedKeys = new Set(
      lineItems
        .filter(
          (item, i) =>
            i === index ||
            (removed.lineItemType === "HARDWARE" &&
              item.lineItemType === "HOSTING_COLOCATION" &&
              item.hardwareId === removed.hardwareId),
        )
        .map((item) => item.key),
    );
    const next = lineItems.filter(
      (item) =>
        !removedKeys.has(item.key) &&
        !(isDiscount(item) && removedKeys.has(item.parentKey ?? "")),
    );
    onChange(next);
  };

  const addDiscount = (parent: LineItem) => {
    onChange([
      ...lineItems,
      {
        key: newLineItemKey(),
        parentKey: parent.key,
        hardwareId: "",
        model: DEFAULT_DISCOUNT_LABEL,
        quantity: 1,
        unitPrice: 0,
        lineItemType: "DISCOUNT",
      },
    ]);
  };

  const addRow = () => {
    const hardware = hardwareList.find((h) => h.id === newHardwareId);
    if (!hardware) return;
    onChange([
      ...lineItems,
      {
        key: newLineItemKey(),
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
    if (newHostingRows.length === 0) return;
    onChange([...lineItems, ...newHostingRows]);
  };

  const displayOrder = sortInvoiceLineItems(
    lineItems.map((item, index) => ({ ...item, index })),
    keyLinks,
  ).map(({ index }) => ({ item: lineItems[index], index }));

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
            if (isDiscount(item)) {
              const error = discountRowError(item, lineItems);
              const amountError =
                item.unitPrice > 0 && error?.startsWith("Max") ? error : null;
              return (
                <TableRow
                  key={item.key}
                  sx={{ backgroundColor: "rgba(46, 125, 50, 0.06)" }}
                >
                  <TableCell sx={{ pl: 3 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <SubdirectoryArrowRightIcon
                        fontSize="small"
                        sx={{ color: "success.main" }}
                      />
                      <TextField
                        size="small"
                        value={item.model}
                        placeholder={DEFAULT_DISCOUNT_LABEL}
                        onChange={(e) =>
                          updateRow(index, { model: e.target.value })
                        }
                        inputProps={{
                          maxLength: DISCOUNT_LABEL_MAX_LENGTH,
                          "aria-label": "Discount description",
                        }}
                        error={!item.model.trim()}
                        sx={{ flex: 1, minWidth: 160 }}
                        disabled={disabled}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="textSecondary">
                      —
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={item.unitPrice || ""}
                      placeholder="0.00"
                      onChange={(e) =>
                        updateRow(index, {
                          unitPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                      inputProps={{
                        min: 0,
                        step: 0.01,
                        style: { textAlign: "right" },
                        "aria-label": "Discount amount",
                      }}
                      error={!!amountError}
                      helperText={amountError ?? undefined}
                      sx={{ width: 130 }}
                      disabled={disabled}
                    />
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: "success.dark", fontWeight: 500 }}
                  >
                    −${round2(item.unitPrice || 0).toFixed(2)}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => removeRow(index)}
                      disabled={disabled}
                      aria-label="Remove discount"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            }
            return (
              <TableRow key={item.key}>
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
                <TableCell align="right">
                  ${rowTotal(item).toFixed(2)}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  {enableDiscounts && !discountedKeys.has(item.key) && (
                    <Tooltip title="Add a discount under this line">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => addDiscount(item)}
                          disabled={disabled}
                          aria-label="Add discount"
                        >
                          <LocalOfferOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
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
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            alignItems: "center",
            mt: 2,
          }}
        >
          <TextField
            select
            size="small"
            label="Hosting from"
            value={hostingStartMonth}
            onChange={(e) => setHostingStartMonth(Number(e.target.value))}
            sx={{ minWidth: 140 }}
            disabled={disabled}
          >
            {MONTH_NAMES.map((name, i) => (
              <MenuItem key={name} value={i}>
                {name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Year"
            value={hostingStartYear}
            onChange={(e) => setHostingStartYear(Number(e.target.value))}
            sx={{ minWidth: 100 }}
            disabled={disabled}
          >
            {hostingYearOptions.map((year) => (
              <MenuItem key={year} value={year}>
                {year}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Months"
            value={hostingMonthCount}
            onChange={(e) => setHostingMonthCount(Number(e.target.value))}
            sx={{ minWidth: 100 }}
            disabled={disabled}
          >
            {Array.from({ length: MAX_HOSTING_MONTHS }, (_, i) => i + 1).map(
              (count) => (
                <MenuItem key={count} value={count}>
                  {count}
                </MenuItem>
              ),
            )}
          </TextField>
          <Button
            startIcon={<AddIcon />}
            onClick={addHostingRows}
            disabled={disabled || newHostingRows.length === 0}
          >
            Add Hosting & Colocation
          </Button>
        </Box>
      )}

      <Box sx={{ p: 2, backgroundColor: "#f5f5f5", borderRadius: 1, mt: 2 }}>
        {totals.discounts > 0 && (
          <>
            <Typography variant="body2">
              Subtotal: ${totals.subtotal.toFixed(2)}
            </Typography>
            <Typography variant="body2" sx={{ color: "success.dark", mb: 0.5 }}>
              Discounts: −${totals.discounts.toFixed(2)}
            </Typography>
          </>
        )}
        <strong>Total Amount: ${totals.total.toFixed(2)}</strong>
      </Box>
    </Box>
  );
}
