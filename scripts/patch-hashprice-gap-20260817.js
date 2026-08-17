/**
 * Targeted patch: fills only the `hashprice` field on
 * PoolSubaccountDailySnapshot rows where it is currently null, using the
 * 2026-08-17 CSV export as the source. Does not touch any other field.
 * Only writes when the existing DB value is null (never overwrites a real
 * value), so this is safe to re-run.
 *
 * Run with: node scripts/patch-hashprice-gap-20260817.js
 */

const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const prisma = new PrismaClient();

const DAILY_STATS_CSV =
  "C:/Users/IT Support/Downloads/dailystats_2026-08-17.csv";

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

async function main() {
  const subaccounts = await prisma.poolSubaccount.findMany({
    where: { pool: { name: "Luxor" } },
  });
  const subaccountById = new Map(subaccounts.map((s) => [s.subaccountName, s]));

  const rows = parseCsv(DAILY_STATS_CSV);
  let patched = 0;
  let skippedAlreadySet = 0;
  let skippedNoCsvValue = 0;

  for (const row of rows) {
    const name = row.Subaccount?.trim();
    if (!name) continue;

    const hashprice = toNumber(row["Price (BTC/PH/s/Day)"]);
    if (hashprice === null) {
      skippedNoCsvValue++;
      continue;
    }

    const poolSubaccount = subaccountById.get(name);
    if (!poolSubaccount) continue;

    const date = parseUtcDate(row.Date);

    const existing = await prisma.poolSubaccountDailySnapshot.findUnique({
      where: {
        poolSubaccountId_date: { poolSubaccountId: poolSubaccount.id, date },
      },
    });

    if (!existing) continue; // nothing to patch, not a row we're tracking
    if (existing.hashprice !== null) {
      skippedAlreadySet++;
      continue;
    }

    await prisma.poolSubaccountDailySnapshot.update({
      where: {
        poolSubaccountId_date: { poolSubaccountId: poolSubaccount.id, date },
      },
      data: { hashprice },
    });
    patched++;
    console.log(`  ${name} ${row.Date}: hashprice null -> ${hashprice}`);
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Patched: ${patched}`);
  console.log(`Skipped (already had a value): ${skippedAlreadySet}`);
  console.log(
    `Skipped (CSV had no hashprice for that row): ${skippedNoCsvValue}`,
  );
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
