require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg in one transaction and records it in _prisma_migrations.
//
// Internal bank transfers: the accounting_bank_transfers table and three
// audit actions. Add-only: nothing existing is changed.
//
// Production first (the owner asked for prod): it refuses any host but
// ep-misty-fog, and does a dry run (everything, checks included, then rolled
// back) unless --apply is given. DATABASE_URL must be set in the shell to
// the prod URL; .env points at a test branch.
//
//   node scripts/apply-bank-transfers-migration.js           dry run
//   node scripts/apply-bank-transfers-migration.js --apply   apply
const MIGRATION_NAME = "20261110120000_bank_transfers";
const PRODUCTION_HOST = "ep-misty-fog";
const APPLY = process.argv.includes("--apply");

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
const AUDIT_ACTIONS = [
  "BANK_TRANSFER_RECORDED",
  "BANK_TRANSFER_UPDATED",
  "BANK_TRANSFER_DELETED",
];
const TABLE = "accounting_bank_transfers";
// Existing tables whose row counts must not change.
const COUNTED = ["accounting_banks", "accounting_currencies", "users"];

async function counts(client) {
  const r = await client.query(
    COUNTED.map(
      (t) => `SELECT '${t}' AS t, count(*)::int AS n FROM "${t}"`,
    ).join(" UNION ALL "),
  );
  return Object.fromEntries(r.rows.map((x) => [x.t, x.n]));
}

async function migrate(client) {
  // The database must be level with the code before this one.
  const folders = fs
    .readdirSync(path.join(__dirname, "..", "prisma", "migrations"), {
      withFileTypes: true,
    })
    .filter((d) => d.isDirectory() && d.name !== MIGRATION_NAME)
    .map((d) => d.name);
  const recorded = (
    await client.query(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    )
  ).rows.map((r) => r.migration_name);
  if (recorded.includes(MIGRATION_NAME)) {
    console.log("Migration already recorded, skipping.");
    return;
  }
  const missing = folders.filter((f) => !recorded.includes(f));
  const extra = recorded.filter((r) => !folders.includes(r));
  console.log(
    `Migrations: ${folders.length} folders before this one, ${recorded.length} recorded`,
  );
  if (missing.length) throw new Error(`Not applied yet: ${missing.join(", ")}`);
  if (extra.length)
    console.log(`Recorded but not in this branch: ${extra.join(", ")}`);

  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '10s'");

  const exists = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = $1`,
    [TABLE],
  );
  if (exists.rowCount) throw new Error(`${TABLE} already exists`);

  const before = await counts(client);
  console.log("Row counts before:", JSON.stringify(before));

  console.log("Running migration.sql ...");
  await client.query(sql);

  const actions = (await client.query(ENUM_VALUES("AuditAction"))).rows.map(
    (r) => r.enumlabel,
  );
  const added = AUDIT_ACTIONS.filter((a) => actions.includes(a));
  console.log(`New audit actions: ${added.length} of ${AUDIT_ACTIONS.length}`);
  if (added.length !== AUDIT_ACTIONS.length) {
    throw new Error("Audit actions missing - rolling back");
  }

  const columns = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1`,
    [TABLE],
  );
  console.log(`New table ${TABLE}: ${columns.rowCount} columns`);
  if (columns.rowCount !== 22) {
    throw new Error("Unexpected column count - rolling back");
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

  if (APPLY) {
    await client.query("COMMIT");
    console.log("Migration applied and recorded:", MIGRATION_NAME);
  } else {
    await client.query("ROLLBACK");
    console.log("Dry run OK - rolled back:", MIGRATION_NAME);
  }
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const host = new URL(url).hostname;
  console.log("Database host:", host, APPLY ? "(APPLY)" : "(DRY RUN)");
  if (!host.includes(PRODUCTION_HOST)) {
    throw new Error(
      `Refusing to run: the database isn't production (${PRODUCTION_HOST})`,
    );
  }

  const client = new Client({ connectionString: url });
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
  console.error(e.message ?? e);
  process.exit(1);
});
