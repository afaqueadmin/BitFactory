require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Prisma migrate can't reach Neon from every machine, so this applies the
// migration with pg in one transaction and records it in _prisma_migrations.
//
// Expense Entry #: adds accounting_expenses."entryNumber" (SERIAL, unique),
// shown as EXP-0001. Add-only: no existing column or row is changed beyond
// numbering existing expenses.
//
// Production first, as with the earlier accounting migrations: it refuses
// any host but ep-misty-fog, and does a dry run (everything, checks
// included, then rolled back) unless --apply is given. The prod URL is the
// commented DATABASE_URL line in .env (DATABASE_URL in the shell wins).
//
//   node scripts/apply-expense-entry-number-migration.js           dry run
//   node scripts/apply-expense-entry-number-migration.js --apply   apply
const MIGRATION_NAME = "20261114130000_expense_entry_number";
const PRODUCTION_HOST = "ep-misty-fog";
const APPLY = process.argv.includes("--apply");

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

// Tables whose row counts must not change.
const COUNTED = [
  "accounting_expenses",
  "accounting_expense_payments",
  "accounting_expense_heads",
];

function productionUrl() {
  if (process.env.DATABASE_URL?.includes(PRODUCTION_HOST)) {
    return process.env.DATABASE_URL;
  }
  const line = fs
    .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split(/\r?\n/)
    .find((l) => /^#\s*DATABASE_URL=/.test(l) && l.includes(PRODUCTION_HOST));
  if (!line) throw new Error("Prod DATABASE_URL not found");
  return line.replace(/^#\s*DATABASE_URL=/, "").replace(/^"|"$/g, "");
}

async function counts(client) {
  const r = await client.query(
    COUNTED.map(
      (t) => `SELECT '${t}' AS t, count(*)::int AS n FROM "${t}"`,
    ).join(" UNION ALL "),
  );
  return Object.fromEntries(r.rows.map((x) => [x.t, x.n]));
}

async function migrate(client) {
  // The database must be level with the code before this one.
  const folders = fs
    .readdirSync(path.join(__dirname, "..", "prisma", "migrations"), {
      withFileTypes: true,
    })
    .filter((d) => d.isDirectory() && d.name !== MIGRATION_NAME)
    .map((d) => d.name);
  const recorded = (
    await client.query(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    )
  ).rows.map((r) => r.migration_name);
  if (recorded.includes(MIGRATION_NAME)) {
    console.log("Migration already recorded, skipping.");
    return;
  }
  const missing = folders.filter((f) => !recorded.includes(f));
  const extra = recorded.filter((r) => !folders.includes(r));
  console.log(
    `Migrations: ${folders.length} folders before this one, ${recorded.length} recorded`,
  );
  if (missing.length) throw new Error(`Not applied yet: ${missing.join(", ")}`);
  if (extra.length)
    console.log(`Recorded but not in this branch: ${extra.join(", ")}`);

  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '10s'");

  const exists = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'accounting_expenses' AND column_name = 'entryNumber'`,
  );
  if (exists.rowCount) throw new Error("entryNumber already exists");

  const before = await counts(client);
  console.log("Row counts before:", JSON.stringify(before));

  console.log("Running migration.sql ...");
  await client.query(sql);

  const column = await client.query(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'accounting_expenses' AND column_name = 'entryNumber'`,
  );
  console.log("New column entryNumber:", JSON.stringify(column.rows[0]));
  if (
    column.rows[0]?.data_type !== "integer" ||
    column.rows[0]?.is_nullable !== "NO" ||
    !String(column.rows[0]?.column_default).startsWith("nextval(")
  ) {
    throw new Error("entryNumber is not a NOT NULL serial - rolling back");
  }
  const index = await client.query(
    `SELECT indexdef FROM pg_indexes
     WHERE indexname = 'accounting_expenses_entryNumber_key'`,
  );
  if (!index.rows[0]?.indexdef.includes("UNIQUE")) {
    throw new Error("Unique index missing - rolling back");
  }
  const numbered = await client.query(
    `SELECT count(*)::int AS n, count(DISTINCT "entryNumber")::int AS d
     FROM "accounting_expenses"`,
  );
  console.log(
    `Existing expenses numbered: ${numbered.rows[0].n} (distinct ${numbered.rows[0].d})`,
  );
  if (numbered.rows[0].n !== numbered.rows[0].d) {
    throw new Error("Duplicate entry numbers - rolling back");
  }
  const list = await client.query(
    `SELECT e."entryNumber", e."createdAt", e."date"::text AS date,
            h."name" AS head, e."amountDueUsd"::text AS due
     FROM "accounting_expenses" e
     JOIN "accounting_expense_heads" h ON h."id" = e."headId"
     ORDER BY e."entryNumber"`,
  );
  for (const r of list.rows) {
    console.log(
      `  EXP-${String(r.entryNumber).padStart(4, "0")}: ${r.head}, $${r.due}, dated ${r.date}, recorded ${r.createdAt.toISOString()}`,
    );
  }
  // A new expense takes this number (peeking via the sequence's own state).
  const next = await client.query(
    `SELECT last_value, is_called FROM "accounting_expenses_entryNumber_seq"`,
  );
  const { last_value: last, is_called: called } = next.rows[0];
  console.log(
    `Next new expense: EXP-${String(Number(last) + (called ? 1 : 0)).padStart(4, "0")}`,
  );

  const after = await counts(client);
  console.log("Row counts after:", JSON.stringify(after));
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error("Existing row counts changed - rolling back");
  }

  await client.query(
    `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES ($1, $2, now(), $3, NULL, NULL, now(), 1)`,
    [crypto.randomUUID(), checksum, MIGRATION_NAME],
  );

  if (APPLY) {
    await client.query("COMMIT");
    console.log("Migration applied and recorded:", MIGRATION_NAME);
  } else {
    await client.query("ROLLBACK");
    console.log("Dry run OK - rolled back:", MIGRATION_NAME);
  }
}

(async () => {
  const url = productionUrl();
  const host = new URL(url).hostname;
  console.log("Database host:", host, APPLY ? "(APPLY)" : "(DRY RUN)");
  if (!host.includes(PRODUCTION_HOST)) {
    throw new Error(
      `Refusing to run: the database isn't production (${PRODUCTION_HOST})`,
    );
  }

  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 60000,
  });
  await client.connect();
  try {
    await migrate(client);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
