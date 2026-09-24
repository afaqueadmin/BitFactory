require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20260924150000_invoice_machine_hosting_location_array";
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
  `ALTER TABLE "invoices" ALTER COLUMN "machineHostingLocation" DROP DEFAULT`,
  `ALTER TABLE "invoices" ALTER COLUMN "machineHostingLocation" TYPE TEXT[] USING CASE WHEN "machineHostingLocation" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["machineHostingLocation"] END`,
  `ALTER TABLE "invoices" ALTER COLUMN "machineHostingLocation" SET DEFAULT ARRAY[]::TEXT[]`,
  `ALTER TABLE "invoices" ALTER COLUMN "machineHostingLocation" SET NOT NULL`,
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

    const before = await client.query(
      `SELECT count(*) FROM "_prisma_migrations"`,
    );
    console.log("_prisma_migrations rows before:", before.rows[0].count);

    const preflight = await client.query(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE "machineHostingLocation" IS NOT NULL) AS non_null
       FROM "invoices"`,
    );
    console.log("invoices preflight:", preflight.rows[0]);

    await client.query("BEGIN");
    try {
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

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    const after = await client.query(
      `SELECT count(*) FROM "_prisma_migrations"`,
    );
    console.log("_prisma_migrations rows after:", after.rows[0].count);

    const postflight = await client.query(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE cardinality("machineHostingLocation") > 0) AS non_empty
       FROM "invoices"`,
    );
    console.log("invoices postflight:", postflight.rows[0]);

    console.log("Migration applied and recorded:", MIGRATION_NAME);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
