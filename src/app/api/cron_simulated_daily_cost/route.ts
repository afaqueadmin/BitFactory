import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SimNotConfiguredError,
  loadSimSetup,
  loadSimStart,
  simDailyChargeUsd,
} from "@/lib/simulation/context";
import { simChargeDay } from "@/lib/simulation/ledger";
import { chargeSimDay } from "@/lib/simulation/ledgerStore";
import { waitForDatabase } from "@/lib/services/cronRetry";
import {
  sendCronFailureEmail,
  sendCronSuccessEmailToDeveloper,
} from "@/lib/email";

const CRON_NAME = "cron_simulated_daily_cost";

/**
 * GET /api/cron_simulated_daily_cost
 *
 * Vercel cron endpoint, protected by CRON_SECRET. The simulated-account twin
 * of cron_deduct_daily_cost: right after 00:00 UTC it charges every active
 * simulated account for the day that just ended - the mirrored miner's
 * power x the simulated rate (simulation_settings) x 24 - while that miner
 * is AUTO, into simulated_cost_payments. A day is never charged twice
 * (unique per account and day), so a rerun is safe.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await waitForDatabase(CRON_NAME);
    const { demoMiner, ratePerKwh } = await loadSimSetup();
    const amountUsd = simDailyChargeUsd(demoMiner, ratePerKwh);
    const consumptionKwh = demoMiner.hardware.powerUsage * 24;

    if (demoMiner.status !== "AUTO" || !(amountUsd > 0)) {
      console.log(
        `[Simulated Daily Cost] Nothing charged: miner status ${demoMiner.status}, daily cost ${amountUsd}`,
      );
      const reason =
        demoMiner.status !== "AUTO"
          ? `Simulated miner is ${demoMiner.status}`
          : "No simulated rate set";
      const email = await sendCronSuccessEmailToDeveloper(CRON_NAME, [
        `Nothing charged: ${reason}.`,
      ]);
      return NextResponse.json({
        success: true,
        charged: 0,
        reason,
        emailSent: email.success,
      });
    }

    const users = await prisma.user.findMany({
      where: { role: "SIMULATED", isDeleted: false },
      select: { id: true },
    });

    const now = new Date();
    const results: Array<{ userId: string; day: string; charged: boolean }> =
      [];
    for (const { id } of users) {
      const since = await loadSimStart(id);
      const day = since ? simChargeDay(since, now) : null;
      if (!day) continue;
      const charged = await chargeSimDay({
        userId: id,
        day,
        amountUsd,
        consumptionKwh,
      });
      results.push({ userId: id, day, charged });
    }

    const charged = results.filter((r) => r.charged).length;
    console.log(
      `[Simulated Daily Cost] Charged ${charged}/${users.length} accounts $${amountUsd} each`,
    );
    const email = await sendCronSuccessEmailToDeveloper(CRON_NAME, [
      `Charged ${charged} of ${users.length} active simulated account(s) $${amountUsd.toFixed(2)} each (${consumptionKwh.toFixed(2)} kWh at ${ratePerKwh} USD/kWh) for ${results[0]?.day ?? "no day"}.`,
      ...(results.length > charged
        ? [
            `${results.length - charged} account(s) were already charged for that day.`,
          ]
        : []),
    ]);
    return NextResponse.json({
      success: true,
      charged,
      amountUsd,
      results,
      emailSent: email.success,
    });
  } catch (error) {
    if (error instanceof SimNotConfiguredError) {
      console.error(`[Simulated Daily Cost] ${error.message}`);
      await sendCronFailureEmail(CRON_NAME, error.message, "developer");
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 503 },
      );
    }
    console.error("[Simulated Daily Cost] Error:", error);
    await sendCronFailureEmail(
      CRON_NAME,
      error instanceof Error ? error.message : "Unknown error",
      "developer",
    );
    return NextResponse.json(
      { success: false, error: "Failed to charge simulated accounts" },
      { status: 500 },
    );
  }
}
