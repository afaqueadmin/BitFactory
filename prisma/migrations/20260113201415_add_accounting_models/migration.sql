-- CreateEnum for InvoiceStatus
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'OVERDUE', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum for AuditAction
CREATE TYPE "AuditAction" AS ENUM ('INVOICE_CREATED', 'INVOICE_UPDATED', 'INVOICE_ISSUED', 'INVOICE_SENT_TO_CUSTOMER', 'INVOICE_CANCELLED', 'PAYMENT_ADDED', 'PAYMENT_REMOVED', 'PAYMENT_REFUNDED', 'RECURRING_INVOICE_CREATED', 'RECURRING_INVOICE_UPDATED', 'RECURRING_INVOICE_DELETED', 'RECURRING_INVOICE_PAUSED', 'RECURRING_INVOICE_RESUMED', 'PRICING_CONFIG_CREATED', 'PRICING_CONFIG_UPDATED', 'PRICING_CONFIG_ARCHIVED', 'EMAIL_SENT', 'EMAIL_FAILED', 'EMAIL_RETRY');

-- CreateEnum for NotificationType
CREATE TYPE "NotificationType" AS ENUM ('INVOICE_ISSUED', 'PAYMENT_REMINDER', 'OVERDUE_REMINDER', 'PAYMENT_RECEIVED', 'INVOICE_VIEWED');

-- CreateEnum for NotificationStatus
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'BOUNCED', 'UNSUBSCRIBED');

-- CreateTable invoices
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalMiners" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL,
    "invoiceGeneratedDate" TIMESTAMP(3) NOT NULL,
    "issuedDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable recurring_invoices
CREATE TABLE "recurring_invoices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2),
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedDate" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable customer_pricing_config
CREATE TABLE "customer_pricing_config" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultUnitPrice" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pricing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable invoice_payments
CREATE TABLE "invoice_payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "costPaymentId" TEXT NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable audit_logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changes" JSONB,
    "description" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable invoice_notifications
CREATE TABLE "invoice_notifications" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "notificationType" "NotificationType" NOT NULL,
    "sentTo" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3),
    "status" "NotificationStatus" NOT NULL,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex invoices
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");
CREATE INDEX "invoices_userId_idx" ON "invoices"("userId");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");
CREATE INDEX "invoices_createdAt_idx" ON "invoices"("createdAt");
CREATE INDEX "invoices_invoiceNumber_idx" ON "invoices"("invoiceNumber");

-- CreateIndex recurring_invoices
CREATE INDEX "recurring_invoices_userId_idx" ON "recurring_invoices"("userId");
CREATE INDEX "recurring_invoices_isActive_idx" ON "recurring_invoices"("isActive");
CREATE INDEX "recurring_invoices_dayOfMonth_idx" ON "recurring_invoices"("dayOfMonth");
CREATE INDEX "recurring_invoices_startDate_idx" ON "recurring_invoices"("startDate");

-- CreateIndex customer_pricing_config
CREATE UNIQUE INDEX "customer_pricing_config_userId_effectiveFrom_key" ON "customer_pricing_config"("userId", "effectiveFrom");
CREATE INDEX "customer_pricing_config_userId_idx" ON "customer_pricing_config"("userId");
CREATE INDEX "customer_pricing_config_effectiveFrom_idx" ON "customer_pricing_config"("effectiveFrom");
CREATE INDEX "customer_pricing_config_effectiveTo_idx" ON "customer_pricing_config"("effectiveTo");

-- CreateIndex invoice_payments
CREATE UNIQUE INDEX "invoice_payments_invoiceId_costPaymentId_key" ON "invoice_payments"("invoiceId", "costPaymentId");
CREATE INDEX "invoice_payments_invoiceId_idx" ON "invoice_payments"("invoiceId");
CREATE INDEX "invoice_payments_costPaymentId_idx" ON "invoice_payments"("costPaymentId");

-- CreateIndex audit_logs
CREATE INDEX "audit_logs_entityId_idx" ON "audit_logs"("entityId");
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex invoice_notifications
CREATE INDEX "invoice_notifications_invoiceId_idx" ON "invoice_notifications"("invoiceId");
CREATE INDEX "invoice_notifications_status_idx" ON "invoice_notifications"("status");
CREATE INDEX "invoice_notifications_sentTo_idx" ON "invoice_notifications"("sentTo");
CREATE INDEX "invoice_notifications_createdAt_idx" ON "invoice_notifications"("createdAt");
CREATE INDEX "invoice_notifications_sentAt_idx" ON "invoice_notifications"("sentAt");

-- AddForeignKey invoices
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey recurring_invoices
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey customer_pricing_config
ALTER TABLE "customer_pricing_config" ADD CONSTRAINT "customer_pricing_config_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_pricing_config" ADD CONSTRAINT "customer_pricing_config_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_pricing_config" ADD CONSTRAINT "customer_pricing_config_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey invoice_payments
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_costPaymentId_fkey" FOREIGN KEY ("costPaymentId") REFERENCES "cost_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey audit_logs
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey invoice_notifications
ALTER TABLE "invoice_notifications" ADD CONSTRAINT "invoice_notifications_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
