/**
 * Verifies (and fills, if any exists) Luxor history OLDER than each
 * subaccount's earliest existing PoolSubaccountDailySnapshot/PoolTransaction
 * row, back to DATA_FLOOR (2023-01-02) - the range the original CSV export
 * (2025-12-28 onward) never covered.
 *
 * For each Luxor PoolSubaccount:
 *   1. Find the earliest date we already have a snapshot for.
 *   2. If that's already <= DATA_FLOOR, nothing to do.
 *   3. Otherwise fetch [DATA_FLOOR, earliestExisting - 1 day] from Luxor live
 *      (hashrate-efficiency + revenue + uptime + active-workers, all in one
 *      call each - verified no per-request range cap for tick_size=1d) and
 *      the transaction ledger for the same range (paginated).
 *   4. Upsert only genuinely new rows/records - never touches anything that
 *      already exists.
 *
 * Braiins is not touched: its own live API only ever exposes a ~188-day
 * rolling window, so there is no way to reach back to 2025-12-27 or earlier
 * via API regardless of when this runs - that gap is permanent, not
 * something a backfill can close.
 *
 * Run with: node scripts/backfill-pre-csv-history-20260817.js
 */

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();

const LUXOR_BASE_URL = "https://app.luxor.tech/api/v2";
const LUXOR_API_KEY = process.env.LUXOR_API_KEY;
const DATA_FLOOR = "2023-01-02";
const CUTOFF_EXCLUSIVE = "2025-12-28"; // first date the CSV/live gap-fill already covers

if (!LUXOR_API_KEY) {
  throw new Error("LUXOR_API_KEY is not set in environment");
}

const luxorClient = axios.create({
  baseURL: LUXOR_BASE_URL,
  headers: { Authorization: `Bearer ${LUXOR_API_KEY}` },
  timeout: 30000,
});

async function withBackoff(fn, label, maxRetries = 5) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const status = error.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const delayMs = 1000 * 2 ** attempt;
        console.warn(
          `  [rate-limit] ${label} got 429, retrying in ${delayMs}ms`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
        attempt++;
        continue;
      }
      throw error;
    }
  }
}

