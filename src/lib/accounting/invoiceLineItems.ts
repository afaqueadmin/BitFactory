/**
 * Line items for Hosting & Colocation and Hardware Sales invoices (create and
 * update APIs). Validates the incoming rows and computes the invoice
 * aggregates server-side - client-computed sums are never trusted.
 *
 * A DISCOUNT row sits under another row (its parent, matched by the client's
 * `key` / `parentKey`) and comes off the total. It is stored with negative
 * unitPrice/totalPrice, so summing totalPrice gives the net total.
 */

import { randomUUID } from "crypto";
import { parseLineItemBillingMonths } from "./hostingMonths";

export const DISCOUNT_LABEL_MAX_LENGTH = 100;

type ChargeType = "HARDWARE" | "HOSTING_COLOCATION";

export interface ChargeLineItemRow {
  id: string;
  hardwareId: string;
  model: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  lineItemType: ChargeType;
  billingMonth: Date | null;
}

export interface DiscountLineItemRow {
  id: string;
  parentLineItemId: string;
  hardwareId: null;
  model: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  lineItemType: "DISCOUNT";
  billingMonth: null;
}

export interface ValidatedLineItems {
  parentRows: ChargeLineItemRow[];
  discountRows: DiscountLineItemRow[];
  // "Miners sold" summary: HARDWARE rows only - hosting rows repeat their
  // hardware row's quantity, so folding them in would double-count.
  totalMiners: number;
  // Average hardware rate, before discounts.
  unitPrice: number;
  // Net invoice total: hardware + hosting & colocation - discounts.
  totalAmount: number;
}

const round2 = (value: number) => parseFloat(value.toFixed(2));

const hasAtMostTwoDecimals = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

interface IncomingLineItem {
  key?: unknown;
  parentKey?: unknown;
  hardwareId?: unknown;
  model?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  lineItemType?: unknown;
  billingMonth?: unknown;
}

export function validateStandardLineItems(
  lineItems: unknown[],
): ValidatedLineItems | { error: string } {
  const items = lineItems as IncomingLineItem[];
  const charges: IncomingLineItem[] = [];
  const discounts: IncomingLineItem[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      return { error: "Invalid line item" };
    }
    if (item.lineItemType === "DISCOUNT") {
      discounts.push(item);
      continue;
    }
    if (
      typeof item.hardwareId !== "string" ||
      !item.hardwareId ||
      typeof item.model !== "string" ||
      !item.model ||
      typeof item.quantity !== "number" ||
      item.quantity <= 0 ||
      typeof item.unitPrice !== "number" ||
      item.unitPrice <= 0 ||
      (item.lineItemType !== undefined &&
        item.lineItemType !== "HARDWARE" &&
        item.lineItemType !== "HOSTING_COLOCATION")
    ) {
      return {
        error:
          "Each line item requires hardwareId, model, quantity > 0, unitPrice > 0, and a valid lineItemType",
      };
    }
    charges.push(item);
  }

  if (charges.length === 0) {
    return { error: "Add at least one line item besides discounts" };
  }

  const parsedMonths = parseLineItemBillingMonths(
    charges as Array<{
      hardwareId: string;
      lineItemType?: ChargeType;
      billingMonth?: unknown;
    }>,
  );
  if ("error" in parsedMonths) return parsedMonths;

  // Discounts find their row by the client's key (rows without one, e.g.
  // from Bulk Create, simply can't carry a discount).
  const rowByKey = new Map<string, ChargeLineItemRow>();
  const parentRows: ChargeLineItemRow[] = [];
  for (const [index, item] of charges.entries()) {
    const quantity = item.quantity as number;
    const unitPrice = Number(item.unitPrice);
    const row: ChargeLineItemRow = {
      id: randomUUID(),
      hardwareId: item.hardwareId as string,
      model: item.model as string,
      quantity,
      unitPrice,
      totalPrice: round2(quantity * unitPrice),
      lineItemType: (item.lineItemType as ChargeType) || "HARDWARE",
      billingMonth: parsedMonths.months[index],
    };
    if (typeof item.key === "string" && item.key) {
      if (rowByKey.has(item.key)) {
        return { error: "Line item keys must be unique" };
      }
      rowByKey.set(item.key, row);
    }
    parentRows.push(row);
  }

  const discountedParents = new Set<string>();
  const discountRows: DiscountLineItemRow[] = [];
  for (const item of discounts) {
    const label = typeof item.model === "string" ? item.model.trim() : "";
    if (!label) {
      return { error: "Every discount needs a description" };
    }
    if (label.length > DISCOUNT_LABEL_MAX_LENGTH) {
      return {
        error: `Discount descriptions can be at most ${DISCOUNT_LABEL_MAX_LENGTH} characters`,
      };
    }
    const amount = item.unitPrice;
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !hasAtMostTwoDecimals(amount)
    ) {
      return {
        error: `"${label}" must be an amount greater than 0 with up to 2 decimal places`,
      };
    }
    const parent =
      typeof item.parentKey === "string"
        ? rowByKey.get(item.parentKey)
        : undefined;
    if (!parent) {
      return { error: `"${label}" isn't attached to a line item` };
    }
    if (discountedParents.has(parent.id)) {
      return { error: `"${parent.model}" can only have one discount` };
    }
    if (amount > parent.totalPrice + 1e-9) {
      return {
        error: `"${label}" can't be more than the "${parent.model}" line ($${parent.totalPrice.toFixed(2)})`,
      };
    }
    discountedParents.add(parent.id);
    discountRows.push({
      id: randomUUID(),
      parentLineItemId: parent.id,
      hardwareId: null,
      model: label,
      quantity: 1,
      unitPrice: -round2(amount),
      totalPrice: -round2(amount),
      lineItemType: "DISCOUNT",
      billingMonth: null,
    });
  }

  const hardwareRows = parentRows.filter(
    (row) => row.lineItemType === "HARDWARE",
  );
  const totalMiners = hardwareRows.reduce((sum, row) => sum + row.quantity, 0);
  const hardwareTotal = hardwareRows.reduce(
    (sum, row) => sum + row.totalPrice,
    0,
  );
  const totalAmount = round2(
    [...parentRows, ...discountRows].reduce(
      (sum, row) => sum + row.totalPrice,
      0,
    ),
  );

  return {
    parentRows,
    discountRows,
    totalMiners,
    unitPrice: totalMiners > 0 ? round2(hardwareTotal / totalMiners) : 0,
    totalAmount,
  };
}
