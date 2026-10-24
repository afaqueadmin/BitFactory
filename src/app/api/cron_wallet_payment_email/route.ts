import { NextRequest, NextResponse } from "next/server";
import {
  sendCronFailureEmail,
  sendCronSuccessEmailToDeveloper,
} from "@/lib/email";
import { runWalletPaymentEmails } from "@/lib/services/walletPaymentEmailService";
import { waitForDatabase } from "@/lib/services/cronRetry";

const CRON_NAME = "cron_wallet_payment_email";

// Each email renders a PDF in a headless browser; the service stops starting
// new ones after ~240s and the next hourly run continues.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron_wallet_payment_email
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Runs hourly 06:30-11:30
 * UTC, after cron_pool_worker_transactions (04:00) has stored the previous
 * day's Luxor transactions. Emails every customer who was paid out - a Luxor
 * "Payment" debit, or a simulated account's monthly payout - in the last few
 * days a PDF snapshot of their wallet, once per customer per payout day.
 * Subaccounts that sync missed are fetched live from Luxor first.
 *
 * Testing (CRON_SECRET still required):
 *   ?dryRun=1        list candidates and recipients; no Luxor calls, no
 *                    PDFs, no emails, no writes
 *   ?asOf=YYYY-MM-DD run as if today were that UTC day
 *   ?onlyUser=<id>   only email this customer
 * With WALLET_PAYMENT_EMAIL_TEST_TO set, every email goes only to that
 * address and nothing is recorded as sent.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const params = request.nextUrl.searchParams;
  const dryRun = params.get("dryRun") === "1";
  const onlyUserId = params.get("onlyUser");
  const asOf = params.get("asOf");
  let now = new Date();
  if (asOf) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      return NextResponse.json(
        { success: false, error: "asOf must be YYYY-MM-DD" },
        { status: 400 },
      );
    }
    now = new Date(`${asOf}T12:00:00.000Z`);
  }

  try {
    await waitForDatabase(CRON_NAME);
    const result = await runWalletPaymentEmails({
      now,
      startedAt,
      dryRun,
      onlyUserId,
    });

    console.log(
      `[Wallet Payment Email] ${result.window.start} -> ${result.window.end}: ` +
        `${result.candidates.length} candidate(s), sent ${result.sent.length}, ` +
        `failed ${result.failed.length}, deferred ${result.deferred.length}`,
    );

    // Summary to the developer only when something happened - a quiet run
    // (most hours of most days) sends nothing.
    const fallbackFetched = result.fallback.length;
    const somethingHappened =
      result.sent.length > 0 ||
      result.failed.length > 0 ||
      result.deferred.length > 0 ||
      result.errors.length > 0 ||
      fallbackFetched > 0;
    let emailSent = false;
    if (!dryRun && somethingHappened) {
      const email = await sendCronSuccessEmailToDeveloper(CRON_NAME, [
        `Payout window ${result.window.start} to ${result.window.end}.`,
        `Luxor fallback fetched ${fallbackFetched} subaccount(s) the nightly sync missed${fallbackFetched ? `: ${result.fallback.join("; ")}` : "."}`,
        `Sent ${result.sent.length}: ${result.sent.join(", ") || "none"}.`,
        `Failed ${result.failed.length}: ${result.failed.map((f) => `${f.email} (${f.payoutDate}): ${f.error}`).join("; ") || "none"}.`,
        `Deferred to the next run ${result.deferred.length}: ${result.deferred.join(", ") || "none"}.`,
        ...result.errors.map((e) => `Error: ${e}`),
      ]);
      emailSent = email.success;
    }

    return NextResponse.json({ success: true, ...result, emailSent });
  } catch (error) {
    console.error("[Wallet Payment Email] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (!dryRun) {
      await sendCronFailureEmail(CRON_NAME, message, "developer");
    }
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
