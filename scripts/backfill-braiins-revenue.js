/**
 * Backfills PoolSubaccountDailySnapshot revenue fields for every Braiins
 * subaccount from Braiins' /accounts/rewards/json/btc endpoint.
 *
 * Unlike the hashrate endpoint, this one respects `from`/`to` and can return
 * an account's full history in one unpaginated call (verified live:
 * requesting back to 2010-01-01 returned data down to 2014-04-25, a global
 * floor, with no pagination). So for each subaccount this fetches from its
 * earliest existing snapshot date (or 90 days back if it has none) through
 * yesterday (today is never finalized), and upserts revenue onto that range:
 *   - existing snapshot row -> updates only the revenue fields, leaving
 *     hashrate/efficiency/uptime/activeWorkers untouched
 *   - no snapshot row for that day -> creates one with just revenue set
 *     (those other fields stay null, same as what the dormant Braiins cron
 *     would leave them)
 *
 * Run with: node scripts/backfill-braiins-revenue.js
 */

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();

function utcDateOnly(d) {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

async function backfillSubaccount(sub) {
  const client = axios.create({
    baseURL: "https://pool.braiins.com",
    headers: { "Pool-Auth-Token": sub.poolAuth.authKey },
    timeout: 30000,
  });

  const earliestSnapshot = await prisma.poolSubaccountDailySnapshot.findFirst({
    where: { poolSubaccountId: sub.id },
    orderBy: { date: "asc" },
  });

  const yesterday = utcDateOnly(new Date());
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const fromDate = earliestSnapshot
    ? utcDateOnly(earliestSnapshot.date)
    : (() => {
        const d = utcDateOnly(new Date());
        d.setUTCDate(d.getUTCDate() - 90);
        return d;
      })();

  if (fromDate > yesterday) {
    console.log(
      `  ${sub.subaccountName}: no range to backfill (from > yesterday)`,
    );
    return { updated: 0, created: 0 };
  }

  const from = fromDate.toISOString().slice(0, 10);
  const to = yesterday.toISOString().slice(0, 10);

  console.log(`  ${sub.subaccountName}: fetching rewards ${from} -> ${to}`);
  const { data } = await client.get("/accounts/rewards/json/btc", {
    params: { from, to },
  });
  const rewards = data?.btc?.daily_rewards || [];
  console.log(
    `  ${sub.subaccountName}: fetched ${rewards.length} daily reward rows`,
  );

  let updated = 0;
  let created = 0;

  for (const day of rewards) {
    const date = utcDateOnly(new Date(day.date * 1000));
    if (date < fromDate || date > yesterday) continue; // outside our intended window

    const mining = parseFloat(day.mining_reward || "0") || 0;
    const referral =
      (parseFloat(day.referral_bonus || "0") || 0) +
      (parseFloat(day.referral_reward || "0") || 0);
    const other = parseFloat(day.bos_plus_reward || "0") || 0;
    const total =
      parseFloat(day.total_reward || "0") || mining + referral + other;

    const existing = await prisma.poolSubaccountDailySnapshot.findUnique({
      where: {
        poolSubaccountId_date: { poolSubaccountId: sub.id, date },
      },
    });

    if (existing) {
      await prisma.poolSubaccountDailySnapshot.update({
        where: {
          poolSubaccountId_date: { poolSubaccountId: sub.id, date },
        },
        data: {
          miningRevenue: mining,
          referralRevenue: referral,
          otherRevenue: other,
          totalRevenue: total,
        },
      });
      updated++;
    } else {
      await prisma.poolSubaccountDailySnapshot.create({
        data: {
          poolSubaccountId: sub.id,
          date,
          miningRevenue: mining,
          referralRevenue: referral,
          otherRevenue: other,
          totalRevenue: total,
        },
      });
      created++;
    }
  }

  return { updated, created };
}

async function main() {
  const subaccounts = await prisma.poolSubaccount.findMany({
    where: { pool: { name: "Braiins" }, poolAuthId: { not: null } },
    include: { poolAuth: true, user: { select: { email: true } } },
  });

  if (subaccounts.length === 0) {
    console.log("No Braiins PoolSubaccount found - nothing to do");
    return;
  }

  console.log(`Found ${subaccounts.length} Braiins subaccount(s)`);

  let totalUpdated = 0;
  let totalCreated = 0;

  for (const sub of subaccounts) {
    if (!sub.poolAuth) continue;
    try {
      const { updated, created } = await backfillSubaccount(sub);
      console.log(
        `  ${sub.subaccountName} (${sub.user?.email}): updated ${updated}, created ${created}`,
      );
      totalUpdated += updated;
      totalCreated += created;
    } catch (error) {
      console.error(
        `  ${sub.subaccountName}: failed -`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(
    `Done. Updated ${totalUpdated} existing rows, created ${totalCreated} new rows.`,
  );
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
