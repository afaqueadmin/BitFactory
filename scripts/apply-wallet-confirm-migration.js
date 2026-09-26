require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20260923075018_wallet_change_request_confirm_step";
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
  `ALTER TYPE "RequestStatus" ADD VALUE 'CONFIRMED'`,
  `ALTER TYPE "AuditAction" ADD VALUE 'WALLET_CHANGE_CONFIRMED'`,
  `ALTER TABLE "wallet_change_requests" DROP COLUMN "appliedAt",
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmationMethod" TEXT,
ADD COLUMN     "confirmationContact" TEXT,
ADD COLUMN     "confirmationNote" TEXT`,
  `ALTER TABLE "wallet_change_requests" ADD CONSTRAINT "wallet_change_requests_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
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
