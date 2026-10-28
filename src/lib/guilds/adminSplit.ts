/** Splits an admin sets directly, while adding or removing a member. */

import { Prisma } from "@prisma/client";
import { GuildInputError } from "./accounts";

/** `split` from a request body: every listed membership once, 0-100 each. */
export function parseSplitBody(value: unknown, expectedIds: string[]) {
  if (!Array.isArray(value)) throw new GuildInputError("split must be a list");
  const split = value.map((line) => {
    const raw = (line ?? {}) as Record<string, unknown>;
    const percent = Number(raw.percent);
    if (typeof raw.membershipId !== "string") {
      throw new GuildInputError("Each split line needs a membershipId");
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new GuildInputError("Each percent must be between 0 and 100");
    }
    return { membershipId: raw.membershipId, percent };
  });
  const ids = split.map((s) => s.membershipId);
  if (
    new Set(ids).size !== ids.length ||
    ids.length !== expectedIds.length ||
    ids.some((i) => !expectedIds.includes(i))
  ) {
    throw new GuildInputError("split must list every current member once");
  }
  return split;
}

/**
 * Writes a split an admin set while adding or removing a member. It counts
 * as a split change, so the next distribution waits out the 24h freeze.
 */
export async function applyAdminSplit(
  tx: Prisma.TransactionClient,
  guildId: string,
  split: { membershipId: string; percent: number }[],
  now: Date,
) {
  for (const line of split) {
    await tx.guildMembership.update({
      where: { id: line.membershipId },
      data: { rewardPercent: new Prisma.Decimal(line.percent.toFixed(4)) },
    });
  }
  await tx.guild.update({
    where: { id: guildId },
    data: { splitUpdatedAt: now },
  });
}
