import { NextRequest, NextResponse } from "next/server";
import { createLuxorClient } from "@/lib/luxor";
import { createBraiinsClient } from "@/lib/braiins";
import { prisma } from "@/lib/prisma";
import {
  selectRequestedSubaccounts,
  joinSubaccountNames,
} from "@/lib/luxorSubaccounts";
import { simRoute } from "@/lib/simulation/context";
import { loadSimPoolLedger } from "@/lib/simulation/data";
import { authenticateWalletRequest } from "@/lib/walletTarget";

/** BTC revenue_24h from Luxor's summary, summed over every revenue type. */
async function luxorRevenue24h(names: string[]): Promise<number> {
  const subaccountNames = joinSubaccountNames(names);
  const summary = await createLuxorClient(subaccountNames).getSummary("BTC", {
    subaccount_names: subaccountNames,
  });
  return (summary.revenue_24h ?? [])
    .filter((r) => r.currency_type === "BTC")
    .reduce((sum, r) => sum + (Number(r.revenue) || 0), 0);
}

/**
 * GET /api/wallet/earnings-24h
 *
 * Revenue over the last 24 hours. Luxor: the summary's rolling revenue_24h,
 * the figure Luxor's own dashboard shows (not posted credits, which land a
 * day late and left the card at 0 every UTC morning). Braiins: daily
 * rewards for yesterday and today.
 *
 * Response:
 * {
 *   revenue24h: { btc: number, usd: number },
 *   currency: "BTC",
 *   timestamp: string,
 *   dataSource: "luxor"
 * }
 *
 * usd covers simulated accounts only; Luxor's summary has no USD figure and
 * the wallet converts BTC at the live price itself.
 */
export async function GET(request: NextRequest) {
  try {
    // Signed-in session, or the PDF renderer's wallet snapshot ticket.
    const target = await authenticateWalletRequest(request);
    if (target instanceof NextResponse) return target;

    // Simulated accounts: simulated credits in the same date window as below.
    const sim = await simRoute(target, async (ctx) => {
      const { transactions } = await loadSimPoolLedger(ctx);
      const from = new Date(ctx.now.getTime() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const to = ctx.now.toISOString().split("T")[0];
      let btc = 0;
      let usd = 0;
      for (const tx of transactions) {
        const day = tx.date_time.slice(0, 10);
        if (tx.transaction_type === "credit" && day >= from && day <= to) {
          btc += tx.currency_amount;
          usd += tx.usd_equivalent;
        }
      }
      const luxor = {
        btc: Number(btc.toFixed(8)),
        usd: Number(usd.toFixed(2)),
      };
      return NextResponse.json({
        revenue24h: luxor,
        currency: "BTC",
        timestamp: new Date().toISOString(),
        dataSource: "luxor",
        activePoolNames: ["Luxor"],
        poolBreakdown: { luxor, braiins: { btc: 0, usd: 0 } },
      });
    });
    if (sim) return sim;

    const userId = target.userId;
    console.log(`[24h Revenue API] Fetching data for user: ${userId}`);

    // Get PoolAuth entries for this user (contains API keys). Which pools
    // are active is determined directly from PoolAuth, not from
    // Miner.poolId - a Braiins/Luxor account is authenticated independently
    // of whether any Miner row happens to be tagged with that pool.
    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId },
      include: { pool: { select: { id: true, name: true } } },
    });

    if (!poolAuths || poolAuths.length === 0) {
      console.log(`[24h Revenue API] User ${userId} has no pool accounts`);
      return NextResponse.json(
        {
          revenue24h: { btc: 0, usd: 0 },
          currency: "BTC",
          timestamp: new Date().toISOString(),
          dataSource: "none",
          poolBreakdown: {
            luxor: { btc: 0, usd: 0 },
            braiins: { btc: 0, usd: 0 },
          },
          message: "No pool accounts configured",
        },
        { status: 200 },
      );
    }

    const luxorAuths = poolAuths.filter((auth) =>
      auth.pool.name.toLowerCase().includes("luxor"),
    );
    const selectedLuxorAuths = selectRequestedSubaccounts(
      luxorAuths.map((a) => ({ id: a.id, authKey: a.authKey })),
      request.nextUrl.searchParams.get("subaccounts"),
    );
    const braiinsAuth = poolAuths.find((auth) =>
      auth.pool.name.toLowerCase().includes("braiins"),
    );

    // Calculate date range - last 24 hours
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    let totalRevenueBtc = 0;
    let luxorRevenueBtc = 0;
    let braiinsRevenueBtc = 0;

    // Fetch from Luxor: one call for every selected subaccount. If it fails
    // (a single unknown name fails the whole call), show an error - never a
    // partial sum or a false 0.
    if (selectedLuxorAuths.length > 0) {
      const names = selectedLuxorAuths.map((a) => a.authKey);
      try {
        luxorRevenueBtc = await luxorRevenue24h(names);
      } catch (error) {
        console.error(
          `[24h Revenue API] Luxor summary failed for ${names.join(",")}:`,
          error,
        );
        return NextResponse.json(
          { error: "Couldn't load 24-hour revenue from Luxor" },
          { status: 502 },
        );
      }
    }

    // Fetch from Braiins (use daily rewards for 24h earnings)
    if (braiinsAuth) {
      try {
        const authKey = braiinsAuth.authKey;
        console.log(
          `[24h Revenue API] Fetching Braiins daily rewards for auth key: ${authKey}`,
        );
        const braiinsClient = createBraiinsClient(authKey);
        const rewards = await braiinsClient.getDailyRewards({
          from: formatDate(startDate),
          to: formatDate(endDate),
        });

        if (rewards?.btc?.daily_rewards) {
          for (const reward of rewards.btc.daily_rewards) {
            braiinsRevenueBtc += parseFloat(reward.total_reward) || 0;
          }
        }
      } catch (error) {
        console.error(
          `[24h Revenue API] Error fetching Braiins daily rewards:`,
          error,
        );
      }
    }

    totalRevenueBtc = luxorRevenueBtc + braiinsRevenueBtc;

    // Determine which pools have a configured account
    const activePoolNames = [];
    if (selectedLuxorAuths.length > 0) activePoolNames.push("Luxor");
    if (braiinsAuth) activePoolNames.push("Braiins");

    return NextResponse.json({
      revenue24h: {
        btc: Number(totalRevenueBtc.toFixed(8)),
        usd: 0,
      },
      currency: "BTC",
      timestamp: new Date().toISOString(),
      dataSource:
        selectedLuxorAuths.length > 0 && braiinsAuth
          ? "both"
          : selectedLuxorAuths.length > 0
            ? "luxor"
            : "braiins",
      activePoolNames,
      poolBreakdown: {
        luxor: {
          btc: Number(luxorRevenueBtc.toFixed(8)),
          usd: 0,
        },
        braiins: {
          btc: Number(braiinsRevenueBtc.toFixed(8)),
          usd: 0,
        },
      },
    });
  } catch (error) {
    console.error("[24h Revenue API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch 24-hour earnings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
