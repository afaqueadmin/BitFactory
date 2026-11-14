"use client";

/**
 * Click-to-sort column headers for tables sorted in the browser (Expense
 * Heads, Expenses, bank statements). Click a header to sort by it, click
 * again to reverse.
 */

import { TableCell, TableSortLabel } from "@mui/material";
import { useState } from "react";
import { SortDir, SortState } from "@/lib/sortRows";

export { sortRows } from "@/lib/sortRows";
export type { SortDir, SortValue } from "@/lib/sortRows";

export interface TableSort<K extends string> extends SortState<K> {
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
