require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg in one transaction and records it in _prisma_migrations.
// --dry-run runs everything, including the checks, then rolls back.
//
// Adds the GUILDMASTER segment, the GUILD_MEMBER_ADD_* / _REMOVE_* audit
// actions and the guild member change request tables.
//
// --backfill (run after the migration is applied, in its own transaction -
// a new enum value can't be used in the transaction that adds it) moves every
// Guildmaster onto the GUILDMASTER segment. With --dry-run it lists the rows
// and rolls back.
//
// Runs only on the Neon test branch, unless --production is given; then
// only on production. Any other database is refused.
const MIGRATION_NAME = "20261028120000_guild_segment_and_member_requests";
const TEST_HOST = "ep-polished-surf";
const PRODUCTION_HOST = "ep-misty-fog";
const DRY_RUN = process.argv.includes("--dry-run");
const BACKFILL = process.argv.includes("--backfill");
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
const AUDIT_MEMBER_ACTIONS = 8;
const TABLES = [
  "guild_member_change_requests",
  "guild_member_change_request_lines",
];

function databaseHost() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new URL(url).hostname;
}

async function migrate(client) {
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

  const before = (await client.query(ENUM_VALUES("Segment"))).rows.map(
    (r) => r.enumlabel,
  );
  console.log("Segment values before:", before.join(", "));
  if (before.includes("GUILDMASTER")) {
    throw new Error("GUILDMASTER segment already exists - rolling back");
  }

  console.log("Running migration.sql ...");
  await client.query(sql);

  const after = (await client.query(ENUM_VALUES("Segment"))).rows.map(
    (r) => r.enumlabel,
  );
  console.log("Segment values after:", after.join(", "));
  if (
    after.length !== before.length + 1 ||
    after[after.length - 1] !== "GUILDMASTER"
  ) {
    throw new Error("Unexpected Segment values - rolling back");
  }

  const memberActions = (await client.query(ENUM_VALUES("AuditAction"))).rows
    .map((r) => r.enumlabel)
    .filter(
      (v) =>
        v.startsWith("GUILD_MEMBER_ADD_") ||
        v.startsWith("GUILD_MEMBER_REMOVE_"),
    );
  console.log(
    `GUILD_MEMBER_ADD_* / _REMOVE_* audit actions: ${memberActions.length}`,
  );
  if (memberActions.length !== AUDIT_MEMBER_ACTIONS) {
    throw new Error("Unexpected AuditAction values - rolling back");
  }

  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ANY($1)`,
    [TABLES],
  );
  const found = tables.rows.map((r) => r.table_name).sort();
  console.log("New tables:", found.join(", "));
  if (found.length !== TABLES.length) {
    throw new Error("Not every table was created - rolling back");
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
}

async function backfill(client) {
  const applied = await client.query(
    `SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1`,
    [MIGRATION_NAME],
  );
  if (applied.rows.length === 0) {
    throw new Error("Apply the migration first, then run --backfill");
  }

  await client.query("BEGIN");
  const rows = await client.query(
    `SELECT id, email, segment FROM users
     WHERE role = 'GUILDMASTER' AND segment IS DISTINCT FROM 'GUILDMASTER'
     ORDER BY email`,
  );
  console.log(
    `Guildmasters to move onto the GUILDMASTER segment: ${rows.rows.length}`,
  );
  for (const r of rows.rows) {
    console.log(`  ${r.email}: ${r.segment ?? "(none)"} -> GUILDMASTER`);
  }
  const updated = await client.query(
    `UPDATE users SET segment = 'GUILDMASTER'
     WHERE role = 'GUILDMASTER' AND segment IS DISTINCT FROM 'GUILDMASTER'`,
  );
  if (updated.rowCount !== rows.rows.length) {
    throw new Error("Row count changed while updating - rolling back");
  }

  if (DRY_RUN) {
    await client.query("ROLLBACK");
    console.log("Dry run OK - rolled back the backfill");
  } else {
    await client.query("COMMIT");
    console.log(`Backfill committed: ${updated.rowCount} row(s)`);
  }
}

(async () => {
  const host = databaseHost();
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

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (BACKFILL) await backfill(client);
    else await migrate(client);
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
