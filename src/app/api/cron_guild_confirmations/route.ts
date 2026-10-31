import { NextRequest, NextResponse } from "next/server";
import {
  sendCronFailureEmail,
  sendCronSuccessEmailToDeveloper,
} from "@/lib/email";
import { waitForDatabase } from "@/lib/services/cronRetry";
import { isMultisigEnabled } from "@/lib/guilds/multisig/network";
import { checkMultisigConfirmations } from "@/lib/guilds/multisig/payout";

const CRON_NAME = "cron_guild_confirmations";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron_guild_confirmations
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Runs hourly. For multisig
 * guild payouts that have been signed and broadcast, it counts their
 * confirmations and settles each one that has enough (hosting invoices paid,
 * carried balances updated, members emailed). Does nothing where multisig
 * payouts aren't switched on.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isMultisigEnabled()) {
    return NextResponse.json({ success: true, skipped: "multisig off" });
  }

  try {
    await waitForDatabase(CRON_NAME);
    const results = await checkMultisigConfirmations();

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
