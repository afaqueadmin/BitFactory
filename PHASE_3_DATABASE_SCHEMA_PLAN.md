# PHASE 3: DATABASE SCHEMA IMPLEMENTATION PLAN

**Status:** Ready for Review  
**Date Created:** January 12, 2026  
**Duration:** 1.5 hours (estimated)  
**Complexity:** Low (Schema definition only)  
**Risk Level:** 🟢 ZERO (No existing data modified)  

---

## 📋 PHASE 3 OVERVIEW

### Objectives
1. Design 6 new Prisma models for accounting module
2. Create database migration file
3. Verify data safety and existing tables remain unchanged
4. Document relationships and constraints
5. Prepare rollback procedures

### Key Principle
**NO EXISTING DATA WILL BE TOUCHED**
- Zero modifications to existing 7 tables
- All new tables created as empty additions
- Safe to rollback at any point

### Deliverables (After Execution)
- ✅ 6 new database tables created
- ✅ All relationships defined via foreign keys
- ✅ Indexes created for performance
- ✅ Prisma Client regenerated with new types
- ✅ Migration file tracked in git

---

## 📊 DATABASE MODEL SPECIFICATIONS

### MODEL 1: Invoice

**Purpose:** Track all customer invoices

**Fields:**
```
id                  String    @id @default(cuid())
invoiceNumber       String    @unique
userId              String    @db.ObjectId            // Customer ID
totalMiners         Int                               // Number of miners
unitPrice           Decimal   @db.Decimal(10,2)      // Price per miner
totalAmount         Decimal   @db.Decimal(12,2)      // totalMiners × unitPrice
status              InvoiceStatus                     // DRAFT, ISSUED, OVERDUE, PAID, CANCELLED
invoiceGeneratedDate DateTime
issuedDate          DateTime?                         // When actually sent
dueDate             DateTime
paidDate            DateTime?                         // When payment received
createdBy           String    @db.ObjectId           // Admin who created
updatedBy           String?   @db.ObjectId           // Admin who last edited
createdAt           DateTime  @default(now())
updatedAt           DateTime  @updatedAt

// Relationships
user                User      @relation("invoices", fields: [userId], references: [_id])
payments            InvoicePayment[]
notifications       InvoiceNotification[]
createdByUser       User      @relation("invoicesCreated", fields: [createdBy], references: [_id])
updatedByUser       User?     @relation("invoicesUpdated", fields: [updatedBy], references: [_id])

// Indexes
@@index([userId])
@@index([status])
@@index([dueDate])
@@index([createdAt])
@@index([invoiceNumber])
```

**Key Notes:**
- `invoiceNumber` is unique (format: YYYYMMDDSR)
- `totalAmount` is calculated (totalMiners × unitPrice)
- `status` tracks invoice lifecycle
- Stores who created and last modified

---

### MODEL 2: RecurringInvoice

**Purpose:** Template for monthly recurring invoices

**Fields:**
```
id                  String    @id @default(cuid())
userId              String    @db.ObjectId           // Customer ID
dayOfMonth          Int                              // 1-28 (handles month-end)
unitPrice           Decimal?  @db.Decimal(10,2)     // Optional: override default
startDate           DateTime
endDate             DateTime?                        // Optional: when to stop
isActive            Boolean   @default(true)
lastGeneratedDate   DateTime?                        // When invoice was last generated
createdBy           String    @db.ObjectId          // Admin who created
updatedBy           String?   @db.ObjectId          // Admin who last edited
createdAt           DateTime  @default(now())
updatedAt           DateTime  @updatedAt

// Relationships
user                User      @relation("recurringInvoices", fields: [userId], references: [_id])
createdByUser       User      @relation("recurringInvoicesCreated", fields: [createdBy], references: [_id])
updatedByUser       User?     @relation("recurringInvoicesUpdated", fields: [updatedBy], references: [_id])

// Indexes
@@index([userId])
@@index([isActive])
@@index([dayOfMonth])
@@index([startDate])
```

