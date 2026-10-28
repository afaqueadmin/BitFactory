require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg in one transaction and records it in _prisma_migrations.
// --dry-run runs everything, including the checks, then rolls back.
//
// Adds the GUILDMASTER / GUILDMEMBER roles, the GUILD_* audit actions, the
// guild enums and the guild tables (including payout batches and settings).
// Nothing existing is changed, so there is no backfill to check.
//
// Runs only on the Neon test branch, unless --production is given; then
// only on production. Any other database is refused.
const MIGRATION_NAME = "20261026120000_guilds";
const TEST_HOST = "ep-polished-surf";
const PRODUCTION_HOST = "ep-misty-fog";
const DRY_RUN = process.argv.includes("--dry-run");
const PRODUCTION = process.argv.includes("--production");
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

// A new enum value can't be read in the same transaction (55P04), so check
// pg_enum instead of enum_range().
const ENUM_VALUES = (type) => `SELECT e.enumlabel FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = '${type}' ORDER BY e.enumsortorder`;
const ROLE_VALUES = ENUM_VALUES("Role");
const AUDIT_GUILD_ACTIONS = 17;

const TABLES = [
  "guilds",
  "guild_memberships",
  "guild_wallet_change_requests",
  "guild_split_change_requests",
  "guild_split_change_request_lines",
  "guild_distributions",
  "guild_distribution_lines",
  "guild_payout_batches",
  "guild_payout_settings",
];

function checkHost() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const host = new URL(url).hostname;
  console.log("Database host:", host, PRODUCTION ? "(PRODUCTION)" : "");
  if (PRODUCTION) {
    if (!host.includes(PRODUCTION_HOST)) {
      throw new Error(
        "--production given, but the database isn't " + PRODUCTION_HOST,
      );
    }
  } else if (host.includes(PRODUCTION_HOST)) {
    throw new Error("Refusing to run against production without --production");
  } else if (!host.includes(TEST_HOST)) {
    throw new Error(
      "Refusing to run: the database isn't the test branch " + TEST_HOST,
    );
  }
}

(async () => {
  checkHost();
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

    const before = (await client.query(ROLE_VALUES)).rows.map(
      (r) => r.enumlabel,
    );
    console.log("Role values before:", before.join(", "));
    if (before.includes("GUILDMASTER") || before.includes("GUILDMEMBER")) {
      throw new Error("Guild roles already exist - rolling back");
    }

    console.log("Running migration.sql ...");
    await client.query(sql);

    const after = (await client.query(ROLE_VALUES)).rows.map(
      (r) => r.enumlabel,
    );
    console.log("Role values after:", after.join(", "));
    if (
      after.length !== before.length + 2 ||
      after[after.length - 2] !== "GUILDMASTER" ||
      after[after.length - 1] !== "GUILDMEMBER"
    ) {
      throw new Error("Unexpected Role values - rolling back");
    }

    const auditGuild = (await client.query(ENUM_VALUES("AuditAction"))).rows
      .map((r) => r.enumlabel)
      .filter((v) => v.startsWith("GUILD_"));
    console.log(`GUILD_* audit actions: ${auditGuild.length}`);
    if (auditGuild.length !== AUDIT_GUILD_ACTIONS) {
      throw new Error("Unexpected AuditAction values - rolling back");
    }

    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1)`,
      [TABLES],
    );
    const found = tables.rows.map((r) => r.table_name).sort();
    console.log("Guild tables:", found.join(", "));
    if (found.length !== TABLES.length) {
      throw new Error("Not every guild table was created - rolling back");
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
