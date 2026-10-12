// Applies prisma/migrations/20261012150000_email_results_keep_on_delete and
// records its _prisma_migrations row, because `prisma migrate` can't reach
// Neon from the dev machine (P1001). Email report rows used to be deleted
// with their invoice/memo (ON DELETE CASCADE); the FKs become SET NULL, and
// existing invoice rows get their invoice number backfilled into
// documentNumber so they stay identifiable. Re-running skips.
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20261012150000_email_results_keep_on_delete";
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

const BACKFILL =
  /^UPDATE "email_send_results" AS r SET "documentNumber" = i\."invoiceNumber" FROM "invoices" AS i WHERE r\."invoiceId" = i\."id" AND r\."documentNumber" IS NULL;?$/;

// Only the expected statements are allowed through.
const ALLOWED = [
  /^ALTER TABLE "email_send_results" DROP CONSTRAINT "email_send_results_(invoiceId|memoId)_fkey";?$/,
  /^ALTER TABLE "email_send_results" ADD CONSTRAINT "email_send_results_invoiceId_fkey" FOREIGN KEY \("invoiceId"\) REFERENCES "invoices"\("id"\) ON DELETE SET NULL ON UPDATE CASCADE;?$/,
  /^ALTER TABLE "email_send_results" ADD CONSTRAINT "email_send_results_memoId_fkey" FOREIGN KEY \("memoId"\) REFERENCES "memos"\("id"\) ON DELETE SET NULL ON UPDATE CASCADE;?$/,
  BACKFILL,
];
for (const stmt of statements) {
  if (!ALLOWED.some((re) => re.test(stmt))) {
    throw new Error(`Unexpected statement: ${stmt}`);
  }
}
if (statements.length !== 5) {
  throw new Error(`Expected 5 statements, found ${statements.length}`);
}

// Every column except documentNumber (which the backfill fills) must be
// unchanged, plus the FK targets.
const fingerprints = {
  email_send_runs: `id,type,kind,source,status,"successCount","failureCount"`,
  email_send_results: `id,"runId","invoiceId","memoId","customerId","customerEmail","ccEmails",success,"errorMessage","sentAt"`,
  invoices: `id,"invoiceNumber",status,"updatedAt"`,
  memos: `id,"memoNumber",status,"updatedAt"`,
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

async function fkRules(client) {
  const { rows } = await client.query(
    `SELECT conname, confdeltype FROM pg_constraint
     WHERE conname IN ('email_send_results_invoiceId_fkey', 'email_send_results_memoId_fkey')
     ORDER BY conname`,
  );
  return rows;
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
    const rulesBefore = await fkRules(client);
    // confdeltype 'c' = CASCADE, 'n' = SET NULL.
    if (
      rulesBefore.length !== 2 ||
      rulesBefore.some((r) => r.confdeltype !== "c")
    ) {
      throw new Error(
        `Unexpected FK state: ${JSON.stringify(rulesBefore)} (expected both CASCADE)`,
      );
    }

    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    try {
      await client.query("SET LOCAL lock_timeout = '10s'");
      const before = await fingerprint(client);
      console.log("before:", before);
      const { rows: pending } = await client.query(
        `SELECT count(*)::int AS n FROM email_send_results r JOIN invoices i ON i.id = r."invoiceId" WHERE r."documentNumber" IS NULL`,
      );

      const startedAt = new Date();
      let backfilled = null;
      for (const stmt of statements) {
        const res = await client.query(stmt);
        if (BACKFILL.test(stmt)) backfilled = res.rowCount;
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
      if (backfilled !== pending[0].n) {
        throw new Error(
          `Backfilled ${backfilled} rows, expected ${pending[0].n}`,
        );
      }
      const rulesAfter = await fkRules(client);
      if (rulesAfter.some((r) => r.confdeltype !== "n")) {
        throw new Error(`FKs not SET NULL: ${JSON.stringify(rulesAfter)}`);
      }
      console.log(`documentNumber backfilled on ${backfilled} rows`);

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
      `Applied ${statements.length} statements; FKs now SET NULL; other data unchanged.`,
    );
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
