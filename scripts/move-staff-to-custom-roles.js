require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// RBAC: moves every ADMIN and ACCOUNTING account to the STAFF system role plus
// a custom role ("Admin" / "Accounting") holding the permissions those system
// roles have today: every catalogue permission except SA_ONLY. Nobody's access
// changes; the custom roles can then be narrowed on /roles.
//
// One transaction:
//   1. create the "Admin" and "Accounting" roles (or top up existing ones with
//      any missing permission; nothing is removed from them);
//   2. each ADMIN/ACCOUNTING account (deleted ones too, so a restore can't
//      bring the old role back) -> role STAFF + the matching custom role;
//   3. signs them out everywhere (sessionsValidAfter), since the role is in
//      the session token;
//   4. audit rows: STAFF_ROLE_CREATED, USER_UPDATED and STAFF_ROLE_ASSIGNED,
//      by the first SUPER_ADMIN (or --actor=<email>).
//
// Dry run (everything, then rolled back) unless --apply. Default target is
// prod (ep-misty-fog, the commented DATABASE_URL line in .env); --target=test
// uses the live DATABASE_URL and refuses any host but ep-green-haze.
//
//   node scripts/move-staff-to-custom-roles.js --target=test           dry run
//   node scripts/move-staff-to-custom-roles.js --target=test --apply   apply
//   node scripts/move-staff-to-custom-roles.js [--apply]               prod
//
// Undo, per account: role back to ADMIN/ACCOUNTING, delete its
// staff_role_assignments row.
const PRODUCTION_HOST = "ep-misty-fog";
const TEST_HOST = "ep-green-haze";
const APPLY = process.argv.includes("--apply");
const TEST = process.argv.includes("--target=test");
const HOST = TEST ? TEST_HOST : PRODUCTION_HOST;
const ACTOR = (process.argv.find((a) => a.startsWith("--actor=")) || "")
  .slice("--actor=".length)
  .trim()
  .toLowerCase();

const MOVES = [
  {
    from: "ADMIN",
    role: "Admin",
    description: "Moved from the ADMIN system role",
  },
  {
    from: "ACCOUNTING",
    role: "Accounting",
    description: "Moved from the ACCOUNTING system role",
  },
];

