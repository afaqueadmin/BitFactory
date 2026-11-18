require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg in one transaction and records it in _prisma_migrations.
//
// Staff access rules: staff_access_rules / staff_access_windows /
// staff_holidays / staff_time_requests, two enums, five audit actions, three
// nullable columns on webauthn_credentials and a partial unique index.
// Add-only: nothing existing is changed or dropped, so the code running before
// this deploy keeps working.
//
// Targets:
//   --target=test (default)  the active DATABASE_URL, must be ep-green-haze.
//                            That branch lags prod-only migrations; they are
//                            listed but don't block (these tables don't
//                            depend on them).
//   --target=prod            ep-misty-fog, from the commented DATABASE_URL line
//                            in .env (DATABASE_URL in the shell wins). Must be
//                            level with every earlier migration.
// Dry run (everything, checks included, then rolled back) unless --apply.
//
//   node scripts/apply-staff-access-rules-migration.js                  dry run, test
//   node scripts/apply-staff-access-rules-migration.js --apply          apply, test
//   node scripts/apply-staff-access-rules-migration.js --target=prod    dry run, prod
const MIGRATION_NAME = "20261118120000_staff_access_rules";
const HOSTS = { test: "ep-green-haze", prod: "ep-misty-fog" };
const APPLY = process.argv.includes("--apply");
const TARGET = (
  process.argv.find((a) => a.startsWith("--target=")) || "--target=test"
).split("=")[1];
if (!HOSTS[TARGET]) throw new Error(`Unknown target ${TARGET}`);

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
  "STAFF_ACCESS_RULE_UPDATED",
  "STAFF_ACCESS_TIME_ADDED",
  "STAFF_ACCESS_EXCEPTION_SET",
  "STAFF_ACCESS_PASSKEY_REMOVED",
  "STAFF_HOLIDAY_UPDATED",
];
// New tables and their column counts.
const TABLES = {
  staff_access_rules: 11,
  staff_access_windows: 8,
  staff_holidays: 6,
  staff_time_requests: 9,
};
const NEW_COLUMNS = [
  ["webauthn_credentials", "deviceType"],
  ["webauthn_credentials", "backedUp"],
  ["webauthn_credentials", "attachment"],
];
// Existing tables whose row counts must not change.
const COUNTED = ["users", "webauthn_credentials", "audit_logs"];

function databaseUrl() {
  const host = HOSTS[TARGET];
  if (process.env.DATABASE_URL?.includes(host)) return process.env.DATABASE_URL;
  if (TARGET === "prod") {
    const line = fs
      .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
      .split(/\r?\n/)
      .find((l) => /^#\s*DATABASE_URL=/.test(l) && l.includes(host));
    if (line)
      return line.replace(/^#\s*DATABASE_URL=/, "").replace(/^"|"$/g, "");
  }
  throw new Error(`No DATABASE_URL for ${TARGET} (${host}) found`);
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
  console.log(
    `Migrations: ${folders.length} folders before this one, ${recorded.length} recorded`,
  );
  if (missing.length) {
    if (TARGET === "prod") {
      throw new Error(`Not applied yet: ${missing.join(", ")}`);
    }
    console.log(
      `Not applied on this test branch (prod-only, not needed here): ${missing.join(", ")}`,
    );
  }

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

  for (const [table, column] of NEW_COLUMNS) {
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
  console.log(
    `webauthn_credentials: ${NEW_COLUMNS.length} columns added, all nullable`,
  );

  const partial = await client.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'staff_holidays_office_date_key'`,
  );
  if (!partial.rows[0]?.indexdef.includes("WHERE")) {
    throw new Error("Office-holiday partial index missing - rolling back");
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
  const url = databaseUrl();
  const host = new URL(url).hostname;
  console.log(
    `Target: ${TARGET}. Database host:`,
    host,
    APPLY ? "(APPLY)" : "(DRY RUN)",
  );
  if (!host.includes(HOSTS[TARGET])) {
    throw new Error(`Refusing to run: host isn't ${HOSTS[TARGET]}`);
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
