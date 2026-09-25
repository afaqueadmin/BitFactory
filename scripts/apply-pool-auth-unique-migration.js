// Applies 20260925090000_pool_auth_unique_per_pool_auth_key by hand (the
// prisma migrate CLI can't reach the Neon DB from the office machine).
//
//   node scripts/apply-pool-auth-unique-migration.js           # preflight only
//   node scripts/apply-pool-auth-unique-migration.js --apply   # apply
//
// The preflight is read-only: it checks the migration history is exactly
// "everything applied except this one", that the old index exists, and that
// no (poolId, authKey) pair is held twice - which would make the new unique
// index fail. --apply then runs only the two expected statements plus the
// _prisma_migrations row in one transaction, and verifies the result.
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_NAME = "20260925090000_pool_auth_unique_per_pool_auth_key";
const MIGRATIONS_DIR = path.join(__dirname, "..", "prisma", "migrations");
const sqlPath = path.join(MIGRATIONS_DIR, MIGRATION_NAME, "migration.sql");
const raw = fs.readFileSync(sqlPath);
// Prisma checksums the file's raw bytes; the repo blob is LF-only.
if (raw.includes(0x0d)) {
  throw new Error("migration.sql contains CR characters - expected LF only");
}
const checksum = crypto.createHash("sha256").update(raw).digest("hex");
const APPLY = process.argv.includes("--apply");

const EXPECTED_STATEMENTS = [
  `DROP INDEX "pool_auths_poolId_userId_authKey_key"`,
  `CREATE UNIQUE INDEX "pool_auths_poolId_authKey_key" ON "pool_auths"("poolId", "authKey")`,
];

async function poolAuthIndexes(client) {
  const r = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'pool_auths' ORDER BY 1`,
  );
  return r.rows;
}

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // ---- Preflight (read-only)
    await client.query("BEGIN READ ONLY");
    const folders = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const applied = (
      await client.query(
        `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      )
    ).rows.map((r) => r.migration_name);
    const notApplied = folders.filter((f) => !applied.includes(f));
    const unknown = applied.filter((a) => !folders.includes(a));
    const duplicates = (
      await client.query(
        `SELECT "poolId", "authKey", count(*) FROM pool_auths GROUP BY 1, 2 HAVING count(*) > 1`,
      )
    ).rowCount;
    const rowCount = (
      await client.query(`SELECT count(*)::int AS n FROM pool_auths`)
    ).rows[0].n;
    const before = await poolAuthIndexes(client);
    await client.query("ROLLBACK");

    console.log({
      migrationFolders: folders.length,
      appliedMigrations: applied.length,
      notApplied,
      unknown,
      duplicates,
      poolAuthRows: rowCount,
      checksum,
    });
    console.table(before);

    if (applied.includes(MIGRATION_NAME)) {
      console.log(`\n${MIGRATION_NAME} is already applied - nothing to do.`);
      return;
    }
    if (
      JSON.stringify(notApplied) !== JSON.stringify([MIGRATION_NAME]) ||
      unknown.length > 0
    ) {
      throw new Error(
        "Migration history is not exactly 'everything applied except this one'",
      );
    }
    if (duplicates > 0) {
      throw new Error("Duplicate (poolId, authKey) rows exist - resolve first");
    }
    if (
      !before.some(
        (i) => i.indexname === "pool_auths_poolId_userId_authKey_key",
      )
    ) {
      throw new Error(
        "Expected old index pool_auths_poolId_userId_authKey_key",
      );
    }
    if (!APPLY) {
      console.log("\nPreflight OK. Re-run with --apply to apply.");
      return;
    }

    // ---- Apply: only the expected statements + history row, one transaction
    const statements = raw
      .toString("utf8")
      .split(";")
      .map((s) => s.replace(/--.*$/gm, "").trim())
      .filter(Boolean);
    if (JSON.stringify(statements) !== JSON.stringify(EXPECTED_STATEMENTS)) {
      throw new Error(
        "migration.sql statements differ from expected: " +
          JSON.stringify(statements),
      );
    }

    await client.query("BEGIN");
    try {
      for (const statement of statements) await client.query(statement);
      await client.query(
        `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
         VALUES ($1, $2, $3, now(), now(), 1)`,
        [crypto.randomUUID(), checksum, MIGRATION_NAME],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    // ---- Verify
    const after = await poolAuthIndexes(client);
    console.log("\nAfter:");
    console.table(after);
    const rowCountAfter = (
      await client.query(`SELECT count(*)::int AS n FROM pool_auths`)
    ).rows[0].n;
    if (
      after.some((i) => i.indexname === "pool_auths_poolId_userId_authKey_key")
    ) {
      throw new Error("Old index is still present");
    }
    if (
      !after.some(
        (i) =>
          i.indexname === "pool_auths_poolId_authKey_key" &&
          /UNIQUE/.test(i.indexdef),
      )
    ) {
      throw new Error("New unique index is missing");
    }
    if (rowCountAfter !== rowCount)
      throw new Error("pool_auths row count changed");
    console.log(`\nApplied and verified ${MIGRATION_NAME}.`);
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