/** Grantable permissions (catalogue minus SA_ONLY), read from permissions.ts. */
function grantablePermissions() {
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
  return all.filter((p) => !saOnly.has(p));
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

async function audit(
  client,
  action,
  entityType,
  entityId,
  actorId,
  description,
  changes,
) {
  await client.query(
    `INSERT INTO audit_logs (id, action, "entityType", "entityId", "userId", changes, description, "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, ${NOW})`,
    [
      id(),
      action,
      entityType,
      entityId,
      actorId,
      JSON.stringify(changes),
      description,
    ],
  );
}

async function run(client) {
  const permissions = grantablePermissions();
  console.log(`Grantable permissions: ${permissions.length}`);

  const actor = (
    await client.query(
      `SELECT id, email FROM users WHERE role = 'SUPER_ADMIN' AND "isDeleted" = false
       ${ACTOR ? "AND lower(email) = $1" : ""} ORDER BY "createdAt" LIMIT 1`,
      ACTOR ? [ACTOR] : [],
    )
  ).rows[0];
  if (!actor) throw new Error("No SUPER_ADMIN found to record as the actor");
  console.log("Actor:", actor.email);

  await client.query("BEGIN");
  for (const m of MOVES) {
    // 1. the custom role
    let role = (
      await client.query(`SELECT id FROM staff_roles WHERE name = $1`, [m.role])
    ).rows[0];
    if (!role) {
      role = { id: id() };
      await client.query(
        `INSERT INTO staff_roles (id, name, description, "createdById", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, ${NOW}, ${NOW})`,
        [role.id, m.role, m.description, actor.id],
      );
      await audit(
        client,
        "STAFF_ROLE_CREATED",
        "StaffRole",
        role.id,
        actor.id,
        `Role "${m.role}" created with ${permissions.length} permissions (move from ${m.from})`,
        { after: { name: m.role, permissions } },
      );
      console.log(`Role "${m.role}": created`);
    } else {
      console.log(`Role "${m.role}": exists, topping up permissions`);
    }
    const added = await client.query(
      `INSERT INTO staff_role_permissions ("roleId", permission)
       SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
      [role.id, permissions],
    );
    console.log(`  permissions added: ${added.rowCount}`);

    // 2-4. the accounts
    const users = (
      await client.query(
        `SELECT id, email, "isDeleted" FROM users WHERE role = $1 ORDER BY "createdAt"`,
        [m.from],
      )
    ).rows;
    for (const u of users) {
      await client.query(
        `UPDATE users SET role = 'STAFF', "sessionsValidAfter" = ${NOW} WHERE id = $1`,
        [u.id],
      );
      await client.query(
        `INSERT INTO staff_role_assignments ("userId", "roleId", "assignedById", "assignedAt")
         VALUES ($1, $2, $3, ${NOW}) ON CONFLICT DO NOTHING`,
        [u.id, role.id, actor.id],
      );
      await audit(
        client,
        "USER_UPDATED",
        "User",
        u.id,
        actor.id,
        `Account ${u.email} moved from ${m.from} to STAFF + role "${m.role}" (signed out)`,
        { role: { from: m.from, to: "STAFF" }, customRole: m.role },
      );
      await audit(
        client,
        "STAFF_ROLE_ASSIGNED",
        "StaffRole",
        role.id,
        actor.id,
        `Role "${m.role}" given to ${u.email}`,
        { userId: u.id },
      );
      console.log(
        `  ${m.from} -> STAFF + ${m.role}: ${u.email}${u.isDeleted ? " (deleted account)" : ""}`,
      );
    }
    if (!users.length) console.log(`  no ${m.from} accounts`);
  }

  // Checks before committing.
  const left = (
    await client.query(
      `SELECT count(*)::int AS n FROM users WHERE role IN ('ADMIN', 'ACCOUNTING')`,
    )
  ).rows[0].n;
  if (left) throw new Error(`${left} ADMIN/ACCOUNTING accounts left`);
  const unassigned = (
    await client.query(
      `SELECT count(*)::int AS n FROM users u WHERE u.role = 'STAFF'
       AND NOT EXISTS (SELECT 1 FROM staff_role_assignments a WHERE a."userId" = u.id)`,
    )
  ).rows[0].n;
  console.log(
    `STAFF accounts with no role (created as STAFF before): ${unassigned}`,
  );
  const summary = (
    await client.query(
      `SELECT r.name, count(DISTINCT p.permission)::int AS perms, count(DISTINCT a."userId")::int AS people
       FROM staff_roles r LEFT JOIN staff_role_permissions p ON p."roleId" = r.id
       LEFT JOIN staff_role_assignments a ON a."roleId" = r.id
       WHERE r.name IN ('Admin', 'Accounting') GROUP BY r.name ORDER BY r.name`,
    )
  ).rows;
  console.table(summary);
  for (const r of summary)
    if (r.perms !== permissions.length)
      throw new Error(`Role ${r.name} has ${r.perms} permissions`);

  if (APPLY) {
    await client.query("COMMIT");
    console.log("Committed.");
  } else {
    await client.query("ROLLBACK");
    console.log("Dry run: rolled back. Run again with --apply to keep it.");
  }
}

(async () => {
  const url = TEST ? process.env.DATABASE_URL : productionUrl();
  if (!url) throw new Error("DATABASE_URL not set");
  const host = new URL(url).hostname;
  console.log("Database host:", host, APPLY ? "(APPLY)" : "(DRY RUN)");
  if (!host.includes(HOST))
    throw new Error(`Refusing to run: the database isn't ${HOST}`);
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 60000,
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
  console.error(e.message ?? e);
  process.exit(1);
});
