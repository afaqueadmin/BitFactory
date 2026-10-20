require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg in one transaction and records it in _prisma_migrations.
// --dry-run runs everything, including the checks, then rolls back.
const MIGRATION_NAME = "20261020120000_simulated_accounts_ledger";
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

    const settings = await client.query(
      `SELECT "sourceMinerId", "displayName", "welcomeBonusUsd", "ratePerKwh" FROM "simulation_settings"`,
    );
    console.log("Settings seeded:", settings.rows);
    const ledger = await client.query(
      `SELECT count(*)::int AS n FROM "simulated_cost_payments"`,
    );
    console.log(`simulated_cost_payments rows: ${ledger.rows[0].n}`);
    if (settings.rows.length !== 1 || ledger.rows[0].n !== 0) {
      throw new Error("Unexpected result - rolling back");
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
