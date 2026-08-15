/**
 * Targeted follow-up fix: the main backfill (scripts/backfill-pool-history.js)
 * never called Braiins' /accounts/rewards/json/btc endpoint, so every
 * PoolSubaccountDailySnapshot row for the Braiins subaccount has
 * miningRevenue/referralRevenue/otherRevenue/totalRevenue stuck at 0. This
 * fetches that endpoint and updates the existing rows in place.
 *
 * Run with: node scripts/backfill-braiins-revenue.js
 */

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();

async function main() {
  const poolSubaccount = await prisma.poolSubaccount.findFirst({
    where: { pool: { name: "Braiins" } },
  });

  if (!poolSubaccount) {
    console.log("No Braiins PoolSubaccount found - nothing to do");
    return;
  }

  const poolAuth = await prisma.poolAuth.findUnique({
    where: { id: poolSubaccount.poolAuthId },
  });

  const client = axios.create({
    baseURL: "https://pool.braiins.com",
    headers: { "Pool-Auth-Token": poolAuth.authKey },
    timeout: 30000,
  });

  const { data } = await client.get("/accounts/rewards/json/btc");
  const rewards = data?.btc?.daily_rewards || [];
  console.log(`Fetched ${rewards.length} daily reward rows from Braiins`);

  let updated = 0;
  let skippedNoSnapshot = 0;

  for (const day of rewards) {
    const date = new Date(day.date * 1000);
    date.setUTCHours(0, 0, 0, 0);

    const mining = parseFloat(day.mining_reward || "0") || 0;
    const referral =
      (parseFloat(day.referral_bonus || "0") || 0) +
      (parseFloat(day.referral_reward || "0") || 0);
    const other = parseFloat(day.bos_plus_reward || "0") || 0;
    const total =
      parseFloat(day.total_reward || "0") || mining + referral + other;

    const existing = await prisma.poolSubaccountDailySnapshot.findUnique({
      where: {
        poolSubaccountId_date: { poolSubaccountId: poolSubaccount.id, date },
      },
    });

    if (!existing) {
      skippedNoSnapshot++;
      continue;
    }

    await prisma.poolSubaccountDailySnapshot.update({
      where: {
        poolSubaccountId_date: { poolSubaccountId: poolSubaccount.id, date },
      },
      data: {
        miningRevenue: mining,
        referralRevenue: referral,
        otherRevenue: other,
        totalRevenue: total,
      },
    });
    updated++;
  }

  console.log(`Updated ${updated} snapshot rows with revenue data`);
  console.log(
    `Skipped ${skippedNoSnapshot} reward days with no matching snapshot row (outside our date range)`,
  );
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
