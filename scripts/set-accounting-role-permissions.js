require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// RBAC: limits the "Accounting" custom role to finance. It gets every
// grantable permission of the finance modules below, plus four read-only
// finance-linked views (decided 23 Nov 2026). Anything else it holds is
// removed. Writes the same STAFF_ROLE_UPDATED audit row as the /roles page.
//
// Dry run (everything, then rolled back) unless --apply. Default target is
// prod (ep-misty-fog, the commented DATABASE_URL line in .env); --target=test
// uses the live DATABASE_URL and refuses any host but ep-green-haze.
//
//   node scripts/set-accounting-role-permissions.js --target=test           dry run
//   node scripts/set-accounting-role-permissions.js --target=test --apply   apply
//   node scripts/set-accounting-role-permissions.js [--apply]               prod
//
// Undo: tick the permissions back on /roles (the audit row lists "before").
const PRODUCTION_HOST = "ep-misty-fog";
const TEST_HOST = "ep-green-haze";
const APPLY = process.argv.includes("--apply");
const TEST = process.argv.includes("--target=test");
const HOST = TEST ? TEST_HOST : PRODUCTION_HOST;
const ROLE = "Accounting";

const FINANCE_MODULES = [
  "invoicing",
  "recurring_invoices",
  "email_reports",
  "farm_tariffs",
  "hardware_purchases",
  "security_deposits",
  "memos",
  "credit_adjustments",
  "banks",
  "transfers",
  "expenses",
  "capital_income",
  "bank_reconciliation",
  "customer_statements",
  "incentive_payouts",
  "pricing",
  "repair_charges",
  "invoice_pdf_settings",
  "vendors",
  "payment_settings",
];
// Read-only views linked to finance work.
const LINKED_VIEWS = [
  "dashboard.view", // company totals, monthly billing, customer balances
  "franchisees.view", // incentive payouts are recorded on the franchisee page
  "transaction_history.view", // pool payouts and charges per customer
  "customers.view", // open a customer from an invoice
];

/** Catalogue and SA_ONLY, read from permissions.ts. */
function catalogue() {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "lib", "auth", "permissions.ts"),
    "utf8",
  );
  const all = [...src.matchAll(/^  "([a-z_]+\.[a-z_]+)": \{/gm)].map(
    (m) => m[1],
  );
  const block = src.slice(src.indexOf("export const SA_ONLY"));
  const saOnly = new Set(
    [
      ...block.slice(0, block.indexOf("]);")).matchAll(/"([a-z_]+\.[a-z_]+)"/g),
    ].map((m) => m[1]),
  );
  if (all.length < 150 || saOnly.size !== 14)
    throw new Error(
      `Catalogue parse looks wrong: ${all.length} / ${saOnly.size}`,
    );
  return { all, saOnly };
}

function wantedPermissions() {
  const { all, saOnly } = catalogue();
  const allSet = new Set(all);
  for (const m of FINANCE_MODULES)
    if (!all.some((p) => p.startsWith(m + ".")))
      throw new Error(`Unknown module: ${m}`);
  for (const p of LINKED_VIEWS)
    if (!allSet.has(p)) throw new Error(`Unknown permission: ${p}`);
  const finance = all.filter(
    (p) => FINANCE_MODULES.includes(p.split(".")[0]) && !saOnly.has(p),
  );
  return [...new Set([...finance, ...LINKED_VIEWS])].sort();
}

function productionUrl() {
  if (process.env.DATABASE_URL?.includes(PRODUCTION_HOST))
    return process.env.DATABASE_URL;
  const line = fs
    .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split(/\r?\n/)
    .find((l) => /^#\s*DATABASE_URL=/.test(l) && l.includes(PRODUCTION_HOST));
  if (!line) throw new Error("Prod DATABASE_URL not found");
  return line.replace(/^#\s*DATABASE_URL=/, "").replace(/^"|"$/g, "");
}

const id = () => "c" + crypto.randomBytes(12).toString("hex");
// Timestamp columns are without time zone: write UTC (see raw pg dates trap).
const NOW = "date_trunc('second', now() AT TIME ZONE 'UTC')";

async function run(client) {
  const wanted = wantedPermissions();
  const actor = (
    await client.query(
      `SELECT id, email FROM users WHERE role = 'SUPER_ADMIN' AND "isDeleted" = false
       ORDER BY "createdAt" LIMIT 1`,
    )
  ).rows[0];
  if (!actor) throw new Error("No SUPER_ADMIN found to record as the actor");
  const role = (
    await client.query(
      `SELECT id, name, description FROM staff_roles WHERE name = $1`,
      [ROLE],
    )
  ).rows[0];
  if (!role) throw new Error(`Role "${ROLE}" not found`);
  const before = (
    await client.query(
      `SELECT permission FROM staff_role_permissions WHERE "roleId" = $1 ORDER BY permission`,
      [role.id],
    )
  ).rows.map((r) => r.permission);
  const holders = (
    await client.query(
      `SELECT u.email FROM staff_role_assignments a JOIN users u ON u.id = a."userId" WHERE a."roleId" = $1`,
      [role.id],
    )
  ).rows.map((r) => r.email);

  const remove = before.filter((p) => !wanted.includes(p));
  const add = wanted.filter((p) => !before.includes(p));
  console.log(
    `Role "${ROLE}": ${before.length} -> ${wanted.length} permissions (remove ${remove.length}, add ${add.length}). Held by ${holders.length}: ${holders.join(", ") || "nobody"}. Actor: ${actor.email}`,
  );
  console.log("Keeps:", wanted.join(" "));
  console.log("Add:", add.join(" ") || "-");

  await client.query("BEGIN");
  await client.query(
    `DELETE FROM staff_role_permissions WHERE "roleId" = $1 AND NOT (permission = ANY($2))`,
    [role.id, wanted],
  );
  for (const p of add)
    await client.query(
      `INSERT INTO staff_role_permissions ("roleId", permission) VALUES ($1, $2)`,
      [role.id, p],
    );
  const description =
    "Finance only: the finance modules plus read-only Dashboard, Franchisees, Transaction History and Customers";
  await client.query(
    `UPDATE staff_roles SET description = $2, "updatedAt" = ${NOW} WHERE id = $1`,
    [role.id, description],
  );
  await client.query(
    `INSERT INTO audit_logs (id, action, "entityType", "entityId", "userId", changes, description, "createdAt")
     VALUES ($1, 'STAFF_ROLE_UPDATED', 'StaffRole', $2, $3, $4, $5, ${NOW})`,
    [
      id(),
      role.id,
      actor.id,
      JSON.stringify({
        before: {
          name: role.name,
          description: role.description,
          permissions: before,
        },
        after: { name: role.name, description, permissions: wanted },
      }),
      `Role "${ROLE}" updated`,
    ],
  );
  const after = (
    await client.query(
      `SELECT count(*)::int n FROM staff_role_permissions WHERE "roleId" = $1`,
      [role.id],
    )
  ).rows[0].n;
  if (after !== wanted.length)
    throw new Error(`Expected ${wanted.length} rows, found ${after}`);
  await client.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(
    APPLY ? `APPLIED: ${after} permissions.` : "Dry run: rolled back.",
  );
}

(async () => {
  const url = TEST ? process.env.DATABASE_URL : productionUrl();
  if (!url?.includes(HOST)) throw new Error(`Target host must be ${HOST}`);
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} on ${HOST}`);
  const client = new Client({
    connectionString: url.replace("&channel_binding=require", ""),
  });
  await client.connect();
  try {
    await run(client);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
