// Rebuilds email_send_results rows that were deleted along with their
// invoices while the FK still cascaded (before migration
// 20261012150000_email_results_keep_on_delete). Each missing row is matched
// to the audit entry the send wrote (INVOICE_SENT_TO_CUSTOMER, or
// INVOICE_CANCELLED "... cancelled and sent to ...") by the run's admin
// inside the run's time window. Rebuilt rows have no invoiceId (the invoice
// is gone) and keep the invoice number in documentNumber.
//
// Dry run by default (prints the plan). Pass --apply to write, in one
// transaction. Idempotent: a fully rebuilt run is no longer short.
require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const {
  AUDIT_ACTION_FOR_KIND,
  parseAuditEntry,
  planRun,
} = require("./lib/email-report-rebuild");

const APPLY = process.argv.includes("--apply");
const WINDOW = "5 seconds";

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(
      APPLY ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN READ ONLY",
    );

    const { rows: shortRuns } = await client.query(`
      SELECT r.id, r.type, r.kind, r."createdBy", r."startedAt",
             COALESCE(r."completedAt", r."startedAt") AS "endedAt",
             r."totalInvoices",
             (SELECT count(*)::int FROM email_send_results s WHERE s."runId" = r.id) AS "recordedRows"
      FROM email_send_runs r
      WHERE r.kind IN ('INVOICE', 'CANCELLATION')
        AND r."totalInvoices" > (SELECT count(*) FROM email_send_results s WHERE s."runId" = r.id)
      ORDER BY r."startedAt"`);

    const plans = [];
    const emails = new Set();
    for (const run of shortRuns) {
      // Compare timestamps column-to-column in SQL: they're `timestamp
      // without time zone`, and round-tripping them through JS Dates shifts
      // the window by the driver's local offset.
      const { rows: entries } = await client.query(
        // createdAt as text so it is written back verbatim (see above).
        `SELECT a.action, a."entityId", a.description, a.changes,
                a."createdAt"::text AS "createdAt"
         FROM email_send_runs r
         JOIN audit_logs a
           ON a."userId" = r."createdBy" AND a."entityType" = 'Invoice' AND a.action::text = $2
          AND a."createdAt" BETWEEN r."startedAt" - interval '${WINDOW}'
                                AND COALESCE(r."completedAt", r."startedAt") + interval '${WINDOW}'
         WHERE r.id = $1
           AND NOT EXISTS (SELECT 1 FROM email_send_results x
                           WHERE x."runId" = r.id AND x."invoiceId" = a."entityId")
         ORDER BY a."createdAt"`,
        [run.id, AUDIT_ACTION_FOR_KIND[run.kind]],
      );
      const candidates = entries
        .map((e) => parseAuditEntry(e, run.kind))
        .filter(Boolean);
      candidates.forEach((c) => emails.add(c.sentTo.toLowerCase()));
      plans.push({ run, candidates });
    }

    const { rows: users } = await client.query(
      `SELECT id, name, lower(email) AS email FROM users WHERE lower(email) = ANY($1)`,
      [[...emails]],
    );
    const usersByEmail = new Map(users.map((u) => [u.email, u]));

    let toInsert = [];
    for (const { run, candidates } of plans) {
      const { rows, skipped } = planRun(run, candidates, usersByEmail);
      const missing = run.totalInvoices - run.recordedRows;
      console.log(
        `\nRun ${run.id} (${run.type} ${run.kind}, ${run.startedAt.toISOString()}): ${missing} missing, ${rows.length} rebuildable${skipped ? ` - ${skipped}` : ""}`,
      );
      for (const r of rows) {
        console.log(
          `  + ${r.documentNumber}  ${r.customerEmail}  cc=${r.ccEmails || "-"}  sentAt=${r.sentAt}`,
        );
      }
      toInsert = toInsert.concat(rows);
    }

    console.log(
      `\n${toInsert.length} rows to rebuild across ${plans.length} short runs.`,
    );

    if (!APPLY) {
      await client.query("ROLLBACK");
      console.log("Dry run - nothing written. Re-run with --apply to write.");
      return;
    }

    for (const r of toInsert) {
      await client.query(
        `INSERT INTO email_send_results
           (id, "runId", "invoiceId", "memoId", "documentNumber", "customerId",
            "customerName", "customerEmail", "ccEmails", success, "errorMessage",
            "sentAt", "createdAt", "updatedAt")
         VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, $7, true, NULL, $8::timestamp, $8::timestamp, now())`,
        [
          crypto.randomUUID(),
          r.runId,
          r.documentNumber,
          r.customerId,
          r.customerName,
          r.customerEmail,
          r.ccEmails,
          r.sentAt,
        ],
      );
    }

    // No run may end up with more rows than it sent.
    const { rows: over } = await client.query(`
      SELECT r.id FROM email_send_runs r
      WHERE (SELECT count(*) FROM email_send_results s WHERE s."runId" = r.id) > r."totalInvoices"`);
    if (over.length > 0) {
      throw new Error(
        `Runs over their total: ${over.map((o) => o.id).join(", ")}`,
      );
    }

    await client.query("COMMIT");
    console.log(`Inserted ${toInsert.length} rows.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
