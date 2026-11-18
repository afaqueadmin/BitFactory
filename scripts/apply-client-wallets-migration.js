require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg in one transaction and records it in _prisma_migrations.
//
// Client wallets: client_wallets / client_wallet_history /
// client_wallet_mismatches, three enums, seven audit actions, and a nullable
// "…Hash" column beside every wallet address column. Add-only: nothing
// existing is changed or dropped, so the code running before this deploy
// keeps working.
//
// Production only (decided 2026-11-17): refuses any host but ep-misty-fog,
// and does a dry run (everything, checks included, then rolled back) unless
// --apply is given. The prod URL is the commented DATABASE_URL line in .env
// (DATABASE_URL in the shell wins).
//
//   node scripts/apply-client-wallets-migration.js           dry run
//   node scripts/apply-client-wallets-migration.js --apply   apply
const MIGRATION_NAME = "20261117120000_client_wallets";
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
if (sql.includes("\r")) throw new Error("migration.sql must use LF endings");
const checksum = crypto.createHash("sha256").update(sql).digest("hex");

const ENUM_VALUES = (type) => `SELECT e.enumlabel FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = '${type}' ORDER BY e.enumsortorder`;
const AUDIT_ACTIONS = [
  "CLIENT_WALLET_SYNCED",
  "CLIENT_WALLET_UPDATED",
  "CLIENT_WALLET_MISMATCH_DETECTED",
  "CLIENT_WALLET_MISMATCH_ACCEPTED",
  "CLIENT_WALLET_MISMATCH_FIXED",
  "CLIENT_WALLET_RECHECKED",
  "CLIENT_WALLET_HISTORY_VIEWED",
];
// New tables and their column counts.
const TABLES = {
  client_wallets: 12,
  client_wallet_history: 12,
  client_wallet_mismatches: 15,
};
// New hash columns on existing tables.
const HASH_COLUMNS = [
  ["wallet_change_requests", "currentAddressHash"],
  ["wallet_change_requests", "requestedAddressHash"],
  ["guilds", "payoutAddressHash"],
  ["guild_memberships", "walletAddressHash"],
  ["guild_wallet_change_requests", "currentAddressHash"],
  ["guild_wallet_change_requests", "requestedAddressHash"],
  ["guild_member_change_requests", "newWalletAddressHash"],
  ["guild_distribution_lines", "walletSnapshotHash"],
  ["pool_transactions", "addressHash"],
];
// Existing tables whose row counts must not change.
const COUNTED = [
  "wallet_change_requests",
  "guilds",
  "guild_memberships",
  "guild_wallet_change_requests",
  "guild_member_change_requests",
  "guild_distribution_lines",
  "pool_transactions",
  "pool_subaccounts",
  "users",
];

function productionUrl() {
  if (process.env.DATABASE_URL?.includes(PRODUCTION_HOST)) {
    return process.env.DATABASE_URL;
  }
  const line = fs
    .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split(/\r?\n/)
    .find((l) => /^#\s*DATABASE_URL=/.test(l) && l.includes(PRODUCTION_HOST));
  if (!line) throw new Error("Prod DATABASE_URL not found");
  return line.replace(/^#\s*DATABASE_URL=/, "").replace(/^"|"$/g, "");
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
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ANY($1)`,
    [Object.keys(TABLES)],
  );
  if (exists.rowCount) {
    throw new Error(
      `Already exists: ${exists.rows.map((r) => r.table_name).join(", ")}`,
    );
  }

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

  for (const [table, expected] of Object.entries(TABLES)) {
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1`,
      [table],
    );
    console.log(`New table ${table}: ${columns.rowCount} columns`);
    if (columns.rowCount !== expected) {
      throw new Error(
        `Unexpected column count on ${table} (expected ${expected}) - rolling back`,
      );
    }
  }

  for (const [table, column] of HASH_COLUMNS) {
    const c = await client.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
      [table, column],
    );
    if (c.rows[0]?.is_nullable !== "YES") {
      throw new Error(
        `${table}.${column} missing or not nullable - rolling back`,
      );
    }
  }
  console.log(`Hash columns: ${HASH_COLUMNS.length} added, all nullable`);

  const partial = await client.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'client_wallet_mismatches_open_key'`,
  );
  if (!partial.rows[0]?.indexdef.includes("WHERE")) {
    throw new Error("Open-mismatch partial index missing - rolling back");
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
  const url = productionUrl();
  const host = new URL(url).hostname;
  console.log("Database host:", host, APPLY ? "(APPLY)" : "(DRY RUN)");
  if (!host.includes(PRODUCTION_HOST)) {
    throw new Error(
      `Refusing to run: the database isn't production (${PRODUCTION_HOST})`,
    );
  }

  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 60000,
  });
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
