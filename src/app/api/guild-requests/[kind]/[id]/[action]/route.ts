/**
 * POST /api/guild-requests/[kind]/[id]/[action] - admin only.
 * kind: wallet | split | member. action: confirm | approve | reject.
 *
 * Same review as a client's wallet change request:
 *   confirm  { confirmationMethod: CALL|EMAIL, confirmationContact,
 *              confirmationNote } - the admin has checked with the
 *              Guildmaster outside the app. PENDING only.
 *   approve  - CONFIRMED only. Writes the change and starts its 24h freeze.
 *              A member ADD creates the account (welcome email first); a
 *              REMOVE closes it. Both re-check the guild hasn't changed.
 *   reject   { rejectionReason } - PENDING or CONFIRMED.
 * Every action needs the admin's step-up re-authentication
 * ({ currentPassword } or { twoFactorToken }).
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { verifyStepUp } from "@/lib/auth/stepUp";
import {
  GuildInputError,
  createGuildAccount,
  deleteFreshAccounts,
} from "@/lib/guilds/accounts";
import {
  GUILD_MEMBER_REQUEST_AUDIT,
  GUILD_REQUEST_AUDIT,
  applySplitRequest,
  applyWalletRequest,
  checkMemberRequestStillValid,
  type GuildRequestKind,
} from "@/lib/guilds/requests";
import { addMember, removeMember } from "@/lib/guilds/members";
import { diffMembers, requestMeta, snapshotMembers } from "@/lib/guilds/audit";
import { revokeAllSessions } from "@/lib/auth/sessionRevocation";
import { sendGuildRequestReviewedEmail } from "@/lib/email";

const AUDIT_STEP = {
  confirm: "confirmed",
  approve: "approved",
  reject: "rejected",
} as const;
type Action = keyof typeof AUDIT_STEP;
const CONFIRMATION_METHODS = new Set(["CALL", "EMAIL"]);
const KINDS = new Set<GuildRequestKind>(["wallet", "split", "member"]);

type Body = {
  confirmationMethod?: string;
  confirmationContact?: string;
  confirmationNote?: string;
  rejectionReason?: string;
  currentPassword?: string;
  twoFactorToken?: string;
};

const userName = { select: { name: true, email: true } };
const who = (u: { name: string | null; email: string }) => u.name || u.email;

/** The request, loaded the same way for every kind. */
async function loadRequest(kind: GuildRequestKind, id: string) {
  const include = {
    guild: {
      select: {
        id: true,
        name: true,
        guildmaster: { select: { email: true } },
      },
    },
  };
  if (kind === "wallet") {
    const r = await prisma.guildWalletChangeRequest.findUnique({
      where: { id },
      include: { ...include, membership: { include: { user: userName } } },
    });
    if (!r) return null;
    return {
      kind,
      req: r,
      summary: `change ${who(r.membership.user)}'s reward wallet to ${r.requestedAddress}`,
    } as const;
  }
  const lines = {
    include: { membership: { include: { user: userName } } },
  };
  if (kind === "split") {
    const r = await prisma.guildSplitChangeRequest.findUnique({
      where: { id },
      include: { ...include, lines },
    });
    if (!r) return null;
    return {
      kind,
      req: r,
      summary: `new reward split: ${splitText(r.lines)}`,
    } as const;
  }
  const r = await prisma.guildMemberChangeRequest.findUnique({
    where: { id },
    include: {
      ...include,
      lines,
      membership: { include: { user: userName } },
    },
  });
  if (!r) return null;
  return {
    kind,
    req: r,
    summary:
      r.action === "ADD"
        ? `add ${r.newName} (${r.newEmail}) at ${Number(r.newPercent)}%; new split for the others: ${splitText(r.lines)}`
        : `remove ${r.membership ? who(r.membership.user) : "a member"}; new split: ${splitText(r.lines)}`,
  } as const;
}

function splitText(
  lines: {
    requestedPercent: Prisma.Decimal;
    membership: { user: { name: string | null; email: string } };
  }[],
) {
  return lines
    .map((l) => `${who(l.membership.user)} ${Number(l.requestedPercent)}%`)
    .join(", ");
}

