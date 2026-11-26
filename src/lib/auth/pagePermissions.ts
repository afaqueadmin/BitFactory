import type { Permission } from "@/lib/auth/permissions";

/**
 * RBAC stage 4: which permission opens each staff page. Used by the proxy
 * (redirects to /adminpanel without it) and the admin sidebar (hides the
 * item). Any one of the listed permissions is enough. A staff page that
 * matches no rule is refused (fail closed); a test checks every page under
 * src/app/(manage) is covered.
 *
 * No database access, so it is safe to import in client components.
 */

/** Always open to staff: the landing page and their own account pages. */
const ALWAYS = new Set(["/adminpanel", "/admin-profile", "/security-settings"]);

type Rule = [RegExp, Permission[]];

const exact = (path: string) =>
  new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
// A page path plus anything below it.
const under = (path: string) =>
  new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/.*)?$`);
const ID = "[^/]+";

// First match wins, so specific rules come before the general ones.
const RULES: Rule[] = [
  // Invoicing (Hosting and Colocation, Hardware Sales, Hardware Repair)
  [
    /^\/accounting\/(hardware-sales\/|hardware-repair\/)?create$/,
    ["invoicing.create"],
  ],
  [exact("/accounting/bulk-invoices"), ["invoicing.create"]],
  [
    new RegExp(`^/accounting/(hardware-sales/|hardware-repair/)?${ID}/edit$`),
    ["invoicing.edit"],
  ],
  [
    new RegExp(
      `^/accounting/(hardware-sales/|hardware-repair/)?${ID}/record-payment$`,
    ),
    ["invoicing.record_payment"],
  ],
  [under("/accounting/Hosting-and-Colocation"), ["invoicing.view"]],
  [under("/accounting/hardware-sales"), ["invoicing.view"]],
  [under("/accounting/hardware-repair"), ["invoicing.view"]],
  [exact("/accounting/recurring"), ["recurring_invoices.view"]],
  [under("/accounting/email-report"), ["email_reports.view"]],
  [under("/hardware-sales/email-report"), ["email_reports.view"]],
  [under("/hardware-repair/email-report"), ["email_reports.view"]],
  // Payables
  [exact("/accounting/vendor-invoices/create"), ["farm_tariffs.create"]],
  [under("/accounting/farm-tariffs"), ["farm_tariffs.view"]],
  [under("/accounting/vendorInvoice"), ["farm_tariffs.view"]],
  [
    exact("/accounting/hardware-purchases/create"),
    ["hardware_purchases.create"],
  ],
  [under("/accounting/hardware-purchases"), ["hardware_purchases.view"]],
  [under("/accounting/hardwarePurchase"), ["hardware_purchases.view"]],
  [exact("/accounting/security-deposits"), ["security_deposits.view"]],
  // Adjustments
  [exact("/accounting/memos"), ["memos.view"]],
  [exact("/accounting/credit-adjustments"), ["credit_adjustments.view"]],
  // Banking
  [under("/accounting/payment-accounts"), ["banks.view"]],
  [exact("/accounting/transfers"), ["transfers.view"]],
  [exact("/accounting/expenses"), ["expenses.view"]],
  [exact("/accounting/expense-heads"), ["expenses.view"]],
  [exact("/accounting/capital-income"), ["capital_income.view"]],
  [exact("/accounting/capital-income-heads"), ["capital_income.view"]],
  [exact("/accounting/bank-reconciliation"), ["bank_reconciliation.view"]],
  // Finance: other
  [under("/accounting/statements"), ["customer_statements.view"]],
  [exact("/incentives/payouts"), ["incentive_payouts.view"]],
  [exact("/accounting/pricing"), ["pricing.view"]],
  [exact("/admin/repair-charges"), ["repair_charges.view"]],
  [exact("/accounting/pdf-invoice-settings"), ["invoice_pdf_settings.view"]],
  [exact("/accounting/vendors"), ["vendors.view"]],
  [
    exact("/accounting/client-transaction-history"),
    ["transaction_history.view"],
  ],
  // Hosting invoice detail pages live at /accounting/[id]; keep this after
  // every named /accounting page.
  [new RegExp(`^/accounting/${ID}$`), ["invoicing.view"]],
  // Dashboard
  [
    exact("/admin/monthly-customer-billing"),
    ["dashboard_balances.monthly_billing"],
  ],
  [exact("/admin/customer-balance"), ["dashboard_balances.total_balance"]],
  // Work Queue
  [under("/tickets"), ["tickets.view"]],
  [exact("/hashrate-alerts"), ["hashrate_alerts.view"]],
  [exact("/wallets"), ["wallets.view"]],
  [exact("/wallet-requests"), ["wallets.view"]],
  [exact("/payment-frequency-requests"), ["wallets.view"]],
  [exact("/firmware-change-requests"), ["firmware_requests.view"]],
  [exact("/secondary-login-requests"), ["signin_email_requests.view"]],
  [exact("/guild-requests"), ["guild_requests.view"]],
  // Customers
  [
    new RegExp(`^/customers/${ID}/wallet-email$`),
    ["customers.send_wallet_email"],
  ],
  [under("/customers"), ["customers.view"]],
  [under("/groups"), ["customer_groups.view"]],
  [exact("/subaccounts"), ["subaccounts.view"]],
  [under("/franchisees"), ["franchisees.view"]],
  [under("/guilds"), ["guilds.view"]],
  [exact("/simulated-accounts"), ["simulated_accounts.view"]],
  // Operations
  [exact("/machine"), ["miners.view"]],
  [exact("/workers"), ["pool_workers.view"]],
  [exact("/braiins-workers"), ["pool_workers.view"]],
  [exact("/pools"), ["pools.view"]],
  [exact("/space"), ["locations.view"]],
  [exact("/hardware"), ["hardware_models.view"]],
  // Analytics
  [exact("/admin/payback-analysis"), ["customer_payback.view"]],
  [
    exact("/admin/payback-analysis-settings"),
    ["customer_payback.edit_settings"],
  ],
  [exact("/admin/payback-analysis-company"), ["company_payback.view"]],
  [
    exact("/admin/payback-analysis-company-settings"),
    ["company_payback.edit_settings"],
  ],
  // System
  [exact("/activity-log"), ["activity_log.view"]],
  [exact("/audit-log"), ["audit_log.view"]],
  [exact("/access-rules"), ["access_rules.view"]],
  [exact("/roles"), ["roles.view"]],
  [under("/db-data-management"), ["db_data.view"]],
  [exact("/settings/payment"), ["payment_settings.view"]],
  [exact("/external-resource"), ["external_resources.view"]],
];

/** "always", the permissions that open the page (any one), or null: refused. */
export function pagePermissions(
  pathname: string,
): "always" | Permission[] | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (ALWAYS.has(path)) return "always";
  for (const [re, perms] of RULES) if (re.test(path)) return perms;
  return null;
}

/** Whether someone with these permissions may open the staff page. */
export function canOpenPage(
  permissions: Iterable<string> | undefined,
  pathname: string,
): boolean {
  const needed = pagePermissions(pathname);
  if (needed === "always") return true;
  if (!needed || !permissions) return false;
  const have = new Set(permissions);
  return needed.some((p) => have.has(p));
}
