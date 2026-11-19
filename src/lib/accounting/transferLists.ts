import { SortState, SortValue, parseSort, sortRows } from "@/lib/sortRows";

/**
 * Filters and sort orders of the Transfers list, shared by the page and its
 * CSV / PDF export so a download holds exactly the rows shown, in the same
 * order.
 */

const isDay = (v: string | null): v is string =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const TRANSFER_SORT_KEYS = [
  "date",
  "from",
  "to",
  "sent",
  "received",
  "value",
] as const;
export type TransferSortKey = (typeof TRANSFER_SORT_KEYS)[number];

/** Newest first, as the list loads. */
export const TRANSFER_DEFAULT_SORT: SortState<TransferSortKey> = {
  key: "date",
  dir: "desc",
};

export interface TransferFilter {
  /** Entity id on either side, "" = all. */
  entityId: string;
  /** Bank id on either side, "" = all. */
  bankId: string;
  /** Inclusive YYYY-MM-DD on the transfer date, "" = open. */
  from: string;
  to: string;
}

interface TransferListSide {
  entityId: string;
  bankId: string;
  bankName: string;
  amount: string;
}

/** What filtering and sorting need from a transfer. */
export interface TransferListRow {
  date: string;
  from: TransferListSide;
  to: TransferListSide;
  amountUsd: string;
}

export function transferSortValue(
  t: TransferListRow,
  key: TransferSortKey,
): SortValue {
  switch (key) {
    case "date":
      return t.date;
    case "from":
      return t.from.bankName;
    case "to":
      return t.to.bankName;
    // Sent / received are in each side's own currency, so they sort by the
    // typed amount; Value sorts by the shared USD value.
    case "sent":
      return Number(t.from.amount);
    case "received":
      return Number(t.to.amount);
    case "value":
      return Number(t.amountUsd);
  }
}

/** The rows the Transfers list shows: filtered, then sorted. */
export function transferListRows<T extends TransferListRow>(
  rows: T[],
  filter: TransferFilter,
  sort: SortState<TransferSortKey>,
): T[] {
  return sortRows(
    rows.filter(
      (t) =>
        (!filter.entityId ||
          t.from.entityId === filter.entityId ||
          t.to.entityId === filter.entityId) &&
        (!filter.bankId ||
          t.from.bankId === filter.bankId ||
          t.to.bankId === filter.bankId) &&
        (!filter.from || t.date >= filter.from) &&
        (!filter.to || t.date <= filter.to),
    ),
    sort,
    transferSortValue,
  );
}

/** ?entity=&bank=&from=&to=&sort=&dir= for the export (only the set ones). */
export function transferListQuery(
  filter: TransferFilter,
  sort: SortState<TransferSortKey>,
): URLSearchParams {
  const q = new URLSearchParams();
  if (filter.entityId) q.set("entity", filter.entityId);
  if (filter.bankId) q.set("bank", filter.bankId);
  if (filter.from) q.set("from", filter.from);
  if (filter.to) q.set("to", filter.to);
  if (sort.key) {
    q.set("sort", sort.key);
    q.set("dir", sort.dir);
  }
  return q;
}

export function parseTransferListQuery(params: URLSearchParams): {
  filter: TransferFilter;
  sort: SortState<TransferSortKey>;
} {
  const from = params.get("from");
  const to = params.get("to");
  return {
    filter: {
      entityId: params.get("entity") ?? "",
      bankId: params.get("bank") ?? "",
      from: isDay(from) ? from : "",
      to: isDay(to) ? to : "",
    },
    sort: parseSort(params, TRANSFER_SORT_KEYS, TRANSFER_DEFAULT_SORT),
  };
}