/** Status-guarded update, so two admins can't both move it on. */
function claim(
  tx: Prisma.TransactionClient,
  kind: GuildRequestKind,
  id: string,
  fromStatuses: ("PENDING" | "CONFIRMED")[],
  data: Prisma.GuildWalletChangeRequestUncheckedUpdateManyInput &
    Prisma.GuildSplitChangeRequestUncheckedUpdateManyInput &
    Prisma.GuildMemberChangeRequestUncheckedUpdateManyInput,
) {
  const where = { id, status: { in: fromStatuses } };
  if (kind === "wallet") {
    return tx.guildWalletChangeRequest.updateMany({ where, data });
  }
  if (kind === "split") {
    return tx.guildSplitChangeRequest.updateMany({ where, data });
  }
  return tx.guildMemberChangeRequest.updateMany({ where, data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string; action: string }> },
) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  let createdUserId: string | null = null;
  try {
    const { kind: kindParam, id, action: actionParam } = await params;
    if (
      !KINDS.has(kindParam as GuildRequestKind) ||
      !(actionParam in AUDIT_STEP)
    ) {
      return jsonError("Not found", 404);
    }
    const kind = kindParam as GuildRequestKind;
    const action = actionParam as Action;
    const body = (await request.json().catch(() => ({}))) as Body;
    const adminId = auth.decoded.userId;

    const loaded = await loadRequest(kind, id);
    if (!loaded) return jsonError("Request not found", 404);
    const { req, summary } = loaded;

    // Validate the action's own fields before asking for step-up.
    if (action === "confirm") {
      if (req.status !== "PENDING") {
        return jsonError(
          `Request has already been ${req.status.toLowerCase()}`,
        );
      }
      if (!CONFIRMATION_METHODS.has(body.confirmationMethod ?? "")) {
        return jsonError("confirmationMethod must be CALL or EMAIL");
      }
      if (!body.confirmationContact?.trim()) {
        return jsonError(
          body.confirmationMethod === "EMAIL"
            ? "The email address the Guildmaster confirmed through is required"
            : "The phone number the Guildmaster confirmed on is required",
        );
      }
      if (!body.confirmationNote?.trim()) {
        return jsonError("A note describing how they confirmed is required");
      }
    } else if (action === "approve") {
      if (req.status !== "CONFIRMED") {
        return jsonError(
          req.status === "PENDING"
            ? "Confirm this request with the Guildmaster before approving it"
            : `Request has already been ${req.status.toLowerCase()}`,
        );
      }
      // Stale member requests are refused before any account is created.
      if (loaded.kind === "member") {
        await checkMemberRequestStillValid(prisma, loaded.req);
      }
    } else {
      if (req.status !== "PENDING" && req.status !== "CONFIRMED") {
        return jsonError(
          `Request has already been ${req.status.toLowerCase()}`,
        );
      }
      if (!body.rejectionReason?.trim()) {
        return jsonError("A rejection reason is required");
      }
    }

    const stepUp = await verifyStepUp(
      auth.decoded,
      {
        currentPassword: body.currentPassword,
        twoFactorToken: body.twoFactorToken,
      },
      `${action} a guild change request`,
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    // An approved ADD creates the account first - its welcome email goes out
    // before it exists, as for every new account (H-5).
    if (
      action === "approve" &&
      loaded.kind === "member" &&
      loaded.req.action === "ADD"
    ) {
      const r = loaded.req;
      const user = await createGuildAccount({
        person: {
          name: r.newName ?? "",
          email: r.newEmail ?? "",
          phoneNumber: r.newPhoneNumber,
          percent: Number(r.newPercent),
          walletAddress: r.newWalletAddress,
        },
        role: "GUILDMEMBER",
        segment: null,
      });
      createdUserId = user.id;
    }

    const now = new Date();
    const audit =
      loaded.kind === "member"
        ? GUILD_MEMBER_REQUEST_AUDIT[loaded.req.action]
        : GUILD_REQUEST_AUDIT[loaded.kind];
    const entityType =
      kind === "wallet"
        ? "GuildWalletChangeRequest"
        : kind === "split"
          ? "GuildSplitChangeRequest"
          : "GuildMemberChangeRequest";
    let removedUserId: string | null = null;

    await prisma.$transaction(async (tx) => {
      let claimed;
      let description: string;
      let changes: Record<string, unknown> = {};
      if (action === "confirm") {
        const contact = body.confirmationContact!.trim();
        const note = body.confirmationNote!.trim();
        claimed = await claim(tx, kind, id, ["PENDING"], {
          status: "CONFIRMED",
          confirmedById: adminId,
          confirmedAt: now,
          confirmationMethod: body.confirmationMethod,
          confirmationContact: contact,
          confirmationNote: note,
        });
        description = `Guild ${req.guild.name}: confirmed with the Guildmaster via ${body.confirmationMethod === "EMAIL" ? "email" : "phone call"} (${contact}) - ${summary}`;
        changes = {
          confirmationMethod: body.confirmationMethod,
          contact,
          note,
        };
      } else if (action === "approve") {
        claimed = await claim(tx, kind, id, ["CONFIRMED"], {
          status: "APPROVED",
          reviewedById: adminId,
          reviewedAt: now,
        });
        if (claimed.count > 0) {
          if (loaded.kind === "wallet") {
            if (loaded.req.membership.leftAt) {
              throw new GuildInputError("That member has left the guild");
            }
            await applyWalletRequest(tx, loaded.req, now);
            changes = {
              member: who(loaded.req.membership.user),
              from: loaded.req.currentAddress,
              to: loaded.req.requestedAddress,
            };
          } else if (loaded.kind === "split") {
            await applySplitRequest(tx, loaded.req, now);
            changes = {
              lines: loaded.req.lines.map((l) => ({
                membershipId: l.membershipId,
                name: who(l.membership.user),
                from: Number(l.currentPercent),
                to: Number(l.requestedPercent),
              })),
            };
          } else {
            const r = loaded.req;
            // The email was checked before the account was created for it.
            const split = await checkMemberRequestStillValid(tx, r, {
              checkEmail: false,
            });
            const before = await snapshotMembers(tx, r.guildId);
            if (r.action === "ADD") {
              const membership = await addMember(tx, {
                guildId: r.guildId,
                userId: createdUserId!,
                person: {
                  percent: Number(r.newPercent),
                  walletAddress: r.newWalletAddress,
                },
                split,
                now,
              });
              await tx.guildMemberChangeRequest.update({
                where: { id: r.id },
                data: { createdMembershipId: membership.id },
              });
            } else {
              const leaving = before.find(
                (m) => m.membershipId === r.membershipId,
              )!;
              await removeMember(tx, {
                guildId: r.guildId,
                leaving: { id: leaving.membershipId, userId: leaving.userId },
                split,
                actorId: adminId,
                now,
              });
              removedUserId = leaving.userId;
            }
            const after = await snapshotMembers(tx, r.guildId);
            changes = { members: diffMembers(before, after) };
          }
        }
        description = `Guild ${req.guild.name}: approved - ${summary}`;
      } else {
        const reason = body.rejectionReason!.trim();
        claimed = await claim(tx, kind, id, ["PENDING", "CONFIRMED"], {
          status: "REJECTED",
          rejectionReason: reason,
          reviewedById: adminId,
          reviewedAt: now,
        });
        description = `Guild ${req.guild.name}: rejected - ${summary}`;
        changes = { rejectionReason: reason };
      }
      if (claimed.count === 0) {
        throw new GuildInputError("Request has already been reviewed");
      }
      await tx.auditLog.create({
        data: {
          action: AuditAction[audit[AUDIT_STEP[action]]],
          entityType,
          entityId: id,
          userId: adminId,
          description,
          changes: JSON.stringify({ guildId: req.guild.id, ...changes }),
          ...requestMeta(request),
        },
      });
    });
    createdUserId = null;
    if (removedUserId) await revokeAllSessions(removedUserId);

    if (action !== "confirm") {
      await sendGuildRequestReviewedEmail(
        req.guild.guildmaster.email,
        summary,
        action === "approve",
        body.rejectionReason?.trim(),
      ).catch((e) => console.error("[Guild Requests API] email failed:", e));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (createdUserId) {
      await deleteFreshAccounts([createdUserId]).catch((cleanupError) =>
        console.error("[Guild Requests API] cleanup failed:", cleanupError),
      );
    }
    if (error instanceof GuildInputError) return jsonError(error.message);
    console.error("[Guild Requests API] action error:", error);
    return jsonError("Failed to update the request", 500);
  }
}
