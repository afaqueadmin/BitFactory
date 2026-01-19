/**
 * Mock Invoice Data Generator
 *
 * Uses Faker.js and custom logic to generate realistic invoice data
 * for UI development and testing. No database calls needed.
 */

import { faker } from "@faker-js/faker";
import { CostPayment } from "@/generated/prisma";
import {
  Invoice,
  InvoiceStatus,
  RecurringFrequency,
  RecurringInvoice,
  CustomerPricingConfig,
  AuditLog,
  AuditAction,
  InvoiceNotification,
  NotificationType,
  NotificationStatus,
} from "@/lib/types/invoice";

// ============================================================================
// INVOICE MOCK GENERATORS
// ============================================================================

/**
 * Generate a single mock invoice
 */
export function generateMockInvoice(overrides?: Partial<Invoice>): Invoice {
  const invoiceGeneratedDate = faker.date.past({ years: 1 });
  const issuedDate = faker.datatype.boolean({ probability: 0.8 })
    ? faker.date.between({
        from: invoiceGeneratedDate,
        to: new Date(),
      })
    : null;
  const dueDate = new Date(invoiceGeneratedDate);
  dueDate.setDate(dueDate.getDate() + faker.number.int({ min: 15, max: 45 }));

  const totalMiners = faker.number.int({ min: 5, max: 100 });
  const unitPrice = faker.number.float({ min: 10, max: 500 });
  const totalAmount = totalMiners * unitPrice;

  const statuses = [
    InvoiceStatus.PAID,
    InvoiceStatus.ISSUED,
    InvoiceStatus.OVERDUE,
    InvoiceStatus.DRAFT,
  ];
  const status =
    statuses[faker.number.int({ min: 0, max: statuses.length - 1 })];

  const paidDate =
    status === InvoiceStatus.PAID && issuedDate
      ? faker.date.between({
          from: issuedDate,
          to: new Date(),
        })
      : null;

  const year = invoiceGeneratedDate.getFullYear();
  const month = String(invoiceGeneratedDate.getMonth() + 1).padStart(2, "0");
  const day = String(invoiceGeneratedDate.getDate()).padStart(2, "0");
  const sequenceNumber = faker.number.int({ min: 1, max: 999 });
  const invoiceNumber = `${year}${month}${day}${String(sequenceNumber).padStart(3, "0")}`;

  return {
    id: faker.string.uuid(),
    invoiceNumber,
    userId: faker.string.uuid(),
    totalMiners,
    unitPrice,
    totalAmount: Math.round(totalAmount * 100) / 100,
    status,
    invoiceGeneratedDate,
    issuedDate,
    dueDate,
    paidDate,
    createdBy: faker.string.uuid(),
    createdAt: invoiceGeneratedDate,
    updatedBy: faker.datatype.boolean() ? faker.string.uuid() : null,
    updatedAt: faker.date.between({
      from: invoiceGeneratedDate,
      to: new Date(),
    }),
    ...overrides,
  };
}

/**
 * Generate multiple mock invoices
 */
export function generateMockInvoices(count: number = 10): Invoice[] {
  return Array.from({ length: count }, () => generateMockInvoice());
}

// ============================================================================
// RECURRING INVOICE MOCK GENERATORS
// ============================================================================

/**
 * Generate a single mock recurring invoice
 */
export function generateMockRecurringInvoice(
  overrides?: Partial<RecurringInvoice>,
): RecurringInvoice {
  const startDate = faker.date.past({ years: 1 });
  const endDate = faker.datatype.boolean({ probability: 0.3 })
    ? faker.date.future({ years: 2 })
    : null;

  return {
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    dayOfMonth: faker.number.int({ min: 1, max: 28 }),
    unitPrice: faker.datatype.boolean()
      ? faker.number.float({ min: 10, max: 500 })
      : null,
    startDate,
    endDate,
    frequency: RecurringFrequency.MONTHLY,
    isActive: faker.datatype.boolean({ probability: 0.7 }),
    lastGeneratedDate: faker.datatype.boolean()
      ? faker.date.recent({ days: 30 })
      : null,
    createdBy: faker.string.uuid(),
    createdAt: startDate,
    updatedBy: faker.datatype.boolean() ? faker.string.uuid() : null,
    updatedAt: faker.date.recent({ days: 30 }),
    ...overrides,
  };
}

/**
 * Generate multiple mock recurring invoices
 */
export function generateMockRecurringInvoices(
  count: number = 5,
): RecurringInvoice[] {
  return Array.from({ length: count }, () => generateMockRecurringInvoice());
}

// ============================================================================
// PRICING CONFIG MOCK GENERATORS
// ============================================================================

/**
 * Generate a single mock pricing config
 */
export function generateMockPricingConfig(
  overrides?: Partial<CustomerPricingConfig>,
): CustomerPricingConfig {
  const effectiveFrom = faker.date.past({ years: 1 });
  const effectiveTo = faker.datatype.boolean({ probability: 0.4 })
    ? faker.date.future({ years: 1 })
    : null;

  return {
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    defaultUnitPrice: faker.number.float({
      min: 10,
      max: 500,
    }),
    effectiveFrom,
    effectiveTo,
    createdBy: faker.string.uuid(),
    createdAt: effectiveFrom,
    updatedBy: faker.datatype.boolean() ? faker.string.uuid() : null,
    updatedAt: faker.date.recent({ days: 30 }),
    ...overrides,
  };
}

