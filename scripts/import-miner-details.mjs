/**
 * Bulk Miner SN/MAC Import Script
 *
 * Usage:
 *   node scripts/import-miner-details.mjs miners.csv
 *
 * CSV format (first row must be headers):
 *   name,serialNumber,macAddress
 *   Miner-001,SN123456789,AA:BB:CC:DD:EE:FF
 *   Miner-002,SN0987654321,11:22:33:44:55:66
 *
 * - The `name` column must match the miner name exactly as stored in the DB.
 * - serialNumber and macAddress are optional per row (leave blank to skip that field).
 */

import { createReadStream } from "fs";
import { resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import readline from "readline";

// ── Locate project root ──────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// ── Dynamically load Prisma from the project (Windows-safe file:// URL) ─────
const prismaClientPath = join(projectRoot, "node_modules", "@prisma", "client", "index.js");
const { PrismaClient } = await import(pathToFileURL(prismaClientPath).href);

const prisma = new PrismaClient();

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const rl = readline.createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let headers = null;
    rl.on("line", (line) => {
      // Skip empty lines
      if (!line.trim()) return;

      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));

      if (!headers) {
        // Normalise headers to lowercase
        headers = cols.map((h) => h.toLowerCase());
        return;
      }

      const row = {};
      headers.forEach((h, i) => {
        row[h] = cols[i] ?? "";
      });
      rows.push(row);
    });

    rl.on("close", () => resolve(rows));
    rl.on("error", reject);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const csvArg = process.argv[2];
  if (!csvArg) {
    console.error("❌  Please provide the CSV file path as the first argument.");
    console.error("    Example: node scripts/import-miner-details.mjs miners.csv");
    process.exit(1);
  }

  const csvPath = resolve(csvArg);
  console.log(`\n📂  Reading CSV: ${csvPath}\n`);

  let rows;
  try {
    rows = await parseCSV(csvPath);
  } catch (err) {
    console.error("❌  Failed to read CSV file:", err.message);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.warn("⚠️   CSV file is empty or contains only headers. Nothing to do.");
    process.exit(0);
  }

  console.log(`📋  Found ${rows.length} rows. Starting update...\n`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  const errors = [];

  for (const row of rows) {
    const name = row["name"] || row["miner name"] || row["minername"];
    if (!name) {
      console.warn("⚠️   Skipping row with missing miner name:", row);
      skipped++;
      continue;
    }

    const serialNumber = row["serialnumber"] || row["serial number"] || row["sn"] || "";
    const macAddress  = row["macaddress"]   || row["mac address"]   || row["mac"] || "";

    if (!serialNumber && !macAddress) {
      console.log(`⏭️   ${name} — no data to update, skipping.`);
      skipped++;
      continue;
    }

    // Find the miner by name
    let miner;
    try {
      miner = await prisma.miner.findFirst({
        where: { name, isDeleted: false },
        select: { id: true, name: true },
      });
    } catch (err) {
      console.error(`❌  DB error looking up "${name}":`, err.message);
      errors.push({ name, error: err.message });
      continue;
    }

    if (!miner) {
      console.warn(`⚠️   NOT FOUND: "${name}" — skipping.`);
      notFound++;
      continue;
    }

    // Build update payload (only set fields that have values)
    const updateData = {};
    if (serialNumber) updateData.serialNumber = serialNumber;
    if (macAddress)   updateData.macAddress   = macAddress;

    try {
      await prisma.miner.update({
        where: { id: miner.id },
        data: updateData,
      });
      const parts = [];
      if (serialNumber) parts.push(`SN=${serialNumber}`);
      if (macAddress)   parts.push(`MAC=${macAddress}`);
      console.log(`✅  ${name}  →  ${parts.join("  |  ")}`);
      updated++;
    } catch (err) {
      console.error(`❌  Failed to update "${name}":`, err.message);
      errors.push({ name, error: err.message });
    }
  }

  console.log("\n─────────────────────────────────────────────");
  console.log(`✅  Updated : ${updated}`);
  console.log(`⏭️   Skipped : ${skipped}`);
  console.log(`🔍  Not found: ${notFound}`);
  if (errors.length) {
    console.log(`❌  Errors  : ${errors.length}`);
    errors.forEach((e) => console.log(`    • ${e.name}: ${e.error}`));
  }
  console.log("─────────────────────────────────────────────\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
