require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg and records it in _prisma_migrations.
// Pass --dry-run to only show what would run.
const MIGRATION_NAME = "20261015120000_change_request_requested_by";
const DRY_RUN = process.argv.includes("--dry-run");
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

const statements = [
  `ALTER TABLE "wallet_change_requests" ADD COLUMN "requestedByEmail" TEXT,
ADD COLUMN "requestedBySecondary" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "payment_frequency_change_requests" ADD COLUMN "requestedByEmail" TEXT,
ADD COLUMN "requestedBySecondary" BOOLEAN NOT NULL DEFAULT false`,
];

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

    if (DRY_RUN) {
      console.log("Dry run - would run:");
      statements.forEach((stmt) => console.log(stmt + ";"));
      return;
    }

    for (const stmt of statements) {
      console.log("Running:", stmt.split("\n")[0], "...");
      await client.query(stmt);
    }

    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, now(), $3, NULL, NULL, now(), $4)`,
      [id, checksum, MIGRATION_NAME, statements.length],
    );

    console.log("Migration applied and recorded:", MIGRATION_NAME);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
