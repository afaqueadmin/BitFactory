import { NextRequest, NextResponse } from "next/server";
import { checkClientWallets } from "@/lib/services/clientWalletCheckService";
import { waitForDatabase } from "@/lib/services/cronRetry";
import { prisma } from "@/lib/prisma";
import {
  sendCronFailureEmail,
  sendWalletMismatchAlertEmail,
} from "@/lib/email";

export const maxDuration = 300;

/**
 * GET /api/cron_wallet_address_check
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Once a day, reads each
 * Luxor subaccount's payout address from Luxor and compares it with our
 * record (ClientWallet). A difference opens a mismatch alert in the Wallets
 * module and is emailed to WALLET_ALERT_EMAILS; the email repeats daily
 * while any mismatch is open. Never writes to Luxor and never changes our
 * record - only an admin does that, from the Wallets module.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await waitForDatabase("cron_wallet_address_check");
    const result = await checkClientWallets();

    console.log(
      `[Wallet Check Cron] ${result.rows.length} subaccount(s): ${result.openMismatches.length} mismatch(es) (${result.newMismatches.length} new), ${result.errors.length} error(s), ${result.noRecord.length} without a record`,
    );

    if (
      result.openMismatches.length > 0 ||
      result.errors.length > 0 ||
      result.noRecord.length > 0
    ) {
      try {
        const sent = await sendWalletMismatchAlertEmail({
          checkedAt: result.checkedAt,
          checked: result.rows.length,
          newMismatches: result.newMismatches,
          openMismatches: result.openMismatches,
          errors: result.errors,
          noRecord: result.noRecord,
        });
        if (sent.success) {
          await prisma.clientWalletMismatch.updateMany({
            where: { status: "OPEN", emailedAt: null },
            data: { emailedAt: new Date() },
          });
        }
      } catch (error) {
        // The mismatch rows are already written; email is best-effort.
        console.error("[Wallet Check Cron] Failed to send alert email:", error);
      }
    }

    return NextResponse.json({
      success: true,
      checkedAt: result.checkedAt,
      checked: result.rows.length,
      mismatches: result.openMismatches.length,
      newMismatches: result.newMismatches.length,
      errors: result.errors.length,
      noRecord: result.noRecord.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Wallet Check Cron] fatal -", error);
    await sendCronFailureEmail(
      "cron_wallet_address_check",
      message,
      "developer",
    );
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
