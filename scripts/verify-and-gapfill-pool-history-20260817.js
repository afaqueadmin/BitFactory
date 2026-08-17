/**
 * Verify existing PoolSubaccountDailySnapshot / PoolTransaction rows against
 * the newly exported CSVs (dailystats_2026-08-17.csv, transaction_2026-08-17.csv,
 * covering 2025-12-28 -> 2026-08-16) and gap-fill whatever dates the DB is
 * missing. Read-only for anything that already matches; NOTHING that already
 * exists in the DB is overwritten - mismatches are only reported, never
 * auto-corrected, since we don't know whether the DB value (possibly written
 * by a later cron/API call) or the CSV export is more authoritative.
 *
 * Run with: node scripts/verify-and-gapfill-pool-history-20260817.js
 */

const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();

const CSV_DIR = "C:/Users/IT Support/Downloads";
const DAILY_STATS_CSV = `${CSV_DIR}/dailystats_2026-08-17.csv`;
const TRANSACTIONS_CSV = `${CSV_DIR}/transaction_2026-08-17.csv`;

const EXCLUDED_SUBACCOUNTS = new Set([
  "higgs_test",
  "higgs_test2",
  "higgs_test3",
  "N/A",
]);

// ---------------------------------------------------------------------------
// CSV helpers (identical to scripts/backfill-pool-history.js)
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

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

const ABS_EPSILON_BTC = 1e-7; // sub-satoshi rounding noise
const ABS_EPSILON_PERCENT = 0.02; // percent fields (efficiency/uptime), rounding noise

function numsDiffer(a, b, epsilon) {
  const an = a === null || a === undefined ? null : Number(a);
  const bn = b === null || b === undefined ? null : Number(b);
  if (an === null && bn === null) return false;
  if (an === null || bn === null) return true; // one side has data, other doesn't
  return Math.abs(an - bn) > epsilon;
}

// ---------------------------------------------------------------------------
// Load subaccounts already in DB
// ---------------------------------------------------------------------------

async function loadSubaccounts() {
  const rows = await prisma.poolSubaccount.findMany({
    include: { pool: { select: { name: true } } },
  });
  const byKey = new Map();
  for (const row of rows) {
    byKey.set(`${row.pool.name}|${row.subaccountName}`, row);
  }
  return byKey;
}

// ---------------------------------------------------------------------------
// Daily stats: verify overlap, gap-fill new dates
// ---------------------------------------------------------------------------

