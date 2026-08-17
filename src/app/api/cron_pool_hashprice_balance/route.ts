import { NextRequest, NextResponse } from "next/server";
import { upsertTodayHashpriceAndBalance } from "@/lib/services/poolHashpriceBalanceService";
import { sendPoolCronSummaryEmail } from "@/lib/email";

/**
 * GET /api/cron_pool_hashprice_balance
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Captures TODAY's live
 * hashprice + balance for every Luxor subaccount — not a retry window over
 * past days like cron_pool_daily_snapshot, because Luxor has no historical
 * endpoint for either field. Missing this run means that day's hashprice/
 * balance is gone permanently; there is no "catch up tomorrow" path.
 *
 * Luxor only, matching the sibling snapshot cron split (Braiins has no
 * hashprice concept and no active miners right now).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results = await upsertTodayHashpriceAndBalance();

  console.log(
    "[Hashprice/Balance Cron] " +
      results.map((r) => `${r.subaccountName}=${r.status}`).join(", "),
  );

  const allErrored =
    results.length > 0 && results.every((r) => r.status === "error");

  try {
    await sendPoolCronSummaryEmail({
      cronName: "cron_pool_hashprice_balance",
      days: [
        {
          date: new Date().toISOString().slice(0, 10),
          results: results.map((r) => ({
            pool: "Luxor",
            subaccountName: r.subaccountName,
            status: r.status,
            error: r.error,
          })),
        },
      ],
    });
  } catch (error) {
    console.error(
      "[Hashprice/Balance Cron] Failed to send summary email:",
      error,
    );
  }

  return NextResponse.json(
    { success: !allErrored, results },
    { status: allErrored ? 500 : 200 },
  );
}
