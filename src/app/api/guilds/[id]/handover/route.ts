/**
 * POST /api/guilds/[id]/handover - admin only. { membershipId } names the
 * member who becomes Guildmaster; see src/lib/guilds/handover.ts for what
 * moves. Requires the admin's step-up re-authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/guilds/routeAuth";
import { authorizeStaff } from "@/lib/auth/authorization";
import { GuildInputError } from "@/lib/guilds/accounts";
import { handOverGuild } from "@/lib/guilds/handover";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { requestMeta } from "@/lib/guilds/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeStaff(request, ["guilds.handover"]);
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      membershipId?: unknown;
      currentPassword?: string;
      twoFactorToken?: string;
    };
    if (typeof body.membershipId !== "string") {
      return jsonError("Choose the new Guildmaster");
    }

    const stepUp = await verifyStepUp(
      auth.decoded,
      {
        currentPassword: body.currentPassword,
        twoFactorToken: body.twoFactorToken,
      },
      "hand over a guild",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    const result = await handOverGuild({
      guildId: id,
      newMasterMembershipId: body.membershipId,
      actorId: auth.decoded.userId,
      meta: requestMeta(request),
    });
    return NextResponse.json({ success: true, data: result.moved });
  } catch (error) {
    if (error instanceof GuildInputError) return jsonError(error.message);
    console.error("[Guild Handover API] error:", error);
    return jsonError("Failed to hand over the guild", 500);
  }
}
