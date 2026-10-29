/**
 * Guild change requests: the Guildmaster asks, an admin confirms the change
 * with them, then approves it - the same review as a client's wallet change
 * (WalletChangeRequest). Approving writes the change and starts its 24h
 * freeze: the next distribution waits until it has passed.
 */

import { Prisma } from "@prisma/client";
import { isFullSplit } from "./distribution";
import {
  GuildInputError,
  assertEmailsAvailable,
  parseNewGuildPerson,
  type NewGuildPerson,
} from "./accounts";

type Tx = Prisma.TransactionClient;

export type GuildRequestKind = "wallet" | "split" | "member";

/** Open = still in review. */
export const OPEN_REQUEST = {
  in: ["PENDING", "CONFIRMED"] as ("PENDING" | "CONFIRMED")[],
};

export const GUILD_REQUEST_AUDIT = {
  wallet: {
    requested: "GUILD_WALLET_CHANGE_REQUESTED",
    confirmed: "GUILD_WALLET_CHANGE_CONFIRMED",
    approved: "GUILD_WALLET_CHANGE_APPROVED",
    rejected: "GUILD_WALLET_CHANGE_REJECTED",
  },
  split: {
    requested: "GUILD_SPLIT_CHANGE_REQUESTED",
    confirmed: "GUILD_SPLIT_CHANGE_CONFIRMED",
    approved: "GUILD_SPLIT_CHANGE_APPROVED",
    rejected: "GUILD_SPLIT_CHANGE_REJECTED",
  },
} as const;

/** Member requests: one set of audit actions per ADD / REMOVE. */
export const GUILD_MEMBER_REQUEST_AUDIT = {
  ADD: {
    requested: "GUILD_MEMBER_ADD_REQUESTED",
    confirmed: "GUILD_MEMBER_ADD_CONFIRMED",
    approved: "GUILD_MEMBER_ADD_APPROVED",
    rejected: "GUILD_MEMBER_ADD_REJECTED",
  },
  REMOVE: {
    requested: "GUILD_MEMBER_REMOVE_REQUESTED",
    confirmed: "GUILD_MEMBER_REMOVE_CONFIRMED",
    approved: "GUILD_MEMBER_REMOVE_APPROVED",
    rejected: "GUILD_MEMBER_REMOVE_REJECTED",
  },
} as const;

export interface SplitLineInput {
  membershipId: string;
  percent: number;
}

/**
 * A requested split must name every active member exactly once (the
 * Guildmaster included) and add up to 100%. `extraPercent` is a person being
 * added alongside the split, counted in the 100%.
 */
export function validateSplit(
  lines: unknown,
  activeMembershipIds: string[],
  extraPercent = 0,
): SplitLineInput[] {
  if (!Array.isArray(lines)) {
    throw new GuildInputError("lines must be a list");
  }
  const parsed = lines.map((line) => {
    const raw = (line ?? {}) as Record<string, unknown>;
    const percent = Number(raw.percent);
    if (typeof raw.membershipId !== "string") {
      throw new GuildInputError("Each line needs a membershipId");
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new GuildInputError("Each percent must be between 0 and 100");
    }
    return { membershipId: raw.membershipId, percent };
  });
  const ids = parsed.map((l) => l.membershipId);
  const expected = new Set(activeMembershipIds);
  if (
    new Set(ids).size !== ids.length ||
    ids.length !== expected.size ||
    ids.some((id) => !expected.has(id))
  ) {
    throw new GuildInputError(
      "The split must list every guild member exactly once",
    );
  }
  if (!isFullSplit([...parsed.map((l) => l.percent), extraPercent])) {
    throw new GuildInputError("The percentages must add up to exactly 100%");
  }
  return parsed;
}

export type MemberRequestInput =
  | { action: "ADD"; person: NewGuildPerson; lines: SplitLineInput[] }
  | { action: "REMOVE"; membershipId: string; lines: SplitLineInput[] };

interface ActiveMember {
  id: string;
  isGuildmaster: boolean;
}

/**
 * A Guildmaster's add / remove request from the request body:
 *   member-add:    { person: {...}, lines } - lines name every active member
 *   member-remove: { membershipId, lines } - lines name everyone but them
 * and the percentages (with the new person's) add up to 100.
 */
