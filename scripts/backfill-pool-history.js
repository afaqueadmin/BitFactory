/**
 * One-time historical backfill for pool_subaccounts / pool_subaccount_daily_snapshots /
 * pool_worker_daily_metrics / pool_transactions.
 *
 * Run with: node scripts/backfill-pool-history.js
 *
 * Sources, in order:
 *   1. Bootstrap PoolSubaccount rows from real PoolAuth rows (Luxor + Braiins,
 *      skips the "Test" pool and known junk subaccounts).
 *   2. CSV import (Dec 28 2025 - Aug 11 2026, no API calls) for Luxor daily
 *      snapshots + the transaction ledger.
 *   3. API gap-fill for Luxor: whatever days sit between the CSV's last day
 *      and yesterday (UTC).
 *   4. API worker-level backfill for Luxor (hashrate/efficiency/estRevenue
 *      only - stale/rejected shares, firmware and status have no historical
 *      endpoint and stay null until the daily cron starts populating them).
 *   5. Braiins: one daily-hashrate call (its only history, a fixed ~188-day
 *      rolling window) + payouts (real tx_ids). No Braiins worker history
 *      exists via any API, so nothing to backfill there.
 *
 * Every write is an upsert or a skipDuplicates createMany, so this script is
 * safe to re-run.
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();

const LUXOR_BASE_URL = "https://app.luxor.tech/api/v2";
const LUXOR_API_KEY = process.env.LUXOR_API_KEY;
const BRAIINS_BASE_URL = "https://pool.braiins.com";

const SUBACCOUNT_DATA_FLOOR = "2023-01-02";
const WORKER_DATA_FLOOR = "2024-01-02";

const CSV_DIR = "C:/Users/IT Support/Downloads";
const DAILY_STATS_CSV = path.join(
  CSV_DIR,
  "dailystats_2026-08-12 - dailystats_2026-08-12.csv.csv",
);
const TRANSACTIONS_CSV = path.join(
  CSV_DIR,
  "transaction_2026-08-12 - transaction_2026-08-12.csv.csv",
);

// Known test/placeholder subaccounts - real Luxor data confirms these have
// zero hashing activity across the whole CSV export, so nothing is lost by
// skipping them.
const EXCLUDED_SUBACCOUNTS = new Set([
  "higgs_test",
  "higgs_test2",
  "higgs_test3",
  "N/A",
]);

const stats = {
  subaccountsCreated: 0,
  dailySnapshotsWritten: 0,
  transactionsWritten: 0,
  workerMetricsWritten: 0,
  errors: [],
};

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i];
    });
    return row;
  });
}

function toNumber(str) {
  if (str === undefined || str === null) return null;
  const trimmed = String(str).trim();
  if (trimmed === "") return null;
  const cleaned = trimmed.replace(/[$,%]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseUtcDate(dateStr) {
  return new Date(`${dateStr.trim()}T00:00:00.000Z`);
}

function parseUtcDateTime(str) {
  const [datePart, timePart] = str.trim().split(" ");
  const [h, m, s] = timePart.split(":").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  return new Date(`${datePart}T${pad(h)}:${pad(m)}:${pad(s)}.000Z`);
}

const toApiDate = (date) => date.toISOString().slice(0, 10);

const yesterdayUtc = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
};

// ---------------------------------------------------------------------------
// API helpers (with 429 backoff)
// ---------------------------------------------------------------------------

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

const luxorClient = axios.create({
  baseURL: LUXOR_BASE_URL,
  headers: { Authorization: `Bearer ${LUXOR_API_KEY}` },
  timeout: 30000,
});

function luxorGet(pathname, params, label) {
  return withBackoff(
    () => luxorClient.get(pathname, { params }).then((r) => r.data),
    label,
  );
}

function braiinsGet(pathname, token, label) {
  const client = axios.create({
    baseURL: BRAIINS_BASE_URL,
    headers: { "Pool-Auth-Token": token },
    timeout: 30000,
  });
  return withBackoff(() => client.get(pathname).then((r) => r.data), label);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Step 1: bootstrap PoolSubaccount rows
// ---------------------------------------------------------------------------

async function bootstrapSubaccounts() {
  console.log("\n=== STEP 1: Bootstrapping PoolSubaccount rows ===");

  const poolAuths = await prisma.poolAuth.findMany({
    where: { pool: { name: { in: ["Luxor", "Braiins"] } } },
    include: { pool: true, user: { select: { id: true } } },
  });

  const subaccounts = new Map(); // key: `${poolName}|${subaccountName}` -> PoolSubaccount

  for (const auth of poolAuths) {
    let subaccountName = auth.authKey;

    if (auth.pool.name === "Braiins") {
      try {
        const profile = await braiinsGet(
          "/accounts/profile/json/btc",
          auth.authKey,
          "braiins profile",
        );
        subaccountName = profile.username;
      } catch (error) {
        stats.errors.push(
          `Braiins profile fetch failed for PoolAuth ${auth.id}: ${error.message}`,
        );
        continue;
      }
    }

    if (EXCLUDED_SUBACCOUNTS.has(subaccountName)) {
      console.log(`  Skipping excluded/test subaccount: ${subaccountName}`);
      continue;
    }

    const record = await prisma.poolSubaccount.upsert({
      where: { poolId_subaccountName: { poolId: auth.poolId, subaccountName } },
      update: {
        userId: auth.userId,
        poolAuthId: auth.id,
        lastSyncedAt: new Date(),
      },
      create: {
        poolId: auth.poolId,
        subaccountName,
        userId: auth.userId,
        poolAuthId: auth.id,
        currency: "BTC",
        lastSyncedAt: new Date(),
      },
    });

    stats.subaccountsCreated++;
    subaccounts.set(`${auth.pool.name}|${subaccountName}`, {
      ...record,
      poolName: auth.pool.name,
      authKey: auth.authKey,
    });
    console.log(`  ${auth.pool.name} / ${subaccountName} -> ${record.id}`);
  }

  return subaccounts;
}

// ---------------------------------------------------------------------------
// Step 2: CSV import - daily snapshots
// ---------------------------------------------------------------------------

async function importDailyStatsCsv(subaccountsByKey) {
  console.log("\n=== STEP 2: Importing daily stats CSV ===");

  if (!fs.existsSync(DAILY_STATS_CSV)) {
    stats.errors.push(`Daily stats CSV not found at ${DAILY_STATS_CSV}`);
    return;
  }

  const rows = parseCsv(DAILY_STATS_CSV);
  console.log(`  Parsed ${rows.length} rows`);

  const bySubaccount = new Map();
  for (const row of rows) {
    const name = row.Subaccount?.trim();
    if (!name || EXCLUDED_SUBACCOUNTS.has(name)) continue;

    const hashrateThs = toNumber(row["Hashrate (TH/s)"]);
    if (hashrateThs === null) continue; // no real activity that day - skip, don't write a fake zero row

    const key = `Luxor|${name}`;
    const poolSubaccount = subaccountsByKey.get(key);
    if (!poolSubaccount) continue;

    const mining = toNumber(row["Mining (BTC)"]) || 0;
    const referral = toNumber(row["Referrals (BTC)"]) || 0;
    const other = toNumber(row["LuxOS (BTC)"]) || 0;

    const values = {
      poolSubaccountId: poolSubaccount.id,
      date: parseUtcDate(row.Date),
      hashrate: hashrateThs * 1e12,
      efficiency: toNumber(row["Shares Efficiency"]),
      uptime: toNumber(row.Uptime),
      activeWorkers: toNumber(row["Workers count"]),
      hashprice: toNumber(row["Price (BTC/PH/s/Day)"]),
      miningRevenue: mining,
      referralRevenue: referral,
      otherRevenue: other,
      totalRevenue: mining + referral + other,
    };

    if (!bySubaccount.has(poolSubaccount.id))
      bySubaccount.set(poolSubaccount.id, []);
    bySubaccount.get(poolSubaccount.id).push(values);
  }

  for (const [poolSubaccountId, snapshots] of bySubaccount) {
    const result = await prisma.$transaction(
      snapshots.map((s) =>
        prisma.poolSubaccountDailySnapshot.upsert({
          where: {
            poolSubaccountId_date: {
              poolSubaccountId: s.poolSubaccountId,
              date: s.date,
            },
          },
          update: s,
          create: s,
        }),
      ),
    );
    stats.dailySnapshotsWritten += result.length;
    console.log(`  ${poolSubaccountId}: ${result.length} daily snapshots`);
  }
}

// ---------------------------------------------------------------------------
// Step 3: CSV import - transactions
// ---------------------------------------------------------------------------

async function importTransactionsCsv(subaccountsByKey) {
  console.log("\n=== STEP 3: Importing transactions CSV ===");

  if (!fs.existsSync(TRANSACTIONS_CSV)) {
    stats.errors.push(`Transactions CSV not found at ${TRANSACTIONS_CSV}`);
    return;
  }

  const rows = parseCsv(TRANSACTIONS_CSV);
  console.log(`  Parsed ${rows.length} rows`);

  const luxorPool = [...subaccountsByKey.values()].find(
    (s) => s.poolName === "Luxor",
  );
  if (!luxorPool) {
    stats.errors.push(
      "No Luxor PoolSubaccount available to resolve poolId for transactions import",
    );
    return;
  }

  const CREDIT_CATEGORIES = new Set(["Miner Revenue", "LuxOS Rebate"]);
  const records = [];

  for (const row of rows) {
    const name = row.Subaccount?.trim();
    if (!name || EXCLUDED_SUBACCOUNTS.has(name)) continue;

    const poolSubaccount = subaccountsByKey.get(`Luxor|${name}`);
    if (!poolSubaccount) continue;

    const category = row.Description?.trim();
    const amount = toNumber(row["Amount (BTC)"]);
    if (amount === null) continue;

    records.push({
      poolId: poolSubaccount.poolId,
      poolSubaccountId: poolSubaccount.id,
      externalTransactionId: row.TransactionId?.trim() || null,
      transactionType: CREDIT_CATEGORIES.has(category) ? "credit" : "debit",
      category,
      amount,
      usdEquivalent: toNumber(row["Amount (USD)"]),
      addressName: row.Wallet?.trim() || null,
      occurredAt: parseUtcDateTime(row["Date (UTC)"]),
    });
  }

  const result = await prisma.poolTransaction.createMany({
    data: records,
    skipDuplicates: true,
  });
  stats.transactionsWritten += result.count;
  console.log(
    `  Inserted ${result.count} transactions (${records.length - result.count} duplicates skipped)`,
  );
}

// ---------------------------------------------------------------------------
// Step 4: API gap-fill for Luxor subaccount daily snapshots + transactions
// ---------------------------------------------------------------------------

async function apiGapFillLuxor(subaccountsByKey) {
  console.log(
    "\n=== STEP 4: API gap-fill (Luxor daily snapshots + transactions) ===",
  );

  const end = yesterdayUtc();
  const endDate = toApiDate(end);

  for (const [key, poolSubaccount] of subaccountsByKey) {
    if (poolSubaccount.poolName !== "Luxor") continue;

    const lastSnapshot = await prisma.poolSubaccountDailySnapshot.findFirst({
      where: { poolSubaccountId: poolSubaccount.id },
      orderBy: { date: "desc" },
    });

    const startDate = lastSnapshot
      ? toApiDate(new Date(lastSnapshot.date.getTime() + 86_400_000))
      : SUBACCOUNT_DATA_FLOOR;

    if (startDate > endDate) {
      console.log(`  ${key}: up to date, nothing to gap-fill`);
      continue;
    }

    console.log(`  ${key}: gap-filling ${startDate} -> ${endDate}`);

    try {
      const authKey = poolSubaccount.authKey;
      const [hashrateEff, revenue, uptime, activeWorkers] = await Promise.all([
        luxorGet(
          `/pool/hashrate-efficiency/BTC`,
          {
            subaccount_names: authKey,
            start_date: startDate,
            end_date: endDate,
            tick_size: "1d",
          },
          `${key} hashrate-efficiency`,
        ),
        luxorGet(
          `/pool/revenue/BTC`,
          {
            subaccount_names: authKey,
            start_date: startDate,
            end_date: endDate,
          },
          `${key} revenue`,
        ),
        luxorGet(
          `/pool/uptime/BTC`,
          {
            subaccount_names: authKey,
            start_date: startDate,
            end_date: endDate,
            tick_size: "1d",
          },
          `${key} uptime`,
        ),
        luxorGet(
          `/pool/active-workers/BTC`,
          {
            subaccount_names: authKey,
            start_date: startDate,
            end_date: endDate,
            tick_size: "1d",
          },
          `${key} active-workers`,
        ),
      ]);

      const byDate = new Map();
      const dateKey = (iso) => iso.slice(0, 10);
      const ensure = (d) => {
        if (!byDate.has(d)) {
          byDate.set(d, {
            poolSubaccountId: poolSubaccount.id,
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

      const values = [...byDate.values()];
      if (values.length) {
        await prisma.$transaction(
          values.map((v) =>
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
        stats.dailySnapshotsWritten += values.length;
        console.log(`    wrote ${values.length} snapshot day(s)`);
      }
    } catch (error) {
      stats.errors.push(
        `Gap-fill snapshot failed for ${key}: ${error.message}`,
      );
      console.error(`    ERROR: ${error.message}`);
    }

    await sleep(400);

    try {
      const lastTx = await prisma.poolTransaction.findFirst({
        where: { poolSubaccountId: poolSubaccount.id },
        orderBy: { occurredAt: "desc" },
      });
      const txStartDate = lastTx
        ? toApiDate(lastTx.occurredAt)
        : SUBACCOUNT_DATA_FLOOR;

      let pageNumber = 1;
      let hasMore = true;
      const CREDIT_CATEGORIES = new Set(["Miner Revenue", "LuxOS Rebate"]);
      const txRecords = [];

      while (hasMore) {
        const page = await luxorGet(
          `/pool/transactions/BTC`,
          {
            subaccount_names: poolSubaccount.authKey,
            start_date: txStartDate,
            end_date: endDate,
            page_number: pageNumber,
            page_size: 250,
          },
          `${key} transactions p${pageNumber}`,
        );

        for (const tx of page.transactions || []) {
          txRecords.push({
            poolId: poolSubaccount.poolId,
            poolSubaccountId: poolSubaccount.id,
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

      if (txRecords.length) {
        const result = await prisma.poolTransaction.createMany({
          data: txRecords,
          skipDuplicates: true,
        });
        stats.transactionsWritten += result.count;
        console.log(
          `    wrote ${result.count} transaction(s) (of ${txRecords.length} fetched)`,
        );
      }
    } catch (error) {
      stats.errors.push(
        `Gap-fill transactions failed for ${key}: ${error.message}`,
      );
      console.error(`    ERROR: ${error.message}`);
    }

    await sleep(400);
  }
}

// ---------------------------------------------------------------------------
// Step 5: API worker-level backfill (Luxor only)
// ---------------------------------------------------------------------------

async function workerBackfillLuxor(subaccountsByKey) {
  console.log("\n=== STEP 5: Worker-level backfill (Luxor) ===");

  const endDate = toApiDate(yesterdayUtc());

  for (const [key, poolSubaccount] of subaccountsByKey) {
    if (poolSubaccount.poolName !== "Luxor") continue;

    console.log(
      `  ${key}: fetching worker history ${WORKER_DATA_FLOOR} -> ${endDate}`,
    );

    try {
      let pageNumber = 1;
      let hasMore = true;
      const records = [];

      while (hasMore) {
        const page = await luxorGet(
          `/pool/workers-hashrate-efficiency/BTC/${poolSubaccount.authKey}`,
          {
            tick_size: "1d",
            start_date: WORKER_DATA_FLOOR,
            end_date: endDate,
            page_number: pageNumber,
            page_size: 100,
          },
          `${key} workers-hashrate-efficiency p${pageNumber}`,
        );

        const byWorker = page.hashrate_efficiency_revenue || {};
        for (const [workerName, points] of Object.entries(byWorker)) {
          for (const p of points) {
            records.push({
              poolSubaccountId: poolSubaccount.id,
              workerName,
              date: parseUtcDate(p.date_time.slice(0, 10)),
              hashrate: parseFloat(p.hashrate || "0") || 0,
              efficiency:
                typeof p.efficiency === "number" ? p.efficiency * 100 : null,
              estRevenue:
                typeof p.est_revenue === "number" ? p.est_revenue : null,
            });
          }
        }

        const totalWorkers =
          page.pagination?.item_count ?? Object.keys(byWorker).length;
        hasMore = pageNumber * 100 < totalWorkers;
        pageNumber++;
        if (pageNumber > 20) break;
      }

      if (records.length) {
        const result = await prisma.poolWorkerDailyMetric.createMany({
          data: records,
          skipDuplicates: true,
        });
        stats.workerMetricsWritten += result.count;
        console.log(
          `    wrote ${result.count} worker-day rows (of ${records.length} fetched)`,
        );
      }
    } catch (error) {
      stats.errors.push(`Worker backfill failed for ${key}: ${error.message}`);
      console.error(`    ERROR: ${error.message}`);
    }

    await sleep(400);
  }
}

// ---------------------------------------------------------------------------
// Step 6: Braiins (daily hashrate + payouts)
// ---------------------------------------------------------------------------

async function backfillBraiins(subaccountsByKey) {
  console.log("\n=== STEP 6: Braiins backfill ===");

  const braiinsEntry = [...subaccountsByKey.entries()].find(([k]) =>
    k.startsWith("Braiins|"),
  );
  if (!braiinsEntry) {
    console.log("  No Braiins subaccount to backfill");
    return;
  }
  const [key, poolSubaccount] = braiinsEntry;

  try {
    const daily = await braiinsGet(
      "/accounts/hash_rate_daily/json/btc",
      poolSubaccount.authKey,
      `${key} daily hashrate`,
    );

    const values = (daily.btc || []).map((day) => ({
      poolSubaccountId: poolSubaccount.id,
      date: new Date(day.date * 1000),
      hashrate: (Number(day.hash_rate_24h) || 0) * 1e9,
      efficiency: null,
      uptime: null,
      activeWorkers: null,
      hashprice: null,
      miningRevenue: 0,
      referralRevenue: 0,
      otherRevenue: 0,
      totalRevenue: 0,
    }));

    if (values.length) {
      await prisma.$transaction(
        values.map((v) =>
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
      stats.dailySnapshotsWritten += values.length;
      console.log(`  ${key}: wrote ${values.length} daily snapshot(s)`);
    }
  } catch (error) {
    stats.errors.push(
      `Braiins daily hashrate backfill failed: ${error.message}`,
    );
    console.error(`  ERROR: ${error.message}`);
  }

  try {
    const payouts = await braiinsGet(
      "/accounts/payouts/json/btc",
      poolSubaccount.authKey,
      `${key} payouts`,
    );

    const records = [
      ...(payouts.onchain || []),
      ...(payouts.lightning || []),
    ].map((p) => ({
      poolId: poolSubaccount.poolId,
      poolSubaccountId: poolSubaccount.id,
      externalTransactionId: p.tx_id || p.invoice || null,
      transactionType: "debit",
      category: "Payout",
      amount: p.amount_sats / 1e8,
      usdEquivalent: null,
      addressName: p.destination || null,
      status: p.status,
      occurredAt: new Date(p.resolved_at_ts * 1000),
    }));

    if (records.length) {
      const result = await prisma.poolTransaction.createMany({
        data: records,
        skipDuplicates: true,
      });
      stats.transactionsWritten += result.count;
      console.log(
        `  ${key}: wrote ${result.count} payout(s) (of ${records.length} fetched)`,
      );
    }
  } catch (error) {
    stats.errors.push(`Braiins payouts backfill failed: ${error.message}`);
    console.error(`  ERROR: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Starting pool history backfill...");
  console.log("Date:", new Date().toISOString());

  if (!LUXOR_API_KEY) {
    throw new Error("LUXOR_API_KEY is not set in environment");
  }

  const subaccountsByKey = await bootstrapSubaccounts();
  await importDailyStatsCsv(subaccountsByKey);
  await importTransactionsCsv(subaccountsByKey);
  await apiGapFillLuxor(subaccountsByKey);
  await workerBackfillLuxor(subaccountsByKey);
  await backfillBraiins(subaccountsByKey);

  console.log("\n=== SUMMARY ===");
  console.log(`PoolSubaccount rows: ${stats.subaccountsCreated}`);
  console.log(`Daily snapshots written: ${stats.dailySnapshotsWritten}`);
  console.log(`Transactions written: ${stats.transactionsWritten}`);
  console.log(`Worker-day metrics written: ${stats.workerMetricsWritten}`);
  console.log(`Errors: ${stats.errors.length}`);
  if (stats.errors.length) {
    console.log("\nErrors encountered:");
    for (const e of stats.errors) console.log(`  - ${e}`);
  }
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
