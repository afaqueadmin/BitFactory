/**
 * src/lib/luxorSubaccounts.ts
 * Single source of truth for a user's Luxor subaccounts: one PoolAuth row per
 * subaccount on the "Luxor" pool. A user can hold any number of them, and a
 * subaccount belongs to at most one user (@@unique([poolId, authKey])).
 *
 * The old single-value subaccount column on User is retired - it is still in
 * the schema but no code reads or writes it. Everything goes through here.
 */

import { prisma } from "@/lib/prisma";
import { AuditAction, Prisma } from "@prisma/client";
import { logPoolCredentialChange } from "@/lib/audit/logPoolCredentialChange";

export interface LuxorSubaccount {
  id: string | null;
  authKey: string;
}

type Db = Prisma.TransactionClient;

/**
 * Options for the prisma.$transaction wrapping setLuxorSubaccounts /
 * setClientGroup - they run several sequential queries, which can outlast
 * Prisma's 5s interactive-transaction default against a cold Neon instance.
 */
export const SUBACCOUNT_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

/** All of a user's Luxor subaccounts, oldest first. */
export async function resolveLuxorSubaccounts(
  userId: string,
): Promise<LuxorSubaccount[]> {
  return prisma.poolAuth.findMany({
    where: { userId, pool: { name: "Luxor" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, authKey: true },
  });
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

/**
 * Cleans a client-supplied subaccount list: accepts an array (or a single
 * string), trims, drops blanks and the "N/A" placeholder, de-duplicates.
 * Returns null when the input isn't a list at all (i.e. "not provided").
 */
export function normalizeSubaccountNames(input: unknown): string[] | null {
  if (input === undefined) return null;
  if (input === null) return [];
  const raw = Array.isArray(input) ? input : [input];
  const names = raw
    .filter((n): n is string => typeof n === "string")
    .map((n) => n.trim())
    .filter((n) => n && n !== "N/A");
  return Array.from(new Set(names));
}

/** Thrown when a requested subaccount already belongs to another user. */
export class LuxorSubaccountConflictError extends Error {
  constructor(public readonly names: string[]) {
    super(
      `Luxor subaccount${names.length > 1 ? "s" : ""} already assigned to another user: ${names.join(", ")}`,
    );
    this.name = "LuxorSubaccountConflictError";
  }
}

/**
 * Names from `names` that are already held by a user other than
 * `exceptUserId` (pass null for a user that doesn't exist yet).
 */
export async function findLuxorSubaccountConflicts(
  names: string[],
  exceptUserId: string | null,
  db: Db = prisma,
): Promise<string[]> {
  if (names.length === 0) return [];
  const taken = await db.poolAuth.findMany({
    where: {
      pool: { name: "Luxor" },
      authKey: { in: names },
      ...(exceptUserId ? { userId: { not: exceptUserId } } : {}),
    },
    select: { authKey: true },
  });
  return taken.map((t) => t.authKey);
}

/** Every Luxor authKey assigned to any user - for "unassigned" pickers. */
export async function listAssignedLuxorSubaccountNames(): Promise<string[]> {
  const rows = await prisma.poolAuth.findMany({
    where: { pool: { name: "Luxor" } },
    select: { authKey: true },
  });
  return rows.map((r) => r.authKey);
}

/**
 * Luxor subaccount names per user id, oldest first - for list endpoints that
 * need to show every user's subaccounts without an N+1 query.
 */
export async function luxorSubaccountNamesByUser(
  userIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (userIds.length === 0) return map;
  const rows = await prisma.poolAuth.findMany({
    where: { userId: { in: userIds }, pool: { name: "Luxor" } },
    orderBy: { createdAt: "asc" },
    select: { userId: true, authKey: true },
  });
  for (const r of rows) {
    const list = map.get(r.userId) ?? [];
    list.push(r.authKey);
    map.set(r.userId, list);
  }
  return map;
}

/**
 * The groups a client belongs to through the memberships this module manages:
 * direct (userId-based) rows plus rows keyed by one of their Luxor PoolAuths.
 */
async function managedMemberships(db: Db, userId: string) {
  return db.groupSubaccount.findMany({
    where: {
      OR: [{ userId }, { poolAuth: { userId, pool: { name: "Luxor" } } }],
    },
    select: { id: true, groupId: true, poolAuthId: true, userId: true },
  });
}

/**
 * Makes `names` exactly the user's set of Luxor subaccounts: adds missing
 * PoolAuth rows, removes the rest. Keeps group membership in step - a new
 * subaccount joins the group the user is already in (when there's exactly
 * one), a removed subaccount's membership row is deleted, and a user left
 * with no subaccounts keeps their group through a direct userId row.
 *
 * Throws LuxorSubaccountConflictError if any name belongs to another user.
 * Run it inside prisma.$transaction so a failure leaves nothing half-done.
 */
export async function setLuxorSubaccounts(
  db: Db,
  args: { userId: string; names: string[]; actorId: string },
): Promise<{ added: string[]; removed: string[] }> {
  const { userId, actorId } = args;
  const names = normalizeSubaccountNames(args.names) ?? [];

  const luxorPool = await db.pool.findUnique({
    where: { name: "Luxor" },
    select: { id: true },
  });
  if (!luxorPool) {
    if (names.length > 0) throw new Error("Luxor pool is not configured");
    return { added: [], removed: [] };
  }

  const conflicts = await findLuxorSubaccountConflicts(names, userId, db);
  if (conflicts.length > 0) throw new LuxorSubaccountConflictError(conflicts);

  const current = await db.poolAuth.findMany({
    where: { poolId: luxorPool.id, userId },
    select: { id: true, authKey: true },
  });
  const toRemove = current.filter((c) => !names.includes(c.authKey));
  const toAdd = names.filter((n) => !current.some((c) => c.authKey === n));
  if (toRemove.length === 0 && toAdd.length === 0) {
    return { added: [], removed: [] };
  }

  const memberships = await managedMemberships(db, userId);
  const groupIds = Array.from(new Set(memberships.map((m) => m.groupId)));
  const inheritedGroupId = groupIds.length === 1 ? groupIds[0] : null;

  // Removals - membership rows first (the FK would otherwise just null out
  // poolAuthId and leave an orphaned row behind).
  for (const r of toRemove) {
    const removedMemberships = await db.groupSubaccount.findMany({
      where: { poolAuthId: r.id },
      select: { groupId: true },
    });
    await db.groupSubaccount.deleteMany({ where: { poolAuthId: r.id } });
    for (const m of removedMemberships) {
      await db.auditLog.create({
        data: {
          action: AuditAction.GROUP_SUBACCOUNT_REMOVED,
          entityType: "Group",
          entityId: m.groupId,
          userId: actorId,
          description: `${r.authKey} removed from group`,
        },
      });
    }
    await db.poolAuth.delete({ where: { id: r.id } });
    await logPoolCredentialChange(db, {
      action: AuditAction.POOL_CREDENTIAL_REMOVED,
      userId,
      actorId,
      poolName: "Luxor",
      credentialName: r.authKey,
    });
  }

  // Additions
  for (const name of toAdd) {
    const poolAuth = await db.poolAuth.create({
      data: { poolId: luxorPool.id, userId, authKey: name },
      select: { id: true },
    });
    await logPoolCredentialChange(db, {
      action: AuditAction.POOL_CREDENTIAL_ADDED,
      userId,
      actorId,
      poolName: "Luxor",
      credentialName: name,
    });
    if (inheritedGroupId) {
      await db.groupSubaccount.create({
        data: {
          groupId: inheritedGroupId,
          subaccountName: name,
          poolAuthId: poolAuth.id,
          addedBy: actorId,
          addedByUserId: actorId,
        },
      });
      await db.auditLog.create({
        data: {
          action: AuditAction.GROUP_SUBACCOUNT_ADDED,
          entityType: "Group",
          entityId: inheritedGroupId,
          userId: actorId,
          description: `${name} added to group`,
        },
      });
    }
  }

  // Keep the membership shape consistent: direct userId rows are only for
  // users with no Luxor subaccount.
  if (inheritedGroupId) {
    if (names.length > 0) {
      await db.groupSubaccount.deleteMany({ where: { userId } });
    } else {
      const direct = await db.groupSubaccount.findFirst({
        where: { userId, groupId: inheritedGroupId },
        select: { id: true },
      });
      if (!direct) {
        await db.groupSubaccount.create({
          data: {
            groupId: inheritedGroupId,
            userId,
            addedBy: actorId,
            addedByUserId: actorId,
          },
        });
      }
    }
  }

  return { added: toAdd, removed: toRemove.map((r) => r.authKey) };
}

/**
 * Puts the client (all of their Luxor subaccounts, or the user directly when
 * they have none) into `groupId`, replacing every membership this module
 * manages. Pass null to remove them from all groups.
 */
export async function setClientGroup(
  db: Db,
  args: { userId: string; groupId: string | null; actorId: string },
): Promise<void> {
  const { userId, actorId } = args;
  const groupId = args.groupId?.trim() || null;

  const existing = await managedMemberships(db, userId);
  const existingGroupIds = Array.from(new Set(existing.map((m) => m.groupId)));

  // Nothing to do if the client is already wholly in exactly this group.
  const luxorAuths = await db.poolAuth.findMany({
    where: { userId, pool: { name: "Luxor" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, authKey: true },
  });
  const fullyInGroup =
    groupId !== null &&
    existingGroupIds.length === 1 &&
    existingGroupIds[0] === groupId &&
    (luxorAuths.length === 0
      ? existing.some((m) => m.userId === userId)
      : luxorAuths.every((a) => existing.some((m) => m.poolAuthId === a.id)));
  if (fullyInGroup || (groupId === null && existing.length === 0)) return;

  await db.groupSubaccount.deleteMany({
    where: { id: { in: existing.map((m) => m.id) } },
  });
  for (const gid of existingGroupIds) {
    await db.auditLog.create({
      data: {
        action: AuditAction.GROUP_SUBACCOUNT_REMOVED,
        entityType: "Group",
        entityId: gid,
        userId: actorId,
        description: `${luxorAuths.map((a) => a.authKey).join(", ") || "Customer"} removed from group`,
      },
    });
  }

  if (!groupId) return;

  if (luxorAuths.length > 0) {
    for (const a of luxorAuths) {
      await db.groupSubaccount.create({
        data: {
          groupId,
          subaccountName: a.authKey,
          poolAuthId: a.id,
          addedBy: actorId,
          addedByUserId: actorId,
        },
      });
    }
  } else {
    await db.groupSubaccount.create({
      data: { groupId, userId, addedBy: actorId, addedByUserId: actorId },
    });
  }
  await db.auditLog.create({
    data: {
      action: AuditAction.GROUP_SUBACCOUNT_ADDED,
      entityType: "Group",
      entityId: groupId,
      userId: actorId,
      description: `${luxorAuths.map((a) => a.authKey).join(", ") || "Customer"} added to group`,
    },
  });
}

/** Group ids the client is in via memberships managed above. */
export async function getClientGroupIds(userId: string): Promise<string[]> {
  const rows = await managedMemberships(prisma, userId);
  return Array.from(new Set(rows.map((r) => r.groupId)));
}