export function validateMemberRequest(
  kind: "member-add" | "member-remove",
  body: Record<string, unknown>,
  active: ActiveMember[],
): MemberRequestInput {
  if (kind === "member-add") {
    const person = parseNewGuildPerson(body.person, "New member");
    const lines = validateSplit(
      body.lines,
      active.map((m) => m.id),
      person.percent,
    );
    return { action: "ADD", person, lines };
  }
  const target = active.find((m) => m.id === body.membershipId);
  if (!target) throw new GuildInputError("Choose a guild member to remove");
  if (target.isGuildmaster) {
    throw new GuildInputError(
      "The Guildmaster can't be removed - ask us to hand the guild over first",
    );
  }
  const lines = validateSplit(
    body.lines,
    active.filter((m) => m.id !== target.id).map((m) => m.id),
  );
  return { action: "REMOVE", membershipId: target.id, lines };
}

const STALE = "reject this request and ask the Guildmaster for a new one";

/**
 * Re-checks a member request when it's approved: the guild may have changed
 * since it was submitted. Throws a GuildInputError saying why it no longer
 * applies; returns the split to write. `checkEmail: false` skips the
 * new-email check - for the re-check run after the account was created for
 * that email, which would otherwise find its own account.
 */
export async function checkMemberRequestStillValid(
  db: Tx,
  request: {
    guildId: string;
    action: "ADD" | "REMOVE";
    newEmail: string | null;
    newPercent: Prisma.Decimal | null;
    membershipId: string | null;
    lines: { membershipId: string; requestedPercent: Prisma.Decimal }[];
  },
  { checkEmail = true }: { checkEmail?: boolean } = {},
): Promise<SplitLineInput[]> {
  const active = await db.guildMembership.findMany({
    where: { guildId: request.guildId, leftAt: null },
    select: { id: true, isGuildmaster: true },
  });
  const lines = request.lines.map((l) => ({
    membershipId: l.membershipId,
    percent: Number(l.requestedPercent),
  }));
  let staying = active.map((m) => m.id);
  if (request.action === "REMOVE") {
    const target = active.find((m) => m.id === request.membershipId);
    if (!target) {
      throw new GuildInputError(`That member has already left - ${STALE}`);
    }
    if (target.isGuildmaster) {
      throw new GuildInputError(
        `That member is now the Guildmaster - ${STALE}`,
      );
    }
    staying = staying.filter((id) => id !== target.id);
  } else if (checkEmail && request.newEmail) {
    try {
      await assertEmailsAvailable([request.newEmail]);
    } catch {
      throw new GuildInputError(
        `${request.newEmail} is already in use now - ${STALE}`,
      );
    }
  }
  try {
    return validateSplit(lines, staying, Number(request.newPercent ?? 0));
  } catch {
    throw new GuildInputError(
      `The guild's members changed since this was requested - ${STALE}`,
    );
  }
}

/** Approving a wallet request: the member's reward wallet changes now. */
export async function applyWalletRequest(
  tx: Tx,
  request: { membershipId: string; requestedAddress: string; network: string },
  now: Date,
) {
  await tx.guildMembership.update({
    where: { id: request.membershipId },
    data: {
      walletAddress: request.requestedAddress,
      walletNetwork: request.network,
      walletUpdatedAt: now,
    },
  });
}

/**
 * Approving a split request: every line's percent applies now. Members who
 * joined or left since it was submitted make it stale - reject it and ask
 * for a new one instead.
 */
export async function applySplitRequest(
  tx: Tx,
  request: {
    guildId: string;
    lines: { membershipId: string; requestedPercent: Prisma.Decimal }[];
  },
  now: Date,
) {
  const active = await tx.guildMembership.findMany({
    where: { guildId: request.guildId, leftAt: null },
    select: { id: true },
  });
  const lines = validateSplit(
    request.lines.map((l) => ({
      membershipId: l.membershipId,
      percent: Number(l.requestedPercent),
    })),
    active.map((m) => m.id),
  );
  for (const line of lines) {
    await tx.guildMembership.update({
      where: { id: line.membershipId },
      data: { rewardPercent: new Prisma.Decimal(line.percent.toFixed(4)) },
    });
  }
  await tx.guild.update({
    where: { id: request.guildId },
    data: { splitUpdatedAt: now },
  });
}
