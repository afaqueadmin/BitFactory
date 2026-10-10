// Applies prisma/migrations/20261011090000_hardware_repair_invoices and
// records its _prisma_migrations row (`prisma migrate` can't reach Neon from
// the dev machine, P1001).
//
// Additive only: three new enum values, invoices.minerId (nullable),
// invoices.discountAmount (NOT NULL DEFAULT 0 - existing rows read 0, no
// table rewrite on PG 11+), miner_repair_notes.invoiceId (nullable, unique),
// and their indexes / foreign keys. Safe to run before the code that uses it
// is deployed; run it BEFORE that deploy, since the new Prisma client selects
// these columns.
//
// The migration file's own SQL is executed as-is inside one transaction, so
// what is recorded in _prisma_migrations is exactly what ran.
//
//   node scripts/apply-hardware-repair-invoices-migration.js            # preflight only
//   node scripts/apply-hardware-repair-invoices-migration.js --apply
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20261011090000_hardware_repair_invoices";
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

    const version = Number(
      (await client.query(`SHOW server_version_num`)).rows[0]
        .server_version_num,
    );
    const preflight = await client.query(
      `SELECT
         (SELECT count(*)::int FROM invoices) AS invoices,
         (SELECT count(*)::int FROM miner_repair_notes) AS repair_notes,
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name IN ('minerId', 'discountAmount')) AS invoice_cols_exist,
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'miner_repair_notes' AND column_name = 'invoiceId') AS note_col_exists,
         EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE e.enumlabel IN ('HARDWARE_REPAIR', 'REPAIR')
                   AND t.typname IN ('PaymentType', 'InvoiceType', 'InvoiceLineItemType')) AS enum_values_exist`,
    );
    const state = { server_version_num: version, ...preflight.rows[0] };
    console.log("preflight:", state);

    if (version < 120000) {
      throw new Error(
        "PostgreSQL 12+ is required (ALTER TYPE ADD VALUE inside a transaction). Stopping.",
      );
    }
    if (
      state.invoice_cols_exist ||
      state.note_col_exists ||
      state.enum_values_exist
    ) {
      throw new Error(
        "Some of this migration's objects already exist but it is not recorded. Stopping.",
      );
    }

    if (!apply) {
      console.log("Preflight passed. Re-run with --apply to apply it.");
      return;
    }

    await client.query("BEGIN");
    try {
      const startedAt = new Date();
      await client.query(sql.toString("utf8"));
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
      `SELECT
         (SELECT count(*)::int FROM invoices) AS invoices,
         (SELECT count(*)::int FROM invoices WHERE "minerId" IS NOT NULL) AS invoices_with_miner,
         (SELECT count(*)::int FROM invoices WHERE "discountAmount" <> 0) AS invoices_with_discount,
         (SELECT count(*)::int FROM miner_repair_notes) AS repair_notes,
         (SELECT count(*)::int FROM miner_repair_notes WHERE "invoiceId" IS NOT NULL) AS notes_with_invoice`,
    );
    console.log("after:", after.rows[0]);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