async function processDailyStats(subaccountsByKey) {
  console.log("\n=== Daily stats: verify + gap-fill ===");

  if (!fs.existsSync(DAILY_STATS_CSV)) {
    throw new Error(`Daily stats CSV not found at ${DAILY_STATS_CSV}`);
  }

  const rows = parseCsv(DAILY_STATS_CSV);
  console.log(`  Parsed ${rows.length} CSV rows`);

  const mismatches = [];
  const toWrite = [];
  let matched = 0;
  let skippedNoSubaccount = 0;
  let skippedNoActivity = 0;

  for (const row of rows) {
    const name = row.Subaccount?.trim();
    if (!name || EXCLUDED_SUBACCOUNTS.has(name)) continue;

    const hashrateThs = toNumber(row["Hashrate (TH/s)"]);
    if (hashrateThs === null) {
      skippedNoActivity++;
      continue; // no real activity that day per CSV, nothing to compare/write
    }

    const poolSubaccount = subaccountsByKey.get(`Luxor|${name}`);
    if (!poolSubaccount) {
      skippedNoSubaccount++;
      continue;
    }

    const mining = toNumber(row["Mining (BTC)"]) || 0;
    const referral = toNumber(row["Referrals (BTC)"]) || 0;
    const other = toNumber(row["LuxOS (BTC)"]) || 0;

    const csvValues = {
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

    const date = parseUtcDate(row.Date);

    const existing = await prisma.poolSubaccountDailySnapshot.findUnique({
      where: {
        poolSubaccountId_date: { poolSubaccountId: poolSubaccount.id, date },
      },
    });

    if (!existing) {
      toWrite.push({
        poolSubaccountId: poolSubaccount.id,
        date,
        ...csvValues,
      });
      continue;
    }

    matched++;
    const rowMismatches = [];
    const check = (field, epsilon) => {
      if (numsDiffer(existing[field], csvValues[field], epsilon)) {
        rowMismatches.push({
          field,
          db: existing[field] === null ? null : Number(existing[field]),
          csv: csvValues[field],
        });
      }
    };
    check("hashrate", 1); // H/s, allow 1 H/s rounding
    check("efficiency", ABS_EPSILON_PERCENT);
    check("uptime", ABS_EPSILON_PERCENT);
    check("activeWorkers", 0);
    check("hashprice", ABS_EPSILON_BTC);
    check("miningRevenue", ABS_EPSILON_BTC);
    check("referralRevenue", ABS_EPSILON_BTC);
    check("otherRevenue", ABS_EPSILON_BTC);
    check("totalRevenue", ABS_EPSILON_BTC);

    if (rowMismatches.length > 0) {
      mismatches.push({
        subaccount: name,
        date: row.Date,
        fields: rowMismatches,
      });
    }
  }

  console.log(`  Already in DB (compared): ${matched}`);
  console.log(`  Mismatches found: ${mismatches.length}`);
  console.log(`  New rows to gap-fill: ${toWrite.length}`);
  console.log(`  Skipped (no matching PoolSubaccount): ${skippedNoSubaccount}`);
  console.log(`  Skipped (no activity that day): ${skippedNoActivity}`);

  if (toWrite.length) {
    // Chunk to keep transactions reasonably sized.
    const CHUNK = 200;
    for (let i = 0; i < toWrite.length; i += CHUNK) {
      const chunk = toWrite.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map((v) =>
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
    }
    console.log(`  Wrote ${toWrite.length} new daily snapshot rows`);
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// Transactions: verify overlap (by subaccount+date+category), gap-fill new
// ---------------------------------------------------------------------------

async function processTransactions(subaccountsByKey) {
  console.log("\n=== Transactions: verify + gap-fill ===");

  if (!fs.existsSync(TRANSACTIONS_CSV)) {
    throw new Error(`Transactions CSV not found at ${TRANSACTIONS_CSV}`);
  }

  const rows = parseCsv(TRANSACTIONS_CSV);
  console.log(`  Parsed ${rows.length} CSV rows`);

  const CREDIT_CATEGORIES = new Set(["Miner Revenue", "LuxOS Rebate"]);

  // Pull every existing Luxor transaction once, keyed by
  // subaccount|date|category, so each CSV row can be checked without a
  // per-row DB round trip.
  const existingRows = await prisma.poolTransaction.findMany({
    where: { pool: { name: "Luxor" } },
    select: {
      poolSubaccountId: true,
      occurredAt: true,
      category: true,
      amount: true,
    },
  });
  const existingByKey = new Map();
  for (const row of existingRows) {
    const key = `${row.poolSubaccountId}|${row.occurredAt.toISOString()}|${row.category}`;
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(Number(row.amount));
  }

  const mismatches = [];
  const toInsert = [];
  let matched = 0;
  let skippedNoSubaccount = 0;

  for (const row of rows) {
    const name = row.Subaccount?.trim();
    if (!name || EXCLUDED_SUBACCOUNTS.has(name)) continue;

    const poolSubaccount = subaccountsByKey.get(`Luxor|${name}`);
    if (!poolSubaccount) {
      skippedNoSubaccount++;
      continue;
    }

    const category = row.Description?.trim();
    const amount = toNumber(row["Amount (BTC)"]);
    if (amount === null) continue;

    const occurredAt = parseUtcDateTime(row["Date (UTC)"]);
    const key = `${poolSubaccount.id}|${occurredAt.toISOString()}|${category}`;
    const existingAmounts = existingByKey.get(key);

    if (!existingAmounts) {
      toInsert.push({
        poolId: poolSubaccount.poolId,
        poolSubaccountId: poolSubaccount.id,
        externalTransactionId: row.TransactionId?.trim() || null,
        transactionType: CREDIT_CATEGORIES.has(category) ? "credit" : "debit",
        category,
        amount,
        usdEquivalent: toNumber(row["Amount (USD)"]),
        addressName: row.Wallet?.trim() || null,
        occurredAt,
      });
      continue;
    }

    matched++;
    const hasMatchingAmount = existingAmounts.some(
      (a) => Math.abs(a - amount) <= ABS_EPSILON_BTC,
    );
    if (!hasMatchingAmount) {
      mismatches.push({
        subaccount: name,
        date: row["Date (UTC)"],
        category,
        csvAmount: amount,
        dbAmounts: existingAmounts,
      });
    }
  }

  console.log(`  Already in DB (subaccount+date+category matched): ${matched}`);
  console.log(`  Amount mismatches found: ${mismatches.length}`);
  console.log(`  New transactions to insert: ${toInsert.length}`);
  console.log(`  Skipped (no matching PoolSubaccount): ${skippedNoSubaccount}`);

  if (toInsert.length) {
    const result = await prisma.poolTransaction.createMany({
      data: toInsert,
      skipDuplicates: true,
    });
    console.log(
      `  Inserted ${result.count} transactions (${toInsert.length - result.count} duplicates skipped by DB constraint)`,
    );
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Starting verify + gap-fill run...");
  console.log("Date:", new Date().toISOString());

  const subaccountsByKey = await loadSubaccounts();
  console.log(`Loaded ${subaccountsByKey.size} existing PoolSubaccount rows`);

  const snapshotMismatches = await processDailyStats(subaccountsByKey);
  const transactionMismatches = await processTransactions(subaccountsByKey);

  console.log("\n=== SUMMARY ===");
  console.log(`Daily snapshot mismatches: ${snapshotMismatches.length}`);
  console.log(`Transaction amount mismatches: ${transactionMismatches.length}`);

  if (snapshotMismatches.length) {
    console.log("\n--- Daily snapshot mismatches (DB left untouched) ---");
    for (const m of snapshotMismatches) {
      console.log(`  ${m.subaccount} ${m.date}:`);
      for (const f of m.fields) {
        console.log(`    ${f.field}: db=${f.db}  csv=${f.csv}`);
      }
    }
  }

  if (transactionMismatches.length) {
    console.log(
      "\n--- Transaction amount mismatches (nothing inserted for these) ---",
    );
    for (const m of transactionMismatches) {
      console.log(
        `  ${m.subaccount} ${m.date} [${m.category}]: db=${JSON.stringify(m.dbAmounts)}  csv=${m.csvAmount}`,
      );
    }
  }
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
