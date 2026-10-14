// Applies prisma/migrations/20261014090000_user_logins and records its
// _prisma_migrations row, because `prisma migrate` can't reach Neon from the
// dev machine (P1001).
//
// Multi-login accounts: creates user_logins, backfills one primary login per
// existing user (copying email, password, sessionsValidAfter), attaches every
// two_factor_auth and webauthn_credentials row to its user's primary login,
// and adds nullable loginId columns to user_activities and user_sessions.
//
// Safety: one REPEATABLE READ transaction. users / two_factor_auth /
// webauthn_credentials are write-locked before the snapshot, so nothing can
// change under the backfill. Every pre-existing column of every touched table
// is fingerprinted (row count + hash of all rows) before and after, and the
// backfill is checked row by row; any difference rolls everything back.
//
//   node scripts/apply-user-logins-migration.js --check     allow-list only
//   node scripts/apply-user-logins-migration.js --dry-run   run all, roll back
//   node scripts/apply-user-logins-migration.js             apply
//
// Re-running after it's applied skips.
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20261014090000_user_logins";
const sqlPath = path.join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  MIGRATION_NAME,
  "migration.sql",
);
const sql = fs.readFileSync(sqlPath);
if (sql.includes("\r\n")) {
  throw new Error("migration.sql must be LF-only (matches the repo blob)");
}
const checksum = crypto.createHash("sha256").update(sql).digest("hex");

// The migration file's statements, comments stripped.
const statements = sql
  .toString("utf8")
  .split(/;\s*\n/)
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean);

