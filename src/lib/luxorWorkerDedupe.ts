/**
 * src/lib/luxorWorkerDedupe.ts
 * Client-safe helpers for Luxor worker lists that span several subaccounts.
 *
 * A miner moved from one subaccount to another leaves its old entry behind:
 * Luxor keeps listing it under the old subaccount as INACTIVE while the new
 * one is ACTIVE. Anything that matches workers to miners by name only must
 * pick between those twins on purpose - taking the first or last one Luxor
 * returns reads the stale entry depending on response order.
 *
 * Rule everywhere: an ACTIVE entry wins; between two of the same status the
 * one with the most recent last share wins. Names compare trimmed and
 * case-insensitive.
 */

import type { Worker } from "@/lib/luxor";

type WorkerLike = Pick<Worker, "name" | "status"> & {
  last_share_time?: string | null;
};

export function workerNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function lastShareMs(w: WorkerLike): number {
  const t = w.last_share_time ? new Date(w.last_share_time).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** True if `candidate` should replace `current` as the entry for a miner. */
export function isPreferredWorkerEntry(
  candidate: WorkerLike,
  current: WorkerLike,
): boolean {
  const candidateActive = candidate.status === "ACTIVE";
  const currentActive = current.status === "ACTIVE";
  if (candidateActive !== currentActive) return candidateActive;
  return lastShareMs(candidate) > lastShareMs(current);
}

/**
 * One entry per key (default: worker name), chosen by isPreferredWorkerEntry.
 * Pass a key that includes the owner when the list spans several customers -
 * miner names are only unique per customer.
 */
export function dedupeWorkers<T extends WorkerLike>(
  workers: T[],
  keyOf: (w: T) => string = (w) => workerNameKey(w.name),
): T[] {
  const byKey = new Map<string, T>();
  for (const w of workers) {
    const key = keyOf(w);
    const existing = byKey.get(key);
    if (!existing || isPreferredWorkerEntry(w, existing)) byKey.set(key, w);
  }
  return Array.from(byKey.values());
}

/** The entry for `minerName` in a (possibly multi-subaccount) list, if any. */
export function pickWorkerForMiner<T extends WorkerLike>(
  workers: T[],
  minerName: string,
): T | undefined {
  const target = workerNameKey(minerName);
  let picked: T | undefined;
  for (const w of workers) {
    if (workerNameKey(w.name) !== target) continue;
    if (!picked || isPreferredWorkerEntry(w, picked)) picked = w;
  }
  return picked;
}

/**
 * Counts distinct workers - Luxor's total_active / total_inactive count a
 * moved miner twice. A key is active if any of its entries is ACTIVE.
 */
export function countDistinctWorkers<T extends WorkerLike>(
  workers: T[],
  keyOf?: (w: T) => string,
): { active: number; inactive: number } {
  const distinct = dedupeWorkers(workers, keyOf);
  const active = distinct.filter((w) => w.status === "ACTIVE").length;
  return { active, inactive: distinct.length - active };
}
