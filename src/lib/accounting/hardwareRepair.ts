/**
 * Hardware Repair invoices: one miner per invoice, free-text line items
 * (DESCRIPTION | QTY | RATE | AMOUNT), a flat discount taken off the
 * subtotal, and a repair note written to the miner.
 *
 * Pure helpers shared by the create/update APIs and the UI. Money is summed
 * in integer cents so totals never drift.
 */
import type { Prisma } from "@prisma/client";

/** Miner details shown on repair invoices (UI, PDF and email). */
export const REPAIR_MINER_SELECT = {
  id: true,
  name: true,
  serialNumber: true,
  userId: true,
  isDeleted: true,
  hardware: { select: { model: true } },
  space: { select: { name: true, location: true } },
} satisfies Prisma.MinerSelect;

export const REPAIR_DESCRIPTION_MAX = 500;
export const REPAIR_NOTE_MAX = 5000;

export interface RepairLineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface ParsedRepairInvoice {
  minerId: string;
  lineItems: Array<RepairLineItemInput & { totalPrice: number }>;
  subtotal: number;
  discount: number;
  total: number;
  repairNote: string;
}

const toCents = (value: number) => Math.round(value * 100);
const fromCents = (cents: number) => cents / 100;

/** At most 2 decimal places (tolerant of float noise like 0.1 + 0.2). */
const hasAtMost2Decimals = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

/** Amount of one line: qty x rate, rounded to cents. */
export const repairLineAmount = (quantity: number, unitPrice: number) =>
  fromCents(Math.round(quantity * toCents(unitPrice)));

/** Subtotal, discount and total for a set of lines (UI preview + API). */
export function computeRepairTotals(
  lines: Array<{ quantity: number; unitPrice: number }>,
  discount: number,
): { subtotal: number; discount: number; total: number } {
  const subtotalCents = lines.reduce(
    (sum, li) =>
      sum + Math.round((li.quantity || 0) * toCents(li.unitPrice || 0)),
    0,
  );
  const discountCents = toCents(discount || 0);
  return {
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    total: fromCents(subtotalCents - discountCents),
  };
}

/** Pre-fill text for the miner repair note. */
export function defaultRepairNote(
  invoiceNumber: string | null,
  lines: Array<{ description: string; quantity: number }>,
): string {
  const header = invoiceNumber
    ? `Repair invoice ${invoiceNumber}`
    : "Repair invoice";
  const items = lines
    .filter((li) => li.description.trim())
    .map((li) => `- ${li.description.trim()} x${li.quantity}`);
  return items.length > 0 ? `${header}:\n${items.join("\n")}` : header;
}

/**
 * Validates the repair-specific part of an invoice create/update body.
 * Ownership of the miner is checked by the caller (needs the database).
 */
export function parseRepairInvoiceInput(body: {
  minerId?: unknown;
  lineItems?: unknown;
  discountAmount?: unknown;
  repairNote?: unknown;
}): ParsedRepairInvoice | { error: string } {
  if (typeof body.minerId !== "string" || !body.minerId) {
    return { error: "A miner is required for a Hardware Repair invoice" };
  }

  if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
    return { error: "Add at least one line item" };
  }

  const lineItems: ParsedRepairInvoice["lineItems"] = [];
  for (const raw of body.lineItems as Array<Record<string, unknown>>) {
    const description =
      typeof raw?.description === "string" ? raw.description.trim() : "";
    const quantity = raw?.quantity;
    const unitPrice = raw?.unitPrice;

    if (!description) {
      return { error: "Every line item needs a description" };
    }
    if (description.length > REPAIR_DESCRIPTION_MAX) {
      return {
        error: `Line item descriptions must be at most ${REPAIR_DESCRIPTION_MAX} characters`,
      };
    }
    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return { error: "Line item QTY must be a whole number greater than 0" };
    }
    if (
      typeof unitPrice !== "number" ||
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0 ||
      !hasAtMost2Decimals(unitPrice)
    ) {
      return {
        error:
          "Line item RATE must be greater than 0, with up to 2 decimal places",
      };
    }

    lineItems.push({
      description,
      quantity,
      unitPrice: fromCents(toCents(unitPrice)),
      totalPrice: repairLineAmount(quantity, unitPrice),
    });
  }

  const rawDiscount = body.discountAmount;
  const discount =
    rawDiscount === undefined || rawDiscount === null || rawDiscount === ""
      ? 0
      : rawDiscount;
  if (
    typeof discount !== "number" ||
    !Number.isFinite(discount) ||
    discount < 0 ||
    !hasAtMost2Decimals(discount)
  ) {
    return {
      error: "Discount must be 0 or more, with up to 2 decimal places",
    };
  }

  const totals = computeRepairTotals(lineItems, discount);
  if (totals.discount > totals.subtotal) {
    return { error: "Discount can't be more than the subtotal" };
  }
  if (totals.total <= 0) {
    return { error: "Total after discount must be greater than 0" };
  }

  const repairNote =
    typeof body.repairNote === "string" ? body.repairNote.trim() : "";
  if (!repairNote) {
    return { error: "A repair note is required" };
  }
  if (repairNote.length > REPAIR_NOTE_MAX) {
    return {
      error: `Repair note must be at most ${REPAIR_NOTE_MAX} characters`,
    };
  }

  return {
    minerId: body.minerId,
    lineItems,
    ...totals,
    repairNote,
  };
}