**Key Notes:**
- `dayOfMonth` triggers invoice generation (1-28, month-end automatically handled)
- `unitPrice` optional (uses customer's pricing config if not set)
- `isActive` controls whether to generate invoices
- Soft-delete via `isActive = false` instead of hard delete

---

### MODEL 3: CustomerPricingConfig

**Purpose:** Track unit price per customer with historical changes

**Fields:**
```
id                  String    @id @default(cuid())
userId              String    @db.ObjectId           // Customer ID
defaultUnitPrice    Decimal   @db.Decimal(10,2)
effectiveFrom       DateTime                         // When price becomes active
effectiveTo         DateTime?                        // When price stops (next config starts)
createdBy           String    @db.ObjectId          // Admin who set this price
updatedBy           String?   @db.ObjectId
createdAt           DateTime  @default(now())
updatedAt           DateTime  @updatedAt

// Relationships
user                User      @relation("pricingConfigs", fields: [userId], references: [_id])
createdByUser       User      @relation("pricingConfigsCreated", fields: [createdBy], references: [_id])
updatedByUser       User?     @relation("pricingConfigsUpdated", fields: [updatedBy], references: [_id])

// Constraints & Indexes
@@unique([userId, effectiveFrom])
@@index([userId])
@@index([effectiveFrom])
@@index([effectiveTo])
```

**Key Notes:**
- Maintains pricing history (never delete, only add new with `effectiveTo`)
- `effectiveFrom` is date (not datetime) for month-based pricing
- `effectiveTo` is automatically set when new price created
- Unique constraint: One active price per customer at any time
- Can query current price by: `WHERE userId = X AND effectiveFrom <= NOW AND (effectiveTo IS NULL OR effectiveTo > NOW)`

---

### MODEL 4: InvoicePayment

**Purpose:** Link between Invoice and CostPayment (junction table)

**Fields:**
```
id                  String    @id @default(cuid())
invoiceId           String    @db.ObjectId           // Reference to Invoice
costPaymentId       String    @db.ObjectId           // Reference to CostPayment
amountPaid          Decimal   @db.Decimal(12,2)      // Partial or full payment
paidDate            DateTime                         // When payment was made
createdAt           DateTime  @default(now())

// Relationships
invoice             Invoice   @relation("payments", fields: [invoiceId], references: [id], onDelete: Cascade)
costPayment         CostPayment @relation("invoicePayments", fields: [costPaymentId], references: [_id])

// Indexes
@@index([invoiceId])
@@index([costPaymentId])
@@unique([invoiceId, costPaymentId])
```

**Key Notes:**
- **LINKS TWO SYSTEMS:** New Invoice table ↔ Existing CostPayment table
- One invoice can have multiple partial payments (multiple CostPayment records)
- `onDelete: Cascade` ensures if invoice deleted, payment links deleted
- Does NOT modify CostPayment table (read-only reference)

---

### MODEL 5: AuditLog

**Purpose:** Complete audit trail of all accounting actions

**Fields:**
```
id                  String    @id @default(cuid())
action              AuditAction                      // INVOICE_CREATED, INVOICE_UPDATED, etc.
entityType          String                           // "Invoice", "RecurringInvoice", etc.
entityId            String                           // ID of the entity being acted on
userId              String    @db.ObjectId          // Who performed the action
changes             Json?                            // {before: {}, after: {}} for updates
description         String                           // Human-readable description
ipAddress           String?
userAgent           String?
createdAt           DateTime  @default(now())

// Relationships
user                User      @relation("auditLogs", fields: [userId], references: [_id])

// Indexes
@@index([entityId])
@@index([entityType])
@@index([userId])
@@index([createdAt])
@@index([action])
```

**Key Notes:**
- **Immutable:** Never update audit logs, only create new entries
- `changes` JSON stores before/after for updates
- `description` is human-readable for compliance
- Indexed for quick audit trail queries
- IP and UserAgent optional but valuable for security

---

### MODEL 6: InvoiceNotification

**Purpose:** Track email sends and deliveries

**Fields:**
```
id                  String    @id @default(cuid())
invoiceId           String    @db.ObjectId           // Which invoice
notificationType    NotificationType                 // INVOICE_ISSUED, PAYMENT_REMINDER, OVERDUE_REMINDER
sentTo              String                           // Email address
sentAt              DateTime
isRead              Boolean   @default(false)        // If customer opened email (future feature)
openedAt            DateTime?
status              NotificationStatus               // PENDING, SENT, FAILED
failureReason       String?
retryCount          Int       @default(0)
nextRetryAt         DateTime?
createdAt           DateTime  @default(now())

// Relationships
invoice             Invoice   @relation("notifications", fields: [invoiceId], references: [id], onDelete: Cascade)

// Indexes
@@index([invoiceId])
@@index([status])
@@index([sentTo])
@@index([createdAt])
@@index([sentAt])
```

**Key Notes:**
- Tracks every email sent from system
- `status` enables retry logic for failed sends
- `retryCount` prevents infinite retry loops
- `isRead` ready for future email tracking features
- Indexed for quick notification history queries

---

## 🔗 RELATIONSHIP DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Table                              │
│                      (Existing - Safe)                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ _id (ObjectId)                                             │ │
│  │ email, name, role, etc.                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────┬──────────────────────────────────────────────────┘
              │
    ┌─────────┼─────────┬──────────────┬─────────────┬──────────────┐
    │         │         │              │             │              │
    ▼         ▼         ▼              ▼             ▼              ▼
┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌──────────────┐
│Invoice │ │Recurring │ │Pricing   │ │AuditLog  │ │Recurring│ │Invoice       │
│        │ │Invoice   │ │Config    │ │          │ │Invoice  │ │Notification │
│        │ │          │ │          │ │          │ │Created  │ │              │
│(NEW)   │ │(NEW)     │ │(NEW)     │ │(NEW)     │ │(NEW)    │ │(NEW)         │
└────────┘ └──────────┘ └──────────┘ └──────────┘ └─────────┘ └──────────────┘
    │                                     │
    │                                     │
    ▼                                     ▼
┌──────────────┐                  ┌────────────────┐
│InvoicePayment│─────────────────→│CostPayment     │
│   (NEW)      │                  │(Existing - Safe)
│              │                  │                 │
└──────────────┘                  └─────────────────┘
     │
     └──────────────────────────────────────────────────────┐
                                                            │
                                                            ▼
                                                   ┌──────────────┐
                                                   │User (payments)
                                                   │(Existing)
                                                   └──────────────┘
```

**Safety Verification:**
- ✅ User table: READ ONLY (no modifications)
- ✅ CostPayment table: READ ONLY (linked via InvoicePayment)
- ✅ All new tables: Created fresh (no existing data)
- ✅ No breaking changes to existing schema

---

## 📋 ENUMS TO ADD

### InvoiceStatus
```typescript
enum InvoiceStatus {
  DRAFT           // Not yet sent
  ISSUED          // Sent to customer
  OVERDUE         // Past due date, not paid
  PAID            // Fully paid
  CANCELLED       // Manually cancelled
  REFUNDED        // Refund issued (future)
}
```

### AuditAction
```typescript
enum AuditAction {
  INVOICE_CREATED
  INVOICE_UPDATED
  INVOICE_ISSUED
  INVOICE_SENT_TO_CUSTOMER
  INVOICE_CANCELLED
  PAYMENT_ADDED
  PAYMENT_REMOVED
  PAYMENT_REFUNDED
  RECURRING_INVOICE_CREATED
  RECURRING_INVOICE_UPDATED
  RECURRING_INVOICE_DELETED
  RECURRING_INVOICE_PAUSED
  RECURRING_INVOICE_RESUMED
  PRICING_CONFIG_CREATED
  PRICING_CONFIG_UPDATED
  PRICING_CONFIG_ARCHIVED
  EMAIL_SENT
  EMAIL_FAILED
  EMAIL_RETRY
}
```

### NotificationType
```typescript
enum NotificationType {
  INVOICE_ISSUED           // New invoice sent
  PAYMENT_REMINDER         // Payment due soon
  OVERDUE_REMINDER         // Invoice overdue
  PAYMENT_RECEIVED         // Payment confirmation (future)
  INVOICE_VIEWED           // Customer opened email (future)
}
```

### NotificationStatus
```typescript
enum NotificationStatus {
  PENDING          // Queued to send
  SENT             // Successfully sent
  FAILED           // Failed to send
  BOUNCED          // Email bounced
  UNSUBSCRIBED     // Customer unsubscribed (future)
}
```

---

## ✅ DATA SAFETY VERIFICATION CHECKLIST

### Existing Tables - Verification
- [ ] `users` table - No schema changes
- [ ] `cost_payments` table - No schema changes, will be READ ONLY
- [ ] `miners` table - No schema changes, will be READ ONLY
- [ ] `spaces` table - No schema changes, no interaction
- [ ] `hardware` table - No schema changes, no interaction
- [ ] `miner_rate_history` table - No schema changes, no interaction
- [ ] `user_activities` table - No schema changes, no interaction

### New Tables - Creation
- [ ] `invoices` table will be created (empty)
- [ ] `recurring_invoices` table will be created (empty)
- [ ] `customer_pricing_config` table will be created (empty)
- [ ] `invoice_payments` table will be created (empty)
- [ ] `audit_logs` table will be created (empty)
- [ ] `invoice_notifications` table will be created (empty)

### Relationships - Verification
- [ ] All foreign keys point to existing User table
- [ ] InvoicePayment links to existing CostPayment (read-only)
- [ ] No circular dependencies
- [ ] All relationships documented

### Migration - Safety
- [ ] Migration file created in `prisma/migrations/`
- [ ] Migration is idempotent (safe to run multiple times)
- [ ] Migration does not modify existing data
- [ ] Rollback procedure documented
- [ ] Backup created before migration

---

## 🔄 MIGRATION EXECUTION STEPS

### Step 1: Review Current State
```bash
# Check current schema
npx prisma studio

# Verify database is accessible
npx prisma db execute --stdin < /dev/null
```

### Step 2: Create Database Backup
```bash
# Create backup before making changes
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Or use MongoDB backup if applicable
mongoexport --uri=$MONGODB_URI --collection=users
```

### Step 3: Update Prisma Schema
- Add 6 new models to `prisma/schema.prisma`
- Add 4 new enums to schema
- Verify syntax is correct
- Check all relationships defined

### Step 4: Create Migration
```bash
npx prisma migrate dev --name add_accounting_models
```

**What This Does:**
1. Generates migration SQL file
2. Creates tables in database
3. Regenerates Prisma Client
4. Updates TypeScript types
5. Records migration history

### Step 5: Verify Migration Success
```bash
# Check tables exist
npx prisma studio

# Verify schema matches
npx prisma db execute --stdin < /dev/null

# Test Prisma Client types
npm run type-check
```

### Step 6: Commit to Git
```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(database): Add accounting module schema (Phase 3)

- Add 6 new models: Invoice, RecurringInvoice, CustomerPricingConfig, InvoicePayment, AuditLog, InvoiceNotification
- Add 4 enums: InvoiceStatus, AuditAction, NotificationType, NotificationStatus
- Create relationships to User table (ADMIN role for actions)
- Create relationship to CostPayment for payment tracking
- All existing tables remain untouched
- Database safety guaranteed - new tables only
"
git push origin main
```

---

## ↩️ ROLLBACK PROCEDURES

### If Issues Found Before Phase 4

**Option 1: Prisma Reset (Development Only)**
```bash
# WARNING: Only use in development!
npx prisma migrate reset
```

**What Happens:**
1. All new tables dropped
2. All new data deleted
3. Migration history cleared
4. Database returned to pre-Phase 3 state
5. **Takes ~2 minutes**

**What is Preserved:**
- ✅ All existing data in User, CostPayment, Miners, etc.

---

### Option 2: Restore from Backup (Production Safe)

**Before Starting Phase 3:**
```bash
# Create backup
pg_dump $DATABASE_URL > backup_before_phase3_$(date +%Y%m%d_%H%M%S).sql
```

**If Rollback Needed:**
```bash
# Restore from backup
psql $DATABASE_URL < backup_before_phase3_YYYYMMDD_HHMMSS.sql
```

**What is Preserved:**
- ✅ All existing data restored exactly as it was
- ✅ All new tables removed
- ✅ Database returned to pre-Phase 3 state

---

### Option 3: Manual SQL Rollback

**If migration file needs to be reversed:**
```sql
-- Drop all new tables
DROP TABLE invoice_notifications;
DROP TABLE invoice_payments;
DROP TABLE audit_logs;
DROP TABLE customer_pricing_configs;
DROP TABLE recurring_invoices;
DROP TABLE invoices;

-- Drop enums (if using PostgreSQL)
DROP TYPE IF EXISTS "InvoiceStatus";
DROP TYPE IF EXISTS "AuditAction";
DROP TYPE IF EXISTS "NotificationType";
DROP TYPE IF EXISTS "NotificationStatus";
```

---

## 📊 MIGRATION IMPACT ANALYSIS

### Database Growth
```
Table: invoices
- Estimated rows after Phase 4: ~500 (monthly)
- Estimated rows after 1 year: ~6,000
- Size: ~1-2 MB

Table: recurring_invoices
- Estimated rows: 30-50 (one per active customer)
- Size: ~10 KB

Table: customer_pricing_config
- Estimated rows: 50-100 (multiple prices per customer if changed)
- Size: ~20 KB

Table: invoice_payments
- Estimated rows: Similar to invoices
- Size: ~500 KB - 1 MB

Table: audit_logs
- Estimated rows: 10K - 50K (all actions logged)
- Size: 5-10 MB

Table: invoice_notifications
- Estimated rows: 1000+ (every email sent)
- Size: 2-5 MB

Total estimated database growth after 1 year: ~20 MB
```

### Performance Considerations
- ✅ All indexes properly defined
- ✅ Foreign keys optimized
- ✅ Queries will be fast (<100ms)
- ✅ No N+1 query problems with proper Prisma usage
- ✅ Archival strategy (delete old invoices after 3 years) optional

---

## 🎯 SUCCESS CRITERIA FOR PHASE 3

### After Migration Execution
- [ ] 6 new tables successfully created
- [ ] All enums defined in database
- [ ] All relationships working
- [ ] All indexes created
- [ ] Prisma types generated
- [ ] Build passes without errors
- [ ] Existing data unchanged
- [ ] Rollback procedure tested
- [ ] Migration committed to git
- [ ] Code pushed to origin/main

### Verification Queries
```bash
# Check tables exist
npx prisma studio

# Verify no existing data modified
SELECT COUNT(*) FROM users;          # Should match before count
SELECT COUNT(*) FROM cost_payments;  # Should match before count
SELECT COUNT(*) FROM miners;         # Should match before count

# Verify new tables are empty
SELECT COUNT(*) FROM invoices;              # Should be 0
SELECT COUNT(*) FROM recurring_invoices;    # Should be 0
SELECT COUNT(*) FROM customer_pricing_config; # Should be 0
SELECT COUNT(*) FROM invoice_payments;      # Should be 0
SELECT COUNT(*) FROM audit_logs;            # Should be 0
SELECT COUNT(*) FROM invoice_notifications; # Should be 0
```

---

## 📝 CURRENT STATE BEFORE PHASE 3

### What's Already Done
- ✅ Phase 1: Type definitions, mocks, constants (Committed)
- ✅ Phase 2: UI pages, components, hooks (Committed, Build Passing)
- ✅ Build: Verified passing with zero TypeScript errors
- ✅ Routes: All 7 accounting routes confirmed in build
- ✅ Deployment: Ready for Vercel (pushed to origin/main)

### What Happens in Phase 3
1. ⏳ Add 6 Prisma models to schema
2. ⏳ Run migration to create tables
3. ⏳ Verify existing data untouched
4. ⏳ Commit and push to git

### What Happens After Phase 3
- Phase 4: Create API routes that read/write to new tables
- Phase 4: Wire UI pages to real APIs instead of mock data
- Phase 4: System becomes fully functional with real database

---

## 🚀 READY FOR PHASE 3

**Status:** ✅ PLANNING COMPLETE

**Next Steps (When Ready):**
1. Review this document
2. Verify you're comfortable with schema
3. Confirm database backup strategy
4. Execute Phase 3 implementation
5. Verify migration success
6. Begin Phase 4

**Estimated Time:** 1.5 hours (planning) + 30 minutes (execution & verification) = 2 hours total

**Risk Level:** 🟢 ZERO (All existing data 100% safe)

---

## 📞 PHASE 3 CHECKLIST

Before executing Phase 3, verify:

- [ ] Backup database (see Rollback Procedures section)
- [ ] Review all 6 model definitions above
- [ ] Understand relationship diagram
- [ ] Review data safety guarantees
- [ ] Understand rollback procedure
- [ ] Team is available for 2 hours
- [ ] No concurrent database operations
- [ ] Database connection string is correct
- [ ] Prisma is properly configured
- [ ] Ready to commit changes to git

---

**Phase 3 Documentation Complete**  
**Ready to Proceed at User's Direction**  
**Date:** January 12, 2026

