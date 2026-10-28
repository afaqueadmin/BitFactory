/**
 * DELETE /api/guilds/[id]/members/[membershipId] - admin only. Removes a
 * Guildmember: { split: [{ membershipId, percent }] } gives the remaining
 * members' new percentages (adding up to 100). The Guildmaster can't be
 * removed - hand the guild over first. The removed person's account exists
 * only for the guild, so it's closed (deleted, signed out everywhere).
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { GuildInputError } from "@/lib/guilds/accounts";
import { isFullSplit } from "@/lib/guilds/distribution";
import { parseSplitBody } from "@/lib/guilds/adminSplit";
import { removeMember } from "@/lib/guilds/members";
import { diffMembers, requestMeta, snapshotMembers } from "@/lib/guilds/audit";
import { revokeAllSessions } from "@/lib/auth/sessionRevocation";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; membershipId: string }> },
) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const { id, membershipId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const guild = await prisma.guild.findFirst({
      where: { id, deletedAt: null },
      include: {
        memberships: {
          where: { leftAt: null },
          include: { user: { select: { email: true } } },
        },
      },
    });
    if (!guild) return jsonError("Guild not found", 404);

    const leaving = guild.memberships.find((m) => m.id === membershipId);
    if (!leaving) return jsonError("Member not found", 404);
    if (leaving.isGuildmaster) {
      throw new GuildInputError(
        "The Guildmaster can't be removed - hand the guild over first",
      );
    }

    const split = parseSplitBody(
      body.split,
      guild.memberships.filter((m) => m.id !== membershipId).map((m) => m.id),
    );
    if (!isFullSplit(split.map((s) => s.percent))) {
      throw new GuildInputError("The percentages must add up to exactly 100%");
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const before = await snapshotMembers(tx, guild.id);
      await removeMember(tx, {
        guildId: guild.id,
        leaving,
        split,
        actorId: auth.decoded.userId,
        now,
      });
      const after = await snapshotMembers(tx, guild.id);
      await tx.auditLog.create({
        data: {
          action: AuditAction.GUILD_MEMBER_REMOVED,
          entityType: "Guild",
          entityId: guild.id,
          userId: auth.decoded.userId,
          description: `${leaving.user.email} removed from guild ${guild.name}; account closed`,
          changes: JSON.stringify({
            userId: leaving.userId,
            email: leaving.user.email,
            members: diffMembers(before, after),
          }),
          ...requestMeta(request),
        },
      });
    });
    await revokeAllSessions(leaving.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof GuildInputError) return jsonError(error.message);
    console.error("[Guild Members API] DELETE error:", error);
    return jsonError("Failed to remove the member", 500);
  }
}
