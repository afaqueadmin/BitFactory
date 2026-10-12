// Applies prisma/migrations/20261012120000_email_reports_memos and records
// its _prisma_migrations row, because `prisma migrate` can't reach Neon from
// the dev machine (P1001). Lets email reports hold memo emails: two new
// EmailRunKind values, nullable memoId (FK to memos) + documentNumber on
// email_send_results, and invoiceId relaxed to nullable. Re-running skips.
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20261012120000_email_reports_memos";
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

// Only the expected statements are allowed through.
const ALLOWED = [
  /^ALTER TYPE "EmailRunKind" ADD VALUE 'MEMO(_VOID)?';?$/,
  /^ALTER TABLE "email_send_results" ADD COLUMN\s+"documentNumber" TEXT,\s*ADD COLUMN\s+"memoId" TEXT,\s*ALTER COLUMN "invoiceId" DROP NOT NULL;?$/,
  /^CREATE INDEX "email_send_results_memoId_idx" ON "email_send_results"\("memoId"\);?$/,
  /^ALTER TABLE "email_send_results" ADD CONSTRAINT "email_send_results_memoId_fkey" FOREIGN KEY \("memoId"\) REFERENCES "memos"\("id"\) ON DELETE CASCADE ON UPDATE CASCADE;?$/,
];
for (const stmt of statements) {
  if (!ALLOWED.some((re) => re.test(stmt))) {
    throw new Error(`Unexpected statement: ${stmt}`);
  }
}

// Fingerprint of the altered tables and the new FK target, to prove existing
// rows are untouched.
const fingerprints = {
  email_send_runs: `id,type,kind,source,status,"successCount","failureCount"`,
  email_send_results: `id,"runId","invoiceId","ccEmails",success,"errorMessage","sentAt"`,
  memos: `id,"memoNumber",status,amount,"updatedAt"`,
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

if (process.argv.includes("--check")) {
  console.log(`Allow-list OK: ${statements.length} statements.`);
  process.exit(0);
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
    const colExists = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'email_send_results' AND column_name IN ('memoId', 'documentNumber')`,
    );
    if (colExists.rows.length > 0) {
      throw new Error("Column already exists but migration is not recorded");
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
