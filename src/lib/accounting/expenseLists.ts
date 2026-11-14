import { SortState, SortValue, parseSort, sortRows } from "@/lib/sortRows";
import type { ExpenseStatus } from "@/lib/accounting/expense";

/**
 * Filters and sort orders of the Expenses and Expense Heads lists, shared
 * by the pages and their CSV / PDF exports so a download holds exactly the
 * rows shown, in the same order.
 */

const isDay = (v: string | null): v is string =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/* -------------------------------- Expenses -------------------------------- */

export const EXPENSE_SORT_KEYS = [
  "entry",
  "date",
  "head",
  "narration",
  "due",
  "paid",
  "balance",
  "status",
] as const;
export type ExpenseSortKey = (typeof EXPENSE_SORT_KEYS)[number];

/** Newest first, as the list loads. */
export const EXPENSE_DEFAULT_SORT: SortState<ExpenseSortKey> = {
  key: "date",
  dir: "desc",
};

export const EXPENSE_STATUSES: ExpenseStatus[] = ["PENDING", "PARTIAL", "PAID"];

export interface ExpenseFilter {
  /** Head id, "" = all. */
  headId: string;
  status: ExpenseStatus | "";
  /** Inclusive YYYY-MM-DD on the expense date, "" = open. */
  from: string;
  to: string;
}

/** What filtering and sorting need from an expense. */
export interface ExpenseListRow {
  /** Entry # (shown as EXP-0001). */
  entryNumber: number;
  date: string;
  head: { id: string; name: string };
  narration: string | null;
  amountDueUsd: string;
  paidUsd: string;
  balanceUsd: string;
  status: ExpenseStatus;
}

const STATUS_ORDER: Record<ExpenseStatus, number> = {
  PENDING: 0,
  PARTIAL: 1,
  PAID: 2,
};

export function expenseSortValue(
  e: ExpenseListRow,
  key: ExpenseSortKey,
): SortValue {
  switch (key) {
    case "entry":
      return e.entryNumber;
    case "date":
      return e.date;
    case "head":
      return e.head.name;
    case "narration":
      return e.narration;
    case "due":
      return Number(e.amountDueUsd);
    case "paid":
      return Number(e.paidUsd);
    case "balance":
      return Number(e.balanceUsd);
    case "status":
      return STATUS_ORDER[e.status];
  }
}

/** The rows the Expenses list shows: filtered, then sorted. */
export function expenseListRows<T extends ExpenseListRow>(
  rows: T[],
  filter: ExpenseFilter,
  sort: SortState<ExpenseSortKey>,
): T[] {
  return sortRows(
    rows.filter(
      (e) =>
        (!filter.headId || e.head.id === filter.headId) &&
        (!filter.status || e.status === filter.status) &&
        (!filter.from || e.date >= filter.from) &&
        (!filter.to || e.date <= filter.to),
    ),
    sort,
    expenseSortValue,
  );
}

/** ?head=&status=&from=&to=&sort=&dir= for the export (only the set ones). */
export function expenseListQuery(
  filter: ExpenseFilter,
  sort: SortState<ExpenseSortKey>,
): URLSearchParams {
  const q = new URLSearchParams();
  if (filter.headId) q.set("head", filter.headId);
  if (filter.status) q.set("status", filter.status);
  if (filter.from) q.set("from", filter.from);
  if (filter.to) q.set("to", filter.to);
  if (sort.key) {
    q.set("sort", sort.key);
    q.set("dir", sort.dir);
  }
  return q;
}

export function parseExpenseListQuery(params: URLSearchParams): {
  filter: ExpenseFilter;
  sort: SortState<ExpenseSortKey>;
} {
  const status = params.get("status");
  const from = params.get("from");
  const to = params.get("to");
  return {
    filter: {
      headId: params.get("head") ?? "",
      status: EXPENSE_STATUSES.includes(status as ExpenseStatus)
        ? (status as ExpenseStatus)
        : "",
      from: isDay(from) ? from : "",
      to: isDay(to) ? to : "",
    },
    sort: parseSort(params, EXPENSE_SORT_KEYS, EXPENSE_DEFAULT_SORT),
  };
}

/* ------------------------------ Expense Heads ----------------------------- */

export const HEAD_SORT_KEYS = [
  "name",
  "expenses",
  "due",
  "paid",
  "status",
] as const;
export type HeadSortKey = (typeof HEAD_SORT_KEYS)[number];

export const HEAD_DEFAULT_SORT: SortState<HeadSortKey> = {
  key: "name",
  dir: "asc",
};

export interface HeadListRow {
  name: string;
  isActive: boolean;
  _count: { expenses: number };
  amountDueUsd?: string;
  amountPaidUsd?: string;
}

export function headSortValue(h: HeadListRow, key: HeadSortKey): SortValue {
  switch (key) {
    case "name":
      return h.name;
    case "expenses":
      return h._count.expenses;
    case "due":
      return Number(h.amountDueUsd ?? 0);
    case "paid":
      return Number(h.amountPaidUsd ?? 0);
    case "status":
      return h.isActive ? 0 : 1;
  }
}

export type HeadStatusFilter = "" | "active" | "inactive";

/** The rows the Expense Heads list shows: filtered by status, then sorted. */
export function headListRows<T extends HeadListRow>(
  rows: T[],
  status: HeadStatusFilter,
  sort: SortState<HeadSortKey>,
): T[] {
  return sortRows(
    rows.filter(
      (h) => !status || (status === "active" ? h.isActive : !h.isActive),
    ),
    sort,
    headSortValue,
  );
}

/** ?status=&sort=&dir= for the heads export (only the set ones). */
export function headListQuery(
  status: HeadStatusFilter,
  sort: SortState<HeadSortKey>,
): URLSearchParams {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (sort.key) {
    q.set("sort", sort.key);
    q.set("dir", sort.dir);
  }
  return q;
}

export function parseHeadListQuery(params: URLSearchParams): {
  status: HeadStatusFilter;
  sort: SortState<HeadSortKey>;
} {
  const status = params.get("status");
  return {
    status: status === "active" || status === "inactive" ? status : "",
    sort: parseSort(params, HEAD_SORT_KEYS, HEAD_DEFAULT_SORT),
  };
}
