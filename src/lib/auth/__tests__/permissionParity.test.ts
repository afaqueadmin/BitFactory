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

  // Miners. GET machine also serves franchisees (own customers' miners);
  // the shared reads keep their client / franchisee / guild branches.
  {
    route: "machine",
    method: "GET",
    permissions: ["miners.view", "farm_tariffs.create"],
    today: "staff",
  },
  {
    route: "machine",
    method: "POST",
    permissions: ["miners.create"],
    today: "staff",
  },
  {
    route: "machine/[id]",
    method: "PUT",
    permissions: ["miners.edit"],
    today: "staff",
  },
  {
    route: "machine/[id]",
    method: "DELETE",
    permissions: ["miners.delete"],
    today: "staff",
  },
  {
    route: "machine/bulk-edit",
    method: "POST",
    permissions: ["miners.edit"],
    today: "staff",
  },
  {
    route: "machine/bulk-delete",
    method: "POST",
    permissions: ["miners.bulk_delete"],
    today: "staff",
  },
  {
    route: "machine/[id]/restarts",
    method: "POST",
    permissions: ["miners.log_restart", "hashrate_alerts.acknowledge"],
    today: "staff",
  },
  {
    route: "machine/[id]/repair-notes",
    method: "GET",
    permissions: ["miners.view", "customers.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "miners/[id]/pool-history",
    method: "GET",
    permissions: ["miners.view"],
    today: "staff",
  },
  {
    route: "miners/[id]/hashrate-history",
    method: "GET",
    permissions: ["miners.view", "customers.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "miners/hashrate-history",
    method: "GET",
    permissions: ["miners.view", "customers.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "miners/daily-costs",
    method: "GET",
    permissions: ["miners.view", "customers.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "miners/user",
    method: "GET",
    permissions: ["miners.view", "customers.view"],
    today: "staff",
    shared: true,
  },

  // Pool Workers. The luxor proxy serves every account type; only its staff
  // branch checks a permission. workers/stats is own-data only (unchanged).
  {
    route: "luxor",
    method: "GET",
    permissions: [
      "subaccounts.view",
      "pool_workers.view",
      "dashboard.view",
      "miners.view",
      "customers.view",
      "customers.create",
      "customers.edit",
      "franchisees.create",
      "franchisees.edit",
      "franchisees.approve_customer_requests",
    ],
    today: "staff",
    shared: true,
  },
  {
    route: "braiins-workers",
    method: "GET",
    permissions: ["pool_workers.view"],
    today: "staff",
  },
  {
    route: "braiins-customers",
    method: "GET",
    permissions: ["pool_workers.view"],
    today: "staff",
  },
  {
    route: "braiins-workers/all",
    method: "GET",
    permissions: ["pool_workers.view"],
    today: "staff",
  },
  {
    route: "braiins-miners/all",
    method: "GET",
    permissions: ["pool_workers.view"],
    today: "staff",
  },

  // Transaction History. The main route also serves franchisees (own
  // customers only); the debug route has no screen.
  {
    route: "admin/client-transaction-history",
    method: "GET",
    permissions: ["transaction_history.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "admin/client-transaction-history-debug",
    method: "GET",
    permissions: ["transaction_history.view"],
    today: "staff",
  },

  // Customer Groups. GET groups/[id] and groups/available also serve
  // franchisees (own customers only); GET groups feeds the group picker in
  // the create / edit customer dialogs.
  {
    route: "groups",
    method: "GET",
    permissions: ["customer_groups.view", "customers.create", "customers.edit"],
    today: "staff",
  },
  {
    route: "groups",
    method: "POST",
    permissions: ["customer_groups.create"],
    today: "staff",
  },
  {
    route: "groups/[id]",
    method: "GET",
    permissions: ["customer_groups.view"],
    today: "staff",
  },
  {
    route: "groups/[id]",
    method: "PUT",
    permissions: ["customer_groups.edit"],
    today: "staff",
  },
  {
    route: "groups/[id]",
    method: "DELETE",
    permissions: ["customer_groups.delete"],
    today: "staff",
  },
  {
    route: "groups/available",
    method: "GET",
    permissions: ["customer_groups.view"],
    today: "staff",
  },
  {
    route: "groups/[id]/subaccounts",
    method: "GET",
    permissions: ["customer_groups.view"],
    today: "staff",
  },
  {
    route: "groups/[id]/subaccounts/add",
    method: "POST",
    permissions: ["customer_groups.edit"],
    today: "staff",
  },
  {
    route: "groups/[id]/subaccounts/bulk-add",
    method: "POST",
    permissions: ["customer_groups.edit"],
    today: "staff",
  },
  {
    route: "groups/[id]/subaccounts/bulk-remove",
    method: "POST",
    permissions: ["customer_groups.edit"],
    today: "staff",
  },
  {
    route: "groups/[id]/subaccounts/[subaccountId]",
    method: "DELETE",
    permissions: ["customer_groups.edit"],
    today: "staff",
  },

  // Analytics. The client-facing payback-config, payback-history and
  // pool-hashprice-live (any signed-in account) stay unchanged.
  {
    route: "admin/payback-config",
    method: "GET",
    permissions: ["customer_payback.view"],
    today: "staff",
  },
  {
    route: "admin/payback-config",
    method: "PATCH",
    permissions: ["customer_payback.edit_settings"],
    today: "staff",
  },
  {
    route: "admin/payback-config-company",
    method: "GET",
    permissions: ["company_payback.view"],
    today: "staff",
  },
  {
    route: "admin/payback-config-company",
    method: "PATCH",
    permissions: ["company_payback.edit_settings"],
    today: "staff",
  },
  {
    route: "payback-config-company",
    method: "GET",
    permissions: ["company_payback.view"],
    today: "staff",
  },
  {
    route: "payback-history-company",
    method: "GET",
    permissions: ["company_payback.view"],
    today: "staff",
  },
  {
    route: "admin/payback-history/backfill",
    method: "POST",
    permissions: ["company_payback.edit_settings"],
    today: "staff",
  },

  // System: logs and DB Data Management (all view-only)
  {
    route: "admin/activity-log",
    method: "GET",
    permissions: ["activity_log.view"],
    today: "staff",
  },
  {
    route: "admin/audit-log",
    method: "GET",
    permissions: ["audit_log.view"],
    today: "staff",
  },
  {
    route: "pool-subaccounts",
    method: "GET",
    permissions: ["db_data.view"],
    today: "staff",
  },
  {
    route: "pool-subaccounts/[id]",
    method: "GET",
    permissions: ["db_data.view"],
    today: "staff",
  },
  {
    route: "pool-daily-snapshots",
    method: "GET",
    permissions: ["db_data.view"],
    today: "staff",
  },
  {
    route: "pool-worker-metrics",
    method: "GET",
    permissions: ["db_data.view"],
    today: "staff",
  },
  {
    route: "pool-transactions",
    method: "GET",
    permissions: ["db_data.view"],
    today: "staff",
  },
  // Work Queue
  {
    route: "tickets",
    method: "GET",
    permissions: ["tickets.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "tickets/[id]",
    method: "GET",
    permissions: ["tickets.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "tickets/[id]",
    method: "PATCH",
    permissions: ["tickets.edit"],
    today: "staff",
    shared: true,
  },
  {
    route: "tickets/[id]/messages",
    method: "POST",
    permissions: ["tickets.reply"],
    today: "staff",
    shared: true,
  },
  {
    route: "tickets/[id]/assign",
    method: "POST",
    permissions: ["tickets.assign"],
    today: "super_admin",
    shared: true, // isStaffRole checks the assignee, not the caller
  },
  {
    route: "admin/staff",
    method: "GET",
    permissions: ["tickets.assign"],
    today: "super_admin",
  },
  {
    route: "admin/hashrate-alerts",
    method: "GET",
    permissions: ["hashrate_alerts.view"],
    today: "staff",
  },
  {
    route: "admin/hashrate-alerts/bulk-acknowledge",
    method: "POST",
    permissions: ["hashrate_alerts.acknowledge"],
    today: "staff",
  },
  {
    route: "admin/hashrate-alerts/[id]/acknowledge",
    method: "POST",
    permissions: ["hashrate_alerts.acknowledge"],
    today: "staff",
  },
  {
    route: "wallets",
    method: "GET",
    permissions: ["wallets.view"],
    today: "staff",
  },
  {
    route: "wallets/mismatches",
    method: "GET",
    permissions: ["wallets.view"],
    today: "staff",
  },
  {
    route: "wallets/[poolSubaccountId]/history",
    method: "GET",
    permissions: ["wallets.view"],
    today: "staff",
  },
  {
    route: "wallets/[poolSubaccountId]/recheck",
    method: "POST",
    permissions: ["wallets.recheck"],
    today: "staff",
  },
  {
    route: "wallets/mismatches/[id]/[action]",
    method: "POST",
    permissions: ["wallets.resolve_mismatch"],
    today: "staff",
  },
  {
    route: "wallet/change-requests",
    method: "GET",
    permissions: ["wallets.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "wallet/change-requests/[id]/confirm",
    method: "POST",
    permissions: ["wallets.confirm"],
    today: "staff",
  },
  {
    route: "wallet/change-requests/[id]/approve",
    method: "POST",
    permissions: ["wallets.approve"],
    today: "staff",
  },
  {
    route: "wallet/change-requests/[id]/reject",
    method: "POST",
    permissions: ["wallets.reject"],
    today: "staff",
  },
  {
    route: "wallet/frequency-change-requests",
    method: "GET",
    permissions: ["wallets.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "wallet/frequency-change-requests/[id]/confirm",
    method: "POST",
    permissions: ["wallets.confirm"],
    today: "staff",
  },
  {
    route: "wallet/frequency-change-requests/[id]/approve",
    method: "POST",
    permissions: ["wallets.approve"],
    today: "staff",
  },
  {
    route: "wallet/frequency-change-requests/[id]/reject",
    method: "POST",
    permissions: ["wallets.reject"],
    today: "staff",
  },
  {
    route: "firmware-change-requests",
    method: "GET",
    permissions: ["firmware_requests.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "firmware-change-requests/[id]/confirm",
    method: "POST",
    permissions: ["firmware_requests.confirm"],
    today: "staff",
  },
  {
    route: "firmware-change-requests/[id]/approve",
    method: "POST",
    permissions: ["firmware_requests.approve"],
    today: "staff",
  },
  {
    route: "firmware-change-requests/[id]/reject",
    method: "POST",
    permissions: ["firmware_requests.reject"],
    today: "staff",
  },
  {
    route: "firmware-options",
    method: "GET",
    permissions: ["firmware_requests.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "firmware-options",
    method: "POST",
    permissions: ["firmware_requests.manage_options"],
    today: "staff",
    shared: true, // same file as the shared GET
  },
  {
    route: "firmware-options/[id]",
    method: "PUT",
    permissions: ["firmware_requests.manage_options"],
    today: "staff",
  },
  {
    route: "firmware-options/[id]",
    method: "DELETE",
    permissions: ["firmware_requests.manage_options"],
    today: "staff",
  },
  {
    route: "secondary-login-requests",
    method: "GET",
    permissions: ["signin_email_requests.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "secondary-login-requests/[id]/approve",
    method: "POST",
    permissions: ["signin_email_requests.approve"],
    today: "staff",
  },
  {
    route: "secondary-login-requests/[id]/reject",
    method: "POST",
    permissions: ["signin_email_requests.reject"],
    today: "staff",
  },
  {
    route: "guild-requests",
    method: "GET",
    permissions: ["guild_requests.view"],
    today: "staff",
  },
  // confirm and approve need .approve, reject needs .reject
  {
    route: "guild-requests/[kind]/[id]/[action]",
    method: "POST",
    permissions: ["guild_requests.approve", "guild_requests.reject"],
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
      expect(source).toMatch(
        /require(Any|Staff)?Permission\(|authorizeStaff\(/,
      );
      if (!row.shared) expect(source).not.toMatch(OLD_STAFF_CHECKS);
    });
  }
});
