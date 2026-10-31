/**
 * POST /api/guild/requests - Guildmaster only. Submits a change request for
 * admin review (confirm, then approve, then a 24h freeze):
 *   { kind: "wallet", membershipId, requestedAddress, reason? }
 *       a member's (or their own) reward wallet
 *   { kind: "split", lines: [{ membershipId, percent }], reason? }
 *       a new reward split for every member, themselves included, adding
 *       up to 100%
 *   { kind: "member-add", person: { name, email, phoneNumber?, percent,
 *     walletAddress? }, lines: [{ membershipId, percent }], reason? }
 *       a new member; lines give every current member's new % (with the new
 *       person's adding up to 100%). Nothing is created until it's approved.
 *   { kind: "member-remove", membershipId, lines, reason? }
 *       removes a member (not the Guildmaster); lines give the remaining
 *       members' new %
 * Requires step-up re-authentication ({ currentPassword } or
 * { twoFactorToken }), like a client's wallet change. Wallet: one open
 * request per member. Split, add and remove all change the split, so only
 * one of those can be open per guild at a time.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/guilds/routeAuth";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { getGuildMembership } from "@/lib/guildScope";
import { GuildInputError, parseWalletAddress } from "@/lib/guilds/accounts";
import {
  GUILD_MEMBER_REQUEST_AUDIT,
  OPEN_REQUEST,
  validateMemberRequest,
  validateSplit,
} from "@/lib/guilds/requests";
import { isEmailTaken } from "@/lib/auth/emailIdentity";
import { requestMeta } from "@/lib/guilds/audit";
import {
  defaultWalletNetwork,
  isWalletNetwork,
} from "@/lib/guilds/walletNetworks";
import { sendGuildRequestSubmittedEmail } from "@/lib/email";

const decimal = (percent: number) => new Prisma.Decimal(percent.toFixed(4));

export async function POST(request: NextRequest) {
  const auth = await requireSession(request);
  if ("error" in auth) return auth.error;
  if (auth.decoded.role !== "GUILDMASTER") {
    return jsonError("Only the Guildmaster can request guild changes", 403);
  }

  try {
    const me = await getGuildMembership(auth.decoded.userId);
    if (!me || me.guild.guildmasterId !== auth.decoded.userId) {
      return jsonError("You're not the Guildmaster of a guild", 403);
    }
    const guild = me.guild;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 1000)
        : null;

    const members = await prisma.guildMembership.findMany({
      where: { guildId: guild.id, leftAt: null },
      include: { user: { select: { name: true, email: true } } },
    });
    const nameOf = (membershipId: string) => {
      const m = members.find((x) => x.id === membershipId)!;
      return m.user.name || m.user.email;
    };
    const splitText = (lines: { membershipId: string; percent: number }[]) =>
      lines.map((l) => `${nameOf(l.membershipId)} ${l.percent}%`).join(", ");
    const currentPercent = (membershipId: string) =>
      members.find((m) => m.id === membershipId)!.rewardPercent;

    /** Split, add and remove requests can't overlap - each changes the split. */
    const assertNoOpenSplitChange = async () => {
      const [split, member] = await Promise.all([
        prisma.guildSplitChangeRequest.findFirst({
          where: { guildId: guild.id, status: OPEN_REQUEST },
          select: { id: true },
        }),
        prisma.guildMemberChangeRequest.findFirst({
          where: { guildId: guild.id, status: OPEN_REQUEST },
          select: { id: true },
        }),
      ]);
      if (split || member) {
        throw new GuildInputError(
          "There's already a member or split change in review",
        );
      }
    };

    // Validate fully before asking for step-up.
    let create: () => Promise<{ id: string; summary: string }>;
    let auditAction: AuditAction;
    let entityType: string;
    if (body.kind === "wallet") {
      const target = members.find((m) => m.id === body.membershipId);
      if (!target) throw new GuildInputError("Choose a guild member");
      const network =
        body.network === undefined ? defaultWalletNetwork() : body.network;
      if (!isWalletNetwork(network)) {
        throw new GuildInputError("Unsupported wallet network");
      }
      const address = parseWalletAddress(body.requestedAddress, network);
      if (!address) throw new GuildInputError("Enter the new wallet address");
      const open = await prisma.guildWalletChangeRequest.findFirst({
        where: { membershipId: target.id, status: OPEN_REQUEST },
        select: { id: true },
      });
      if (open) {
        throw new GuildInputError(
          "There's already a wallet change in review for this member",
        );
      }
      auditAction = AuditAction.GUILD_WALLET_CHANGE_REQUESTED;
      entityType = "GuildWalletChangeRequest";
      create = async () => {
        const created = await prisma.guildWalletChangeRequest.create({
          data: {
            guildId: guild.id,
            membershipId: target.id,
            requestedById: auth.decoded.userId,
            ...(await requester(auth.decoded.loginId)),
            network,
            currentAddress: target.walletAddress,
            requestedAddress: address,
            reason,
          },
        });
        return {
          id: created.id,
          summary: `change ${nameOf(target.id)}'s reward wallet to ${address}`,
        };
      };
    } else if (body.kind === "split") {
      const lines = validateSplit(
        body.lines,
        members.map((m) => m.id),
      );
      await assertNoOpenSplitChange();
      auditAction = AuditAction.GUILD_SPLIT_CHANGE_REQUESTED;
      entityType = "GuildSplitChangeRequest";
      create = async () => {
        const created = await prisma.guildSplitChangeRequest.create({
          data: {
            guildId: guild.id,
            requestedById: auth.decoded.userId,
            ...(await requester(auth.decoded.loginId)),
            reason,
            lines: {
              create: lines.map((l) => ({
                membershipId: l.membershipId,
                currentPercent: currentPercent(l.membershipId),
                requestedPercent: decimal(l.percent),
              })),
            },
          },
        });
        return {
          id: created.id,
          summary: `new reward split: ${splitText(lines)}`,
        };
      };
    } else if (body.kind === "member-add" || body.kind === "member-remove") {
      const input = validateMemberRequest(body.kind, body, members);
      await assertNoOpenSplitChange();
      if (input.action === "ADD") {
        const email = input.person.email;
        const [taken, pending] = await Promise.all([
          isEmailTaken(email),
          prisma.guildMemberChangeRequest.findFirst({
            where: { action: "ADD", newEmail: email, status: OPEN_REQUEST },
            select: { id: true },
          }),
        ]);
        if (taken) throw new GuildInputError(`${email} is already in use`);
        if (pending) {
          throw new GuildInputError(
            `There's already a request in review to add ${email}`,
          );
        }
      }
      auditAction = GUILD_MEMBER_REQUEST_AUDIT[input.action].requested;
      entityType = "GuildMemberChangeRequest";
      create = async () => {
        const created = await prisma.guildMemberChangeRequest.create({
          data: {
            guildId: guild.id,
            action: input.action,
            requestedById: auth.decoded.userId,
            ...(await requester(auth.decoded.loginId)),
            reason,
            ...(input.action === "ADD"
              ? {
                  newName: input.person.name,
                  newEmail: input.person.email,
                  newPhoneNumber: input.person.phoneNumber,
                  newPercent: decimal(input.person.percent),
                  newWalletAddress: input.person.walletAddress,
                }
              : { membershipId: input.membershipId }),
            lines: {
              create: input.lines.map((l) => ({
                membershipId: l.membershipId,
                currentPercent: currentPercent(l.membershipId),
                requestedPercent: decimal(l.percent),
              })),
            },
          },
        });
        const summary =
          input.action === "ADD"
            ? `add ${input.person.name} (${input.person.email}) at ${input.person.percent}%; new split for the others: ${splitText(input.lines)}`
            : `remove ${nameOf(input.membershipId)}; new split: ${splitText(input.lines)}`;
        return { id: created.id, summary };
      };
    } else {
      throw new GuildInputError(
        'kind must be "wallet", "split", "member-add" or "member-remove"',
      );
    }

    const stepUp = await verifyStepUp(
      auth.decoded,
      {
        currentPassword: body.currentPassword as string | undefined,
        twoFactorToken: body.twoFactorToken as string | undefined,
      },
      "request a guild change",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    const { id, summary } = await create();
    await prisma.auditLog.create({
      data: {
        action: auditAction,
        entityType,
        entityId: id,
        userId: auth.decoded.userId,
        description: `Guild ${guild.name}: requested - ${summary}`,
        changes: JSON.stringify({ verifiedVia: stepUp.method }),
        ...requestMeta(request),
      },
    });

    const master = await prisma.user.findUniqueOrThrow({
      where: { id: auth.decoded.userId },
      select: { email: true },
    });
    await sendGuildRequestSubmittedEmail(master.email, summary).catch((e) =>
      console.error("[Guild Requests API] email failed:", e),
    );

    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (error) {
    if (error instanceof GuildInputError) return jsonError(error.message);
    console.error("[Guild Requests API] POST error:", error);
    return jsonError("Failed to submit the request", 500);
  }
}

/** Which of the account's sign-in emails is asking (it can have a second). */
async function requester(loginId: string) {
  const login = await prisma.userLogin.findUnique({
    where: { id: loginId },
    select: { email: true, isPrimary: true },
  });
  return {
    requestedByEmail: login?.email ?? null,
    requestedBySecondary: login ? !login.isPrimary : false,
  };
}
