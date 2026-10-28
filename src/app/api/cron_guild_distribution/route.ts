import { NextRequest, NextResponse } from "next/server";
import {
  sendCronFailureEmail,
  sendCronSuccessEmailToDeveloper,
} from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { waitForDatabase } from "@/lib/services/cronRetry";
import {
  formatRewardMonth,
  runGuildDistribution,
} from "@/lib/guilds/runDistribution";

const CRON_NAME = "cron_guild_distribution";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron_guild_distribution
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Runs daily at 07:00 UTC,
 * after cron_pool_worker_transactions (04:00) has stored the previous day's
 * Luxor transactions. Luxor pays each guild's monthly reward early in the
 * month; once that payout shows up, this calculates the previous month's
 * distribution for the guild (hosting first, then the split). Guilds whose
 * distribution exists already are skipped, except HELD ones (any month),
 * which are
 * re-checked so a passed 24h freeze clears. Settling stays with an admin.
 *
 * Testing (CRON_SECRET still required):
 *   ?asOf=YYYY-MM-DD  run as if today were that UTC day
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const asOf = request.nextUrl.searchParams.get("asOf");
  if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return NextResponse.json(
      { success: false, error: "asOf must be YYYY-MM-DD" },
      { status: 400 },
    );
  }
  const now = asOf ? new Date(`${asOf}T12:00:00.000Z`) : new Date();
  const rewardMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );

  try {
    await waitForDatabase(CRON_NAME);

    const guilds = await prisma.guild.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        distributions: {
          where: { OR: [{ rewardMonth }, { status: "HELD" }] },
          select: { rewardMonth: true, status: true },
          orderBy: { rewardMonth: "asc" },
        },
      },
    });

    const lines: string[] = [];
    let changed = false;
    for (const guild of guilds) {
      // Held months first, oldest first (a later month waits for earlier
      // ones), then last month if it has no distribution yet.
      const months = guild.distributions
        .filter((d) => d.status === "HELD")
        .map((d) => d.rewardMonth);
      const current = guild.distributions.find(
        (d) => d.rewardMonth.getTime() === rewardMonth.getTime(),
      );
      if (!current) months.push(rewardMonth);

      for (const month of months) {
        const label = `${guild.name} ${formatRewardMonth(month)}`;
        try {
          const result = await runGuildDistribution({
            guildId: guild.id,
            rewardMonth: month,
            now,
          });
          if (result.outcome === "saved") {
            changed = true;
            lines.push(`${label}: ${result.status}`);
          } else {
            lines.push(`${label}: ${result.outcome}`);
          }
        } catch (error) {
          changed = true;
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`[${CRON_NAME}] ${label}:`, error);
          lines.push(`${label}: failed - ${message}`);
        }
      }
    }

    let emailSent = false;
    if (changed) {
      const email = await sendCronSuccessEmailToDeveloper(CRON_NAME, [
        `Reward month ${formatRewardMonth(rewardMonth)}, ${guilds.length} active guild(s).`,
        ...lines,
      ]);
      emailSent = email.success;
    }

    return NextResponse.json({
      success: true,
      rewardMonth: rewardMonth.toISOString().slice(0, 7),
      results: lines,
      emailSent,
    });
  } catch (error) {
    console.error(`[${CRON_NAME}] Error:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    await sendCronFailureEmail(CRON_NAME, message, "developer");
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
