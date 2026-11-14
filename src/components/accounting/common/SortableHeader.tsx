"use client";

/**
 * Click-to-sort column headers for tables sorted in the browser (Expense
 * Heads, Expenses, bank statements). Click a header to sort by it, click
 * again to reverse.
 */

import { TableCell, TableSortLabel } from "@mui/material";
import { useState } from "react";

export type SortDir = "asc" | "desc";

export interface TableSort<K extends string> {
  /** null = the order the rows came in. */
  key: K | null;
  dir: SortDir;
  request: (key: K) => void;
}

export function useTableSort<K extends string>(
  initialKey: K | null = null,
  initialDir: SortDir = "asc",
): TableSort<K> {
  const [state, setState] = useState<{ key: K | null; dir: SortDir }>({
    key: initialKey,
    dir: initialDir,
  });
  return {
    ...state,
    request: (key) =>
      setState((s) =>
        s.key === key
          ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
          : { key, dir: "asc" },
      ),
  };
}

export type SortValue = string | number | null | undefined;

/**
 * Rows sorted by `value(row, key)`. Numbers compare as numbers, text
 * ignoring case; empty values (null / "") always go last. Ties keep the
 * incoming order. No key = rows unchanged.
 */
export function sortRows<T, K extends string>(
  rows: T[],
  sort: Pick<TableSort<K>, "key" | "dir">,
  value: (row: T, key: K) => SortValue,
): T[] {
  const key = sort.key;
  if (!key) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: value(row, key) }))
    .sort((a, b) => {
      const aEmpty = a.v === null || a.v === undefined || a.v === "";
      const bEmpty = b.v === null || b.v === undefined || b.v === "";
      if (aEmpty || bEmpty) {
        return aEmpty && bEmpty ? a.i - b.i : aEmpty ? 1 : -1;
      }
      const c =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), undefined, {
              sensitivity: "base",
              numeric: true,
            });
      return c * sign || a.i - b.i;
    })
    .map((x) => x.row);
}

/** A header cell that sorts its table by `sortKey`. */
export function SortHeader<K extends string>({
  sort,
  sortKey,
  label,
  align,
}: {
  sort: TableSort<K>;
  sortKey: K;
  label: React.ReactNode;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <TableCell align={align} sortDirection={active ? sort.dir : false}>
      <TableSortLabel
        active={active}
        direction={active ? sort.dir : "asc"}
        onClick={() => sort.request(sortKey)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}
