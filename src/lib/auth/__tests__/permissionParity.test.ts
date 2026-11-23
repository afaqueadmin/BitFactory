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

  // Customer Groups. GET groups feeds the group picker in the create / edit
  // customer dialogs. GET groups/[id] and groups/available are staff only
  // since O6 (they used to let franchisees in without filtering members).
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
  // Simulated Accounts
  {
    route: "simulated-accounts",
    method: "GET",
    permissions: ["simulated_accounts.view"],
    today: "staff",
  },
  {
    route: "simulated-accounts/requests/[id]",
    method: "POST",
    permissions: ["simulated_accounts.review_requests"],
    today: "staff",
  },
  {
    route: "simulated-accounts/[id]/status",
    method: "POST",
    permissions: ["simulated_accounts.edit_status"],
    today: "staff",
  },
  {
    route: "simulated-accounts/[id]/convert",
    method: "POST",
    permissions: ["simulated_accounts.convert"],
    today: "staff",
  },
  {
    route: "simulated-accounts/[id]/entries",
    method: "GET",
    permissions: ["simulated_accounts.view"],
    today: "staff",
  },
  {
    route: "simulated-accounts/[id]/entries",
    method: "POST",
    permissions: ["simulated_accounts.manage_ledger"],
    today: "staff",
  },
  {
    route: "simulated-accounts/[id]/entries/[entryId]",
    method: "DELETE",
    permissions: ["simulated_accounts.manage_ledger"],
    today: "staff",
  },
  {
    route: "simulated-accounts/settings",
    method: "GET",
    permissions: ["simulated_accounts.view"],
    today: "staff",
  },
  {
    route: "simulated-accounts/settings",
    method: "PUT",
    permissions: ["simulated_accounts.edit_settings"],
    today: "staff",
  },
  // Finance (requireAccountingAdmin routes)
  {
    route: "accounting/bank-reconciliation/[id]/documents/[kind]",
    method: "GET",
    permissions: ["bank_reconciliation.view"],
    today: "staff",
  },
  {
    route: "accounting/bank-reconciliation/[id]",
    method: "PUT",
    permissions: ["bank_reconciliation.edit"],
    today: "staff",
  },
  {
    route: "accounting/bank-reconciliation/[id]",
    method: "DELETE",
    permissions: ["bank_reconciliation.delete"],
    today: "staff",
  },
  {
    route: "accounting/bank-reconciliation/export",
    method: "GET",
    permissions: ["bank_reconciliation.view"],
    today: "staff",
  },
  {
    route: "accounting/bank-reconciliation/invoices",
    method: "GET",
    permissions: ["bank_reconciliation.view"],
    today: "staff",
  },
  {
    route: "accounting/bank-reconciliation",
    method: "GET",
    permissions: ["bank_reconciliation.view"],
    today: "staff",
  },
  {
    route: "accounting/bank-reconciliation",
    method: "POST",
    permissions: ["bank_reconciliation.create"],
    today: "staff",
  },
  {
    route: "accounting/bank-transfers/[id]/receipt",
    method: "GET",
    permissions: ["transfers.view"],
    today: "staff",
  },
  {
    route: "accounting/bank-transfers/[id]",
    method: "PUT",
    permissions: ["transfers.edit"],
    today: "staff",
  },
  {
    route: "accounting/bank-transfers/[id]",
    method: "DELETE",
    permissions: ["transfers.delete"],
    today: "staff",
  },
  {
    route: "accounting/bank-transfers/export",
    method: "GET",
    permissions: ["transfers.view"],
    today: "staff",
  },
  {
    route: "accounting/bank-transfers",
    method: "GET",
    permissions: ["transfers.view"],
    today: "staff",
  },
  {
    route: "accounting/bank-transfers",
    method: "POST",
    permissions: ["transfers.create"],
    today: "staff",
  },
  {
    route: "accounting/banks/[id]",
    method: "PUT",
    permissions: ["banks.edit"],
    today: "staff",
  },
  {
    route: "accounting/banks/[id]",
    method: "DELETE",
    permissions: ["banks.delete"],
    today: "staff",
  },
  {
    route: "accounting/banks/[id]/statement/export",
    method: "GET",
    permissions: ["banks.view"],
    today: "staff",
  },
  {
    route: "accounting/banks/[id]/statement",
    method: "GET",
    permissions: ["banks.view"],
    today: "staff",
  },
  {
    route: "accounting/banks",
    method: "GET",
    permissions: [
      "banks.view",
      "transfers.view",
      "expenses.view",
      "capital_income.view",
      "bank_reconciliation.view",
      "security_deposits.view",
      "farm_tariffs.view",
      "hardware_purchases.view",
    ],
    today: "staff",
  },
  {
    route: "accounting/banks",
    method: "POST",
    permissions: ["banks.create"],
    today: "staff",
  },
  {
    route: "accounting/banks/statement/export",
    method: "GET",
    permissions: ["banks.view"],
    today: "staff",
  },
  {
    route: "accounting/banks/statement",
    method: "GET",
    permissions: ["banks.view"],
    today: "staff",
  },
  {
    route: "accounting/capital-income-heads/[id]",
    method: "PUT",
    permissions: ["capital_income.manage_heads"],
    today: "staff",
  },
  {
    route: "accounting/capital-income-heads/[id]",
    method: "DELETE",
    permissions: ["capital_income.manage_heads"],
    today: "staff",
  },
  {
    route: "accounting/capital-income-heads/export",
    method: "GET",
    permissions: ["capital_income.view"],
    today: "staff",
  },
  {
    route: "accounting/capital-income-heads",
    method: "GET",
    permissions: ["capital_income.view"],
    today: "staff",
  },
  {
    route: "accounting/capital-income-heads",
    method: "POST",
    permissions: ["capital_income.manage_heads"],
    today: "staff",
  },
  {
    route: "accounting/capital-income/[id]/documents/[kind]",
    method: "GET",
    permissions: ["capital_income.view"],
    today: "staff",
  },
  {
    route: "accounting/capital-income/[id]",
    method: "PUT",
    permissions: ["capital_income.edit"],
    today: "staff",
  },
  {
    route: "accounting/capital-income/[id]",
    method: "DELETE",
    permissions: ["capital_income.delete"],
    today: "staff",
  },
  {
    route: "accounting/capital-income/export",
    method: "GET",
    permissions: ["capital_income.view"],
    today: "staff",
  },
  {
    route: "accounting/capital-income/report",
    method: "GET",
    permissions: ["capital_income.view"],
    today: "staff",
  },
  {
    route: "accounting/capital-income",
    method: "GET",
    permissions: ["capital_income.view"],
    today: "staff",
  },
  {
    route: "accounting/capital-income",
    method: "POST",
    permissions: ["capital_income.create"],
    today: "staff",
  },
  {
    route: "accounting/currencies/[id]",
    method: "PUT",
    permissions: ["banks.manage_currencies"],
    today: "staff",
  },
  {
    route: "accounting/currencies/[id]",
    method: "DELETE",
    permissions: ["banks.manage_currencies"],
    today: "staff",
  },
  {
    route: "accounting/currencies",
    method: "GET",
    permissions: ["banks.view"],
    today: "staff",
  },
  {
    route: "accounting/currencies",
    method: "POST",
    permissions: ["banks.manage_currencies"],
    today: "staff",
  },
  {
    route: "accounting/deposit-movements/[id]/receipt",
    method: "GET",
    permissions: ["security_deposits.view"],
    today: "staff",
  },
  {
    route: "accounting/deposit-movements/[id]",
    method: "DELETE",
    permissions: ["security_deposits.delete"],
    today: "staff",
  },
  {
    route: "accounting/deposit-movements",
    method: "POST",
    permissions: ["security_deposits.record"],
    today: "staff",
  },
  {
    route: "accounting/email-runs/[runId]/export",
    method: "GET",
    permissions: ["email_reports.view"],
    today: "staff",
  },
  {
    route: "accounting/email-runs",
    method: "GET",
    permissions: ["email_reports.view"],
    today: "staff",
  },
  {
    route: "accounting/entities/[id]",
    method: "PUT",
    permissions: ["banks.manage_entities"],
    today: "staff",
  },
  {
    route: "accounting/entities/[id]",
    method: "DELETE",
    permissions: ["banks.manage_entities"],
    today: "staff",
  },
  {
    route: "accounting/entities",
    method: "GET",
    permissions: [
      "banks.view",
      "transfers.view",
      "expenses.view",
      "capital_income.view",
      "bank_reconciliation.view",
      "security_deposits.view",
      "farm_tariffs.view",
      "hardware_purchases.view",
    ],
    today: "staff",
  },
  {
    route: "accounting/entities",
    method: "POST",
    permissions: ["banks.manage_entities"],
    today: "staff",
  },
  {
    route: "accounting/expense-heads/[id]",
    method: "PUT",
    permissions: ["expenses.manage_heads"],
    today: "staff",
  },
  {
    route: "accounting/expense-heads/[id]",
    method: "DELETE",
    permissions: ["expenses.manage_heads"],
    today: "staff",
  },
  {
    route: "accounting/expense-heads/export",
    method: "GET",
    permissions: ["expenses.view"],
    today: "staff",
  },
  {
    route: "accounting/expense-heads",
    method: "GET",
    permissions: ["expenses.view"],
    today: "staff",
  },
  {
    route: "accounting/expense-heads",
    method: "POST",
    permissions: ["expenses.manage_heads"],
    today: "staff",
  },
  {
    route: "accounting/expense-payments/[id]/receipt",
    method: "GET",
    permissions: ["expenses.view"],
    today: "staff",
  },
  {
    route: "accounting/expense-payments/[id]",
    method: "PUT",
    permissions: ["expenses.record_payment"],
    today: "staff",
  },
  {
    route: "accounting/expense-payments/[id]",
    method: "DELETE",
    permissions: ["expenses.record_payment"],
    today: "staff",
  },
  {
    route: "accounting/expenses/[id]/documents/[kind]",
    method: "GET",
    permissions: ["expenses.view"],
    today: "staff",
  },
  {
    route: "accounting/expenses/[id]/payments",
    method: "POST",
    permissions: ["expenses.record_payment"],
    today: "staff",
  },
  {
    route: "accounting/expenses/[id]",
    method: "PUT",
    permissions: ["expenses.edit"],
    today: "staff",
  },
  {
    route: "accounting/expenses/[id]",
    method: "DELETE",
    permissions: ["expenses.delete"],
    today: "staff",
  },
  {
    route: "accounting/expenses/export",
    method: "GET",
    permissions: ["expenses.view"],
    today: "staff",
  },
  {
    route: "accounting/expenses/report",
    method: "GET",
    permissions: ["expenses.view"],
    today: "staff",
  },
  {
    route: "accounting/expenses",
    method: "GET",
    permissions: ["expenses.view"],
    today: "staff",
  },
  {
    route: "accounting/expenses",
    method: "POST",
    permissions: ["expenses.create"],
    today: "staff",
  },
  {
    route: "accounting/security-deposits/[vendorId]",
    method: "GET",
    permissions: ["security_deposits.view"],
    today: "staff",
  },
  {
    route: "accounting/security-deposits",
    method: "GET",
    permissions: ["security_deposits.view"],
    today: "staff",
  },
  {
    route: "accounting/uploads/presign",
    method: "POST",
    permissions: [
      "farm_tariffs.create",
      "farm_tariffs.edit",
      "farm_tariffs.record_payment",
      "hardware_purchases.create",
      "hardware_purchases.edit",
      "hardware_purchases.record_payment",
      "security_deposits.record",
      "bank_reconciliation.create",
      "bank_reconciliation.edit",
      "transfers.create",
      "transfers.edit",
      "capital_income.create",
      "capital_income.edit",
      "expenses.create",
      "expenses.edit",
      "expenses.record_payment",
    ],
    today: "staff",
  },
  {
    route: "accounting/vendors/[id]",
    method: "PUT",
    permissions: ["vendors.edit"],
    today: "staff",
  },
  {
    route: "accounting/vendors/[id]",
    method: "DELETE",
    permissions: ["vendors.delete"],
    today: "staff",
  },
  {
    route: "accounting/vendors",
    method: "GET",
    permissions: [
      "vendors.view",
      "farm_tariffs.view",
      "hardware_purchases.view",
      "security_deposits.view",
    ],
    today: "staff",
  },
  {
    route: "accounting/vendors",
    method: "POST",
    permissions: ["vendors.create"],
    today: "staff",
  },
  {
    route: "hardware-purchases/[id]/record-payment",
    method: "POST",
    permissions: ["hardware_purchases.record_payment"],
    today: "staff",
  },
  {
    route: "hardware-purchases/consolidated-payment",
    method: "GET",
    permissions: ["hardware_purchases.record_payment"],
    today: "staff",
  },
  {
    route: "hardware-purchases/consolidated-payment",
    method: "POST",
    permissions: ["hardware_purchases.record_payment"],
    today: "staff",
  },
  {
    route: "vendor-invoices/[id]/record-payment",
    method: "POST",
    permissions: ["farm_tariffs.record_payment"],
    today: "staff",
  },
  {
    route: "vendor-invoices/consolidated-payment",
    method: "GET",
    permissions: ["farm_tariffs.record_payment"],
    today: "staff",
  },
  {
    route: "vendor-invoices/consolidated-payment",
    method: "POST",
    permissions: ["farm_tariffs.record_payment"],
    today: "staff",
  },
  // Finance, Dashboard, Franchisee requests, Customers (standard staff gate)
  {
    route: "accounting/customer-group",
    method: "GET",
    permissions: [
      "invoicing.view",
      "invoicing.create",
      "invoicing.edit",
      "customers.create",
      "customers.edit",
    ],
    today: "staff",
  },
  {
    route: "accounting/customers/balances",
    method: "GET",
    permissions: ["invoicing.view", "invoicing.create", "invoicing.edit"],
    today: "staff",
  },
  {
    route: "accounting/customers/monthly-bill",
    method: "GET",
    permissions: ["invoicing.view", "invoicing.create", "invoicing.edit"],
    today: "staff",
  },
  {
    route: "accounting/miners",
    method: "GET",
    permissions: ["invoicing.view", "invoicing.create", "invoicing.edit"],
    today: "staff",
  },
  {
    route: "accounting/repair-miners",
    method: "GET",
    permissions: ["invoicing.view", "invoicing.create", "invoicing.edit"],
    today: "staff",
  },
  {
    route: "accounting/email-runs/[runId]/resend",
    method: "POST",
    permissions: ["email_reports.resend"],
    today: "staff",
  },
  {
    route: "accounting/email-runs/[runId]",
    method: "GET",
    permissions: ["email_reports.view"],
    today: "staff",
  },
  {
    route: "accounting/generate",
    method: "POST",
    permissions: ["recurring_invoices.generate"],
    today: "staff",
  },
  {
    route: "accounting/invoices/[id]/audit-log",
    method: "GET",
    permissions: ["invoicing.view"],
    today: "staff",
  },
  {
    route: "accounting/invoices/[id]/issue",
    method: "POST",
    permissions: ["invoicing.issue"],
    today: "staff",
  },
  {
    route: "accounting/invoices/[id]/record-payment",
    method: "POST",
    permissions: ["invoicing.record_payment"],
    today: "staff",
  },
  {
    route: "accounting/invoices/[id]",
    method: "PATCH",
    permissions: ["invoicing.edit"],
    today: "staff",
    shared: true, // same file as the shared GET
  },
  {
    route: "accounting/invoices/[id]",
    method: "PUT",
    permissions: ["invoicing.edit"],
    today: "staff",
    shared: true, // same file as the shared GET
  },
  {
    route: "accounting/invoices/[id]",
    method: "POST",
    permissions: ["invoicing.cancel"],
    today: "staff",
    shared: true, // same file as the shared GET
  },
  {
    route: "accounting/invoices/[id]",
    method: "DELETE",
    permissions: ["invoicing.delete"],
    today: "staff",
    shared: true, // same file as the shared GET
  },
  {
    route: "accounting/invoices/[id]/send-email",
    method: "POST",
    permissions: ["invoicing.send_email"],
    today: "staff",
  },
  {
    route: "accounting/invoices/bulk-send-email",
    method: "POST",
    permissions: ["invoicing.send_email"],
    today: "staff",
  },
  {
    route: "accounting/invoices/export",
    method: "GET",
    permissions: ["invoicing.view"],
    today: "staff",
  },
  {
    route: "accounting/invoices/paid-check",
    method: "POST",
    permissions: ["invoicing.view"],
    today: "staff",
  },
  {
    route: "accounting/invoices",
    method: "POST",
    permissions: ["invoicing.create"],
    today: "staff",
    shared: true, // same file as the shared GET
  },
  {
    route: "accounting/payments",
    method: "GET",
    permissions: ["invoicing.view"],
    today: "staff",
  },
  {
    route: "accounting/payments",
    method: "POST",
    permissions: ["invoicing.record_payment"],
    today: "staff",
  },
  {
    route: "accounting/pricing-configs/[id]",
    method: "PUT",
    permissions: ["pricing.edit"],
    today: "staff",
  },
  {
    route: "accounting/pricing-configs",
    method: "GET",
    permissions: ["pricing.view"],
    today: "staff",
  },
  {
    route: "accounting/pricing-configs",
    method: "POST",
    permissions: ["pricing.edit"],
    today: "staff",
  },
  {
    route: "accounting/recurring-invoices/[id]",
    method: "PUT",
    permissions: ["recurring_invoices.manage"],
    today: "staff",
  },
  {
    route: "accounting/recurring-invoices/[id]",
    method: "DELETE",
    permissions: ["recurring_invoices.manage"],
    today: "staff",
  },
  {
    route: "accounting/recurring-invoices",
    method: "GET",
    permissions: ["recurring_invoices.view"],
    today: "staff",
  },
  {
    route: "accounting/recurring-invoices",
    method: "POST",
    permissions: ["recurring_invoices.manage"],
    today: "staff",
  },
  {
    route: "accounting/statements/[customerId]/pdf",
    method: "GET",
    permissions: ["customer_statements.view"],
    today: "staff",
  },
  {
    route: "accounting/statements/[customerId]/print",
    method: "GET",
    permissions: ["customer_statements.view"],
    today: "staff",
  },
  {
    route: "accounting/statements/[customerId]/send-email",
    method: "POST",
    permissions: ["customer_statements.send_email"],
    today: "staff",
  },
  {
    route: "accounting/statements",
    method: "GET",
    permissions: ["customer_statements.view"],
    today: "staff",
  },
  {
    route: "admin/adjustments",
    method: "GET",
    permissions: ["credit_adjustments.view"],
    today: "staff",
  },
  {
    route: "admin/customer-balance/pdf",
    method: "GET",
    permissions: ["dashboard.view"],
    today: "staff",
  },
  {
    route: "admin/customer-balance",
    method: "GET",
    permissions: ["dashboard.view"],
    today: "staff",
  },
  {
    route: "admin/customer-requests/[id]/approve",
    method: "POST",
    permissions: ["franchisees.approve_customer_requests"],
    today: "staff",
  },
  {
    route: "admin/customer-requests/[id]/reject",
    method: "POST",
    permissions: ["franchisees.reject_customer_requests"],
    today: "staff",
  },
  {
    route: "admin/customer-requests/[id]",
    method: "DELETE",
    permissions: ["franchisees.reject_customer_requests"],
    today: "staff",
  },
  {
    route: "admin/customer-requests",
    method: "GET",
    permissions: ["franchisees.view"],
    today: "staff",
  },
  {
    route: "admin/dashboard",
    method: "GET",
    permissions: ["dashboard.view"],
    today: "staff",
  },
  {
    route: "admin/monthly-customer-billing/pdf",
    method: "GET",
    permissions: ["dashboard.view"],
    today: "staff",
  },
  {
    route: "admin/monthly-customer-billing",
    method: "GET",
    permissions: ["dashboard.view"],
    today: "staff",
  },
  {
    route: "cost-payments/hardwareRevenue",
    method: "GET",
    permissions: ["dashboard.view"],
    today: "staff",
  },
  {
    route: "cost-payments/hostingRevenue",
    method: "GET",
    permissions: ["dashboard.view"],
    today: "staff",
  },
  {
    route: "cost-payments",
    method: "POST",
    permissions: ["credit_adjustments.create"],
    today: "staff",
  },
  {
    route: "external-resource",
    method: "GET",
    permissions: ["external_resources.view", "miners.view"],
    today: "staff",
  },
  {
    route: "external-resource",
    method: "POST",
    permissions: ["external_resources.edit"],
    today: "staff",
  },
  {
    route: "hardware-purchases/[id]",
    method: "GET",
    permissions: ["hardware_purchases.view"],
    today: "staff",
  },
  {
    route: "hardware-purchases/[id]",
    method: "PUT",
    permissions: ["hardware_purchases.edit"],
    today: "staff",
  },
  {
    route: "hardware-purchases/[id]",
    method: "DELETE",
    permissions: ["hardware_purchases.delete"],
    today: "staff",
  },
  {
    route: "hardware-purchases/export",
    method: "GET",
    permissions: ["hardware_purchases.view"],
    today: "staff",
  },
  {
    route: "hardware-purchases",
    method: "POST",
    permissions: ["hardware_purchases.create"],
    today: "staff",
  },
  {
    route: "hardware-purchases",
    method: "GET",
    permissions: ["hardware_purchases.view"],
    today: "staff",
  },
  {
    route: "incentives/entries",
    method: "GET",
    permissions: ["franchisees.view"],
    today: "staff",
  },
  {
    route: "incentives/payouts",
    method: "GET",
    permissions: ["incentive_payouts.view"],
    today: "staff",
  },
  {
    route: "incentives/payouts",
    method: "POST",
    permissions: ["incentive_payouts.record"],
    today: "staff",
  },
  {
    route: "incentives/rates/[id]",
    method: "GET",
    permissions: ["franchisees.view"],
    today: "staff",
  },
  {
    route: "incentives/rates/[id]",
    method: "DELETE",
    permissions: ["franchisees.manage_incentive_rates"],
    today: "staff",
  },
  {
    route: "incentives/rates",
    method: "GET",
    permissions: ["franchisees.view"],
    today: "staff",
  },
  {
    route: "incentives/rates",
    method: "POST",
    permissions: ["franchisees.manage_incentive_rates"],
    today: "staff",
  },
  {
    route: "memos",
    method: "POST",
    permissions: ["memos.create"],
    today: "staff",
    shared: true, // same file as the shared GET
  },
  {
    route: "user/[id]/account-type",
    method: "POST",
    permissions: ["customers.change_account_type"],
    today: "staff",
  },
  {
    route: "user/[id]/change-password",
    method: "PUT",
    permissions: ["customers.reset_password"],
    today: "staff",
  },
  {
    route: "user/[id]/restore",
    method: "POST",
    permissions: ["customers.restore"],
    today: "staff",
  },
  {
    route: "user/[id]",
    method: "PUT",
    permissions: ["customers.edit"],
    today: "staff",
  },
  {
    route: "user/[id]",
    method: "DELETE",
    permissions: ["customers.delete"],
    today: "staff",
  },
  {
    route: "user/[id]/sign-out-everywhere",
    method: "POST",
    permissions: ["customers.sign_out"],
    today: "staff",
  },
  {
    route: "user/check-email",
    method: "GET",
    permissions: [
      "customers.view",
      "customers.create",
      "customers.edit",
      "franchisees.create",
      "franchisees.edit",
    ],
    today: "staff",
  },
  {
    route: "user/subaccounts/existing",
    method: "GET",
    permissions: [
      "customers.view",
      "customers.create",
      "customers.edit",
      "franchisees.create",
      "franchisees.edit",
      "franchisees.approve_customer_requests",
    ],
    today: "staff",
  },
  {
    route: "vendor-invoices/[id]",
    method: "GET",
    permissions: ["farm_tariffs.view"],
    today: "staff",
  },
  {
    route: "vendor-invoices/[id]",
    method: "PUT",
    permissions: ["farm_tariffs.edit"],
    today: "staff",
  },
  {
    route: "vendor-invoices/[id]",
    method: "DELETE",
    permissions: ["farm_tariffs.delete"],
    today: "staff",
  },
  {
    route: "vendor-invoices/export",
    method: "GET",
    permissions: ["farm_tariffs.view"],
    today: "staff",
  },
  {
    route: "vendor-invoices",
    method: "POST",
    permissions: ["farm_tariffs.create"],
    today: "staff",
  },
  {
    route: "vendor-invoices",
    method: "GET",
    permissions: ["farm_tariffs.view"],
    today: "staff",
  },
  // Payments, account creation, payment settings, PDF preview
  {
    route: "accounting/payments/[id]",
    method: "GET",
    permissions: ["invoicing.view"],
    today: "staff",
  },
  {
    route: "accounting/payments/[id]",
    method: "DELETE",
    permissions: ["invoicing.delete_payment"],
    today: "super_admin",
  },
  {
    route: "user/create",
    method: "POST",
    permissions: ["customers.create", "customers.create_staff"],
    today: "staff",
    shared: true, // isStaffRole checks the new account's role
  },
  {
    route: "settings/payment",
    method: "GET",
    permissions: [
      "payment_settings.view",
      "invoicing.create",
      "invoicing.edit",
    ],
    today: "staff",
  },
  {
    route: "settings/payment",
    method: "PUT",
    permissions: ["payment_settings.edit"],
    today: "staff",
  },
  {
    route: "test/preview-invoice-pdf",
    method: "GET",
    permissions: ["invoicing.view"],
    today: "staff",
  },
  // Wallet settings write
  {
    route: "wallet/settings",
    method: "POST",
    permissions: ["customers.edit"],
    today: "staff",
    shared: true, // GET is shared; its staff branch needs customers.view
  },
  // Guilds
  {
    route: "guilds",
    method: "GET",
    permissions: ["guilds.view"],
    today: "staff",
  },
  {
    route: "guilds",
    method: "POST",
    permissions: ["guilds.create"],
    today: "staff",
  },
  {
    route: "guilds/[id]",
    method: "GET",
    permissions: ["guilds.view"],
    today: "staff",
  },
  {
    route: "guilds/[id]",
    method: "PATCH",
    permissions: ["guilds.edit"],
    today: "staff",
  },
  {
    route: "guilds/[id]/history",
    method: "GET",
    permissions: ["guilds.view"],
    today: "staff",
  },
  {
    route: "guilds/[id]/members",
    method: "POST",
    permissions: ["guilds.edit"],
    today: "staff",
  },
  {
    route: "guilds/[id]/members/[membershipId]",
    method: "DELETE",
    permissions: ["guilds.edit"],
    today: "staff",
  },
  {
    route: "guilds/[id]/handover",
    method: "POST",
    permissions: ["guilds.handover"],
    today: "staff",
  },
  {
    route: "guilds/[id]/distributions",
    method: "POST",
    permissions: ["guilds.calculate_distribution"],
    today: "staff",
  },
  {
    route: "guilds/payout-batches",
    method: "GET",
    permissions: ["guilds.view"],
    today: "staff",
  },
  {
    route: "guilds/payout-batches",
    method: "POST",
    permissions: ["guilds.record_payout"],
    today: "staff",
  },
  {
    route: "guilds/payout-settings",
    method: "GET",
    permissions: ["guilds.view"],
    today: "staff",
  },
  {
    route: "guilds/payout-settings",
    method: "PATCH",
    permissions: ["guilds.edit_payout_settings"],
    today: "staff",
  },
  // Stage 3 remainder (hand-edited, Franchisees, Access Rules)
  {
    route: "accounting/pricing-configs/[id]",
    method: "GET",
    permissions: ["pricing.view"],
    today: "staff",
  },
  {
    route: "accounting/recurring-invoices/[id]",
    method: "GET",
    permissions: ["recurring_invoices.view"],
    today: "staff",
  },
  {
    route: "vendor-invoices/[id]/documents/[kind]",
    method: "GET",
    permissions: ["farm_tariffs.view"],
    today: "staff",
  },
  {
    route: "vendor-invoices/[id]/documents/[kind]",
    method: "PUT",
    permissions: ["farm_tariffs.edit"],
    today: "staff",
  },
  {
    route: "vendor-invoices/[id]/documents/[kind]",
    method: "DELETE",
    permissions: ["farm_tariffs.edit"],
    today: "staff",
  },
  {
    route: "hardware-purchases/[id]/documents/[kind]",
    method: "GET",
    permissions: ["hardware_purchases.view"],
    today: "staff",
  },
  {
    route: "hardware-purchases/[id]/documents/[kind]",
    method: "PUT",
    permissions: ["hardware_purchases.edit"],
    today: "staff",
  },
  {
    route: "hardware-purchases/[id]/documents/[kind]",
    method: "DELETE",
    permissions: ["hardware_purchases.edit"],
    today: "staff",
  },
  {
    route: "admin/adjustments/[id]",
    method: "PATCH",
    permissions: ["credit_adjustments.edit"],
    today: "staff",
  },
  {
    route: "admin/adjustments/[id]",
    method: "DELETE",
    permissions: ["credit_adjustments.delete"],
    today: "staff",
  },
  {
    route: "admin/adjustments/[id]/audit-log",
    method: "GET",
    permissions: ["credit_adjustments.view"],
    today: "staff",
  },
  {
    route: "admin/payment-details",
    method: "GET",
    permissions: ["invoice_pdf_settings.view"],
    today: "staff",
  },
  {
    route: "admin/payment-details",
    method: "PUT",
    permissions: ["invoice_pdf_settings.edit"],
    today: "staff",
  },
  {
    route: "memos/[id]",
    method: "GET",
    permissions: ["memos.view"],
    today: "staff",
  },
  {
    route: "memos/[id]/void",
    method: "POST",
    permissions: ["memos.void"],
    today: "staff",
  },
  {
    route: "memos/[id]/audit-log",
    method: "GET",
    permissions: ["memos.view"],
    today: "staff",
  },
  {
    route: "memos",
    method: "GET",
    permissions: ["memos.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "memos/[id]/download",
    method: "GET",
    permissions: ["memos.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "cost-payments",
    method: "GET",
    permissions: ["credit_adjustments.view", "customers.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "accounting/invoices",
    method: "GET",
    permissions: ["invoicing.view", "customers.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "accounting/invoices/[id]",
    method: "GET",
    permissions: ["invoicing.view", "customers.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "accounting/invoices/[id]/download",
    method: "GET",
    permissions: [
      "invoicing.view",
      "customers.view",
      "customer_statements.view",
    ],
    today: "staff",
    shared: true,
  },
  {
    route: "accounting/customers",
    method: "GET",
    permissions: [
      "invoicing.view",
      "invoicing.create",
      "invoicing.edit",
      "credit_adjustments.view",
      "credit_adjustments.create",
      "memos.view",
      "memos.create",
      "recurring_invoices.view",
      "recurring_invoices.manage",
      "dashboard.view",
    ],
    today: "staff",
    shared: true,
  },
  {
    route: "accounting/statements/customers",
    method: "GET",
    permissions: ["customer_statements.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "customer-balance",
    method: "GET",
    permissions: ["dashboard.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "user/all",
    method: "GET",
    permissions: [
      "customers.view",
      "activity_log.view",
      "audit_log.view",
      "miners.view",
      "pools.view",
    ],
    today: "staff",
    shared: true,
  },
  {
    route: "wallet/earnings-24h",
    method: "GET",
    permissions: ["customers.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "wallet/earnings-summary",
    method: "GET",
    permissions: ["customers.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "wallet/profit-loss",
    method: "GET",
    permissions: ["customers.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "wallet/transactions",
    method: "GET",
    permissions: ["customers.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "wallet/settings",
    method: "GET",
    permissions: ["customers.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "user/balance",
    method: "GET",
    permissions: ["customers.view", "credit_adjustments.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "invoices/[id]/btcpay",
    method: "POST",
    permissions: ["invoicing.record_payment"],
    today: "staff",
    shared: true,
  },
  {
    route: "user/[id]/logins",
    method: "GET",
    permissions: ["customers.view"],
    today: "staff",
  },
  {
    route: "user/[id]/logins",
    method: "POST",
    permissions: ["customers.manage_signin_emails"],
    today: "staff",
  },
  {
    route: "user/[id]/logins",
    method: "PATCH",
    permissions: ["customers.manage_signin_emails"],
    today: "staff",
  },
  {
    route: "user/[id]/logins",
    method: "DELETE",
    permissions: ["customers.manage_signin_emails"],
    today: "staff",
  },
  {
    route: "repair-charges",
    method: "GET",
    permissions: ["repair_charges.view"],
    today: "staff",
    shared: true,
  },
  {
    route: "repair-charges",
    method: "POST",
    permissions: ["repair_charges.edit"],
    today: "staff",
    shared: true, // same file as the shared GET
  },
  {
    route: "repair-charges/[id]",
    method: "PUT",
    permissions: ["repair_charges.edit"],
    today: "staff",
  },
  {
    route: "repair-charges/[id]",
    method: "DELETE",
    permissions: ["repair_charges.edit"],
    today: "staff",
  },
  {
    route: "repair-charges/reorder",
    method: "PUT",
    permissions: ["repair_charges.edit"],
    today: "staff",
  },
  {
    route: "repair-charges/site-settings",
    method: "PUT",
    permissions: ["repair_charges.edit"],
    today: "staff",
  },
  {
    route: "accounting/invoices/[id]/mark-unpaid",
    method: "GET",
    permissions: ["invoicing.mark_unpaid"],
    today: "super_admin",
  },
  {
    route: "accounting/invoices/[id]/mark-unpaid",
    method: "POST",
    permissions: ["invoicing.mark_unpaid"],
    today: "super_admin",
  },
  {
    route: "accounting/invoices/[id]/cancel-payment",
    method: "GET",
    permissions: ["invoicing.cancel_payment"],
    today: "super_admin",
  },
  {
    route: "accounting/invoices/[id]/cancel-payment",
    method: "POST",
    permissions: ["invoicing.cancel_payment"],
    today: "super_admin",
  },
  {
    route: "vendor-invoices/[id]/mark-unpaid",
    method: "GET",
    permissions: ["farm_tariffs.mark_unpaid"],
    today: "super_admin",
  },
  {
    route: "vendor-invoices/[id]/mark-unpaid",
    method: "POST",
    permissions: ["farm_tariffs.mark_unpaid"],
    today: "super_admin",
  },
  {
    route: "hardware-purchases/[id]/mark-unpaid",
    method: "GET",
    permissions: ["hardware_purchases.mark_unpaid"],
    today: "super_admin",
  },
  {
    route: "hardware-purchases/[id]/mark-unpaid",
    method: "POST",
    permissions: ["hardware_purchases.mark_unpaid"],
    today: "super_admin",
  },
  {
    route: "franchisees",
    method: "GET",
    permissions: ["franchisees.view"],
    today: "staff",
  },
  {
    route: "franchisees",
    method: "POST",
    permissions: ["franchisees.create"],
    today: "staff",
  },
  {
    route: "franchisees/[id]",
    method: "GET",
    permissions: ["franchisees.view"],
    today: "staff",
  },
  {
    route: "franchisees/[id]",
    method: "PUT",
    permissions: ["franchisees.edit"],
    today: "staff",
  },
  {
    route: "franchisees/[id]",
    method: "DELETE",
    permissions: ["franchisees.delete"],
    today: "super_admin",
  },
  {
    route: "franchisees/[id]/customers",
    method: "GET",
    permissions: ["franchisees.view"],
    today: "staff",
  },
  {
    route: "admin/staff-access",
    method: "GET",
    permissions: ["access_rules.view"],
    today: "super_admin",
  },
  {
    route: "admin/staff-access/requests",
    method: "GET",
    permissions: ["access_rules.view"],
    today: "super_admin",
  },
  {
    route: "admin/staff-access/[userId]",
    method: "PUT",
    permissions: ["access_rules.manage"],
    today: "super_admin",
  },
  {
    route: "admin/staff-access/[userId]/time",
    method: "POST",
    permissions: ["access_rules.manage"],
    today: "super_admin",
  },
  {
    route: "admin/staff-access/[userId]/windows",
    method: "POST",
    permissions: ["access_rules.manage"],
    today: "super_admin",
  },
  {
    route: "admin/staff-access/[userId]/windows",
    method: "DELETE",
    permissions: ["access_rules.manage"],
    today: "super_admin",
  },
  {
    route: "admin/staff-access/[userId]/passkey-exception",
    method: "POST",
    permissions: ["access_rules.manage"],
    today: "super_admin",
  },
  {
    route: "admin/staff-access/[userId]/passkey-exception",
    method: "DELETE",
    permissions: ["access_rules.manage"],
    today: "super_admin",
  },
  {
    route: "admin/staff-access/[userId]/passkeys/[credentialId]",
    method: "DELETE",
    permissions: ["access_rules.manage"],
    today: "super_admin",
  },
  {
    route: "admin/staff-access/holidays",
    method: "POST",
    permissions: ["access_rules.manage"],
    today: "super_admin",
  },
  {
    route: "admin/staff-access/holidays",
    method: "DELETE",
    permissions: ["access_rules.manage"],
    today: "super_admin",
  },
  {
    route: "admin/customers/[id]/wallet-email",
    method: "GET",
    permissions: ["customers.send_wallet_email"],
    today: "staff",
  },
  {
    route: "admin/customers/[id]/wallet-email",
    method: "POST",
    permissions: ["customers.send_wallet_email"],
    today: "staff",
  },
  {
    route: "admin/customers/[id]/wallet-email/pdf",
    method: "GET",
    permissions: ["customers.send_wallet_email"],
    today: "staff",
  },
  {
    route: "user/profile",
    method: "GET",
    permissions: ["customers.view"],
    today: "staff",
    shared: true,
  },
  // Role management (new in stage 5, SUPER_ADMIN only)
  {
    route: "admin/roles",
    method: "GET",
    permissions: ["roles.view"],
    today: "super_admin",
  },
  {
    route: "admin/roles",
    method: "POST",
    permissions: ["roles.manage"],
    today: "super_admin",
  },
  {
    route: "admin/roles/[id]",
    method: "PUT",
    permissions: ["roles.manage"],
    today: "super_admin",
  },
  {
    route: "admin/roles/[id]",
    method: "DELETE",
    permissions: ["roles.manage"],
    today: "super_admin",
  },
  {
    route: "admin/roles/[id]/assignments",
    method: "POST",
    permissions: ["roles.assign"],
    today: "super_admin",
  },
  {
    route: "admin/roles/[id]/assignments",
    method: "DELETE",
    permissions: ["roles.assign"],
    today: "super_admin",
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
