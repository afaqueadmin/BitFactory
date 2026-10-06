// Applies prisma/migrations/20261006120000_drop_vendor_invoice_is_deleted and
// records its _prisma_migrations row (`prisma migrate` can't reach Neon from
// the dev machine, P1001).
//
// Run ONLY after the Phase 1 code is deployed: older deployed code still
// selects isDeleted and would fail once the column is gone. Refuses to run
// if any row has isDeleted = true, since dropping it would lose that flag.
//
//   node scripts/apply-drop-vendor-invoice-is-deleted-migration.js            # preflight only
//   node scripts/apply-drop-vendor-invoice-is-deleted-migration.js --apply
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20261006120000_drop_vendor_invoice_is_deleted";
const sqlPath = path.join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  MIGRATION_NAME,
  "migration.sql",
);
const sql = fs.readFileSync(sqlPath);
const checksum = crypto.createHash("sha256").update(sql).digest("hex");

const statements = [
  `DROP INDEX "vendor_invoices_isDeleted_idx"`,
  `DROP INDEX "hardware_purchase_invoices_isDeleted_idx"`,
  `ALTER TABLE "vendor_invoices" DROP COLUMN "isDeleted"`,
  `ALTER TABLE "hardware_purchase_invoices" DROP COLUMN "isDeleted"`,
];

(async () => {
  const apply = process.argv.includes("--apply");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const already = await client.query(
      `SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1`,
      [MIGRATION_NAME],
    );
    if (already.rows.length > 0) {
      console.log("Migration already recorded, skipping.");
      return;
    }

    const preflight = await client.query(
      `SELECT
         (SELECT count(*)::int FROM vendor_invoices) AS vendor_total,
         (SELECT count(*)::int FROM vendor_invoices WHERE "isDeleted") AS vendor_deleted,
         (SELECT count(*)::int FROM hardware_purchase_invoices) AS hardware_total,
         (SELECT count(*)::int FROM hardware_purchase_invoices WHERE "isDeleted") AS hardware_deleted`,
    );
    const counts = preflight.rows[0];
    console.log("preflight:", counts);
    if (counts.vendor_deleted > 0 || counts.hardware_deleted > 0) {
      throw new Error(
        "Some invoices have isDeleted = true; dropping the column would lose that. Stopping.",
      );
    }

    if (!apply) {
      console.log("Preflight passed. Re-run with --apply to drop the column.");
      return;
    }

    await client.query("BEGIN");
    try {
      const startedAt = new Date();
      for (const stmt of statements) {
        await client.query(stmt);
      }
      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES ($1, $2, now(), $3, NULL, NULL, $4, 1)`,
        [crypto.randomUUID(), checksum, MIGRATION_NAME, startedAt],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    const after = await client.query(
      `SELECT (SELECT count(*)::int FROM vendor_invoices) AS vendor_total,
              (SELECT count(*)::int FROM hardware_purchase_invoices) AS hardware_total`,
    );
    console.log("after:", after.rows[0]);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
