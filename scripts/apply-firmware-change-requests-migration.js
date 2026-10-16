// Applies prisma/migrations/20261016120000_add_firmware_change_requests and
// records its _prisma_migrations row, because `prisma migrate` can't reach
// Neon from the dev machine (P1001). Add-only: seven AuditAction enum values,
// the new firmware_options and firmware_change_requests tables with their
// indexes and foreign keys, and the four seeded firmware options. Re-running
// skips.
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20261016120000_add_firmware_change_requests";
const sqlPath = path.join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  MIGRATION_NAME,
  "migration.sql",
);
const sql = fs.readFileSync(sqlPath);
const checksum = crypto.createHash("sha256").update(sql).digest("hex");

// The migration file's statements, comments stripped.
const statements = sql
  .toString("utf8")
  .replace(/\r\n/g, "\n")
  .split(/;\s*\n/)
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean);

// Only the expected kinds of statement are allowed through.
for (const stmt of statements) {
  if (
    !/^ALTER TYPE "AuditAction" ADD VALUE /.test(stmt) &&
    !/^CREATE TABLE "(firmware_options|firmware_change_requests)"/.test(stmt) &&
    !/^CREATE (UNIQUE )?INDEX "(firmware_options|firmware_change_requests)_/.test(
      stmt,
    ) &&
    !/^ALTER TABLE "(firmware_options|firmware_change_requests)" ADD CONSTRAINT /.test(
      stmt,
    ) &&
    !/^INSERT INTO "firmware_options" /.test(stmt)
  ) {
    throw new Error(`Unexpected statement: ${stmt}`);
  }
}

// Fingerprint of tables the new foreign keys / enum touch, to prove existing
// rows are untouched.
const fingerprints = {
  users: `id,email,role,"updatedAt"`,
  miners: `id,name,"userId","updatedAt"`,
  audit_logs: `id,action,"entityType","entityId"`,
};

async function fingerprint(client) {
  const out = {};
  for (const [table, cols] of Object.entries(fingerprints)) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n, md5(string_agg(md5(row(${cols})::text), '' ORDER BY id)) AS h FROM ${table}`,
    );
    out[table] = rows[0];
  }
  return out;
}

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
    const tableExists = await client.query(
      `SELECT to_regclass('public.firmware_options') AS a, to_regclass('public.firmware_change_requests') AS b`,
    );
    if (tableExists.rows[0].a || tableExists.rows[0].b) {
      throw new Error("Table already exists but migration is not recorded");
    }

    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    try {
      await client.query("SET LOCAL lock_timeout = '10s'");
      const before = await fingerprint(client);
      console.log("before:", before);

      const startedAt = new Date();
      for (const stmt of statements) {
        await client.query(stmt);
      }

      const after = await fingerprint(client);
      console.log("after:", after);
      for (const table of Object.keys(fingerprints)) {
        if (
          before[table].h !== after[table].h ||
          before[table].n !== after[table].n
        ) {
          throw new Error(`${table} existing data changed`);
        }
      }

      // The seed needs a SUPER_ADMIN to attribute the options to - if there
      // was none, nothing was inserted, so stop rather than ship an empty list.
      const seeded = await client.query(
        `SELECT name FROM "firmware_options" ORDER BY name`,
      );
      console.log(
        "seeded firmware options:",
        seeded.rows.map((r) => r.name),
      );
      if (seeded.rows.length !== 4) {
        throw new Error(
          `Expected 4 seeded firmware options, got ${seeded.rows.length}`,
        );
      }

      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES ($1, $2, now(), $3, NULL, NULL, $4, 1)`,
        [crypto.randomUUID(), checksum, MIGRATION_NAME, startedAt],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    console.log(
      `Applied ${statements.length} statements; existing rows unchanged.`,
    );
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
