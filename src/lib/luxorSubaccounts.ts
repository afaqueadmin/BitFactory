/**
 * src/lib/luxorSubaccounts.ts
 * Resolves which Luxor subaccount(s) a client-facing request should query.
 *
 * Replaces the old "one subaccount per user" assumption
 * (`poolAuths[0]?.authKey || luxorSubaccountName`) now that PoolAuth allows
 * multiple rows per user per pool. User.luxorSubaccountName is kept only as
 * a fallback for users who don't have any PoolAuth rows yet - new code
 * should never read it directly.
 */

import { prisma } from "@/lib/prisma";

export interface LuxorSubaccount {
  id: string | null;
  authKey: string;
}

/** All of a user's Luxor subaccounts, falling back to the legacy column. */
export async function resolveLuxorSubaccounts(
  userId: string,
): Promise<LuxorSubaccount[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      luxorSubaccountName: true,
      poolAuths: {
        where: { pool: { name: "Luxor" } },
        select: { id: true, authKey: true },
      },
    },
  });

  if (!user) return [];
  if (user.poolAuths.length > 0) return user.poolAuths;
  if (user.luxorSubaccountName) {
    return [{ id: null, authKey: user.luxorSubaccountName }];
  }
  return [];
}

/** Comma-join for Luxor's `subaccount_names` query param. */
export function joinSubaccountNames(authKeys: string[]): string {
  return authKeys
    .map((k) => k.trim())
    .filter(Boolean)
    .join(",");
}

/**
 * Narrows `all` down to the subset named in a `?subaccounts=` query param
 * (comma-separated authKeys, or "all"/missing for everything). Never trusts
 * the param directly - anything not present in `all` is dropped, and an
 * empty/invalid result falls back to `all` rather than returning nothing.
 */
export function selectRequestedSubaccounts(
  all: LuxorSubaccount[],
  requestedParam: string | null | undefined,
): LuxorSubaccount[] {
  if (!requestedParam || requestedParam === "all") return all;

  const requested = new Set(
    requestedParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const filtered = all.filter((s) => requested.has(s.authKey));
  return filtered.length > 0 ? filtered : all;
}
