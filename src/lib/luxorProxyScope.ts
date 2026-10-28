/**
 * src/lib/luxorProxyScope.ts
 * Which Luxor subaccounts a caller of the /api/luxor proxy may query.
 *
 * Admins are unrestricted. Everyone else is limited to subaccounts derived
 * server-side from the DB - never to names taken from the request - and never
 * gets the company-wide site_id fallback.
 */

import { isStaffRole } from "@/lib/auth/staffRoles";
import { prisma } from "@/lib/prisma";
import { franchiseeUserFilter } from "@/lib/franchiseeScope";
import { resolveDataOwnerId } from "@/lib/guildScope";

export function isAdminRole(role: string): boolean {
  return isStaffRole(role);
}

/** The caller's own Luxor subaccount names (PoolAuth), oldest first. */
async function ownLuxorSubaccountNames(userId: string): Promise<string[]> {
  const rows = await prisma.poolAuth.findMany({
    where: { userId, pool: { name: "Luxor" } },
    orderBy: { createdAt: "asc" },
    select: { authKey: true },
  });
  return rows.map((r) => r.authKey);
}

/**
 * Every Luxor subaccount name of a franchisee's active customers, skipping
 * "_test" subaccounts (same rule as the franchise dashboard).
 */
export async function franchiseeCustomerSubaccountNames(
  franchiseeUserId: string,
): Promise<string[]> {
  const customers = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      isDeleted: false,
      ...franchiseeUserFilter({ id: franchiseeUserId, role: "FRANCHISEE" }),
    },
    select: {
      poolAuths: {
        where: { pool: { name: "Luxor" } },
        select: { authKey: true },
      },
    },
  });

  const names = new Set<string>();
  for (const customer of customers) {
    for (const { authKey: name } of customer.poolAuths) {
      if (!name.includes("_test")) names.add(name);
    }
  }
  return Array.from(names);
}

/**
 * Subaccount names the caller may query, or null for unrestricted (admins).
 *   CLIENT / GUILDMASTER -> their own subaccounts
 *   GUILDMEMBER          -> their guild's (the Guildmaster's) subaccounts
 *   FRANCHISEE           -> their own + their customers' subaccounts
 *   any other            -> none
 */
export async function resolveAllowedSubaccounts(user: {
  userId: string;
  role: string;
}): Promise<string[] | null> {
  if (isAdminRole(user.role)) return null;
  if (user.role === "CLIENT" || user.role === "GUILDMASTER") {
    return ownLuxorSubaccountNames(user.userId);
  }
  if (user.role === "GUILDMEMBER") {
    return ownLuxorSubaccountNames(await resolveDataOwnerId(user));
  }
  if (user.role === "FRANCHISEE") {
    const [own, customers] = await Promise.all([
      ownLuxorSubaccountNames(user.userId),
      franchiseeCustomerSubaccountNames(user.userId),
    ]);
    return Array.from(new Set([...own, ...customers]));
  }
  return [];
}

/**
 * Every subaccount name the request asks for, across the three parameters
 * callers use (subaccount_name, subaccount_names, subaccounts). Comma lists
 * are split and trimmed; "all" means "no specific request".
 */
export function parseRequestedSubaccounts(
  searchParams: URLSearchParams,
): string[] {
  const names = new Set<string>();
  for (const key of ["subaccount_name", "subaccount_names", "subaccounts"]) {
    const value = searchParams.get(key);
    if (!value) continue;
    for (const part of value.split(",")) {
      const name = part.trim();
      if (name && name !== "all") names.add(name);
    }
  }
  return Array.from(names);
}

export type ScopeResult =
  { ok: true; names: string[] } | { ok: false; forbidden: string[] };

/**
 * Narrows a non-admin request to the allowed set. Any requested name outside
 * it fails the whole request; no request at all means "all allowed".
 */
export function scopeRequestedSubaccounts(
  allowed: string[],
  requested: string[],
): ScopeResult {
  if (requested.length === 0) return { ok: true, names: allowed };
  const allowedSet = new Set(allowed);
  const forbidden = requested.filter((name) => !allowedSet.has(name));
  if (forbidden.length > 0) return { ok: false, forbidden };
  return { ok: true, names: requested };
}
