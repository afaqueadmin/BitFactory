require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// RBAC: dashboard.view was split into one permission per dashboard card
// (dashboard_operations.*, dashboard_customers.*, dashboard_mining.*,
// dashboard_balances.*, dashboard_finance.*). Every custom role that holds
// dashboard.view gets all the card permissions, so nobody loses a card.
// Writes the same STAFF_ROLE_UPDATED audit row as the /roles page.
//
// Two steps, so prod has no gap between deploy and data:
//   --step=add     before the deploy: add the card permissions, keep dashboard.view
//   --step=remove  after the deploy is live: delete the dashboard.view rows
//
// Dry run (everything, then rolled back) unless --apply. Default target is
// prod (ep-misty-fog, the commented DATABASE_URL line in .env); --target=test
// uses the live DATABASE_URL and refuses any host but ep-green-haze.
//
//   node scripts/migrate-dashboard-permissions.js --target=test --step=add [--apply]
//   node scripts/migrate-dashboard-permissions.js --step=add [--apply]       prod
//
// Undo: untick on /roles (the audit row lists "before").
const PRODUCTION_HOST = "ep-misty-fog";
const TEST_HOST = "ep-green-haze";
const APPLY = process.argv.includes("--apply");
const TEST = process.argv.includes("--target=test");
const HOST = TEST ? TEST_HOST : PRODUCTION_HOST;
const STEP = (process.argv.find((a) => a.startsWith("--step=")) || "").slice(7);
const OLD = "dashboard.view";

/** The card permissions, read from permissions.ts. */
function cardPermissions() {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "lib", "auth", "permissions.ts"),
    "utf8",
  );
  const cards = [
    ...src.matchAll(/^  "(dashboard_[a-z_]+\.[a-z_]+)": \{/gm),
  ].map((m) => m[1]);
  if (cards.length !== 33)
    throw new Error(`Expected 33 card permissions, parsed ${cards.length}`);
  return cards;
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
  const cards = cardPermissions();
  const actor = (
    await client.query(
      `SELECT id, email FROM users WHERE role = 'SUPER_ADMIN' AND "isDeleted" = false
       ORDER BY "createdAt" LIMIT 1`,
    )
  ).rows[0];
  if (!actor) throw new Error("No SUPER_ADMIN found to record as the actor");

  // add: roles holding dashboard.view. remove: roles still holding it.
  const roles = (
    await client.query(
      `SELECT r.id, r.name, r.description FROM staff_roles r
       JOIN staff_role_permissions p ON p."roleId" = r.id AND p.permission = $1
       ORDER BY r.name`,
      [OLD],
    )
  ).rows;
  console.log(
    `Step "${STEP}", actor ${actor.email}. Roles holding ${OLD}: ${roles.map((r) => r.name).join(", ") || "none"}`,
  );

  await client.query("BEGIN");
  for (const role of roles) {
    const before = (
      await client.query(
        `SELECT permission FROM staff_role_permissions WHERE "roleId" = $1 ORDER BY permission`,
        [role.id],
      )
    ).rows.map((r) => r.permission);

    let after;
    if (STEP === "add") {
      const add = cards.filter((p) => !before.includes(p));
      for (const p of add)
        await client.query(
          `INSERT INTO staff_role_permissions ("roleId", permission) VALUES ($1, $2)`,
          [role.id, p],
        );
      after = [...before, ...add].sort();
      console.log(`  ${role.name}: +${add.length} card permissions`);
    } else {
      const missing = cards.filter((p) => !before.includes(p));
      if (missing.length)
        throw new Error(
          `${role.name} lacks ${missing.length} card permissions; run --step=add first`,
        );
      await client.query(
        `DELETE FROM staff_role_permissions WHERE "roleId" = $1 AND permission = $2`,
        [role.id, OLD],
      );
      after = before.filter((p) => p !== OLD);
      console.log(`  ${role.name}: -${OLD}`);
    }

    await client.query(
      `UPDATE staff_roles SET "updatedAt" = ${NOW} WHERE id = $1`,
      [role.id],
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
          after: {
            name: role.name,
            description: role.description,
            permissions: after,
          },
        }),
        `Role "${role.name}" updated`,
      ],
    );
    const n = (
      await client.query(
        `SELECT count(*)::int n FROM staff_role_permissions WHERE "roleId" = $1`,
        [role.id],
      )
    ).rows[0].n;
    if (n !== after.length)
      throw new Error(
        `${role.name}: expected ${after.length} rows, found ${n}`,
      );
  }
  await client.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(APPLY ? "APPLIED." : "Dry run: rolled back.");
}

(async () => {
  if (STEP !== "add" && STEP !== "remove")
    throw new Error("Pass --step=add or --step=remove");
  const url = TEST ? process.env.DATABASE_URL : productionUrl();
  if (!url?.includes(HOST)) throw new Error(`Target host must be ${HOST}`);
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} on ${HOST}`);
  // Neon cold-starts: the first connections are often reset.
  let client;
  for (let attempt = 1; ; attempt++) {
    client = new Client({
      connectionString: url.replace("&channel_binding=require", ""),
    });
    try {
      await client.connect();
      break;
    } catch (e) {
      await client.end().catch(() => {});
      if (attempt === 8) throw e;
      console.log(`Connect attempt ${attempt} failed (${e.message}), retrying`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
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
