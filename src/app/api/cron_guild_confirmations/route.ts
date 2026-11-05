import { NextRequest, NextResponse } from "next/server";
import {
  sendCronFailureEmail,
  sendCronSuccessEmailToDeveloper,
} from "@/lib/email";
import { waitForDatabase } from "@/lib/services/cronRetry";
import { isTrezorPayoutEnabled } from "@/lib/guilds/trezor/network";
import { checkTrezorConfirmations } from "@/lib/guilds/trezor/payout";

const CRON_NAME = "cron_guild_confirmations";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron_guild_confirmations
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Runs hourly. For Trezor
 * guild payouts that have been signed and broadcast, it counts their
 * confirmations and settles each one that has enough (hosting invoices paid,
 * carried balances updated, members emailed). Does nothing where Trezor
 * payouts aren't switched on.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isTrezorPayoutEnabled()) {
    return NextResponse.json({ success: true, skipped: "Trezor payouts off" });
  }

  try {
    await waitForDatabase(CRON_NAME);
    const results = await checkTrezorConfirmations();

    // Only worth an email when something settled.
    const settled = results.filter((r) => r.status === "CONFIRMED");
    let emailSent = false;
    if (settled.length > 0) {
      const email = await sendCronSuccessEmailToDeveloper(
        CRON_NAME,
        results.map(
          (r) =>
            `${r.batchId}: ${r.status}, ${r.confirmations} confirmation(s)`,
        ),
      );
      emailSent = email.success;
    }
    return NextResponse.json({ success: true, results, emailSent });
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
