require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg in one transaction and records it in _prisma_migrations.
// --dry-run runs everything, including the backfill checks, then rolls back.
//
// The migration seeds accounting_vendors from the VendorName enum values in
// use and points every hardware purchase invoice at its vendor. The checks
// below confirm each invoice landed on the vendor its enum value names and
// that no invoice was left without one.
const MIGRATION_NAME = "20261022120000_accounting_vendors_and_deposits";
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

const LABELS = {
  HASHLABS_PTE_LTD: "HashLabs Pte Ltd",
  QRB_LABS: "QRB Labs",
  LUXOR_TECH: "Luxor Tech",
};

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

    const before = await client.query(
      `SELECT "vendorName"::text AS vendor, count(*)::int AS n
       FROM "hardware_purchase_invoices" GROUP BY 1 ORDER BY 1`,
    );
    console.log("Hardware purchases per enum vendor (before):");
    console.table(before.rows);

    console.log("Running migration.sql ...");
    await client.query(sql);

    const vendors = await client.query(
      `SELECT v."name", v."forHardwarePurchases", v."forFarmTariffs",
              u."email" AS "createdBy"
       FROM "accounting_vendors" v JOIN "users" u ON u."id" = v."createdBy"
       ORDER BY v."name"`,
    );
    console.log("Vendors created:");
    console.table(vendors.rows);

    const mapped = await client.query(
      `SELECT h."vendorName"::text AS vendor, v."name", count(*)::int AS n
       FROM "hardware_purchase_invoices" h
       JOIN "accounting_vendors" v ON v."id" = h."vendorId"
       GROUP BY 1, 2 ORDER BY 1`,
    );
    console.log("Hardware purchases per vendor (after):");
    console.table(mapped.rows);

    for (const row of mapped.rows) {
      if (LABELS[row.vendor] !== row.name) {
        throw new Error(`${row.vendor} mapped to "${row.name}" - rolling back`);
      }
    }
    const total = (rows) => rows.reduce((s, r) => s + r.n, 0);
    if (total(mapped.rows) !== total(before.rows)) {
      throw new Error(
        "Not every hardware purchase got a vendor - rolling back",
      );
    }
    if (vendors.rows.length !== before.rows.length) {
      throw new Error("Vendor count != enum values in use - rolling back");
    }

    const deposits = await client.query(
      `SELECT count(*)::int AS n FROM "hardware_purchase_invoices"
       WHERE "securityDeposit" <> 0`,
    );
    const farm = await client.query(
      `SELECT count(*)::int AS total,
              count("vendorId")::int AS "withVendor"
       FROM "vendor_invoices"`,
    );
    console.log(
      `Hardware purchases with a non-zero deposit: ${deposits.rows[0].n}; ` +
        `Farm Tariffs: ${farm.rows[0].total} total, ${farm.rows[0].withVendor} with a vendor`,
    );
    if (deposits.rows[0].n !== 0 || farm.rows[0].withVendor !== 0) {
      throw new Error("Unexpected deposit / Farm Tariff data - rolling back");
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
