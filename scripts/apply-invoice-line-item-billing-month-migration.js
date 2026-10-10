// Applies prisma/migrations/20261010090000_invoice_line_item_billing_month and
// records its _prisma_migrations row (`prisma migrate` can't reach Neon from
// the dev machine, P1001).
//
// Adds a nullable column, so it is safe to run before the code that uses it
// is deployed. Run it BEFORE that deploy: the new Prisma client selects
// invoice_line_items."billingMonth" and fails if the column is missing.
//
//   node scripts/apply-invoice-line-item-billing-month-migration.js            # preflight only
//   node scripts/apply-invoice-line-item-billing-month-migration.js --apply
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20261010090000_invoice_line_item_billing_month";
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
  `ALTER TABLE "invoice_line_items" ADD COLUMN "billingMonth" TIMESTAMP(3)`,
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
         (SELECT count(*)::int FROM invoice_line_items) AS line_items,
         (SELECT count(*)::int FROM invoice_line_items WHERE "lineItemType" = 'HOSTING_COLOCATION') AS hosting_rows,
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'invoice_line_items' AND column_name = 'billingMonth'
         ) AS column_exists`,
    );
    const counts = preflight.rows[0];
    console.log("preflight:", counts);
    if (counts.column_exists) {
      throw new Error(
        "invoice_line_items.billingMonth already exists but the migration is not recorded. Stopping.",
      );
    }

    if (!apply) {
      console.log("Preflight passed. Re-run with --apply to add the column.");
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
      `SELECT count(*)::int AS line_items,
              count("billingMonth")::int AS with_billing_month
       FROM invoice_line_items`,
    );
    console.log("after:", after.rows[0]);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