function luxorGet(pathname, params, label) {
  return withBackoff(
    () => luxorClient.get(pathname, { params }).then((r) => r.data),
    label,
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parseUtcDate = (dateStr) => new Date(`${dateStr.trim()}T00:00:00.000Z`);
const toApiDate = (date) => date.toISOString().slice(0, 10);
const dateKey = (iso) => iso.slice(0, 10);

async function processSubaccount(sub) {
  const key = `${sub.subaccountName}`;

  const earliest = await prisma.poolSubaccountDailySnapshot.findFirst({
    where: { poolSubaccountId: sub.id },
    orderBy: { date: "asc" },
  });

  const endBoundary = earliest
    ? new Date(earliest.date.getTime() - 86_400_000)
    : parseUtcDate("2025-12-27"); // no snapshot at all yet - still check the same pre-CSV window

  const endDate = toApiDate(endBoundary);

  if (endDate < DATA_FLOOR) {
    console.log(
      `  ${key}: earliest snapshot already at/before DATA_FLOOR - nothing to check`,
    );
    return { subaccount: key, daysFound: 0, checked: false };
  }

  console.log(`  ${key}: checking ${DATA_FLOOR} -> ${endDate}`);

  const authKey = sub.authKey;

  const [hashrateEff, revenue, uptime, activeWorkers] = await Promise.all([
    luxorGet(
      `/pool/hashrate-efficiency/BTC`,
      {
        subaccount_names: authKey,
        start_date: DATA_FLOOR,
        end_date: endDate,
        tick_size: "1d",
      },
      `${key} hashrate-efficiency`,
    ),
    luxorGet(
      `/pool/revenue/BTC`,
      { subaccount_names: authKey, start_date: DATA_FLOOR, end_date: endDate },
      `${key} revenue`,
    ),
    luxorGet(
      `/pool/uptime/BTC`,
      {
        subaccount_names: authKey,
        start_date: DATA_FLOOR,
        end_date: endDate,
        tick_size: "1d",
      },
      `${key} uptime`,
    ),
    luxorGet(
      `/pool/active-workers/BTC`,
      {
        subaccount_names: authKey,
        start_date: DATA_FLOOR,
        end_date: endDate,
        tick_size: "1d",
      },
      `${key} active-workers`,
    ),
  ]);

  const byDate = new Map();
  const ensure = (d) => {
    if (!byDate.has(d)) {
      byDate.set(d, {
        poolSubaccountId: sub.id,
        date: parseUtcDate(d),
        hashrate: null,
        efficiency: null,
        uptime: null,
        activeWorkers: null,
        hashprice: null,
        miningRevenue: 0,
        referralRevenue: 0,
        otherRevenue: 0,
        totalRevenue: 0,
      });
    }
    return byDate.get(d);
  };

  for (const p of hashrateEff.hashrate_efficiency || []) {
    const row = ensure(dateKey(p.date_time));
    row.hashrate = parseFloat(p.hashrate || "0") || 0;
    row.efficiency =
      typeof p.efficiency === "number" ? p.efficiency * 100 : null;
  }
  for (const p of uptime.uptime || []) {
    ensure(dateKey(p.date_time)).uptime =
      typeof p.uptime === "number" ? p.uptime * 100 : null;
  }
  for (const p of activeWorkers.active_workers || []) {
    ensure(dateKey(p.date_time)).activeWorkers = p.active_workers ?? null;
  }
  for (const p of revenue.revenue || []) {
    const row = ensure(dateKey(p.date_time));
    const type = p.revenue?.revenue_type;
    const amount = p.revenue?.revenue || 0;
    if (type === "MINING") row.miningRevenue += amount;
    else if (type === "REFERRAL") row.referralRevenue += amount;
    else row.otherRevenue += amount;
    row.totalRevenue += amount;
  }

  // Only rows where the pool actually reported a hashrate figure count as
  // "real activity" - a bare revenue-only or uptime-only row with no
  // hashrate would be noise, not evidence of hashing.
  const realRows = [...byDate.values()].filter(
    (v) => v.hashrate !== null && v.hashrate > 0,
  );

  if (realRows.length) {
    await prisma.$transaction(
      realRows.map((v) =>
        prisma.poolSubaccountDailySnapshot.upsert({
          where: {
            poolSubaccountId_date: {
              poolSubaccountId: v.poolSubaccountId,
              date: v.date,
            },
          },
          update: v,
          create: v,
        }),
      ),
    );
    console.log(
      `    FOUND real activity: wrote ${realRows.length} day(s), earliest=${toApiDate(realRows.map((r) => r.date).sort((a, b) => a - b)[0])}`,
    );
  } else {
    console.log(`    No real hashing activity found in this range`);
  }

  await sleep(400);

  // Transactions for the same window.
  const CREDIT_CATEGORIES = new Set(["Miner Revenue", "LuxOS Rebate"]);
  const txRecords = [];
  let pageNumber = 1;
  let hasMore = true;
  while (hasMore) {
    const page = await luxorGet(
      `/pool/transactions/BTC`,
      {
        subaccount_names: authKey,
        start_date: DATA_FLOOR,
        end_date: endDate,
        page_number: pageNumber,
        page_size: 250,
      },
      `${key} transactions p${pageNumber}`,
    );
    for (const tx of page.transactions || []) {
      txRecords.push({
        poolId: sub.poolId,
        poolSubaccountId: sub.id,
        externalTransactionId: tx.transaction_id || null,
        transactionType: CREDIT_CATEGORIES.has(tx.transaction_category)
          ? "credit"
          : tx.transaction_type,
        category: tx.transaction_category,
        amount: tx.currency_amount,
        usdEquivalent: tx.usd_equivalent,
        addressName: tx.address_name || null,
        occurredAt: new Date(tx.date_time),
      });
    }
    hasMore = page.pagination?.next_page_url != null;
    pageNumber++;
    if (pageNumber > 20) break;
  }

  let txWritten = 0;
  if (txRecords.length) {
    const result = await prisma.poolTransaction.createMany({
      data: txRecords,
      skipDuplicates: true,
    });
    txWritten = result.count;
    console.log(
      `    Transactions: found ${txRecords.length}, wrote ${txWritten} new`,
    );
  } else {
    console.log(`    Transactions: none found in this range`);
  }

  await sleep(400);

  return {
    subaccount: key,
    daysFound: realRows.length,
    earliestRealDate: realRows.length
      ? toApiDate(realRows.map((r) => r.date).sort((a, b) => a - b)[0])
      : null,
    transactionsFound: txRecords.length,
    checked: true,
  };
}

async function main() {
  console.log("Starting pre-CSV history check/backfill...");
  console.log(
    `Range: ${DATA_FLOOR} -> day before each subaccount's earliest existing snapshot`,
  );

  const subaccounts = await prisma.poolSubaccount.findMany({
    where: { pool: { name: "Luxor" }, poolAuthId: { not: null } },
    include: { poolAuth: true },
  });

  const results = [];
  for (const sub of subaccounts) {
    if (!sub.poolAuth) continue;
    try {
      const result = await processSubaccount({
        ...sub,
        authKey: sub.poolAuth.authKey,
      });
      results.push(result);
    } catch (error) {
      console.error(`  ${sub.subaccountName}: ERROR - ${error.message}`);
      results.push({ subaccount: sub.subaccountName, error: error.message });
    }
  }

  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.subaccount}: ERROR - ${r.error}`);
    } else if (!r.checked) {
      console.log(`  ${r.subaccount}: already fully covered, skipped`);
    } else {
      console.log(
        `  ${r.subaccount}: ${r.daysFound} real day(s) found${r.earliestRealDate ? ` (earliest: ${r.earliestRealDate})` : ""}, ${r.transactionsFound} transaction(s) found`,
      );
    }
  }

  const totalDaysFound = results.reduce(
    (sum, r) => sum + (r.daysFound || 0),
    0,
  );
  const totalTxFound = results.reduce(
    (sum, r) => sum + (r.transactionsFound || 0),
    0,
  );
  console.log(
    `\nTotal real pre-2025-12-28 days found across all subaccounts: ${totalDaysFound}`,
  );
  console.log(
    `Total pre-2025-12-28 transactions found across all subaccounts: ${totalTxFound}`,
  );
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
