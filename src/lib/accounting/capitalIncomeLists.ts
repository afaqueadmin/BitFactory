import { SortState, SortValue, parseSort, sortRows } from "@/lib/sortRows";

/**
 * Filters and sort orders of the Capital & Income and Capital & Income
 * Heads lists, shared by the pages and their CSV / PDF exports so a
 * download holds exactly the rows shown, in the same order.
 */

const isDay = (v: string | null): v is string =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/* --------------------------------- Entries -------------------------------- */

export const INCOME_SORT_KEYS = [
  "entry",
  "date",
  "head",
  "from",
  "narration",
  "bank",
  "received",
  "fee",
] as const;
export type IncomeSortKey = (typeof INCOME_SORT_KEYS)[number];

/** Newest first, as the list loads. */
export const INCOME_DEFAULT_SORT: SortState<IncomeSortKey> = {
  key: "date",
  dir: "desc",
};

export interface IncomeFilter {
  /** Head id, "" = all. */
  headId: string;
  /** Bank id, "" = all. */
  bankId: string;
  /** Inclusive YYYY-MM-DD on the entry date, "" = open. */
  from: string;
  to: string;
}

/** What filtering and sorting need from an entry. */
export interface IncomeListRow {
  entryNumber: number;
  date: string;
  head: { id: string; name: string };
  receivedFrom: string | null;
  narration: string | null;
  bankId: string;
  bankName: string;
  amountUsd: string;
  feeUsd: string;
}

export function incomeSortValue(
  e: IncomeListRow,
  key: IncomeSortKey,
): SortValue {
  switch (key) {
    case "entry":
      return e.entryNumber;
    case "date":
      return e.date;
    case "head":
      return e.head.name;
    case "from":
      return e.receivedFrom;
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

/** The rows the Capital & Income list shows: filtered, then sorted. */
export function incomeListRows<T extends IncomeListRow>(
  rows: T[],
  filter: IncomeFilter,
  sort: SortState<IncomeSortKey>,
): T[] {
  return sortRows(
    rows.filter(
      (e) =>
        (!filter.headId || e.head.id === filter.headId) &&
        (!filter.bankId || e.bankId === filter.bankId) &&
        (!filter.from || e.date >= filter.from) &&
        (!filter.to || e.date <= filter.to),
    ),
    sort,
    incomeSortValue,
  );
}

/** ?head=&bank=&from=&to=&sort=&dir= for the export (only the set ones). */
export function incomeListQuery(
  filter: IncomeFilter,
  sort: SortState<IncomeSortKey>,
): URLSearchParams {
  const q = new URLSearchParams();
  if (filter.headId) q.set("head", filter.headId);
  if (filter.bankId) q.set("bank", filter.bankId);
  if (filter.from) q.set("from", filter.from);
  if (filter.to) q.set("to", filter.to);
  if (sort.key) {
    q.set("sort", sort.key);
    q.set("dir", sort.dir);
  }
  return q;
}

export function parseIncomeListQuery(params: URLSearchParams): {
  filter: IncomeFilter;
  sort: SortState<IncomeSortKey>;
} {
  const from = params.get("from");
  const to = params.get("to");
  return {
    filter: {
      headId: params.get("head") ?? "",
      bankId: params.get("bank") ?? "",
      from: isDay(from) ? from : "",
      to: isDay(to) ? to : "",
    },
    sort: parseSort(params, INCOME_SORT_KEYS, INCOME_DEFAULT_SORT),
  };
}

/* ---------------------------------- Heads --------------------------------- */

export const INCOME_HEAD_SORT_KEYS = [
  "name",
  "entries",
  "received",
  "fees",
  "status",
] as const;
export type IncomeHeadSortKey = (typeof INCOME_HEAD_SORT_KEYS)[number];

export const INCOME_HEAD_DEFAULT_SORT: SortState<IncomeHeadSortKey> = {
  key: "name",
  dir: "asc",
};

export interface IncomeHeadListRow {
  name: string;
  isActive: boolean;
  _count: { entries: number };
  receivedUsd?: string;
  feesUsd?: string;
}

export function incomeHeadSortValue(
  h: IncomeHeadListRow,
  key: IncomeHeadSortKey,
): SortValue {
  switch (key) {
    case "name":
      return h.name;
    case "entries":
      return h._count.entries;
    case "received":
      return Number(h.receivedUsd ?? 0);
    case "fees":
      return Number(h.feesUsd ?? 0);
    case "status":
      return h.isActive ? 0 : 1;
  }
}

export type IncomeHeadStatusFilter = "" | "active" | "inactive";

/** The rows the heads list shows: filtered by status, then sorted. */
export function incomeHeadListRows<T extends IncomeHeadListRow>(
  rows: T[],
  status: IncomeHeadStatusFilter,
  sort: SortState<IncomeHeadSortKey>,
): T[] {
  return sortRows(
    rows.filter(
      (h) => !status || (status === "active" ? h.isActive : !h.isActive),
    ),
    sort,
    incomeHeadSortValue,
  );
}

/** ?status=&sort=&dir= for the heads export (only the set ones). */
export function incomeHeadListQuery(
  status: IncomeHeadStatusFilter,
  sort: SortState<IncomeHeadSortKey>,
): URLSearchParams {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (sort.key) {
    q.set("sort", sort.key);
    q.set("dir", sort.dir);
  }
  return q;
}

export function parseIncomeHeadListQuery(params: URLSearchParams): {
  status: IncomeHeadStatusFilter;
  sort: SortState<IncomeHeadSortKey>;
} {
  const status = params.get("status");
  return {
    status: status === "active" || status === "inactive" ? status : "",
    sort: parseSort(params, INCOME_HEAD_SORT_KEYS, INCOME_HEAD_DEFAULT_SORT),
  };
}
