import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  effectivePermissions,
  isPermission,
  type Permission,
} from "../permissions";

/**
 * RBAC parity: one row per migrated admin API route and method. For every
 * system role, "has the permission(s)" must equal "passes today's check", so
 * migrating a route never changes anyone's access. Add the route's row in the
 * same commit that moves it to requirePermission (migration plan, section 7).
 *
 * today: "staff" = any of SUPER_ADMIN, ADMIN, ACCOUNTING; "super_admin" = SA
 * only. permissions: several = any one of them (requireAnyPermission).
 * shared: the route also serves client-side accounts, so it keeps its role
 * branch (isStaffRole) next to the permission check.
 */
interface ParityRow {
  route: string; // relative to src/app/api, e.g. "spaces/[id]"
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  permissions: Permission[];
  today: "staff" | "super_admin";
  shared?: boolean;
}

// Note: routes that read the role from the token today (spaces) read it from
// the database after migration - same answer for every live account.
const ROUTES: ParityRow[] = [
  // Locations (pilot)
  {
    route: "spaces",
    method: "GET",
    permissions: [
      "locations.view",
      "miners.view",
      "invoicing.create",
      "invoicing.edit",
    ],
    today: "staff",
  },
  {
    route: "spaces",
    method: "POST",
    permissions: ["locations.create"],
    today: "staff",
  },
  {
    route: "spaces/[id]",
    method: "PUT",
    permissions: ["locations.edit"],
    today: "staff",
  },
  {
    route: "spaces/[id]",
    method: "DELETE",
    permissions: ["locations.delete"],
    today: "staff",
  },

  // Hardware Models. Both GETs had no check and procure only needed a
  // session; staff keep their access, clients and visitors lose it.
  {
    route: "hardware",
    method: "GET",
    permissions: [
      "hardware_models.view",
      "miners.view",
      "invoicing.create",
      "invoicing.edit",
    ],
    today: "staff",
  },
  {
    route: "hardware",
    method: "POST",
    permissions: ["hardware_models.create"],
    today: "staff",
  },
  {
    route: "hardware/[id]",
    method: "GET",
    permissions: ["hardware_models.view"],
    today: "staff",
  },
  {
    route: "hardware/[id]",
    method: "PUT",
    permissions: ["hardware_models.edit"],
    today: "staff",
  },
  {
    route: "hardware/[id]",
    method: "DELETE",
    permissions: ["hardware_models.delete"],
    today: "staff",
  },
  {
    route: "hardware/procure",
    method: "POST",
    permissions: ["hardware_models.procure"],
    today: "staff",
  },

  // Pools. GET pools stays open to any signed-in account (franchise portal);
  // only its staff branch checks a permission.
  {
    route: "pools",
    method: "GET",
    permissions: [
      "pools.view",
      "miners.view",
      "pool_workers.view",
      "customers.view",
    ],
    today: "staff",
    shared: true,
  },
  {
    route: "pools",
    method: "POST",
    permissions: ["pools.create"],
    today: "staff",
    shared: true, // same file as the shared GET
  },
  {
    route: "pools/[id]",
    method: "PUT",
    permissions: ["pools.edit"],
    today: "staff",
  },
  {
    route: "pools/[id]",
    method: "DELETE",
    permissions: ["pools.delete"],
    today: "staff",
  },
  {
    route: "pool-auth",
    method: "GET",
    permissions: [
      "pools.view",
      "pools.manage_credentials",
      "pool_workers.view",
      "customers.view",
      "customers.edit",
      "franchisees.edit",
    ],
    today: "staff",
  },
  {
    route: "pool-auth",
    method: "POST",
    permissions: ["pools.manage_credentials"],
    today: "staff",
  },
  {
    route: "pool-auth/[id]",
    method: "PUT",
    permissions: ["pools.manage_credentials"],
    today: "staff",
  },
  {
    route: "pool-auth/[id]",
    method: "DELETE",
    permissions: ["pools.manage_credentials"],
    today: "staff",
  },
];

const SYSTEM_ROLES = ["SUPER_ADMIN", "ADMIN", "ACCOUNTING"] as const;
const OLD_STAFF_CHECKS =
  /isStaffRole\(|requireAccountingAdmin|requireStaff\(|requireSimAdmin|requireRepairChargesUser|function requireAdmin|function requireSuperAdmin/;

function passesToday(role: string, today: ParityRow["today"]) {
  return today === "staff" || role === "SUPER_ADMIN";
}

describe("permission parity", () => {
  it("names only catalogue permissions, one row per route and method", () => {
    const keys = ROUTES.map((r) => `${r.method} ${r.route}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of ROUTES) {
      expect(r.permissions.length).toBeGreaterThan(0);
      for (const p of r.permissions) expect(isPermission(p)).toBe(true);
    }
  });

  for (const row of ROUTES) {
    it(`${row.method} ${row.route}: same access as today`, () => {
      for (const role of SYSTEM_ROLES) {
        const perms = effectivePermissions(role);
        const allowed = row.permissions.some((p) => perms.has(p));
        expect(allowed, role).toBe(passesToday(role, row.today));
      }
    });

    it(`${row.method} ${row.route}: uses the permission check only`, () => {
      const file = path.join(
        __dirname,
        "../../../app/api",
        row.route,
        "route.ts",
      );
      const source = fs.readFileSync(file, "utf8");
      expect(source).toMatch(/require(Any)?Permission\(/);
      if (!row.shared) expect(source).not.toMatch(OLD_STAFF_CHECKS);
    });
  }
});
