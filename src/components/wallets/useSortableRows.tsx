"use client";

import React, { useMemo, useState } from "react";
import { TableCell, TableSortLabel, type TableCellProps } from "@mui/material";

/**
 * Client-side column sorting for the Wallets module tables. Each sortable
 * column names a key and how to read a comparable value from a row; empty
 * values always sort last, text compares case-insensitively, dates by time.
 */

export type SortValue = string | number | Date | null | undefined;
export type SortDir = "asc" | "desc";

export function useSortableRows<T, K extends string>(
  rows: T[],
  getters: Record<K, (row: T) => SortValue>,
  initial: { key: K; dir: SortDir },
) {
  const [sort, setSort] = useState(initial);

  const sorted = useMemo(() => {
    const get = getters[sort.key];
    const norm = (v: SortValue) =>
      v instanceof Date
        ? v.getTime()
        : typeof v === "string"
          ? v.toLowerCase()
          : v;
    return [...rows].sort((a, b) => {
      const va = norm(get(a));
      const vb = norm(get(b));
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === "asc" ? c : -c;
    });
    // `getters` is a new object every render; the sort key decides order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  /**
   * A header cell that sorts by `key` when clicked. `firstDir` is the
   * direction a first click picks - "desc" suits dates and amounts.
   */
  const sortCell = (
    key: K,
    label: React.ReactNode,
    opts: { firstDir?: SortDir } & TableCellProps = {},
  ) => {
    const { firstDir = "asc", ...cell } = opts;
    const active = sort.key === key;
    return (
      <TableCell key={key} {...cell} sortDirection={active ? sort.dir : false}>
        <TableSortLabel
          active={active}
          direction={active ? sort.dir : firstDir}
          onClick={() =>
            setSort(
              active
                ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
                : { key, dir: firstDir },
            )
          }
        >
          {label}
        </TableSortLabel>
      </TableCell>
    );
  };

  return { sorted, sortCell };
}

/** ISO string / Date -> Date for sorting (null stays null). */
export const asDate = (v: string | Date | null | undefined) =>
  v ? new Date(v) : null;
