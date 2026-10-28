/**
 * Details written on guild audit entries, so an admin action can be read
 * back later (the guild page's change history): who was in the guild before
 * and after, each member's % and wallet, and where the action came from.
 * Guildmaster requests keep their own record in the request tables.
 */

import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

export interface MemberSnapshot {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  isGuildmaster: boolean;
  percent: number;
  wallet: string | null;
}

export interface MemberChange {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  isGuildmaster: boolean;
  /** null "from": joined; null "to": left. */
  percent: { from: number | null; to: number | null };
  /** Only when the wallet was set or changed. */
  wallet?: { from: string | null; to: string | null };
}

/** IP and browser of the request, as other admin audit entries record. */
export function requestMeta(request: Request) {
  return {
    ipAddress: request.headers.get("x-forwarded-for") || "unknown",
    userAgent: request.headers.get("user-agent") || "unknown",
  };
}

/** The guild's active members right now. */
export async function snapshotMembers(
  db: Db,
  guildId: string,
): Promise<MemberSnapshot[]> {
  const rows = await db.guildMembership.findMany({
    where: { guildId, leftAt: null },
    orderBy: [{ isGuildmaster: "desc" }, { joinedAt: "asc" }],
    include: { user: { select: { name: true, email: true } } },
  });
  return rows.map((m) => ({
    membershipId: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    isGuildmaster: m.isGuildmaster,
    percent: Number(m.rewardPercent),
    wallet: m.walletAddress,
  }));
}

/**
 * Every member present before or after, with their % from -> to (and the
 * wallet when it changed). Members whose % and wallet didn't change are
 * included too, so the entry shows the whole split.
 */
export function diffMembers(
  before: MemberSnapshot[],
  after: MemberSnapshot[],
): MemberChange[] {
  const ids = [
    ...before.map((m) => m.membershipId),
    ...after
      .map((m) => m.membershipId)
      .filter((id) => !before.some((b) => b.membershipId === id)),
  ];
  return ids.map((id) => {
    const b = before.find((m) => m.membershipId === id);
    const a = after.find((m) => m.membershipId === id);
    const who = (a ?? b)!;
    const change: MemberChange = {
      membershipId: id,
      userId: who.userId,
      name: who.name,
      email: who.email,
      isGuildmaster: who.isGuildmaster,
      percent: { from: b?.percent ?? null, to: a?.percent ?? null },
    };
    const walletFrom = b?.wallet ?? null;
    const walletTo = a ? a.wallet : walletFrom;
    if ((!b && walletTo) || (b && a && walletFrom !== walletTo)) {
      change.wallet = { from: b ? walletFrom : null, to: walletTo };
    }
    return change;
  });
}
