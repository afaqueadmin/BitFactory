/**
 * The RBAC permission catalogue: every admin action as `module.action`, the
 * module being the admin sidebar module. Source of truth for permission names
 * (custom roles store these strings; unknown ones are ignored). Matches the
 * reviewed catalogue: https://claude.ai/artifact/PsuVm7YwTw3UvBb6G6yuY7
 *
 * No database access: safe to import anywhere, including the browser.
 */
export const PERMISSIONS = {
  // dashboard
  "dashboard.view": {
    label:
      "Company totals, monthly customer billing, customer balances, and their PDFs",
  },
  // tickets
  "tickets.view": { label: "List and open tickets" },
  "tickets.reply": { label: "Post a message on a ticket" },
  "tickets.edit": { label: "Change a ticket's status" },
  "tickets.assign": {
    label: "Assign a ticket to a staff member; list staff for that",
  },
  // hashrate_alerts
  "hashrate_alerts.view": { label: "List alerts" },
  "hashrate_alerts.acknowledge": {
    label: "Acknowledge one alert, or all that match the filters",
  },
  // wallets
  "wallets.view": {
    label:
      "Wallet records, Luxor mismatch alerts, wallet and payment frequency requests",
  },
  "wallets.recheck": { label: "Re-read a subaccount's wallet from Luxor" },
  "wallets.resolve_mismatch": {
    label: 'Close a mismatch: "Luxor updated" or "accept Luxor\'s address"',
    sensitive: true,
  },
  "wallets.confirm": {
    label:
      "Record that the client confirmed the change outside the app (the step before Approve)",
    sensitive: true,
  },
  "wallets.approve": {
    label: "Approve a wallet or payment frequency change",
    sensitive: true,
  },
  "wallets.reject": { label: "Reject a wallet or payment frequency change" },
  // firmware_requests
  "firmware_requests.view": { label: "List requests and firmware options" },
  "firmware_requests.confirm": { label: "Record the client's confirmation" },
  "firmware_requests.approve": { label: "Approve a request", sensitive: true },
  "firmware_requests.reject": { label: "Reject a request" },
  "firmware_requests.manage_options": {
    label: "Add, edit and remove firmware options",
  },
  // signin_email_requests
  "signin_email_requests.view": { label: "List requests" },
  "signin_email_requests.approve": {
    label: "Add the requested sign-in email to the account",
    sensitive: true,
  },
  "signin_email_requests.reject": { label: "Reject a request" },
  // guild_requests
  "guild_requests.view": { label: "List split and member requests" },
  "guild_requests.approve": {
    label: "Approve a split or member request",
    sensitive: true,
  },
  "guild_requests.reject": { label: "Reject a request" },
  // customers
  "customers.view": {
    label:
      "List accounts and open an account's details, sign-in emails and wallet settings",
  },
  "customers.create": {
    label: "Create a client, franchisee, guild or simulated account",
  },
  "customers.create_staff": {
    label: "Create an ADMIN, ACCOUNTING or SUPER_ADMIN account",
    sensitive: true,
  },
  "customers.edit": {
    label: "Edit account details, subaccounts, pool links and wallet settings",
  },
  "customers.change_email": {
    label: "Change an account's email",
    sensitive: true,
  },
  "customers.manage_signin_emails": {
    label: "Add, change and remove an account's extra sign-in emails",
    sensitive: true,
  },
  "customers.change_account_type": {
    label: "Change an account's role; signs it out",
    sensitive: true,
  },
  "customers.reset_password": {
    label: "Set a new password for an account",
    sensitive: true,
  },
  "customers.sign_out": { label: "Sign an account out everywhere" },
  "customers.delete": {
    label: "Delete an account (refused while it has miners)",
    sensitive: true,
  },
  "customers.restore": { label: "Restore a deleted account" },
  "customers.send_wallet_email": {
    label: "Preview and send a customer's wallet statement email",
  },
  // customer_groups
  "customer_groups.view": { label: "List groups and their subaccounts" },
  "customer_groups.create": { label: "Create a group" },
  "customer_groups.edit": {
    label: "Rename a group; add and remove subaccounts",
  },
  "customer_groups.delete": { label: "Delete a group" },
  // subaccounts
  "subaccounts.view": { label: "All Luxor subaccounts across sites" },
  // franchisees
  "franchisees.view": {
    label: "Franchisees, their customers, incentive rates and entries",
  },
  "franchisees.create": { label: "Create a franchisee" },
  "franchisees.edit": { label: "Edit a franchisee" },
  "franchisees.delete": { label: "Delete a franchisee", sensitive: true },
  "franchisees.manage_incentive_rates": {
    label: "Add and remove incentive rates",
  },
  "franchisees.approve_customer_requests": {
    label: "Approve a franchisee's request for a new customer account",
    sensitive: true,
  },
  "franchisees.reject_customer_requests": {
    label: "Reject or delete such a request",
  },
  // guilds
  "guilds.view": {
    label: "Guilds, members, history, payout batches and payout settings",
  },
  "guilds.create": { label: "Create a guild" },
  "guilds.edit": { label: "Edit a guild; add and remove members" },
  "guilds.handover": {
    label: "Make another member the Guildmaster",
    sensitive: true,
  },
  "guilds.calculate_distribution": {
    label: "Calculate or recalculate a month's distribution",
  },
  "guilds.record_payout": {
    label: "Record a payout batch as sent",
    sensitive: true,
  },
  "guilds.edit_payout_settings": {
    label: "Change guild payout settings",
    sensitive: true,
  },
  // simulated_accounts
  "simulated_accounts.view": {
    label: "Accounts, sign-up requests, ledgers and settings",
  },
  "simulated_accounts.review_requests": {
    label: "Approve or reject a sign-up request",
  },
  "simulated_accounts.edit_status": {
    label: "Activate or deactivate an account",
  },
  "simulated_accounts.convert": {
    label: "Convert a simulated account into a real client",
    sensitive: true,
  },
  "simulated_accounts.manage_ledger": {
    label: "Add and remove simulated cost entries",
  },
  "simulated_accounts.edit_settings": { label: "Change simulation settings" },
  // miners
  "miners.view": {
    label: "Miners, repair notes, hashrate and pool history, daily costs",
  },
  "miners.create": { label: "Add a miner" },
  "miners.edit": { label: "Edit one miner or many in bulk" },
  "miners.delete": { label: "Delete a miner", sensitive: true },
  "miners.bulk_delete": {
    label: "Delete many miners at once",
    sensitive: true,
  },
  "miners.log_restart": { label: "Record a miner restart" },
  // pool_workers
  "pool_workers.view": { label: "Workers the pools report. View only." },
  // pools
  "pools.view": { label: "The pool catalogue and clients' pool credentials" },
  "pools.create": { label: "Add a pool" },
  "pools.edit": { label: "Edit a pool" },
  "pools.delete": { label: "Delete a pool" },
  "pools.manage_credentials": {
    label: "Add, change and remove a client's pool credential",
    sensitive: true,
  },
  // transaction_history
  "transaction_history.view": {
    label: "Pool payouts and charges per customer",
  },
  // locations
  "locations.view": { label: "Hosting spaces and capacity" },
  "locations.create": { label: "Add a space" },
  "locations.edit": { label: "Edit a space" },
  "locations.delete": { label: "Delete a space" },
  // hardware_models
  "hardware_models.view": { label: "Miner models and specs" },
  "hardware_models.create": { label: "Add a model" },
  "hardware_models.edit": { label: "Edit a model" },
  "hardware_models.delete": { label: "Delete a model" },
  "hardware_models.procure": { label: "Record procured stock for a model" },
  // invoicing
  "invoicing.view": {
    label:
      "Invoices, their PDFs, history, payments, and the pick-lists used to build invoices",
  },
  "invoicing.create": { label: "Create an invoice, one at a time or in bulk" },
  "invoicing.edit": { label: "Edit an invoice that isn't paid" },
  "invoicing.issue": { label: "Issue a draft: emails it with its PDF" },
  "invoicing.cancel": {
    label: "Cancel an issued, unpaid invoice",
    sensitive: true,
  },
  "invoicing.delete": { label: "Delete an invoice", sensitive: true },
  "invoicing.record_payment": {
    label: "Record a payment against an invoice",
    sensitive: true,
  },
  "invoicing.send_email": { label: "Email one invoice or many" },
  "invoicing.mark_unpaid": {
    label:
      "Mark a paid invoice unpaid, or move a paid invoice to another status. Voids its payments and deletes its Bank Reconciliation entry.",
    sensitive: true,
  },
  "invoicing.cancel_payment": {
    label: "Cancel a recorded payment",
    sensitive: true,
  },
  "invoicing.delete_payment": {
    label: "Delete one payment. No screen uses this today.",
    sensitive: true,
  },
  // recurring_invoices
  "recurring_invoices.view": { label: "Recurring invoice templates" },
  "recurring_invoices.manage": { label: "Create, edit and delete templates" },
  "recurring_invoices.generate": {
    label: "Generate invoices from the templates",
  },
  // email_reports
  "email_reports.view": { label: "Invoice email runs and their results" },
  "email_reports.resend": { label: "Resend the failed emails of a run" },
  // farm_tariffs
  "farm_tariffs.view": { label: "Vendor invoices and their documents" },
  "farm_tariffs.create": { label: "Add a vendor invoice" },
  "farm_tariffs.edit": {
    label: "Edit a pending invoice; replace or remove its documents",
  },
  "farm_tariffs.delete": { label: "Delete a vendor invoice", sensitive: true },
  "farm_tariffs.record_payment": {
    label: "Pay one invoice, or several in one transfer",
    sensitive: true,
  },
  "farm_tariffs.mark_unpaid": {
    label: "Mark a paid vendor invoice unpaid",
    sensitive: true,
  },
  // hardware_purchases
  "hardware_purchases.view": { label: "Purchases and their documents" },
  "hardware_purchases.create": { label: "Add a purchase" },
  "hardware_purchases.edit": {
    label: "Edit a pending purchase; replace or remove its documents",
  },
  "hardware_purchases.delete": { label: "Delete a purchase", sensitive: true },
  "hardware_purchases.record_payment": {
    label: "Pay one purchase, or several in one transfer",
    sensitive: true,
  },
  "hardware_purchases.mark_unpaid": {
    label: "Mark a paid purchase unpaid",
    sensitive: true,
  },
  // security_deposits
  "security_deposits.view": {
    label: "Deposits per vendor and their movements",
  },
  "security_deposits.record": {
    label: "Record a deposit, return or adjustment",
    sensitive: true,
  },
  "security_deposits.delete": { label: "Delete a movement", sensitive: true },
  // memos
  "memos.view": { label: "Memos, their PDFs and history" },
  "memos.create": { label: "Create a memo" },
  "memos.void": { label: "Void a memo", sensitive: true },
  // credit_adjustments
  "credit_adjustments.view": { label: "Adjustments and their history" },
  "credit_adjustments.create": {
    label: "Add an adjustment to a customer's balance",
    sensitive: true,
  },
  "credit_adjustments.edit": { label: "Edit an adjustment", sensitive: true },
  "credit_adjustments.delete": {
    label: "Delete an adjustment",
    sensitive: true,
  },
  // banks
  "banks.view": {
    label:
      "Banks, entities, currencies, and per-bank and consolidated statements",
  },
  "banks.create": { label: "Add a bank" },
  "banks.edit": { label: "Edit a bank", sensitive: true },
  "banks.delete": { label: "Delete a bank", sensitive: true },
  "banks.manage_entities": { label: "Add, edit and delete entities" },
  "banks.manage_currencies": { label: "Add, edit and delete currencies" },
  // transfers
  "transfers.view": { label: "Transfers between banks and their receipts" },
  "transfers.create": { label: "Record a transfer", sensitive: true },
  "transfers.edit": { label: "Edit a transfer", sensitive: true },
  "transfers.delete": { label: "Delete a transfer", sensitive: true },
  // expenses
  "expenses.view": {
    label: "Expenses, heads, reports, documents and payment receipts",
  },
  "expenses.create": { label: "Add an expense" },
  "expenses.edit": { label: "Edit an expense" },
  "expenses.delete": { label: "Delete an expense", sensitive: true },
  "expenses.record_payment": {
    label: "Pay an expense; edit or delete its payments",
    sensitive: true,
  },
  "expenses.manage_heads": { label: "Add, edit and delete expense heads" },
  // capital_income
  "capital_income.view": { label: "Entries, heads, reports and documents" },
  "capital_income.create": { label: "Add an entry", sensitive: true },
  "capital_income.edit": { label: "Edit an entry", sensitive: true },
  "capital_income.delete": { label: "Delete an entry", sensitive: true },
  "capital_income.manage_heads": { label: "Add, edit and delete heads" },
  // bank_reconciliation
  "bank_reconciliation.view": {
    label: "Paid invoices missing from bank statements, entries and documents",
  },
  "bank_reconciliation.create": {
    label: "Add an entry to a bank statement",
    sensitive: true,
  },
  "bank_reconciliation.edit": { label: "Edit an entry", sensitive: true },
  "bank_reconciliation.delete": { label: "Delete an entry", sensitive: true },
  // customer_statements
  "customer_statements.view": {
    label: "Statements per customer, as PDF or for printing",
  },
  "customer_statements.send_email": {
    label: "Email a statement to the customer",
  },
  // incentive_payouts
  "incentive_payouts.view": { label: "Payouts to franchisees" },
  "incentive_payouts.record": { label: "Record a payout", sensitive: true },
  // pricing
  "pricing.view": { label: "Pricing configurations" },
  "pricing.edit": {
    label: "Create and change pricing configurations",
    sensitive: true,
  },
  // repair_charges
  "repair_charges.view": { label: "Repair charge list and site settings" },
  "repair_charges.edit": {
    label: "Add, edit, delete and reorder charges; site settings",
  },
  // invoice_pdf_settings
  "invoice_pdf_settings.view": {
    label: "Company and payment details printed on invoices",
  },
  "invoice_pdf_settings.edit": {
    label: "Change those details",
    sensitive: true,
  },
  // vendors
  "vendors.view": { label: "Vendor list" },
  "vendors.create": { label: "Add a vendor" },
  "vendors.edit": { label: "Edit a vendor" },
  "vendors.delete": { label: "Delete a vendor" },
  // customer_payback
  "customer_payback.view": { label: "Customer payback analysis" },
  "customer_payback.edit_settings": { label: "Customer payback settings" },
  // company_payback
  "company_payback.view": { label: "Company payback analysis" },
  "company_payback.edit_settings": { label: "Company payback settings" },
  // activity_log
  "activity_log.view": {
    label: "/activity-log: client sign-in sessions and tabs visited",
  },
  // audit_log
  "audit_log.view": { label: "/audit-log: every staff and system action" },
  // access_rules
  "access_rules.view": {
    label: "/access-rules: staff rules, live state, time requests, holidays",
  },
  "access_rules.manage": {
    label:
      "Edit rules, add time, one-off windows, holidays, passkey exceptions; remove a staff passkey",
    sensitive: true,
  },
  // db_data
  "db_data.view": {
    label:
      "/db-data-management/*: stored pool subaccounts, daily snapshots, worker metrics and pool transactions. View only; there are no write routes.",
  },
  // payment_settings
  "payment_settings.view": {
    label:
      "/settings/payment: crypto payment options on invoices. Also read when creating an invoice.",
  },
  "payment_settings.edit": { label: "Change those options", sensitive: true },
  // external_resources
  "external_resources.view": {
    label: "/external-resource: links to data sources the dashboard uses",
  },
  "external_resources.edit": { label: "Change those links" },
  // roles
  "roles.view": { label: "See roles and who has them" },
  "roles.manage": {
    label: "Create, edit and delete custom roles",
    sensitive: true,
  },
  "roles.assign": {
    label: "Give roles to and remove roles from staff accounts",
    sensitive: true,
  },
} as const satisfies Record<string, { label: string; sensitive?: true }>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Today only a SUPER_ADMIN may do these. Custom roles can never grant them. */
export const SA_ONLY: ReadonlySet<Permission> = new Set<Permission>([
  "tickets.assign",
  "customers.create_staff",
  "customers.change_email",
  "franchisees.delete",
  "invoicing.mark_unpaid",
  "invoicing.cancel_payment",
  "farm_tariffs.mark_unpaid",
  "hardware_purchases.mark_unpaid",
  "access_rules.view",
  "access_rules.manage",
  "roles.view",
  "roles.manage",
  "roles.assign",
  "invoicing.delete_payment",
]);

export function isPermission(name: string): name is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, name);
}

/** What a custom role may grant: a catalogue permission that isn't SA-only. */
export function isGrantable(name: string): name is Permission {
  return isPermission(name) && !SA_ONLY.has(name);
}

/** ADMIN and ACCOUNTING: everything except SA-only, the same as today. */
const ADMIN_PERMISSIONS = ALL_PERMISSIONS.filter((p) => !SA_ONLY.has(p));

/**
 * A staff account's effective permissions: its system role's list plus
 * whatever its custom roles grant (allow-only, a union). SUPER_ADMIN gets
 * every permission, including ones added later. Non-staff roles get none.
 */
export function effectivePermissions(
  role: string,
  customRolePermissions: readonly string[] = [],
): Set<Permission> {
  if (role === "SUPER_ADMIN") return new Set(ALL_PERMISSIONS);
  const base =
    role === "ADMIN" || role === "ACCOUNTING"
      ? ADMIN_PERMISSIONS
      : role === "STAFF"
        ? []
        : null;
  if (!base) return new Set();
  return new Set([...base, ...customRolePermissions.filter(isGrantable)]);
}
