/**
 * Adding and removing guild members. Used by the admin's direct Add member /
 * Remove and by an approved Guildmaster request, so both behave the same.
 * The new person's account is created (welcome email first) before
 * addMember's transaction; a removed person's sessions are revoked after
 * removeMember's.
 */

import { Prisma } from "@prisma/client";
import { applyAdminSplit } from "./adminSplit";
import type { NewGuildPerson } from "./accounts";

type Tx = Prisma.TransactionClient;
type SplitLine = { membershipId: string; percent: number };

/** Adds the member and writes everyone else's new %. Counts as a split change. */
export async function addMember(
  tx: Tx,
  params: {
    guildId: string;
    userId: string;
    person: Pick<NewGuildPerson, "percent" | "walletAddress">;
    split: SplitLine[];
    now: Date;
  },
) {
  const { guildId, userId, person, split, now } = params;
  const membership = await tx.guildMembership.create({
    data: {
      guildId,
      userId,
      rewardPercent: new Prisma.Decimal(person.percent.toFixed(4)),
      walletAddress: person.walletAddress ?? null,
      walletUpdatedAt: person.walletAddress ? now : null,
    },
  });
  await applyAdminSplit(tx, guildId, split, now);
  return membership;
}

/**
 * Removes a Guildmember and writes the remaining members' new %. Their
 * account exists only for the guild, so it's closed; their open wallet
 * requests and any open request to remove them no longer apply.
 */
export async function removeMember(
  tx: Tx,
  params: {
    guildId: string;
    leaving: { id: string; userId: string };
    split: SplitLine[];
    actorId: string;
    now: Date;
  },
) {
  const { guildId, leaving, split, actorId, now } = params;
  await tx.guildMembership.update({
    where: { id: leaving.id },
    data: { leftAt: now, rewardPercent: 0 },
  });
  await applyAdminSplit(tx, guildId, split, now);
  await tx.user.update({
    where: { id: leaving.userId },
    data: { isDeleted: true },
  });
  const closed = {
    status: "REJECTED" as const,
    rejectionReason: "The member left the guild",
    reviewedById: actorId,
    reviewedAt: now,
  };
  const open = { in: ["PENDING", "CONFIRMED"] as ("PENDING" | "CONFIRMED")[] };
  await tx.guildWalletChangeRequest.updateMany({
    where: { membershipId: leaving.id, status: open },
    data: closed,
  });
  await tx.guildMemberChangeRequest.updateMany({
    where: { membershipId: leaving.id, status: open },
    data: closed,
  });
}
