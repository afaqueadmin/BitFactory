/**
 * POST /api/guilds/[id]/distributions - admin only. { rewardMonth: "YYYY-MM" }
 * calculates (or recalculates, at today's BTC rate) the guild's distribution
 * for that reward month, from the Luxor payout made the following month.
 * A settled distribution can't be recalculated.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { runGuildDistribution } from "@/lib/guilds/runDistribution";

const OUTCOME_ERRORS: Record<string, string> = {
  "no-subaccount": "The guild has no Luxor subaccount",
  "no-payout":
    "No Luxor payout found for this guild in the month after that reward month yet",
  "already-sent": "That month's distribution has already been sent",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      rewardMonth?: unknown;
    };
    const match =
      typeof body.rewardMonth === "string"
        ? /^(\d{4})-(\d{2})$/.exec(body.rewardMonth)
        : null;
    if (!match) return jsonError("rewardMonth must look like 2026-10");
    const rewardMonth = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, 1),
    );

    const result = await runGuildDistribution({
      guildId: id,
      rewardMonth,
      actorId: auth.decoded.userId,
    });
    if (result.outcome !== "saved") {
      return jsonError(OUTCOME_ERRORS[result.outcome], 409);
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Guild Distributions API] error:", error);
    return jsonError(
      error instanceof Error && error.message.includes("BTC")
        ? "Couldn't get the BTC price - try again shortly"
        : "Failed to calculate the distribution",
      500,
    );
  }
}
