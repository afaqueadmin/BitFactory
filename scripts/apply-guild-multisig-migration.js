require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg in one transaction and records it in _prisma_migrations.
// --dry-run runs everything, including the checks, then rolls back.
//
// Multisig guild payouts: the AWAITING_SIGNATURE / CANCELLED batch statuses,
// six GUILD_PAYOUT_* audit actions, new columns on guild_payout_settings and
// guild_payout_batches, and the guild_wallet_coins and guild_payout_approvers
// tables. Add-only: nothing existing is changed.
//
// Runs only on the Neon test branch, unless --production is given; then
// only on production. Any other database is refused.
const MIGRATION_NAME = "20261031120000_guild_multisig_payouts";
const TEST_HOST = "ep-young-block";
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
const BATCH_STATUSES = ["AWAITING_SIGNATURE", "CANCELLED"];
const AUDIT_ACTIONS = [
  "GUILD_PAYOUT_WALLET_CONFIGURED",
  "GUILD_PAYOUT_APPROVERS_UPDATED",
  "GUILD_PAYOUT_PREPARED",
  "GUILD_PAYOUT_SIGNED",
  "GUILD_PAYOUT_BROADCAST",
  "GUILD_PAYOUT_CANCELLED",
];
const TABLES = ["guild_wallet_coins", "guild_payout_approvers"];
const COLUMNS = {
  guild_payout_settings: ["appKeyEncrypted", "maxFeeRateSatVb"],
  guild_payout_batches: [
    "guildId",
    "psbt",
    "signedById",
    "signedAt",
    "signerDevice",
    "cancelledById",
    "cancelledAt",
  ],
};
// Existing guild tables whose row counts must not change.
const COUNTED = [
  "guilds",
  "guild_payout_settings",
  "guild_payout_batches",
  "guild_distributions",
];

function databaseHost() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new URL(url).hostname;
}

async function counts(client) {
  const r = await client.query(
    COUNTED.map(
      (t) => `SELECT '${t}' AS t, count(*)::int AS n FROM "${t}"`,
    ).join(" UNION ALL "),
  );
  return Object.fromEntries(r.rows.map((x) => [x.t, x.n]));
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

  const statusesBefore = (
    await client.query(ENUM_VALUES("GuildPayoutBatchStatus"))
  ).rows.map((r) => r.enumlabel);
  console.log("Batch statuses before:", statusesBefore.join(", "));
  if (BATCH_STATUSES.some((s) => statusesBefore.includes(s))) {
    throw new Error("A new batch status already exists - rolling back");
  }
  const before = await counts(client);
  console.log("Row counts before:", JSON.stringify(before));

  console.log("Running migration.sql ...");
  await client.query(sql);

  const statuses = (
    await client.query(ENUM_VALUES("GuildPayoutBatchStatus"))
  ).rows.map((r) => r.enumlabel);
  console.log("Batch statuses after:", statuses.join(", "));
  if (!BATCH_STATUSES.every((s) => statuses.includes(s))) {
    throw new Error("Batch statuses missing - rolling back");
  }

  const actions = (await client.query(ENUM_VALUES("AuditAction"))).rows.map(
    (r) => r.enumlabel,
  );
  const added = AUDIT_ACTIONS.filter((a) => actions.includes(a));
  console.log(`New audit actions: ${added.length} of ${AUDIT_ACTIONS.length}`);
  if (added.length !== AUDIT_ACTIONS.length) {
    throw new Error("Audit actions missing - rolling back");
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

  for (const [table, columns] of Object.entries(COLUMNS)) {
    const r = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1
         AND column_name = ANY($2)`,
      [table, columns],
    );
    console.log(`${table}: ${r.rows.length} of ${columns.length} new columns`);
    if (r.rows.length !== columns.length) {
      throw new Error(`Columns missing on ${table} - rolling back`);
    }
  }

  const after = await counts(client);
  console.log("Row counts after:", JSON.stringify(after));
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error("Existing row counts changed - rolling back");
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
    await migrate(client);
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
