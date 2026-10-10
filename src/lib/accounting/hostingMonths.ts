/**
 * Hosting & Colocation billing months on Hardware Sales line items.
 *
 * A HOSTING_COLOCATION line item may carry the month it bills for, stored as
 * the first day of that month at UTC midnight (same convention as
 * Invoice.billingMonth). HARDWARE rows never carry one; hosting rows created
 * before months existed have none.
 */

export type LineItemKind = "HARDWARE" | "HOSTING_COLOCATION" | "REPAIR";

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

/**
 * Display order for invoice line items: all HARDWARE rows first (in their
 * original order), then HOSTING_COLOCATION rows grouped by hardware model -
 * following the order of the hardware rows - and by month within a model.
 * Rows without a month (pre-existing data) sort before dated ones in their
 * group. Ties keep their original order.
 */
export function sortInvoiceLineItems<
  T extends {
    lineItemType?: LineItemKind | null;
    hardwareId?: string | null;
    billingMonth?: MonthValue;
  },
>(items: T[]): T[] {
  const typeOf = (item: T): LineItemKind => item.lineItemType || "HARDWARE";

  const hardwareOrder = new Map<string, number>();
  items.forEach((item) => {
    const id = item.hardwareId || "";
    if (typeOf(item) === "HARDWARE" && !hardwareOrder.has(id)) {
      hardwareOrder.set(id, hardwareOrder.size);
    }
  });
  const groupOf = (item: T) =>
    hardwareOrder.get(item.hardwareId || "") ?? Number.MAX_SAFE_INTEGER;

  return items
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
