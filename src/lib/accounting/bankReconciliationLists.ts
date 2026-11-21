import type { InvoiceType } from "@prisma/client";
import { SortState, SortValue, parseSort, sortRows } from "@/lib/sortRows";

/**
 * Filters and sort orders of the Bank Reconciliation list, shared by the
 * page and its CSV / PDF export so a download holds exactly the rows shown,
 * in the same order. Also the invoice types, here because this file has no
 * runtime Prisma import and is safe for the browser.
 */

/** The invoice types offered, with the label shown everywhere. */
export const RECONCILIATION_INVOICE_TYPES = [
  { value: "ELECTRICITY_CHARGES", label: "Hosting & Colocation" },
  { value: "HARDWARE_SALES", label: "Hardware Sales" },
  { value: "HARDWARE_REPAIR", label: "Hardware Repair" },
] as const satisfies readonly { value: InvoiceType; label: string }[];

export type ReconciliationInvoiceType =
  (typeof RECONCILIATION_INVOICE_TYPES)[number]["value"];

export const isReconciliationInvoiceType = (
  v: unknown,
): v is ReconciliationInvoiceType =>
  RECONCILIATION_INVOICE_TYPES.some((t) => t.value === v);

export const reconciliationTypeLabel = (type: string): string =>
  RECONCILIATION_INVOICE_TYPES.find((t) => t.value === type)?.label ?? type;

const isDay = (v: string | null): v is string =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const RECONCILIATION_SORT_KEYS = [
  "entry",
  "date",
  "invoice",
  "client",
  "narration",
  "bank",
  "received",
  "fee",
] as const;
export type ReconciliationSortKey = (typeof RECONCILIATION_SORT_KEYS)[number];

/** Newest first, as the list loads. */
export const RECONCILIATION_DEFAULT_SORT: SortState<ReconciliationSortKey> = {
  key: "date",
  dir: "desc",
};

export interface ReconciliationFilter {
  /** Invoice type (e.g. HARDWARE_SALES), "" = all. */
  invoiceType: string;
  /** Bank id, "" = all. */
  bankId: string;
  /** Inclusive YYYY-MM-DD on the entry date, "" = open. */
  from: string;
  to: string;
}

/** What filtering and sorting need from an entry. */
export interface ReconciliationListRow {
  entryNumber: number;
  date: string;
  invoiceType: string;
  invoiceNumber: string;
  clientName: string;
  narration: string | null;
  bankId: string;
  bankName: string;
  amountUsd: string;
  feeUsd: string;
}

export function reconciliationSortValue(
  e: ReconciliationListRow,
  key: ReconciliationSortKey,
): SortValue {
  switch (key) {
    case "entry":
      return e.entryNumber;
    case "date":
      return e.date;
    case "invoice":
      return e.invoiceNumber;
    case "client":
      return e.clientName;
    case "narration":
      return e.narration;
    case "bank":
      return e.bankName;
    case "received":
      return Number(e.amountUsd);
    case "fee":
      return Number(e.feeUsd);
  }
}

/** The rows the Bank Reconciliation list shows: filtered, then sorted. */
export function reconciliationListRows<T extends ReconciliationListRow>(
  rows: T[],
  filter: ReconciliationFilter,
  sort: SortState<ReconciliationSortKey>,
): T[] {
  return sortRows(
    rows.filter(
      (e) =>
        (!filter.invoiceType || e.invoiceType === filter.invoiceType) &&
        (!filter.bankId || e.bankId === filter.bankId) &&
        (!filter.from || e.date >= filter.from) &&
        (!filter.to || e.date <= filter.to),
    ),
    sort,
    reconciliationSortValue,
  );
}

/** ?type=&bank=&from=&to=&sort=&dir= for the export (only the set ones). */
export function reconciliationListQuery(
  filter: ReconciliationFilter,
  sort: SortState<ReconciliationSortKey>,
): URLSearchParams {
  const q = new URLSearchParams();
  if (filter.invoiceType) q.set("type", filter.invoiceType);
  if (filter.bankId) q.set("bank", filter.bankId);
  if (filter.from) q.set("from", filter.from);
  if (filter.to) q.set("to", filter.to);
  if (sort.key) {
    q.set("sort", sort.key);
    q.set("dir", sort.dir);
  }
  return q;
}

export function parseReconciliationListQuery(params: URLSearchParams): {
  filter: ReconciliationFilter;
  sort: SortState<ReconciliationSortKey>;
} {
  const from = params.get("from");
  const to = params.get("to");
  return {
    filter: {
      invoiceType: params.get("type") ?? "",
      bankId: params.get("bank") ?? "",
      from: isDay(from) ? from : "",
      to: isDay(to) ? to : "",
    },
    sort: parseSort(
      params,
      RECONCILIATION_SORT_KEYS,
      RECONCILIATION_DEFAULT_SORT,
    ),
  };
}
