/**
 * Pure row sorting shared by the sortable tables and their exports (so a
 * download comes out in the order shown on screen).
 */

export type SortDir = "asc" | "desc";

export type SortValue = string | number | null | undefined;

export interface SortState<K extends string> {
  /** null = the order the rows came in. */
  key: K | null;
  dir: SortDir;
}

/**
 * Rows sorted by `value(row, key)`. Numbers compare as numbers, text
 * ignoring case; empty values (null / "") always go last. Ties keep the
 * incoming order. No key = rows unchanged.
 */
export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
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

/** Reads ?sort=&dir= (anything unknown = `fallback`). */
export function parseSort<K extends string>(
  params: URLSearchParams,
  keys: readonly K[],
  fallback: SortState<K>,
): SortState<K> {
  const key = params.get("sort");
  const dir = params.get("dir");
  if (!key || !(keys as readonly string[]).includes(key)) return fallback;
  return { key: key as K, dir: dir === "desc" ? "desc" : "asc" };
}
