/**
 * Hosting & Colocation billing months on Hardware Sales line items.
 *
 * A HOSTING_COLOCATION line item may carry the month it bills for, stored as
 * the first day of that month at UTC midnight (same convention as
 * Invoice.billingMonth). HARDWARE rows never carry one; hosting rows created
 * before months existed have none.
 */

export type LineItemKind =
  "HARDWARE" | "HOSTING_COLOCATION" | "REPAIR" | "DISCOUNT";

type MonthValue = string | Date | null | undefined;

/** First day of the month containing `value`, at UTC midnight. */
export function startOfBillingMonth(value: string | Date): Date {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** The `count` consecutive months starting at (year, monthIndex), UTC. */
export function consecutiveBillingMonths(
  year: number,
  monthIndex: number,
  count: number,
): Date[] {
  return Array.from(
    { length: count },
    (_, i) => new Date(Date.UTC(year, monthIndex + i, 1)),
  );
}

/** "Oct 2026" */
export function formatBillingMonthShort(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
  });
}

/** "October 2026" */
export function formatBillingMonthLong(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
  });
}

/**
 * "October 2026", or "October 2026 – December 2026" when the months span
 * more than one. Null when there are no months.
 */
export function formatBillingMonthRange(values: MonthValue[]): string | null {
  const times = values
    .filter((v): v is string | Date => v !== null && v !== undefined)
    .map((v) => startOfBillingMonth(v).getTime());
  if (times.length === 0) return null;
  const first = Math.min(...times);
  const last = Math.max(...times);
  return first === last
    ? formatBillingMonthLong(new Date(first))
    : `${formatBillingMonthLong(new Date(first))} – ${formatBillingMonthLong(new Date(last))}`;
}

/** Row label for a hosting line item. */
export function hostingLineItemLabel(
  model: string,
  billingMonth: string | Date,
): string {
  return `Hosting & Colocation (${model}) – ${formatBillingMonthShort(billingMonth)}`;
}

const monthTime = (value: MonthValue): number =>
  value ? new Date(value).getTime() : -Infinity;

type SortableLineItem = {
  lineItemType?: LineItemKind | null;
  hardwareId?: string | null;
  billingMonth?: MonthValue;
};

/**
 * How a row is identified, and which row a DISCOUNT sits under. Stored rows
 * use id/parentLineItemId; the line-items editor uses its own client keys.
 */
export interface LineItemLinks<T> {
  idOf: (item: T) => string | null | undefined;
  parentOf: (item: T) => string | null | undefined;
}

const storedLinks = <T>(): LineItemLinks<T> => ({
  idOf: (item) => (item as { id?: string | null }).id,
  parentOf: (item) =>
    (item as { parentLineItemId?: string | null }).parentLineItemId,
});

/**
 * Display order for invoice line items: all HARDWARE rows first (in their
 * original order), then HOSTING_COLOCATION rows grouped by hardware model -
 * following the order of the hardware rows - and by month within a model.
 * Rows without a month (pre-existing data) sort before dated ones in their
 * group. Ties keep their original order. Each DISCOUNT row follows the row
 * it belongs to; one whose row is missing goes last.
 */
export function sortInvoiceLineItems<T extends SortableLineItem>(
  items: T[],
  links: LineItemLinks<T> = storedLinks<T>(),
): T[] {
  const typeOf = (item: T): LineItemKind => item.lineItemType || "HARDWARE";

  const rows = items.filter((item) => typeOf(item) !== "DISCOUNT");
  const discounts = items.filter((item) => typeOf(item) === "DISCOUNT");

  const hardwareOrder = new Map<string, number>();
  rows.forEach((item) => {
    const id = item.hardwareId || "";
    if (typeOf(item) === "HARDWARE" && !hardwareOrder.has(id)) {
      hardwareOrder.set(id, hardwareOrder.size);
    }
  });
  const groupOf = (item: T) =>
    hardwareOrder.get(item.hardwareId || "") ?? Number.MAX_SAFE_INTEGER;

  const sortedRows = rows
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aHosting = typeOf(a.item) === "HOSTING_COLOCATION" ? 1 : 0;
      const bHosting = typeOf(b.item) === "HOSTING_COLOCATION" ? 1 : 0;
      if (aHosting !== bHosting) return aHosting - bHosting;
      if (aHosting) {
        const groupDiff = groupOf(a.item) - groupOf(b.item);
        if (groupDiff !== 0) return groupDiff;
        const monthDiff =
          monthTime(a.item.billingMonth) - monthTime(b.item.billingMonth);
        if (monthDiff !== 0) return monthDiff;
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);

  if (discounts.length === 0) return sortedRows;

  const placed = new Set<T>();
  const result: T[] = [];
  for (const row of sortedRows) {
    result.push(row);
    const id = links.idOf(row);
    if (!id) continue;
    for (const discount of discounts) {
      if (!placed.has(discount) && links.parentOf(discount) === id) {
        result.push(discount);
        placed.add(discount);
      }
    }
  }
  return [...result, ...discounts.filter((d) => !placed.has(d))];
}

export type LineItemBucket = "HARDWARE" | "HOSTING";

/**
 * Which payment bucket a row counts towards on a split Hardware Sales
 * payment: hosting rows are HOSTING, everything else HARDWARE, and a
 * DISCOUNT takes the bucket of the row it sits under.
 */
export function lineItemBucket<T extends SortableLineItem>(
  item: T,
  all: T[],
  links: LineItemLinks<T> = storedLinks<T>(),
): LineItemBucket {
  let row: T | undefined = item;
  if (item.lineItemType === "DISCOUNT") {
    const parentId = links.parentOf(item);
    row = all.find((other) => links.idOf(other) === parentId);
  }
  return row?.lineItemType === "HOSTING_COLOCATION" ? "HOSTING" : "HARDWARE";
}

/**
 * Validates and normalizes the billingMonth of incoming line items (invoice
 * create/update APIs). Returns the normalized month per item, in input
 * order, or an error message.
 */
export function parseLineItemBillingMonths(
  items: Array<{
    hardwareId: string;
    lineItemType?: LineItemKind;
    billingMonth?: unknown;
  }>,
): { months: Array<Date | null> } | { error: string } {
  const months: Array<Date | null> = [];
  const seen = new Set<string>();

  for (const item of items) {
    const raw = item.billingMonth;
    if (raw === undefined || raw === null || raw === "") {
      months.push(null);
      continue;
    }
    if ((item.lineItemType || "HARDWARE") !== "HOSTING_COLOCATION") {
      return {
        error: "Only Hosting & Colocation line items can have a billing month",
      };
    }
    if (typeof raw !== "string" || Number.isNaN(new Date(raw).getTime())) {
      return { error: "Line item billingMonth must be a valid date" };
    }
    const month = startOfBillingMonth(raw);
    const key = `${item.hardwareId}|${month.getTime()}`;
    if (seen.has(key)) {
      return {
        error: `Hosting & Colocation for the same model is billed more than once for ${formatBillingMonthLong(month)}`,
      };
    }
    seen.add(key);
    months.push(month);
  }

  return { months };
}
