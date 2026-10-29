require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg and records it in _prisma_migrations, all in one
// transaction. Pass --dry-run to run everything and then roll back.
const MIGRATION_NAME = "20261029120000_invoice_sheet_and_file_names";
const DRY_RUN = process.argv.includes("--dry-run");
const sqlPath = path.join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  MIGRATION_NAME,
  "migration.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");
const checksum = crypto.createHash("sha256").update(sql).digest("hex");

const TABLES = ["vendor_invoices", "hardware_purchase_invoices"];
const COLUMNS = ["invoicePdfName", "invoiceSheetKey", "invoiceSheetName"];

const columnsPresent = async (client) =>
  (
    await client.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1) AND column_name = ANY($2)`,
      [TABLES, COLUMNS],
    )
  ).rows;

const rowCounts = async (client) =>
  (
    await client.query(
      `SELECT (SELECT count(*) FROM "vendor_invoices")::int AS vendor,
              (SELECT count(*) FROM "hardware_purchase_invoices")::int AS hardware`,
    )
  ).rows[0];

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");

    const already = await client.query(
      `SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1`,
      [MIGRATION_NAME],
    );
    if (already.rows.length > 0) {
      console.log("Migration already recorded, skipping.");
      await client.query("ROLLBACK");
      return;
    }
    const existing = await columnsPresent(client);
    if (existing.length > 0) {
      throw new Error(
        `Columns already exist: ${JSON.stringify(existing)} - not applying`,
      );
    }

    const before = await rowCounts(client);
    console.log("Row counts before:", before);

    await client.query(sql);

    const added = await columnsPresent(client);
    if (added.length !== TABLES.length * COLUMNS.length) {
      throw new Error(`Expected 6 new columns, found ${added.length}`);
    }
    const after = await rowCounts(client);
    if (after.vendor !== before.vendor || after.hardware !== before.hardware) {
      throw new Error(`Row counts changed: ${JSON.stringify(after)}`);
    }
    console.log("Columns added:", added.length, "| row counts unchanged");

    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, now(), $3, NULL, NULL, now(), 1)`,
      [crypto.randomUUID(), checksum, MIGRATION_NAME],
    );

    if (DRY_RUN) {
      await client.query("ROLLBACK");
      console.log("Dry run OK - rolled back:", MIGRATION_NAME);
      return;
    }
    await client.query("COMMIT");
    console.log("Migration applied and recorded:", MIGRATION_NAME);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
