require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg in one transaction and records it in _prisma_migrations.
// --dry-run runs everything, including the backfill checks, then rolls back.
//
// The migration creates vendor_payment_parts and backfills one part per
// vendor invoice / hardware purchase that has legacy payment details. The
// checks below confirm every such invoice got exactly one part and that the
// backfilled USD totals equal the legacy paymentAmountUsd.
const MIGRATION_NAME = "20261020130000_vendor_payment_parts";
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

// Invoices the backfill should copy (same WHERE as migration.sql).
const legacyWhere = `"paymentEntityId" IS NOT NULL AND "paymentBankId" IS NOT NULL
  AND "paymentCurrencyId" IS NOT NULL AND "paymentAmount" IS NOT NULL
  AND "paymentExchangeRate" IS NOT NULL AND "paymentExchangeRate" > 0`;

(async () => {
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

    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");

    console.log("Running migration.sql ...");
    await client.query(sql);

    for (const [table, fk] of [
      ["vendor_invoices", "vendorInvoiceId"],
      ["hardware_purchase_invoices", "hardwarePurchaseId"],
    ]) {
      const expected = await client.query(
        `SELECT count(*)::int AS n, COALESCE(sum("paymentAmountUsd"), 0)::text AS usd
         FROM "${table}" WHERE ${legacyWhere}`,
      );
      const skipped = await client.query(
        `SELECT count(*)::int AS n FROM "${table}"
         WHERE "paymentStatus" = 'Paid' AND NOT (${legacyWhere})`,
      );
      const parts = await client.query(
        `SELECT count(*)::int AS n, count(DISTINCT "${fk}")::int AS invoices,
                COALESCE(sum("amountUsd"), 0)::text AS usd
         FROM "vendor_payment_parts" WHERE "${fk}" IS NOT NULL`,
      );
      const e = expected.rows[0];
      const p = parts.rows[0];
      console.log(
        `${table}: ${e.n} with payment details (USD ${e.usd}), ` +
          `${skipped.rows[0].n} paid without details (skipped); ` +
          `parts created: ${p.n} for ${p.invoices} invoices (USD ${p.usd})`,
      );
      if (p.n !== e.n || p.invoices !== e.n) {
        throw new Error(`${table}: part count mismatch - rolling back`);
      }
      // A null legacy paymentAmountUsd is recomputed, so only compare when
      // every row had one.
      const nullUsd = await client.query(
        `SELECT count(*)::int AS n FROM "${table}"
         WHERE ${legacyWhere} AND "paymentAmountUsd" IS NULL`,
      );
      if (nullUsd.rows[0].n === 0 && Number(p.usd) !== Number(e.usd)) {
        throw new Error(`${table}: USD total mismatch - rolling back`);
      }
    }

    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, now(), $3, NULL, NULL, now(), 1)`,
      [crypto.randomUUID(), checksum, MIGRATION_NAME],
    );

    if (DRY_RUN) {
      await client.query("ROLLBACK");
      console.log("Dry run OK - rolled back:", MIGRATION_NAME);
    } else {
      await client.query("COMMIT");
      console.log("Migration applied and recorded:", MIGRATION_NAME);
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
