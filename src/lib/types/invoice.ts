/**
 * Invoice and Accounting Module Type Definitions
 *
 * These types define the contract for the entire accounting system.
 * Used by both UI (mock data) and API (real data) to ensure consistency.
 */

import { InvoiceStatus } from "@/generated/prisma";

export { InvoiceStatus } from "@/generated/prisma";

// ============================================================================
// ENUMS
// ============================================================================

export enum RecurringFrequency {
  MONTHLY = "MONTHLY",
}

export enum NotificationType {
  INVOICE_ISSUED = "INVOICE_ISSUED",
  PAYMENT_REMINDER = "PAYMENT_REMINDER",
  OVERDUE_REMINDER = "OVERDUE_REMINDER",
}

export enum AuditAction {
  INVOICE_CREATED = "INVOICE_CREATED",
  INVOICE_UPDATED = "INVOICE_UPDATED",
  INVOICE_ISSUED = "INVOICE_ISSUED",
  INVOICE_SENT_TO_CUSTOMER = "INVOICE_SENT_TO_CUSTOMER",
  INVOICE_CANCELLED = "INVOICE_CANCELLED",
  PAYMENT_ADDED = "PAYMENT_ADDED",
  PAYMENT_REMOVED = "PAYMENT_REMOVED",
  PAYMENT_REFUNDED = "PAYMENT_REFUNDED",
  RECURRING_INVOICE_CREATED = "RECURRING_INVOICE_CREATED",
  RECURRING_INVOICE_UPDATED = "RECURRING_INVOICE_UPDATED",
  RECURRING_INVOICE_DELETED = "RECURRING_INVOICE_DELETED",
  RECURRING_INVOICE_PAUSED = "RECURRING_INVOICE_PAUSED",
  RECURRING_INVOICE_RESUMED = "RECURRING_INVOICE_RESUMED",
  PRICING_CONFIG_CREATED = "PRICING_CONFIG_CREATED",
  PRICING_CONFIG_UPDATED = "PRICING_CONFIG_UPDATED",
  PRICING_CONFIG_ARCHIVED = "PRICING_CONFIG_ARCHIVED",
  EMAIL_SENT = "EMAIL_SENT",
  EMAIL_FAILED = "EMAIL_FAILED",
  EMAIL_RETRY = "EMAIL_RETRY",
}

export enum NotificationStatus {
  PENDING = "PENDING",
  SENT = "SENT",
  FAILED = "FAILED",
}

// ============================================================================
// MAIN MODELS
// ============================================================================

/**
 * Invoice Model
 *
 * Represents a single invoice issued to a customer
 */
export interface Invoice {
  id: string;
  invoiceNumber: string; // Format: YYYYMMDDSR (e.g., 20260111001)
  userId: string; // Customer ID (FK to User)
  totalMiners: number; // Number of mining units
  unitPrice: number; // Price per mining unit (USD)
  totalAmount: number; // totalMiners × unitPrice (USD)
  status: InvoiceStatus; // Current status
  invoiceGeneratedDate: Date; // Date invoice was generated
  issuedDate: Date | null; // Date sent to customer
  dueDate: Date; // Payment due date
  paidDate: Date | null; // Date payment received
  createdBy: string; // Admin user ID who created
  createdAt: Date;
  updatedBy: string | null; // Admin user ID who last updated
  updatedAt: Date;
}

/**
 * Recurring Invoice Template
 *
 * Template for automatically generating invoices monthly
 */
export interface RecurringInvoice {
  id: string;
  userId: string; // Customer ID (FK to User)
  dayOfMonth: number; // 1-31, day to generate invoice
  unitPrice: number | null; // Optional custom unit price
  startDate: Date; // When to start generating
  endDate: Date | null; // When to stop (null = ongoing)
  frequency: RecurringFrequency; // Currently MONTHLY only
  isActive: boolean; // Can pause/resume
  lastGeneratedDate: Date | null; // Last invoice created from this
  createdBy: string; // Admin user ID
  createdAt: Date;
  updatedBy: string | null;
  updatedAt: Date;
}

/**
 * Customer Pricing Configuration
 *
 * Store unit price per customer with history
 */
export interface CustomerPricingConfig {
  id: string;
  userId: string; // Customer ID (FK to User)
  defaultUnitPrice: number; // USD per mining unit
  effectiveFrom: Date; // When this price becomes active
  effectiveTo: Date | null; // When price ends (null = current)
  createdBy: string; // Admin user ID
  createdAt: Date;
  updatedBy: string | null;
  updatedAt: Date;
}

