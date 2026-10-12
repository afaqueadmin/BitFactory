// Deletes legacy miner repair notes that are not linked to a Hardware Repair
// invoice (miner_repair_notes."invoiceId" IS NULL). These were written from
// the Machine page before repair notes became invoice-managed only; nothing in
// the app can edit or delete them any more.
//
// Lists the notes first; deletes only with --apply (one transaction).
//
//   node scripts/delete-legacy-repair-notes.js            # list only
//   node scripts/delete-legacy-repair-notes.js --apply
require("dotenv").config();
const { Client } = require("pg");

(async () => {
  const apply = process.argv.includes("--apply");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query(`
      SELECT n."id", n."dateOfEntry", n."note",
             m."name" AS "minerName", m."serialNumber",
             COALESCE(u."name", u."email") AS "author"
        FROM "miner_repair_notes" n
        JOIN "miners" m ON m."id" = n."minerId"
        JOIN "users" u ON u."id" = n."createdById"
       WHERE n."invoiceId" IS NULL
       ORDER BY n."dateOfEntry"
    `);

    console.log(`Legacy repair notes (no invoice): ${rows.length}`);
    for (const r of rows) {
      const excerpt = r.note.replace(/\s+/g, " ").slice(0, 80);
      console.log(
        `- ${r.id} | ${r.dateOfEntry.toISOString().slice(0, 10)} | ` +
          `${r.minerName} (${r.serialNumber || "no S/N"}) | ${r.author} | ${excerpt}`,
      );
    }

    if (!apply) {
      console.log("\nList only. Re-run with --apply to delete these notes.");
      return;
    }
    if (rows.length === 0) return;

    await client.query("BEGIN");
    const res = await client.query(
      `DELETE FROM "miner_repair_notes" WHERE "id" = ANY($1::text[]) AND "invoiceId" IS NULL`,
      [rows.map((r) => r.id)],
    );
    await client.query("COMMIT");
    console.log(`\nDeleted ${res.rowCount} legacy repair notes.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
