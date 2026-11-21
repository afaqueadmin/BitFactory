import { NextRequest, NextResponse } from "next/server";
import { clearExpiredLocks } from "@/lib/binanceSubaccountLock";
import { waitForDatabase } from "@/lib/services/cronRetry";
import { sendCronFailureEmail } from "@/lib/email";

export const maxDuration = 60;

/**
 * GET /api/cron_binance_subaccount_unlock
 *
 * Vercel cron endpoint (every minute), protected by CRON_SECRET. Clears
 * lockedAt/lockedBy on any Binance subaccount locked more than 5 minutes
 * ago, so a payer who opened "Pay with Binance" and closed the browser
 * doesn't keep the subaccount locked.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await waitForDatabase("cron_binance_subaccount_unlock");
    const cleared = await clearExpiredLocks();
    if (cleared > 0) {
      console.log(
        `[Binance Subaccount Unlock Cron] cleared ${cleared} lock(s)`,
      );
    }
    return NextResponse.json({ success: true, cleared });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Binance Subaccount Unlock Cron] fatal -", error);
    await sendCronFailureEmail(
      "cron_binance_subaccount_unlock",
      message,
      "admin",
    );
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
