require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg in one transaction and records it in _prisma_migrations.
//
// RBAC Phase 1: staff_roles, staff_role_permissions, staff_role_assignments,
// the STAFF role and five audit actions. Add-only: nothing existing changes.
//
// Dry run (everything, checks included, then rolled back) unless --apply.
// Default target is prod (ep-misty-fog, the commented DATABASE_URL line in
// .env; DATABASE_URL in the shell wins). --target=test uses the live
// DATABASE_URL and refuses any host but ep-green-haze.
//
//   node scripts/apply-staff-roles-migration.js --target=test           dry run
//   node scripts/apply-staff-roles-migration.js --target=test --apply   apply
//   node scripts/apply-staff-roles-migration.js [--apply]               prod
const MIGRATION_NAME = "20261121120000_staff_roles";
const PRODUCTION_HOST = "ep-misty-fog";
const TEST_HOST = "ep-green-haze";
const APPLY = process.argv.includes("--apply");
const TEST = process.argv.includes("--target=test");
const HOST = TEST ? TEST_HOST : PRODUCTION_HOST;

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
const NEW_ENUM_VALUES = {
  Role: ["STAFF"],
  AuditAction: [
    "STAFF_ROLE_CREATED",
    "STAFF_ROLE_UPDATED",
    "STAFF_ROLE_DELETED",
    "STAFF_ROLE_ASSIGNED",
    "STAFF_ROLE_UNASSIGNED",
  ],
};
// New tables and their column counts.
const TABLES = {
  staff_roles: 6,
  staff_role_permissions: 2,
  staff_role_assignments: 4,
};
const INDEXES = ["staff_roles_name_key", "staff_role_assignments_roleId_idx"];
// Existing tables whose row counts must not change.
const COUNTED = ["users", "user_logins", "audit_logs", "staff_access_rules"];

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

  for (const [type, values] of Object.entries(NEW_ENUM_VALUES)) {
    const labels = (await client.query(ENUM_VALUES(type))).rows.map(
      (r) => r.enumlabel,
    );
    const added = values.filter((v) => labels.includes(v));
    console.log(`New ${type} values: ${added.length} of ${values.length}`);
    if (added.length !== values.length) {
      throw new Error(`${type} values missing - rolling back`);
    }
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

  const indexes = await client.query(
    `SELECT indexname FROM pg_indexes WHERE indexname = ANY($1)`,
    [INDEXES],
  );
  if (indexes.rowCount !== INDEXES.length) {
    throw new Error("Indexes missing - rolling back");
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
  const url = TEST ? process.env.DATABASE_URL : productionUrl();
  if (!url) throw new Error("DATABASE_URL not set");
  const host = new URL(url).hostname;
  console.log("Database host:", host, APPLY ? "(APPLY)" : "(DRY RUN)");
  if (!host.includes(HOST)) {
    throw new Error(`Refusing to run: the database isn't ${HOST}`);
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
