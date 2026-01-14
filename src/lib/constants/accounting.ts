/**
 * Accounting Module Constants
 *
 * Centralized constants used throughout the accounting system for
 * configuration, formatting, validation, and business rules.
 */

import {
  InvoiceStatus,
  NotificationType,
  AuditAction,
} from "@/generated/prisma";

// ============================================================================
// CURRENCY & FORMATTING
// ============================================================================

export const ACCOUNTING_CURRENCY = "USD";
export const CURRENCY_SYMBOL = "$";
export const CURRENCY_LOCALE = "en-US";

// Formatting options for numbers and currency
export const CURRENCY_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  style: "currency",
  currency: ACCOUNTING_CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

export const PERCENTAGE_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
};

// ============================================================================
// INVOICE CONFIGURATION
// ============================================================================

// Invoice numbering format: YYYYMMDDSR
// Y = Year (4 digits)
// M = Month (2 digits, zero-padded)
// D = Day (2 digits, zero-padded)
// S = Sequential number (3 digits, zero-padded, 001-999)
// Example: 20260111001 = Jan 11, 2026, invoice #1
export const INVOICE_NUMBER_FORMAT = "YYYYMMDDSR";
export const INVOICE_NUMBER_PATTERN = /^\d{8}\d{3}$/; // 11 digits total
export const INVOICE_NUMBER_MAX_DAILY_SEQUENCE = 999; // Max 999 invoices per day

// Default payment terms (in days)
export const DEFAULT_DUE_DAYS = 30;
export const PAYMENT_TERM_OPTIONS = [15, 30, 45, 60, 90];

// Month-end day handling
// When generating monthly invoices, if dayOfMonth > days in month,
// generate on the last day of that month
export const HANDLE_MONTH_END = true;

// Minimum and maximum unit prices (USD)
export const MIN_UNIT_PRICE = 0.01;
export const MAX_UNIT_PRICE = 10000;

// Minimum and maximum miner counts
export const MIN_MINERS = 1;
export const MAX_MINERS = 10000;

// ============================================================================
// RECURRING INVOICE CONFIGURATION
// ============================================================================

// Only monthly recurring invoices are supported
export const SUPPORTED_RECURRING_FREQUENCIES = ["MONTHLY"] as const;

// Valid days of month for recurring invoices
export const VALID_DAY_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

// ============================================================================
// INVOICE STATUSES & COLORS
// ============================================================================

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: "Draft",
  [InvoiceStatus.ISSUED]: "Issued",
  [InvoiceStatus.PAID]: "Paid",
  [InvoiceStatus.OVERDUE]: "Overdue",
  [InvoiceStatus.CANCELLED]: "Cancelled",
  [InvoiceStatus.REFUNDED]: "Refunded",
};

// MUI color variants for each status
export const INVOICE_STATUS_COLORS: Record<
  InvoiceStatus,
  "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"
> = {
  [InvoiceStatus.DRAFT]: "default",
  [InvoiceStatus.ISSUED]: "info",
  [InvoiceStatus.PAID]: "success",
  [InvoiceStatus.OVERDUE]: "error",
  [InvoiceStatus.CANCELLED]: "warning",
  [InvoiceStatus.REFUNDED]: "secondary",
};

// Hex color codes for charts and custom styling
export const INVOICE_STATUS_HEX_COLORS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: "#9CA3AF", // Gray
  [InvoiceStatus.ISSUED]: "#3B82F6", // Blue
  [InvoiceStatus.PAID]: "#10B981", // Green
  [InvoiceStatus.OVERDUE]: "#EF4444", // Red
  [InvoiceStatus.CANCELLED]: "#F59E0B", // Amber
  [InvoiceStatus.REFUNDED]: "#8B5CF6", // Purple
};

// ============================================================================
// AGING BUCKETS (for customer statements)
// ============================================================================

export const AGING_BUCKETS = {
  CURRENT: { label: "Current", days: 30 },
  THIRTY_PLUS: { label: "31-60 Days", days: 30 },
  SIXTY_PLUS: { label: "61-90 Days", days: 30 },
  NINETY_PLUS: { label: "90+ Days", days: Infinity },
} as const;

export function getAgingBucket(
  daysOverdue: number,
): keyof typeof AGING_BUCKETS {
  if (daysOverdue <= 0) return "CURRENT";
  if (daysOverdue <= 30) return "THIRTY_PLUS";
  if (daysOverdue <= 60) return "SIXTY_PLUS";
  return "NINETY_PLUS";
}