/**
 * Invoice Payment Link
 *
 * Links an Invoice to a CostPayment for tracking
 */
export interface InvoicePayment {
  id: string;
  invoiceId: string; // FK to Invoice
  costPaymentId: string; // FK to CostPayment (existing table)
  amountPaid: number; // USD amount paid
  paidDate: Date; // When payment received
  createdAt: Date;
}

/**
 * Audit Log Entry
 *
 * Complete audit trail of all accounting actions
 */
export interface AuditLog {
  id: string;
  action: AuditAction; // What action was taken
  entityType: string; // What was modified (Invoice, etc)
  entityId: string; // ID of the entity
  userId: string; // Who performed action (FK to User)
  changes: Record<string, unknown> | null; // Before/after values
  description: string; // Human-readable description
  ipAddress: string | null; // Client IP
  userAgent: string | null; // Browser info
  createdAt: Date;
}

/**
 * Invoice Notification
 *
 * Tracks email notifications sent for invoices
 */
export interface InvoiceNotification {
  id: string;
  invoiceId: string; // FK to Invoice
  notificationType: NotificationType; // What type of email
  sentTo: string; // Email address
  sentAt: Date; // When email was sent
  isRead: boolean; // Whether customer opened it
  openedAt: Date | null; // When customer opened it
  status: NotificationStatus; // PENDING, SENT, or FAILED
  failureReason: string | null; // Why it failed (if failed)
  retryCount: number; // How many retry attempts
  nextRetryAt: Date | null; // When to retry
  createdAt: Date;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Create Invoice Request
 */
export interface CreateInvoiceRequest {
  userId: string;
  totalMiners: number;
  unitPrice: number;
  dueDate: string; // ISO date string
}

/**
 * Update Invoice Request
 */
export interface UpdateInvoiceRequest {
  totalMiners?: number;
  unitPrice?: number;
  dueDate?: string; // ISO date string
}

/**
 * Record Payment Request
 */
export interface RecordPaymentRequest {
  amountPaid: number;
}

/**
 * Create Recurring Invoice Request
 */
export interface CreateRecurringInvoiceRequest {
  userId: string;
  dayOfMonth: number;
  unitPrice?: number;
  startDate: string; // ISO date string
  endDate?: string; // ISO date string
}

/**
 * Generate Invoices Request
 */
export interface GenerateInvoicesRequest {
  month?: number; // 1-12 (optional, defaults to current)
  year?: number; // 4 digits (optional, defaults to current)
  dayOfMonth?: number; // 1-31 (optional, for specific days)
}

/**
 * Send Emails Request
 */
export interface SendEmailsRequest {
  invoiceIds: string[];
  emailType: NotificationType;
}

/**
 * Dashboard Response
 */
export interface DashboardResponse {
  totalInvoices: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  totalOutstanding: number;
  upcomingInvoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    customerId: string;
    customerName: string;
    amount: number;
    dueDate: string;
    daysUntilDue: number;
  }>;
  recentInvoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    customerId: string;
    customerName: string;
    amount: number;
    issuedDate: string;
    status: InvoiceStatus;
  }>;
  recurringInvoices: {
    total: number;
    active: number;
    inactive: number;
  };
}

/**
 * Customer Statement Response
 */
export interface CustomerStatementResponse {
  customer: {
    id: string;
    name: string;
    email: string;
    company?: string;
  };
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    issuedDate: string;
    dueDate: string;
    totalAmount: number;
    paidAmount: number;
    status: InvoiceStatus;
    agingDays: number;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    date: string;
    invoiceId: string;
    type: string;
  }>;
  summary: {
    totalInvoiced: number;
    totalPaid: number;
    totalOutstanding: number;
    currentBalance: number;
    lastPaymentDate: string | null;
    nextInvoiceDate: string | null;
  };
}

/**
 * API Error Response
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  timestamp: string;
}

/**
 * API Success Response
 */
export interface ApiSuccessResponse<T = Record<string, unknown>> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * Paginated Response
 */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  timestamp: string;
}

// ============================================================================
// VIEW MODELS (for UI display)
// ============================================================================

/**
 * Invoice for UI display (with related customer data)
 */
export interface InvoiceDisplayModel extends Invoice {
  customer?: {
    name: string;
    email: string;
    company?: string;
  };
  daysUntilDue?: number;
  daysOverdue?: number;
  isPaid?: boolean;
  isOverdue?: boolean;
}

/**
 * Customer with invoice summary
 */
export interface CustomerInvoiceSummary {
  customerId: string;
  customerName: string;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  invoiceCount: number;
  lastInvoiceDate: Date | null;
}
