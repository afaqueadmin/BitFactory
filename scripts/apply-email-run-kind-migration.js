// Applies prisma/migrations/20261012090000_email_run_kind_source_cc and
// records its _prisma_migrations row, because `prisma migrate` can't reach
// Neon from the dev machine (P1001). Add-only: two new enums, two defaulted
// columns on email_send_runs, a nullable column on email_send_results and an
// index on email_send_runs.type. Re-running skips.
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20261012090000_email_run_kind_source_cc";
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
    !/^CREATE TYPE "EmailRun(Kind|Source)" AS ENUM /.test(stmt) &&
    !/^ALTER TABLE "email_send_runs" ADD COLUMN\s+"kind"/.test(stmt) &&
    !/^ALTER TABLE "email_send_results" ADD COLUMN\s+"ccEmails" TEXT;?$/.test(
      stmt,
    ) &&
    !/^CREATE INDEX "email_send_runs_type_idx" ON "email_send_runs"\("type"\)/.test(
      stmt,
    )
  ) {
    throw new Error(`Unexpected statement: ${stmt}`);
  }
}

// Fingerprint of the existing columns of the altered tables, to prove
// existing rows are untouched.
const fingerprints = {
  email_send_runs: `id,type,status,"totalInvoices","successCount","failureCount","createdBy"`,
  email_send_results: `id,"runId","invoiceId",success,"errorMessage","sentAt"`,
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
    const enumExists = await client.query(
      `SELECT 1 FROM pg_type WHERE typname IN ('EmailRunKind', 'EmailRunSource')`,
    );
    if (enumExists.rows.length > 0) {
      throw new Error("Enum already exists but migration is not recorded");
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

      const { rows: defaults } = await client.query(
        `SELECT count(*)::int AS n FROM email_send_runs WHERE kind <> 'INVOICE' OR source <> 'BULK'`,
      );
      if (defaults[0].n !== 0) {
        throw new Error("Existing runs did not get INVOICE/BULK defaults");
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
