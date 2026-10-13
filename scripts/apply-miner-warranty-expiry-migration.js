// Applies prisma/migrations/20261013090000_add_miner_warranty_expiry and
// records its _prisma_migrations row, because `prisma migrate` can't reach
// Neon from the dev machine (P1001). Adds the nullable miners.warrantyExpiresAt
// DATE column; existing rows are left untouched. Re-running skips.
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20261013090000_add_miner_warranty_expiry";
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

// Only the expected statement is allowed through.
const ALLOWED = [
  /^ALTER TABLE "miners" ADD COLUMN\s+"warrantyExpiresAt" DATE;?$/,
];
for (const stmt of statements) {
  if (!ALLOWED.some((re) => re.test(stmt))) {
    throw new Error(`Unexpected statement: ${stmt}`);
  }
}
if (statements.length !== 1) {
  throw new Error(`Expected 1 statement, found ${statements.length}`);
}

// Every pre-existing miners column must be unchanged.
const MINER_COLS = `id,name,status,"userId","spaceId","createdAt","updatedAt","hardwareId","isDeleted","poolId","poolAuth","serialNumber","macAddress","createdById","updatedById","deletedById","deletedAt"`;

async function fingerprint(client) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n, md5(string_agg(md5(row(${MINER_COLS})::text), '' ORDER BY id)) AS h FROM miners`,
  );
  return rows[0];
}

async function columnExists(client) {
  const { rows } = await client.query(
    `SELECT data_type, is_nullable FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'miners' AND column_name = 'warrantyExpiresAt'`,
  );
  return rows[0] || null;
}

if (process.argv.includes("--check")) {
  console.log(`Allow-list OK: ${statements.length} statement(s).`);
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
    if (await columnExists(client)) {
      throw new Error(
        "miners.warrantyExpiresAt already exists but the migration isn't recorded",
      );
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
      if (before.h !== after.h || before.n !== after.n) {
        throw new Error("miners existing data changed");
      }
      const col = await columnExists(client);
      if (!col || col.data_type !== "date" || col.is_nullable !== "YES") {
        throw new Error(`Unexpected column state: ${JSON.stringify(col)}`);
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

    const { rows: count } = await client.query(
      `SELECT count(*)::int AS n FROM "_prisma_migrations"`,
    );
    console.log(
      `Applied; miners.warrantyExpiresAt added (DATE, nullable); other data unchanged. _prisma_migrations rows: ${count[0].n}`,
    );
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
