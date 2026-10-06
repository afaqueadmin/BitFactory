// Applies prisma/migrations/20261006090000_accounting_payment_accounts and
// records its _prisma_migrations row, because `prisma migrate` can't reach
// Neon from the dev machine (P1001). Add-only: new tables, nullable columns,
// enum values. Applied 2026-10-06; re-running skips.
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20261006090000_accounting_payment_accounts";
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

// Fingerprint of every pre-existing column, to prove existing rows are untouched.
const fingerprints = {
  vendor_invoices: `id,"invoiceNumber","billingDate","paidDate","dueDate","totalMiners","isDeleted","unitPrice","miscellaneousCharges","totalAmount","paymentStatus",notes,"createdBy","updatedBy","createdAt","updatedAt"`,
  hardware_purchase_invoices: `id,"invoiceNumber","vendorName","hardwareDescription","billingDate","paidDate","dueDate",quantity,"isDeleted","unitPrice","miscellaneousCharges","totalAmount","paymentStatus",notes,"createdBy","updatedBy","createdAt","updatedAt"`,
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

    const before = await fingerprint(client);
    console.log("before:", before);

    await client.query("BEGIN");
    try {
      const startedAt = new Date();
      for (const stmt of statements) {
        await client.query(stmt);
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

    const after = await fingerprint(client);
    console.log("after:", after);
    for (const table of Object.keys(fingerprints)) {
      if (before[table].h !== after[table].h) {
        throw new Error(`${table} existing data changed`);
      }
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
