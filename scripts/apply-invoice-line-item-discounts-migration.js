// Applies prisma/migrations/20261015090000_invoice_line_item_discounts and
// records it in _prisma_migrations (the Prisma migrate CLI can't reach Neon
// from this machine). Run from the repo root:
//   node scripts/apply-invoice-line-item-discounts-migration.js            -> dry run: everything in a transaction, rolled back
//   node scripts/apply-invoice-line-item-discounts-migration.js --apply    -> commit
const { readFileSync } = require("fs");
const { createHash, randomUUID } = require("crypto");
const { createRequire } = require("module");
const repoRequire = createRequire(process.cwd() + "/package.json");
repoRequire("dotenv").config();
const { Client } = repoRequire("pg");

const NAME = "20261015090000_invoice_line_item_discounts";
const apply = process.argv.includes("--apply");

async function main() {
  const sql = readFileSync(`prisma/migrations/${NAME}/migration.sql`, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const already = await client.query(
      `SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = $1`,
      [NAME],
    );
    if (already.rowCount > 0) {
      console.log("Already recorded:", already.rows[0]);
      return;
    }

    await client.query("BEGIN");
    const started = new Date();
    await client.query(sql);
    await client.query(
      `INSERT INTO _prisma_migrations
         (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, now(), $3, NULL, NULL, $4, 1)`,
      [randomUUID(), checksum, NAME, started],
    );

    const enumValues = await client.query(
      `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'InvoiceLineItemType' ORDER BY e.enumsortorder`,
    );
    const column = await client.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_name = 'invoice_line_items' AND column_name = 'parentLineItemId'`,
    );
    const fk = await client.query(
      `SELECT conname FROM pg_constraint WHERE conname = 'invoice_line_items_parentLineItemId_fkey'`,
    );
    const rows = await client.query(
      `SELECT count(*)::int AS n FROM invoice_line_items`,
    );
    console.log("enum:", enumValues.rows.map((r) => r.v).join(", "));
    console.log("column:", column.rows[0]);
    console.log("fk:", fk.rows[0]?.conname);
    console.log("existing line items (untouched):", rows.rows[0].n);

    await client.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(apply ? "COMMITTED" : "DRY RUN - rolled back");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