// ============================================================================
// NOTIFICATION CONFIGURATION
// ============================================================================

// Email notification types
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  [NotificationType.INVOICE_ISSUED]: "Invoice Issued",
  [NotificationType.PAYMENT_REMINDER]: "Payment Reminder",
  [NotificationType.OVERDUE_REMINDER]: "Overdue Reminder",
  [NotificationType.PAYMENT_RECEIVED]: "Payment Received",
  [NotificationType.INVOICE_VIEWED]: "Invoice Viewed",
};

export const NOTIFICATION_EMAIL_SUBJECTS: Record<NotificationType, string> = {
  [NotificationType.INVOICE_ISSUED]: "New Invoice from BitFactory",
  [NotificationType.PAYMENT_REMINDER]: "Payment Reminder - Invoice Due Soon",
  [NotificationType.OVERDUE_REMINDER]:
    "Payment Overdue - Immediate Action Required",
  [NotificationType.PAYMENT_RECEIVED]: "Payment Received - Thank You",
  [NotificationType.INVOICE_VIEWED]: "Your Invoice Has Been Viewed",
};

// Retry configuration for failed email sends
export const EMAIL_RETRY_MAX_ATTEMPTS = 3;
export const EMAIL_RETRY_INITIAL_DELAY_MINUTES = 5;
export const EMAIL_RETRY_BACKOFF_MULTIPLIER = 2; // 5, 10, 20 minutes

// ============================================================================
// AUDIT LOG CONFIGURATION
// ============================================================================

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  [AuditAction.INVOICE_CREATED]: "Invoice Created",
  [AuditAction.INVOICE_UPDATED]: "Invoice Updated",
  [AuditAction.INVOICE_ISSUED]: "Invoice Issued",
  [AuditAction.INVOICE_SENT_TO_CUSTOMER]: "Invoice Sent to Customer",
  [AuditAction.INVOICE_CANCELLED]: "Invoice Cancelled",
  [AuditAction.PAYMENT_ADDED]: "Payment Added",
  [AuditAction.PAYMENT_REMOVED]: "Payment Removed",
  [AuditAction.PAYMENT_REFUNDED]: "Payment Refunded",
  [AuditAction.RECURRING_INVOICE_CREATED]: "Recurring Invoice Created",
  [AuditAction.RECURRING_INVOICE_UPDATED]: "Recurring Invoice Updated",
  [AuditAction.RECURRING_INVOICE_DELETED]: "Recurring Invoice Deleted",
  [AuditAction.RECURRING_INVOICE_PAUSED]: "Recurring Invoice Paused",
  [AuditAction.RECURRING_INVOICE_RESUMED]: "Recurring Invoice Resumed",
  [AuditAction.PRICING_CONFIG_CREATED]: "Pricing Config Created",
  [AuditAction.PRICING_CONFIG_UPDATED]: "Pricing Config Updated",
  [AuditAction.PRICING_CONFIG_ARCHIVED]: "Pricing Config Archived",
  [AuditAction.EMAIL_SENT]: "Email Sent",
  [AuditAction.EMAIL_FAILED]: "Email Failed",
  [AuditAction.EMAIL_RETRY]: "Email Retry",
};

// ============================================================================
// VALIDATION RULES
// ============================================================================

export const VALIDATION_RULES = {
  INVOICE_NUMBER: {
    pattern: INVOICE_NUMBER_PATTERN,
    message: "Invoice number must be 11 digits in format YYYYMMDDSR",
  },
  UNIT_PRICE: {
    min: MIN_UNIT_PRICE,
    max: MAX_UNIT_PRICE,
    message: `Unit price must be between $${MIN_UNIT_PRICE} and $${MAX_UNIT_PRICE}`,
  },
  MINER_COUNT: {
    min: MIN_MINERS,
    max: MAX_MINERS,
    message: `Miner count must be between ${MIN_MINERS} and ${MAX_MINERS}`,
  },
  DUE_DATE: {
    minDaysFromNow: 1,
    message: "Due date must be at least 1 day from today",
  },
  CUSTOMER_REQUIRED: {
    message: "Customer is required",
  },
} as const;

// ============================================================================
// DATE & TIME
// ============================================================================

// Default timezone for admin operations
// Will be overridden by user's timezone setting in Phase 4
export const DEFAULT_TIMEZONE = "UTC";