/**
 * Generate multiple mock pricing configs
 */
export function generateMockPricingConfigs(
  count: number = 5,
): CustomerPricingConfig[] {
  return Array.from({ length: count }, () => generateMockPricingConfig());
}

// ============================================================================
// INVOICE PAYMENT MOCK GENERATORS
// ============================================================================

/**
 * Generate a single mock invoice payment
 */
// InvoicePayment mocks removed - now using CostPayment directly

/**
 * Generate multiple mock invoice payments
 */
// InvoicePayment mocks removed - now using CostPayment directly

// ============================================================================
// AUDIT LOG MOCK GENERATORS
// ============================================================================

/**
 * Generate a single mock audit log entry
 */
export function generateMockAuditLog(overrides?: Partial<AuditLog>): AuditLog {
  const createdAt = faker.date.past({ years: 1 });
  const actions = Object.values(AuditAction);

  return {
    id: faker.string.uuid(),
    action: actions[faker.number.int({ min: 0, max: actions.length - 1 })],
    entityType: faker.helpers.arrayElement(["Invoice", "RecurringInvoice"]),
    entityId: faker.string.uuid(),
    userId: faker.string.uuid(),
    changes: faker.datatype.boolean()
      ? {
          before: { status: "DRAFT" },
          after: { status: "ISSUED" },
        }
      : null,
    description: faker.lorem.sentence(),
    ipAddress: faker.internet.ip(),
    userAgent: faker.internet.userAgent(),
    createdAt,
    ...overrides,
  };
}

/**
 * Generate multiple mock audit logs
 */
export function generateMockAuditLogs(count: number = 20): AuditLog[] {
  return Array.from({ length: count }, () => generateMockAuditLog());
}

// ============================================================================
// INVOICE NOTIFICATION MOCK GENERATORS
// ============================================================================

/**
 * Generate a single mock invoice notification
 */
export function generateMockInvoiceNotification(
  overrides?: Partial<InvoiceNotification>,
): InvoiceNotification {
  const sentAt = faker.date.past({ years: 1 });
  const status = faker.helpers.arrayElement([
    NotificationStatus.SENT,
    NotificationStatus.PENDING,
    NotificationStatus.FAILED,
  ]);

  return {
    id: faker.string.uuid(),
    invoiceId: faker.string.uuid(),
    notificationType: faker.helpers.arrayElement(
      Object.values(NotificationType),
    ),
    sentTo: faker.internet.email(),
    sentAt,
    isRead: faker.datatype.boolean({ probability: 0.6 }),
    openedAt: faker.datatype.boolean({ probability: 0.6 })
      ? faker.date.recent({ days: 7 })
      : null,
    status,
    failureReason:
      status === NotificationStatus.FAILED ? faker.lorem.sentence() : null,
    retryCount:
      status === NotificationStatus.FAILED
        ? faker.number.int({ min: 0, max: 3 })
        : 0,
    nextRetryAt:
      status === NotificationStatus.FAILED
        ? faker.date.soon({ days: 1 })
        : null,
    createdAt: sentAt,
    ...overrides,
  };
}

/**
 * Generate multiple mock invoice notifications
 */
export function generateMockInvoiceNotifications(
  count: number = 15,
): InvoiceNotification[] {
  return Array.from({ length: count }, () => generateMockInvoiceNotification());
}

// ============================================================================
// BATCH GENERATORS (All data at once)
// ============================================================================

/**
 * Generate a complete mock accounting dataset
 */
export interface MockAccountingDataset {
  invoices: Invoice[];
  recurringInvoices: RecurringInvoice[];
  pricingConfigs: CustomerPricingConfig[];
  costPayments: CostPayment[];
  auditLogs: AuditLog[];
  notifications: InvoiceNotification[];
}

export function generateMockAccountingDataset(options?: {
  invoiceCount?: number;
  recurringCount?: number;
  pricingCount?: number;
  paymentCount?: number;
  auditCount?: number;
  notificationCount?: number;
}): MockAccountingDataset {
  const {
    invoiceCount = 20,
    recurringCount = 5,
    pricingCount = 5,
    paymentCount = 15,
    auditCount = 30,
    notificationCount = 25,
  } = options || {};

  return {
    invoices: generateMockInvoices(invoiceCount),
    recurringInvoices: generateMockRecurringInvoices(recurringCount),
    pricingConfigs: generateMockPricingConfigs(pricingCount),
    costPayments: [],
    auditLogs: generateMockAuditLogs(auditCount),
    notifications: generateMockInvoiceNotifications(notificationCount),
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate invoice number in YYYYMMDDSR format
 */
export function generateInvoiceNumber(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const sequenceNumber = faker.number.int({ min: 1, max: 999 });
  return `${year}${month}${day}${String(sequenceNumber).padStart(3, "0")}`;
}

/**
 * Calculate days until due
 */
export function calculateDaysUntilDue(dueDate: Date): number {
  const now = new Date();
  const diffTime = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Calculate days overdue
 */
export function calculateDaysOverdue(dueDate: Date): number {
  const now = new Date();
  const diffTime = now.getTime() - dueDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

/**
 * Determine if invoice is overdue
 */
export function isInvoiceOverdue(
  dueDate: Date,
  status: InvoiceStatus,
): boolean {
  if (status === InvoiceStatus.PAID || status === InvoiceStatus.CANCELLED) {
    return false;
  }
  return new Date() > dueDate;
}