// Only the expected statements are allowed through: nothing that drops or
// rewrites existing data. The UPDATEs only fill the brand-new loginId columns.
const ALLOWED = [
  /^ALTER TYPE "AuditAction" ADD VALUE 'USER_LOGIN_(ADDED|REMOVED)'$/,
  /^CREATE TABLE "user_logins" \(/,
  /^CREATE (UNIQUE )?INDEX "(user_logins_[A-Za-z_]+|two_factor_auth_(loginId_key|userId_idx)|webauthn_credentials_loginId_idx|user_activities_loginId_idx)" ON "(user_logins|two_factor_auth|webauthn_credentials|user_activities)"/,
  /^ALTER TABLE "(user_logins|two_factor_auth|webauthn_credentials|user_activities|user_sessions)" ADD CONSTRAINT "[A-Za-z_]+_fkey" FOREIGN KEY/,
  /^INSERT INTO "user_logins" \(/,
  /^DROP INDEX "two_factor_auth_userId_key"$/,
  /^ALTER TABLE "(two_factor_auth|webauthn_credentials|user_activities|user_sessions)" ADD COLUMN "loginId" TEXT$/,
  /^UPDATE "(two_factor_auth" t|webauthn_credentials" w) SET "loginId" = l\."id"\nFROM "user_logins" l WHERE l\."userId" = [tw]\."userId" AND l\."isPrimary"$/,
  /^ALTER TABLE "(two_factor_auth|webauthn_credentials)" ALTER COLUMN "loginId" SET NOT NULL$/,
];
for (const stmt of statements) {
  if (!ALLOWED.some((re) => re.test(stmt))) {
    throw new Error(`Unexpected statement:\n${stmt}`);
  }
}
if (statements.length !== 27) {
  throw new Error(`Expected 27 statements, found ${statements.length}`);
}

// Existing tables the migration touches; their existing data must not change.
const TOUCHED = [
  "users",
  "two_factor_auth",
  "webauthn_credentials",
  "user_activities",
  "user_sessions",
];

async function columnsOf(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name);
}

/** Row count + hash over the given columns of every row. */
async function fingerprint(client, table, columns) {
  const cols = columns.map((c) => `"${c}"`).join(",");
  const { rows } = await client.query(
    `SELECT count(*)::int AS n,
            coalesce(md5(string_agg(md5(row(${cols})::text), '' ORDER BY id)), '') AS h
     FROM "${table}"`,
  );
  return rows[0];
}

async function snapshot(client, columnsByTable) {
  const out = {};
  for (const table of TOUCHED) {
    out[table] = await fingerprint(client, table, columnsByTable[table]);
  }
  return out;
}

/** Row-level checks of the backfill. Returns a list of problems. */
async function verifyBackfill(client) {
  const problems = [];
  const one = async (label, query) => {
    const { rows } = await client.query(query);
    const n = rows[0].n;
    if (n !== 0) problems.push(`${label}: ${n}`);
  };
  await one(
    "users without exactly one primary login",
    `SELECT count(*)::int AS n FROM users u
     WHERE (SELECT count(*) FROM user_logins l WHERE l."userId" = u.id AND l."isPrimary") <> 1`,
  );
  await one(
    "logins that aren't a primary copy of their user",
    `SELECT count(*)::int AS n FROM user_logins l JOIN users u ON u.id = l."userId"
     WHERE NOT l."isPrimary"
        OR l.email <> u.email
        OR l.password <> u.password
        OR l."sessionsValidAfter" IS DISTINCT FROM u."sessionsValidAfter"
        OR l."lastLoginAt" IS NOT NULL
        OR l."createdById" IS NOT NULL`,
  );
  await one(
    "login rows not matching user count",
    `SELECT abs((SELECT count(*) FROM user_logins) - (SELECT count(*) FROM users))::int AS n`,
  );
  await one(
    "2FA rows not on their user's primary login",
    `SELECT count(*)::int AS n FROM two_factor_auth t
     LEFT JOIN user_logins l ON l.id = t."loginId"
     WHERE l.id IS NULL OR l."userId" <> t."userId" OR NOT l."isPrimary"`,
  );
  await one(
    "passkeys not on their user's primary login",
    `SELECT count(*)::int AS n FROM webauthn_credentials w
     LEFT JOIN user_logins l ON l.id = w."loginId"
     WHERE l.id IS NULL OR l."userId" <> w."userId" OR NOT l."isPrimary"`,
  );
  await one(
    "activities/sessions with a loginId (should all be null)",
    `SELECT ((SELECT count(*) FROM user_activities WHERE "loginId" IS NOT NULL)
           + (SELECT count(*) FROM user_sessions WHERE "loginId" IS NOT NULL))::int AS n`,
  );
  return problems;
}

if (process.argv.includes("--check")) {
  console.log(`Allow-list OK: ${statements.length} statement(s).`);
  process.exit(0);
}
const DRY_RUN = process.argv.includes("--dry-run");

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
    const { rows: exists } = await client.query(
      `SELECT to_regclass('user_logins') IS NOT NULL AS t`,
    );
    if (exists[0].t) {
      throw new Error(
        "user_logins already exists but the migration isn't recorded",
      );
    }

    // Columns as they are now - only these are compared afterwards.
    const columnsByTable = {};
    for (const table of TOUCHED) {
      columnsByTable[table] = await columnsOf(client, table);
      if (columnsByTable[table].includes("loginId")) {
        throw new Error(`${table}.loginId already exists`);
      }
    }

    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    try {
      await client.query("SET LOCAL lock_timeout = '10s'");
      // Before the first read, so the snapshot and the backfill see the same
      // rows: blocks writes (reads continue) to the tables the backfill copies.
      await client.query(
        `LOCK TABLE users, two_factor_auth, webauthn_credentials IN SHARE MODE`,
      );

      const before = await snapshot(client, columnsByTable);
      console.log("before:", before);

      const startedAt = new Date();
      for (const stmt of statements) {
        await client.query(stmt);
      }

      const after = await snapshot(client, columnsByTable);
      console.log("after: ", after);
      for (const table of TOUCHED) {
        if (
          before[table].n !== after[table].n ||
          before[table].h !== after[table].h
        ) {
          throw new Error(`${table}: existing data changed`);
        }
      }

      const problems = await verifyBackfill(client);
      if (problems.length > 0) {
        throw new Error(`Backfill check failed:\n  ${problems.join("\n  ")}`);
      }
      const { rows: summary } = await client.query(
        `SELECT (SELECT count(*) FROM user_logins)::int AS logins,
                (SELECT count(*) FROM two_factor_auth)::int AS two_factor,
                (SELECT count(*) FROM webauthn_credentials)::int AS passkeys`,
      );
      console.log("backfill:", summary[0]);

      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES ($1, $2, now(), $3, NULL, NULL, $4, 1)`,
        [crypto.randomUUID(), checksum, MIGRATION_NAME, startedAt],
      );

      if (DRY_RUN) {
        await client.query("ROLLBACK");
        console.log(
          "DRY RUN: all checks passed; rolled back, nothing changed.",
        );
        return;
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    const { rows: count } = await client.query(
      `SELECT count(*)::int AS n FROM "_prisma_migrations"`,
    );
    console.log(
      `Applied ${MIGRATION_NAME}; existing data unchanged. _prisma_migrations rows: ${count[0].n}`,
    );
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
