/**
 * POST /api/guilds/[id]/members - admin only. Adds a Guildmember:
 *   { person: { name, email, phoneNumber?, percent, walletAddress? },
 *     split: [{ membershipId, percent }] }
 * `split` gives every current member's new percentage; with the new
 * person's it must add up to 100. The new account gets the usual welcome
 * email with a temporary password.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import {
  GuildInputError,
  assertEmailsAvailable,
  assertNoOpenAddRequests,
  createGuildAccount,
  deleteFreshAccounts,
  parseNewGuildPerson,
} from "@/lib/guilds/accounts";
import { isFullSplit } from "@/lib/guilds/distribution";
import { parseSplitBody } from "@/lib/guilds/adminSplit";
import { addMember } from "@/lib/guilds/members";
import { diffMembers, requestMeta, snapshotMembers } from "@/lib/guilds/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  let createdId: string | null = null;
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const guild = await prisma.guild.findFirst({
      where: { id, deletedAt: null },
      include: { memberships: { where: { leftAt: null } } },
    });
    if (!guild) return jsonError("Guild not found", 404);

    const person = parseNewGuildPerson(body.person, "New member");
    const split = parseSplitBody(
      body.split,
      guild.memberships.map((m) => m.id),
    );
    if (!isFullSplit([...split.map((s) => s.percent), person.percent])) {
      throw new GuildInputError("The percentages must add up to exactly 100%");
    }
    await assertEmailsAvailable([person.email]);
    await assertNoOpenAddRequests([person.email]);

    const user = await createGuildAccount({
      person,
      role: "GUILDMEMBER",
      segment: null,
    });
    createdId = user.id;

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const before = await snapshotMembers(tx, guild.id);
      await addMember(tx, {
        guildId: guild.id,
        userId: user.id,
        person,
        split,
        now,
      });
      const after = await snapshotMembers(tx, guild.id);
      await tx.auditLog.create({
        data: {
          action: AuditAction.GUILD_MEMBER_ADDED,
          entityType: "Guild",
          entityId: guild.id,
          userId: auth.decoded.userId,
          description: `${user.email} added to guild ${guild.name} at ${person.percent}%`,
          changes: JSON.stringify({
            userId: user.id,
            name: person.name,
            email: person.email,
            phoneNumber: person.phoneNumber,
            percent: person.percent,
            walletAddress: person.walletAddress,
            members: diffMembers(before, after),
          }),
          ...requestMeta(request),
        },
      });
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (createdId) {
      await deleteFreshAccounts([createdId]).catch((cleanupError) =>
        console.error("[Guild Members API] cleanup failed:", cleanupError),
      );
    }
    if (error instanceof GuildInputError) return jsonError(error.message);
    console.error("[Guild Members API] POST error:", error);
    return jsonError("Failed to add the member", 500);
  }
}
