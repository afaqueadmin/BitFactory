/**
 * Scoping helpers for the guild roles.
 *
 * A Guild's miners, Luxor subaccount, invoices and ledger sit on the current
 * Guildmaster's account (Guild.guildmasterId). A GUILDMEMBER owns nothing:
 * they see the guild's data, which means the Guildmaster's. Everything a
 * route reads "for the caller" therefore goes through resolveDataOwnerId.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isReadOnlyRole } from "@/lib/customerRoles";

interface ScopedUser {
  userId: string;
  role: string;
}

/** The caller's active membership with its guild, or null. */
export async function getGuildMembership(userId: string) {
  return prisma.guildMembership.findFirst({
    where: { userId, leftAt: null, guild: { deletedAt: null } },
    include: { guild: true },
  });
}

/**
 * Whose records to show the caller: a Guildmember sees their guild's
 * Guildmaster's; everyone else their own. A Guildmember with no active guild
 * gets their own id, which owns nothing.
 */
export async function resolveDataOwnerId(user: ScopedUser): Promise<string> {
  if (user.role !== "GUILDMEMBER") return user.userId;
  const membership = await getGuildMembership(user.userId);
  return membership?.guild.guildmasterId ?? user.userId;
}

/**
 * 403 for view-only callers, or null to carry on. Use at the top of any
 * write route a customer can reach.
 */
export function rejectReadOnly(role: string): NextResponse | null {
  if (!isReadOnlyRole(role)) return null;
  return NextResponse.json(
    { success: false, error: "Guild members have view-only access" },
    { status: 403 },
  );
}