// Date display formats
export const DATE_FORMAT = "MMM DD, YYYY"; // Jan 11, 2026
export const DATE_TIME_FORMAT = "MMM DD, YYYY h:mm A"; // Jan 11, 2026 2:30 PM
export const INVOICE_DATE_FORMAT = "MM/DD/YYYY"; // 01/11/2026

// ============================================================================
// PAGINATION & LIMITS
// ============================================================================

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const MAX_RESULTS = 1000; // Safety limit for queries

// ============================================================================
// DASHBOARD CONFIGURATION
// ============================================================================

export const DASHBOARD_REFRESH_INTERVAL_SECONDS = 60; // Refresh stats every minute

export const DASHBOARD_WIDGET_CONFIGS = {
  TOTAL_INVOICES: { label: "Total Invoices", color: "#3B82F6" },
  UNPAID_INVOICES: { label: "Unpaid Invoices", color: "#F59E0B" },
  OVERDUE_INVOICES: { label: "Overdue Invoices", color: "#EF4444" },
  TOTAL_OUTSTANDING: { label: "Total Outstanding", color: "#8B5CF6" },
  TOTAL_COLLECTED: { label: "Total Collected", color: "#10B981" },
  PAYMENT_RATE: { label: "Payment Rate", color: "#06B6D4" },
} as const;

// ============================================================================
// GENERATION RULES
// ============================================================================

// Invoice generation is manual (not automatic cron)
export const AUTO_GENERATE_INVOICES = false;

// Email sending is manual (not automatic)
export const AUTO_SEND_EMAILS = false;

// Miner count is fetched dynamically at invoice generation time
export const DYNAMIC_MINER_COUNT = true;

// Pricing is per-customer (from CustomerPricingConfig)
export const DYNAMIC_UNIT_PRICE = true;

// ============================================================================
// ERROR MESSAGES
// ============================================================================

export const ERROR_MESSAGES = {
  INVOICE_NOT_FOUND: "Invoice not found",
  CUSTOMER_NOT_FOUND: "Customer not found",
  INVALID_STATUS_TRANSITION: "Invalid status transition",
  INSUFFICIENT_PERMISSIONS: "You do not have permission to perform this action",
  INVALID_INVOICE_NUMBER: "Invalid invoice number format",
  DUPLICATE_INVOICE_NUMBER: "Invoice number already exists",
  CANNOT_EDIT_PAID: "Cannot edit a paid invoice",
  CANNOT_DELETE_ISSUED: "Cannot delete an issued invoice",
  CUSTOMER_HAS_NO_SUBACCOUNT:
    "Customer does not have a Luxor subaccount configured",
  INVALID_PRICING_CONFIG: "Invalid pricing configuration",
  RECURRING_INVOICE_OVERLAP:
    "Recurring invoice dates overlap with existing configuration",
  EMAIL_SEND_FAILED: "Failed to send email notification",
  DATABASE_ERROR: "Database error occurred",
  API_ERROR: "API error occurred",
} as const;

// ============================================================================
// SUCCESS MESSAGES
// ============================================================================

export const SUCCESS_MESSAGES = {
  INVOICE_CREATED: "Invoice created successfully",
  INVOICE_UPDATED: "Invoice updated successfully",
  INVOICE_DELETED: "Invoice deleted successfully",
  INVOICE_ISSUED: "Invoice issued successfully",
  INVOICE_CANCELLED: "Invoice cancelled successfully",
  PAYMENT_RECORDED: "Payment recorded successfully",
  EMAIL_SENT: "Email sent successfully",
  RECURRING_INVOICE_CREATED: "Recurring invoice created successfully",
  RECURRING_INVOICE_UPDATED: "Recurring invoice updated successfully",
  RECURRING_INVOICE_DELETED: "Recurring invoice deleted successfully",
  PRICING_CONFIG_UPDATED: "Pricing configuration updated successfully",
} as const;

// ============================================================================
// FEATURE FLAGS (for gradual rollout in Phase 4+)
// ============================================================================

export const FEATURE_FLAGS = {
  ENABLE_INVOICING: true,
  ENABLE_RECURRING_INVOICES: true,
  ENABLE_EMAIL_NOTIFICATIONS: true,
  ENABLE_AUDIT_LOG: true,
  ENABLE_CUSTOM_PRICING: true,
  ENABLE_PAYMENT_TRACKING: true,
  ENABLE_STATEMENTS: true,
  ENABLE_BULK_OPERATIONS: false, // Phase 5
  ENABLE_PAYMENT_PLANS: false, // Phase 5
  ENABLE_TAX_INTEGRATION: false, // Phase 5
} as const;
