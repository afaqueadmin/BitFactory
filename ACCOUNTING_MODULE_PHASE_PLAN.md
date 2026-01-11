# ACCOUNTING MODULE - TYPES-FIRST HYBRID APPROACH
## Complete Phase Implementation Plan

**Document Version:** 1.0  
**Date Created:** January 11, 2026  
**Project:** BitFactory Accounting System  
**Status:** Planning Phase  

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Data Safety Guarantee](#data-safety-guarantee)
3. [Phase 1: Type Definitions & Mock Setup](#phase-1-type-definitions--mock-setup)
4. [Phase 2: UI with Mock Data](#phase-2-ui-with-mock-data)
5. [Phase 3: Database Schema](#phase-3-database-schema)
6. [Phase 4: Real API Routes & Wire UI](#phase-4-real-api-routes--wire-ui)
7. [Phase 5: Advanced Features & Polish](#phase-5-advanced-features--polish)
8. [Complete Timeline](#complete-timeline)
9. [Data Safety Summary](#data-safety-summary)
10. [Rollback Plan](#rollback-plan)
11. [Readiness Checklist](#readiness-checklist)

---

## EXECUTIVE SUMMARY

This document outlines the implementation plan for the **BitFactory Accounting Module** using a **Types-First Hybrid Approach**. This methodology prioritizes:

- **Type Safety**: Define all data contracts upfront
- **Visible Progress**: See working features after each phase
- **Data Protection**: Zero risk to existing data
- **Parallel Work**: Teams can work independently
- **Fast Delivery**: Complete system in 9.5 hours

### Key Benefits

✅ Full working UI visible after Phase 2 (2.5 hours in)  
✅ Real API endpoints ready after Phase 4 (6 hours in)  
✅ All existing database data 100% safe throughout  
✅ No refactoring needed between phases  
✅ Professional accounting system by Phase 5 completion  

### Quick Stats

| Metric | Value |
|--------|-------|
| Total Duration | 9.5 hours |
| Phases | 5 |
| Files to Create | ~30 |
| Database Tables to Add | 6 |
| Risk to Existing Data | None (🟢) |
| Team Members Needed | 2-3 |
| Parallel Work Possible | Yes (Phases 2 & 3) |

---

## DATA SAFETY GUARANTEE

**⚠️ CRITICAL: All existing database data is 100% SAFE**

### What Will NOT Change

❌ No modifications to `users` table  
❌ No modifications to `cost_payments` table  
❌ No modifications to `miners` table  
❌ No modifications to `spaces` table  
❌ No modifications to `hardware` table  
❌ No modifications to any existing tables  

### What WILL Change

✅ 6 new tables will be created (empty initially)
✅ New Prisma types will be generated
✅ New API routes will be added
✅ New UI pages will be created

### Rollback Capability

At ANY point during implementation:
```bash
npx prisma migrate reset
```
This will:
- Remove all new tables
- Restore database to pre-Phase 3 state
- Preserve all existing data
- Takes ~2 minutes

---

## PHASE 1: TYPE DEFINITIONS & MOCK SETUP

### Duration: 1.5 hours
### Complexity: Low (No database changes)
### Visible Result: ✅ Type definitions and mock data generator ready

### 1.1 Create Type Definition Files

**File**: `src/lib/types/invoice.ts`

**What Gets Created:**
- Invoice interface with all fields
- RecurringInvoice interface
- InvoicePayment interface
- CustomerPricingConfig interface
- AuditLog interface
- InvoiceNotification interface
- Enums:
  - `InvoiceStatus` (DRAFT, ISSUED, OVERDUE, PAID, CANCELLED)
  - `RecurringFrequency` (MONTHLY)
  - `NotificationType` (INVOICE_ISSUED, PAYMENT_REMINDER, OVERDUE_REMINDER)
  - `AuditAction` (INVOICE_CREATED, INVOICE_UPDATED, INVOICE_SENT, etc.)

**Purpose:** Define the contract that both UI and API must follow

**Safety**: 🟢 100% Safe
- No database interaction
- Pure TypeScript

### 1.2 Create API Response Contract Document

**File**: `docs/INVOICE_API_CONTRACTS.md`

**What Gets Created:**
- GET /api/invoices response shape
- POST /api/invoices request/response
- GET /api/invoices/[id] response
- PUT /api/invoices/[id] request/response
- DELETE /api/invoices/[id] response
- All other invoice endpoints documented
- Example requests and responses
- Error response formats

**Purpose:** Reference document for API team

**Safety**: 🟢 100% Safe
- Just documentation

### 1.3 Create Mock Data Generator

**File**: `src/lib/mocks/invoiceMocks.ts`

**What Gets Created:**
- `generateMockInvoice()` - Creates fake invoice
- `generateMockInvoices(count)` - Creates multiple fake invoices
- `generateMockRecurringInvoice()` - Creates fake recurring template
- `generateMockCustomer()` - Creates fake customer
- Uses `faker.js` library for realistic data
- All mock data matches types from 1.1

**Purpose:** Provides test data for UI development

**Dependencies:** `faker` (npm package)

**Safety**: 🟢 100% Safe
- No database interaction
- In-memory data only

### 1.4 Create Mock Data Hook Template

**File**: `src/lib/mocks/useMockInvoices.ts`

**What Gets Created:**
- React hook template showing structure
- `useMockInvoices()` - Hook to fetch mock invoice list
- `useMockInvoice(id)` - Hook to fetch single invoice
- Not fully implemented (done in Phase 2)
- Just the framework

**Purpose:** Shows UI team how to consume mock data

**Safety**: 🟢 100% Safe
- Just template/structure

### 1.5 Create Constants File

**File**: `src/lib/constants/accounting.ts`

**What Gets Created:**
```
DEFAULT_DUE_DAYS = 30
INVOICE_NUMBER_FORMAT = "YYYYMMDDSR"
PAYMENT_REMINDER_DAYS_BEFORE = 5
DEFAULT_UNIT_PRICE = 190
ADMIN_BASE_URL = "my.bitfactory.ae"
Invoice statuses, frequencies, etc.
```

**Purpose:** Single source of truth for accounting configuration

**Safety**: 🟢 100% Safe
- Just constants

### ✅ Phase 1 Deliverables

| Item | Status | Safety |
|------|--------|--------|
| Type definitions created | ✓ | 🟢 |
| API contracts documented | ✓ | 🟢 |
| Mock data generator working | ✓ | 🟢 |
| Mock hook template ready | ✓ | 🟢 |
| Constants defined | ✓ | 🟢 |

### Phase 1 Outcome

```
You can:
✓ See all type definitions
✓ Read API contracts
✓ Generate realistic test data
✓ Understand data structure

You cannot:
✗ See anything in browser yet
✗ Access new database tables (none created yet)
✗ Call any APIs

Database State: UNCHANGED ✅
Files Created: 5
Lines of Code: ~500
Risk Level: NONE 🟢
```

---

## PHASE 2: UI WITH MOCK DATA

### Duration: 2.5 hours
### Complexity: Medium (React components)
### Visible Result: ✅ Full working UI in browser

### 2.1 Create Dashboard Page

**File**: `src/app/(manage)/accounting/page.tsx`

**Components:**
- Header: "Accounting Dashboard"
- 4 Stat Cards:
  - Total Invoices
  - Unpaid Invoices
  - Overdue Invoices
  - Outstanding Amount
- Table: Recent Invoices (last 7 days)
- Table: Upcoming Invoices (next 7 days)
- Table: Active Recurring Invoices

**Data Source:** Mock data from Phase 1

**Functionality:**
- Displays statistics
- Shows invoice lists
- Click rows for more details

### 2.2 Create Invoice List Page

**File**: `src/app/(manage)/accounting/invoices/page.tsx`

**Components:**
- Filter section:
  - Status filter (All, DRAFT, ISSUED, OVERDUE, PAID, CANCELLED)
  - Date range picker
  - Customer search
  - Search invoice number
- Sortable table:
  - Invoice Number
  - Customer Name
  - Amount
  - Status
  - Due Date
- Pagination (10, 25, 50 per page)
- Action buttons per row:
  - View
  - Edit (if DRAFT)
  - Delete
- Create button: "Create New Invoice"

**Data Source:** Mock data

**Functionality:**
- Filter and sort mock invoices
- Pagination working
- Click to navigate

### 2.3 Create Invoice Detail Page

**File**: `src/app/(manage)/accounting/invoices/[id]/page.tsx`

**Sections:**
- Invoice Header:
  - Invoice Number
  - Status badge
  - Issue Date
  - Due Date
  - Paid Date (if applicable)
  
- Customer Information:
  - Name
  - Email
  - Company
  
- Invoice Details Table:
  - PARTICULARS | QTY | UNIT PRICE | TOTAL
  - Electricity Advance Payment | 12 | $190 | $2,280
  
- Payment Section:
  - Total Amount
  - Amount Paid
  - Outstanding Balance
  
- Action Buttons:
  - Edit (if DRAFT)
  - Send Invoice Email
  - Send Payment Reminder
  - Record Payment
  
- Payment History (empty for now)
- Audit Trail (empty for now)

**Data Source:** Mock invoice from Phase 1

### 2.4 Create Invoice Form Modal

**File**: `src/components/AccountingModals/InvoiceFormModal.tsx`

**Form Fields:**
- Customer: Dropdown (populated from mock customers)
- Total Miners: Number input (with validation)
- Unit Price: Currency input (with validation)
- Due Date: Date picker
- Auto-calculated: Total Amount

**Features:**
- Form validation
- Real-time calculation
- Submit button (logs to console for now)
- Cancel button

**Data Source:** Mock customers

### 2.5 Create Generate Invoices Modal

**File**: `src/components/AccountingModals/GenerateInvoicesModal.tsx`

**Flow:**
- Step 1: Select Date
  - Radio: "Today" or "Custom Date"
  - If custom: Date picker
  - Preview button
  
- Step 2: Preview
  - Table: Customer | Day of Month | Miners | Amount
  - Shows all invoices to be created
  
- Step 3: Confirm
  - "Generate Invoices" button
  - Confirmation message

**Data Source:** Mock recurring invoices

### 2.6 Create Send Emails Modal

**File**: `src/components/AccountingModals/SendEmailsModal.tsx`

**Flow:**
- Step 1: Select Invoices
  - Checkbox: "Select All"
  - Individual checkboxes per invoice
  
- Step 2: Select Email Type
  - Radio: INVOICE_ISSUED / PAYMENT_REMINDER / OVERDUE_REMINDER
  - Shows email template preview
  
- Step 3: Confirm
  - "Send to X Customers" button
  
- Step 4: Results
  - Confirmation: "Email sent to X customers"

### 2.7 Create Record Payment Modal

**File**: `src/components/AccountingModals/RecordPaymentModal.tsx`

**Form Fields:**
- Invoice Number: Read-only
- Invoice Amount: Read-only
- Amount Paid: Currency input
- Payment Date: Date picker
- Notes: Text area (optional)

**Features:**
- Auto-calculated remaining balance
- Form validation
- Submit button

### 2.8 Create Recurring Invoices Management Page

**File**: `src/app/(manage)/accounting/recurring/page.tsx`

**Components:**
- Header: "Recurring Invoices"
- "Create New" button
- Table:
  - Customer Name
  - Day of Month
  - Unit Price
  - Start Date
  - Status (Active/Inactive)
  - Actions (Edit, Delete, Pause/Resume)

**Data Source:** Mock recurring invoices

### 2.9 Create Account Statements Pages

**File**: `src/app/(manage)/accounting/statements/page.tsx`

**Components:**
- Header: "Account Statements"
- Filters:
  - Customer dropdown
  - Period (Month/Year)
- Summary Table:
  - Customer Name
  - Total Invoiced
  - Total Paid
  - Outstanding
  - Last Payment Date
- "View Details" button per row

**File**: `src/app/(manage)/accounting/statements/[customerId]/page.tsx`

**Components:**
- Customer Header Info
- Summary Cards:
  - Total Invoiced (All Time)
  - Total Paid
  - Outstanding
  - Current Balance
- Transaction Table:
  - Date | Type | Reference | Description | Amount | Running Balance
- Aging Analysis (if applicable)
- Print/Export buttons

### 2.10 Update Navigation

**File**: `src/app/(manage)/layout.tsx`

**Changes:**
- Add "Accounting" menu item
- Links to:
  - Dashboard
  - Invoices
  - Recurring Invoices
  - Statements
  - Settings (optional)

**Result:** Full navigation to accounting module

### ✅ Phase 2 Deliverables

| Item | Status | Safety |
|------|--------|--------|
| Dashboard page | ✓ | 🟢 |
| Invoice list page | ✓ | 🟢 |
| Invoice detail page | ✓ | 🟢 |
| Form modals (4 modals) | ✓ | 🟢 |
| Recurring invoices page | ✓ | 🟢 |
| Statements pages | ✓ | 🟢 |
| Navigation updated | ✓ | 🟢 |
| All modals functional | ✓ | 🟢 |
| Form validation working | ✓ | 🟢 |

### Phase 2 Outcome

```
You can:
✓ Navigate to /accounting in browser
✓ See full dashboard with mock statistics
✓ View invoice list with filters and sorting
✓ Click invoice to see details
✓ Open all modals
✓ Fill and validate forms
✓ Click buttons (no action yet but UI complete)
✓ Navigate between all pages
✓ See professional accounting interface

Existing Database: UNCHANGED ✅
Files Created: ~20 (pages, components, modals)
Lines of Code: ~3,000
Risk Level: NONE 🟢
Time Value: Full demo-ready interface
```

---

## PHASE 3: DATABASE SCHEMA

### Duration: 1.5 hours
### Complexity: Low (Schema definition)
### Visible Result: ✅ Database structure ready

### 3.1 Define Prisma Models

**File**: `prisma/schema.prisma` (UPDATE)

**Models to Add:**

**1. Invoice**
```
Fields:
- id (String, cuid, primary key)
- invoiceNumber (String, unique) - Format: YYYYMMDDSR
- userId (String, foreign key to User)
- totalMiners (Int)
- unitPrice (Decimal)
- totalAmount (Decimal)
- status (Enum: DRAFT, ISSUED, OVERDUE, PAID, CANCELLED)
- invoiceGeneratedDate (DateTime)
- issuedDate (DateTime, nullable)
- dueDate (DateTime)
- paidDate (DateTime, nullable)
- createdBy (String, foreign key to User)
- createdAt (DateTime)
- updatedBy (String, nullable, foreign key to User)
- updatedAt (DateTime)

Relationships:
- user (User)
- payments (InvoicePayment[])
- notifications (InvoiceNotification[])
- createdByUser (User)
- updatedByUser (User)

Indexes:
- userId
- status
- dueDate
- createdAt
```

**2. RecurringInvoice**
```
Fields:
- id (String, cuid)
- userId (String, foreign key)
- dayOfMonth (Int) - 1-31
- unitPrice (Decimal, nullable)
- startDate (DateTime)
- endDate (DateTime, nullable)
- isActive (Boolean, default: true)
- lastGeneratedDate (DateTime, nullable)
- createdBy (String, foreign key)
- createdAt (DateTime)
- updatedBy (String, nullable)
- updatedAt (DateTime)

Relationships:
- user (User)
- createdByUser (User)
- updatedByUser (User)
- generatedInvoices (Invoice[])

Indexes:
- userId
- isActive
- dayOfMonth
```

**3. CustomerPricingConfig**
```
Fields:
- id (String, cuid)
- userId (String, foreign key)
- defaultUnitPrice (Decimal)
- effectiveFrom (DateTime)
- effectiveTo (DateTime, nullable)
- createdBy (String, foreign key)
- createdAt (DateTime)
- updatedBy (String, nullable)
- updatedAt (DateTime)

Relationships:
- user (User)
- createdByUser (User)
- updatedByUser (User)

Constraints:
- Unique: (userId, effectiveFrom)

Indexes:
- userId
- effectiveFrom
```

**4. InvoicePayment**
```
Fields:
- id (String, cuid)
- invoiceId (String, foreign key)
- costPaymentId (String, foreign key)
- amountPaid (Decimal)
- paidDate (DateTime)
- createdAt (DateTime)

Relationships:
- invoice (Invoice)
- costPayment (CostPayment)

Indexes:
- invoiceId
- costPaymentId
```

**5. AuditLog**
```
Fields:
- id (String, cuid)
- action (Enum: INVOICE_CREATED, INVOICE_UPDATED, INVOICE_SENT, etc)
- entityType (String) - "Invoice", "RecurringInvoice", etc
- entityId (String)
- userId (String, foreign key)
- changes (Json, nullable) - Old/new values
- description (String)
- ipAddress (String, nullable)
- userAgent (String, nullable)
- createdAt (DateTime)

Relationships:
- user (User)

Indexes:
- entityId
- entityType
- userId
- createdAt
```

**6. InvoiceNotification**
```
Fields:
- id (String, cuid)
- invoiceId (String, foreign key)
- notificationType (Enum: INVOICE_ISSUED, PAYMENT_REMINDER, OVERDUE_REMINDER)
- sentTo (String) - Email address
- sentAt (DateTime)
- isRead (Boolean, default: false)
- openedAt (DateTime, nullable)
- status (Enum: PENDING, SENT, FAILED)
- failureReason (String, nullable)
- retryCount (Int, default: 0)
- nextRetryAt (DateTime, nullable)
- createdAt (DateTime)

Relationships:
- invoice (Invoice)

Indexes:
- invoiceId
- status
- sentTo
```

### 3.2 Prepare Migration File

**File**: `prisma/migrations/{timestamp}_add_accounting_models/migration.sql`

**What Gets Created:**
- CREATE TABLE statements for all 6 new tables
- CREATE INDEX statements for all indexes
- CREATE CONSTRAINT statements
- Foreign key relationships
- Enum type definitions

**What It Does NOT Do:**
- Does not modify existing tables
- Does not delete anything
- Does not affect existing data

### 3.3 Review Migration Safety

**Verification Checklist:**
- ✓ Existing tables (User, CostPayment, Miner, etc.) NOT modified
- ✓ No breaking changes to existing columns
- ✓ All new tables independent
- ✓ Foreign keys to User table only (for audit/tracking)
- ✓ Foreign key to CostPayment in InvoicePayment only (linking tables)
- ✓ Rollback plan documented

### 3.4 Execute Migration

**Command:**
```bash
npx prisma migrate dev --name add_accounting_models
```

**What Happens:**
- Migration SQL executed
- 6 new tables created in database (empty)
- Prisma Client updated
- Types generated

**What Does NOT Happen:**
- No existing tables modified
- No existing data touched
- Database is backward compatible

### 3.5 Generate Prisma Client

**Command:**
```bash
npx prisma generate
```

**What Gets Generated:**
- Updated `src/generated/prisma/` folder
- TypeScript types for all new models
- Prisma Client with new model methods

### ✅ Phase 3 Deliverables

| Item | Status | Safety |
|------|--------|--------|
| Prisma models defined | ✓ | 🟢 |
| Migration file prepared | ✓ | 🟢 |
| Migration executed | ✓ | 🟢 |
| Prisma Client generated | ✓ | 🟢 |
| Types available | ✓ | 🟢 |

### Phase 3 Outcome

```
You can:
✓ Run: npx prisma studio
✓ See all new tables (6 tables)
✓ See tables are empty and ready
✓ See table relationships
✓ Inspect foreign keys
✓ Verify existing tables untouched
✓ Use new Prisma types in code

Existing Data: COMPLETELY SAFE ✅
Database Tables: +6 new tables
Migration Status: Complete
Rollback Capability: Available
```

---

## PHASE 4: REAL API ROUTES & WIRE UI

### Duration: 2 hours
### Complexity: Medium (API development)
### Visible Result: ✅ Full working system with real data

### 4.1 Create Invoice CRUD API Routes

**Files:**
- `src/app/api/invoices/route.ts`
- `src/app/api/invoices/[id]/route.ts`

**Endpoints:**

**GET /api/invoices**
- List all invoices
- Query parameters: page, pageSize, status, customerId, dateFrom, dateTo
- Returns paginated list
- Admin: can filter by customerId
- Client: sees only own invoices
- Authorization: Requires valid JWT

**POST /api/invoices**
- Create new invoice
- Body: userId, totalMiners, unitPrice, dueDate
- Returns created invoice with generated invoiceNumber
- Generates invoiceNumber in format YYYYMMDDSR
- Logs: AuditLog entry (INVOICE_CREATED)
- Authorization: Admin only

**GET /api/invoices/[id]**
- Get single invoice
- Returns: Full invoice details
- Authorization: Admin or owner

**PUT /api/invoices/[id]**
- Update invoice (DRAFT only)
- Can modify: totalMiners, unitPrice, dueDate
- Logs: AuditLog entry with changes
- Authorization: Admin only

**DELETE /api/invoices/[id]**
- Soft delete (status → CANCELLED)
- Logs: AuditLog entry (INVOICE_CANCELLED)
- Authorization: Admin only

### 4.2 Create Invoice Generation API Route

**File**: `src/app/api/invoices/generate/route.ts`

**Endpoint: POST /api/invoices/generate**

**Functionality:**
1. Find all active RecurringInvoice where dayOfMonth matches today
2. For each matching recurring invoice:
   - Fetch customer's ACTIVE miners count from Miner table
   - Get customer's current pricing config
   - Calculate: totalAmount = miners × unitPrice
   - Generate invoiceNumber (YYYYMMDDSR format)
   - Create new Invoice (status: DRAFT)
3. Return: Array of created invoices
4. Log: AuditLog (INVOICE_AUTO_GENERATED)

**Authorization:** Admin only

**Data Sources:**
- Reads from: RecurringInvoice (new), Miner (existing), CustomerPricingConfig (new)
- Writes to: Invoice (new), AuditLog (new)

**Safety:** 🟢 Safe
- Reads from existing Miner table (not modified)
- Only creates new invoices

### 4.3 Create Invoice Send Email API Route

**File**: `src/app/api/invoices/send/route.ts`

**Endpoint: POST /api/invoices/send**

**Body:**
```json
{
  "invoiceIds": ["id1", "id2"],
  "emailType": "INVOICE_ISSUED" // or PAYMENT_REMINDER, OVERDUE_REMINDER
}
```

**Functionality:**
1. Validate invoices exist
2. Get customer email for each invoice
3. Call appropriate email function:
   - sendInvoiceEmail()
   - sendPaymentReminderEmail()
   - sendOverdueReminderEmail()
4. Log: InvoiceNotification (SENT/FAILED)
5. Log: AuditLog (INVOICE_SENT_TO_CUSTOMER)
6. Return: { sent: X, failed: Y, errors: [] }

**Authorization:** Admin only

### 4.4 Create Record Payment API Route

**File**: `src/app/api/invoices/[id]/pay/route.ts`

**Endpoint: POST /api/invoices/{id}/pay**

**Body:**
```json
{
  "amountPaid": 2280.00
}
```

**Functionality:**
1. Validate invoice exists and status is ISSUED/OVERDUE
2. Create CostPayment entry (type: PAYMENT)
3. Create InvoicePayment link (invoice ↔ costPayment)
4. If amountPaid >= invoice.totalAmount:
   - Update invoice.status = PAID
   - Update invoice.paidDate = now
5. Else:
   - Keep invoice.status = ISSUED
6. Log: AuditLog (PAYMENT_ADDED)
7. Return: Updated invoice

**Reads From:** Invoice (new), User (existing), CostPayment (existing)
**Writes To:** CostPayment (existing), InvoicePayment (new), AuditLog (new)
**Updates:** Invoice (new)

**Authorization:** Admin only

**Safety:** 🟢 Safe
- Links existing CostPayment to new Invoice
- CostPayment data unchanged

### 4.5 Create Recurring Invoice API Routes

**Files:**
- `src/app/api/recurring-invoices/route.ts`
- `src/app/api/recurring-invoices/[id]/route.ts`

**Endpoints:**

**GET /api/recurring-invoices**
- List all recurring invoice templates
- Returns: Array of RecurringInvoice with related data
- Authorization: Admin only

**POST /api/recurring-invoices**
- Create new recurring template
- Body: userId, dayOfMonth, unitPrice (optional), startDate, endDate (optional)
- Logs: AuditLog (RECURRING_INVOICE_CREATED)
- Authorization: Admin only

**GET /api/recurring-invoices/[id]**
- Get single recurring invoice template
- Authorization: Admin only

**PUT /api/recurring-invoices/[id]**
- Update recurring template
- Can change: dayOfMonth, unitPrice, startDate, endDate, isActive
- Logs: AuditLog with changes
- Authorization: Admin only

**DELETE /api/recurring-invoices/[id]**
- Soft delete (isActive → false)
- Logs: AuditLog (RECURRING_INVOICE_DELETED)
- Authorization: Admin only

### 4.6 Create Customer Pricing Config Routes

**Files:**
- `src/app/api/customer-pricing-config/route.ts`
- `src/app/api/customer-pricing-config/[userId]/route.ts`

**Endpoints:**

**GET /api/customer-pricing-config**
- List all customer pricing configurations
- Returns: Array with pricing history
- Authorization: Admin only

**POST /api/customer-pricing-config**
- Create new pricing config
- Body: userId, defaultUnitPrice, effectiveFrom
- When creating: Old config gets effectiveTo = now
- Logs: AuditLog (PRICING_CONFIG_CREATED)
- Authorization: Admin only

**GET /api/customer-pricing-config/[userId]**
- Get customer's current and historical pricing
- Returns: Current config + price history
- Authorization: Admin only

**PUT /api/customer-pricing-config/[userId]**
- Update customer's pricing
- Can change: effectiveFrom, defaultUnitPrice
- Logs: AuditLog
- Authorization: Admin only

### 4.7 Create Dashboard API Route

**File**: `src/app/api/accounting/dashboard/route.ts`

**Endpoint: GET /api/accounting/dashboard**

**Returns:**
```json
{
  "totalInvoices": 45,
  "unpaidInvoices": 12,
  "overdueInvoices": 3,
  "totalOutstanding": 23450.00,
  
  "upcomingInvoices": [
    {
      "invoiceId": "...",
      "invoiceNumber": "20260110001",
      "customerId": "...",
      "customerName": "Customer A",
      "amount": 2280.00,
      "dueDate": "2026-02-10",
      "daysUntilDue": 7
    }
  ],
  
  "recentInvoices": [
    {
      "invoiceId": "...",
      "invoiceNumber": "20260110001",
      "customerId": "...",
      "customerName": "Customer A",
      "amount": 2280.00,
      "issuedDate": "2026-01-10",
      "status": "ISSUED"
    }
  ],
  
  "recurringInvoices": {
    "total": 32,
    "active": 28,
    "inactive": 4
  }
}
```

**Reads From:** Invoice, RecurringInvoice (both new)
**Authorization:** Admin only

### 4.8 Create Account Statements Routes

**Files:**
- `src/app/api/accounting/statements/route.ts`
- `src/app/api/accounting/statements/[customerId]/route.ts`

**Endpoints:**

**GET /api/accounting/statements**
- List all customers with invoice/payment summary
- Returns: Array of customers with totals
- Authorization: Admin only

**GET /api/accounting/statements/[customerId]**
- Detailed statement for one customer
- Returns:
  ```json
  {
    "customer": { "id", "name", "email" },
    "invoices": [
      {
        "id", "number", "issuedDate", "dueDate",
        "totalAmount", "paidAmount", "status", "agingDays"
      }
    ],
    "payments": [
      { "id", "amount", "date", "invoiceId", "type" }
    ],
    "summary": {
      "totalInvoiced": 45000,
      "totalPaid": 42000,
      "totalOutstanding": 3000,
      "lastPaymentDate": "2026-01-10",
      "nextInvoiceDate": "2026-02-10"
    }
  }
  ```
- Authorization: Admin or owner

### 4.9 Add Email Functions to `email.ts`

**File**: `src/lib/email.ts` (UPDATE)

**Functions to Add:**

**sendInvoiceEmail()**
```
Parameters:
- customerEmail: string
- customerName: string
- invoice: Invoice
- totalMiners: number

Returns:
- { success: boolean; error?: any }

Functionality:
- Format invoice as HTML email
- Send via nodemailer
- Include invoice number, amount, due date
- Professional template
```

**sendPaymentReminderEmail()**
```
Parameters:
- customerEmail: string
- customerName: string
- invoice: Invoice
- daysUntilDue: number

Returns:
- { success: boolean; error?: any }

Functionality:
- Format as payment reminder
- Include days until due
- Call-to-action to pay
```

**sendOverdueReminderEmail()**
```
Parameters:
- customerEmail: string
- customerName: string
- invoice: Invoice
- daysOverdue: number

Returns:
- { success: boolean; error?: any }

Functionality:
- Format as overdue notice
- Include days overdue
- Urgent payment request
```

**sendBulkInvoiceEmails()**
```
Parameters:
- invoices: Array of { customerEmail, customerName, invoice, totalMiners }

Returns:
- { success: number; failed: number; errors: any[] }

Functionality:
- Loop through invoices
- Send each email
- Track success/failures
- Return summary
```

### 4.10 Wire UI to Real APIs

**Files to Update:**
- All pages created in Phase 2
- Replace mock data hooks with real API calls

**Changes:**
- `src/app/(manage)/accounting/page.tsx`
  - Replace: `useMockDashboard()` 
  - With: `useEffect(() => fetch('/api/accounting/dashboard'))`
  
- `src/app/(manage)/accounting/invoices/page.tsx`
  - Replace: Mock invoice list
  - With: Real API call
  
- Similar updates to all pages

**Result:**
- UI instantly shows real data from database
- All functionality works with real data

### ✅ Phase 4 Deliverables

| Item | Status | Safety |
|------|--------|--------|
| Invoice CRUD routes | ✓ | 🟢 |
| Recurring invoice routes | ✓ | 🟢 |
| Pricing config routes | ✓ | 🟢 |
| Generation route | ✓ | 🟢 |
| Send email route | ✓ | 🟢 |
| Record payment route | ✓ | 🟢 |
| Dashboard route | ✓ | 🟢 |
| Statements routes | ✓ | 🟢 |
| Email functions | ✓ | 🟢 |
| UI wired to APIs | ✓ | 🟢 |

### Phase 4 Outcome

```
You can:
✓ Create invoice from UI
✓ See invoice in list immediately
✓ Edit DRAFT invoice
✓ View invoice details
✓ Record payment
✓ Payment updates invoice status
✓ Generate monthly invoices
✓ Send bulk emails
✓ View customer statements
✓ See audit trail of all actions

Database:
✓ Real data persisted
✓ All relationships working
✓ Existing CostPayment linked to invoices
✓ Complete invoice lifecycle working

System Status: FULLY FUNCTIONAL ✅
```

---

## PHASE 5: ADVANCED FEATURES & POLISH

### Duration: 2 hours
### Complexity: Low-Medium (Enhancements)
### Visible Result: ✅ Professional production-ready system

### 5.1 Add Bulk Email Functionality

**Enhancement:**
- Admin selects multiple invoices with checkboxes
- "Send Email to Selected" button appears
- Sends emails in bulk with progress indicator
- Shows count of emails sent

### 5.2 Add Export Features

**Enhancements:**
- "Export to CSV" button on invoice lists
- "Export to PDF" button on statements
- Downloads file to user's computer
- Includes all invoice/payment details

### 5.3 Add Audit Trail Display

**Enhancement:**
- "History" section on invoice detail page
- Shows:
  - Who created invoice, when
  - Who edited, when, what changed
  - When email sent, to whom
  - When payment received
  - When invoice cancelled
- Read-only display of AuditLog table

### 5.4 Add Advanced Filtering

**Enhancements:**
- Date range filter (From - To)
- Amount range filter
- Customer name search
- Status multi-select
- Saved filter presets
- Export filtered results

### 5.5 Add Payment Reminder Configuration

**Enhancements:**
- Settings page for accounting
- Configure:
  - Days before due date to send reminder
  - Days overdue before sending overdue notice
  - Email template selection
- Admin can manually trigger reminders
- Automatic scheduling option

### 5.6 Add Bulk Invoice Generation from CSV

**Enhancement:**
- Admin uploads CSV with:
  - Customer ID
  - Custom unit price (optional)
  - Custom due date (optional)
- System generates invoices in bulk
- Shows progress and results
- Option to schedule generation

### 5.7 Add Performance Optimizations

**Enhancements:**
- Database query optimization
- Add missing indexes
- Implement caching for dashboard stats
- Query performance monitoring
- Reduce N+1 query problems

### 5.8 Add Testing & Documentation

**Enhancements:**
- API endpoint testing (Postman collection provided)
- Component testing (Jest)
- Integration tests
- User guide documentation
- API documentation (OpenAPI/Swagger)
- Troubleshooting guide

### ✅ Phase 5 Deliverables

| Feature | Status | Importance |
|---------|--------|-----------|
| Bulk email sending | ✓ | Medium |
| CSV/PDF exports | ✓ | Medium |
| Audit trail display | ✓ | High |
| Advanced filtering | ✓ | Low |
| Reminder config | ✓ | Medium |
| Bulk CSV import | ✓ | Low |
| Performance optimization | ✓ | High |
| Testing & documentation | ✓ | High |

### Phase 5 Outcome

```
You Have:
✓ Complete accounting module
✓ Full invoice lifecycle
✓ Recurring invoice automation
✓ Customer billing tracking
✓ Payment recording & tracking
✓ Professional UI/UX
✓ Email notifications
✓ Audit trail & compliance
✓ Data export capabilities
✓ Performance optimized
✓ Well tested
✓ Fully documented

System Status: PRODUCTION READY ✅
```

---

## COMPLETE TIMELINE

### Sequential Timeline (No Parallel Work)

| Phase | Duration | Cumulative | Activity |
|-------|----------|-----------|----------|
| 1 | 1.5h | 1.5h | Types & Mocks |
| 2 | 2.5h | 4h | UI Development |
| 3 | 1.5h | 5.5h | Database Schema |
| 4 | 2h | 7.5h | API Routes & Wire |
| 5 | 2h | 9.5h | Advanced Features |

### Optimized Timeline (Parallel Work)

```
Phase 1: TYPES (1.5h)
    ↓
Then in parallel:
├─ Phase 2: UI (2.5h)
└─ Phase 3: DB (1.5h)
    ↓ (whichever finishes last determines next)
Phase 4: APIs (2h) [depends on 2 & 3]
    ↓
Phase 5: Polish (2h)

Total: ~8 hours (instead of 9.5h)
Savings: 1.5 hours
```

### Milestone Visibility

| Milestone | After Time | Visible |
|-----------|-----------|---------|
| Types & Contracts | 1.5h | 🟢 Types ready |
| UI in Browser | 4h | 🟢 Full demo |
| Database Ready | 5.5h | 🟢 Prisma Studio |
| APIs Working | 7.5h | 🟢 Real data |
| System Complete | 9.5h | 🟢 Production |

---

## DATA SAFETY SUMMARY

### Existing Tables (Protected)

```
✅ users
   - Role: Auth & user management
   - Status: NO CHANGES
   - Data Safety: 100% SAFE

✅ cost_payments  
   - Role: Track electricity & payments
   - Status: LINKED TO NEW INVOICE TABLE
   - Data Safety: 100% SAFE (read from, linked only)
   - Linked by: InvoicePayment table

✅ miners
   - Role: Track customer mining hardware
   - Status: READ ONLY during generation
   - Data Safety: 100% SAFE (never modified)
   - Used for: Count active miners per customer

✅ spaces
   - Role: Mining facility management
   - Status: NO INTERACTION
   - Data Safety: 100% SAFE

✅ hardware
   - Role: Hardware specs
   - Status: NO INTERACTION
   - Data Safety: 100% SAFE

✅ miner_rate_history
   - Role: Historical rates
   - Status: NO INTERACTION
   - Data Safety: 100% SAFE

✅ token_blacklist
   - Role: Session management
   - Status: NO INTERACTION
   - Data Safety: 100% SAFE

✅ user_activities
   - Role: Activity logging
   - Status: NO INTERACTION
   - Data Safety: 100% SAFE
```

### New Tables (Created)

```
📝 invoices
   - Created in Phase 3
   - Contains: All invoice records
   - Relationships: user (customer), invoicePayments, notifications

📝 recurring_invoices
   - Created in Phase 3
   - Contains: Monthly invoice templates
   - Relationships: user (customer)

📝 customer_pricing_config
   - Created in Phase 3
   - Contains: Unit price per customer with history
   - Relationships: user (customer)

📝 invoice_payments
   - Created in Phase 3
   - Contains: Links between invoices and cost payments
   - Relationships: invoice, costPayment

📝 audit_logs
   - Created in Phase 3
   - Contains: Complete audit trail
   - Relationships: user (who performed action)

📝 invoice_notifications
   - Created in Phase 3
   - Contains: Email tracking
   - Relationships: invoice
```

---

## ROLLBACK PLAN

### If Issues Found at ANY Point

**Command to Rollback:**
```bash
npx prisma migrate reset
```

**What Happens:**
1. All new tables dropped
2. Database returned to state before Phase 3
3. All existing data restored
4. Takes ~2 minutes

**What is Preserved:**
- ✅ All user records
- ✅ All cost payment records
- ✅ All miner records
- ✅ All space records
- ✅ All hardware records
- ✅ All existing data

**What is Lost:**
- ❌ Any invoice records (new)
- ❌ Any recurring invoice templates (new)
- ❌ Any audit log entries (new)

**Result:** Back to pre-accounting system state

### Safety Layers

1. **Backup Before Starting:**
   ```bash
   pg_dump bitfactory > backup_before_accounting.sql
   ```

2. **Rollback After Phase 3:**
   ```bash
   npx prisma migrate reset
   ```

3. **Restore From Backup:**
   ```bash
   psql bitfactory < backup_before_accounting.sql
   ```

---

## READINESS CHECKLIST

### Before Starting Phase 1

- [ ] Read entire plan document
- [ ] Understand data safety guarantees
- [ ] Backup current database
- [ ] Assign team members to phases
- [ ] Reserve calendar time
- [ ] Set up development environment
- [ ] Install faker.js package
- [ ] Verify Prisma setup working

### Before Starting Phase 2

- [ ] Phase 1 completed and reviewed
- [ ] All type definitions match API contracts
- [ ] Mock data generator working
- [ ] Team familiar with mock data structure

### Before Starting Phase 3

- [ ] Phase 2 UI fully functional
- [ ] All pages and modals working
- [ ] Database backup created
- [ ] Rollback plan understood
- [ ] Migration file reviewed

### Before Starting Phase 4

- [ ] Phase 3 migration successful
- [ ] Prisma Studio shows 6 new tables
- [ ] Existing tables unchanged
- [ ] All types generated correctly

### Before Starting Phase 5

- [ ] Phase 4 APIs all working
- [ ] UI connected to real data
- [ ] End-to-end workflow tested
- [ ] All CRUD operations verified

### Before Deploying to Production

- [ ] All phases completed
- [ ] Comprehensive testing done
- [ ] Documentation reviewed
- [ ] Team trained on system
- [ ] Backup strategy documented
- [ ] Monitoring configured
- [ ] Performance verified
- [ ] Security reviewed

---

## TEAM REQUIREMENTS

### Recommended Team Composition

**Phase 1 (Types & Mocks)**
- 1 Backend Developer
- Time: 1.5 hours

**Phase 2 (UI Development)**
- 1-2 Frontend Developers
- 1 UI/UX Designer (optional)
- Time: 2.5 hours

**Phase 3 (Database Schema)**
- 1 Backend Developer / DBA
- Time: 1.5 hours

**Phase 4 (API Development)**
- 1 Backend Developer
- 1 Frontend Developer (for wiring)
- Time: 2 hours

**Phase 5 (Polish & Deploy)**
- 1 Backend Developer
- 1 Frontend Developer
- Time: 2 hours

**Total Team:** 2-3 people  
**Total Time:** 9.5 hours  
**Can Be Done In:** 2-3 days (depending on team size)

---

## SUCCESS CRITERIA

### After Phase 1
- ✅ Types defined and documented
- ✅ API contracts clear
- ✅ Mock data generator working

### After Phase 2
- ✅ UI fully functional in browser
- ✅ All forms and modals working
- ✅ Navigation complete
- ✅ Demo-ready for stakeholders

### After Phase 3
- ✅ Database migration successful
- ✅ 6 new tables created
- ✅ Existing data untouched
- ✅ Prisma types generated

### After Phase 4
- ✅ All API endpoints working
- ✅ Real data flowing through system
- ✅ CRUD operations verified
- ✅ Email sending working
- ✅ Audit trail recording

### After Phase 5
- ✅ Advanced features implemented
- ✅ System optimized
- ✅ Fully documented
- ✅ Ready for production
- ✅ Team trained

---

## APPROVAL & SIGN-OFF

**Document Prepared By:** [To be filled]  
**Date Prepared:** January 11, 2026  
**Approved By:** [To be filled]  
**Approval Date:** [To be filled]  

### Project Start Date: [To be filled]
### Expected Completion: [To be filled]

---

## APPENDIX: QUICK REFERENCE

### File Structure Summary

```
src/
├── lib/
│   ├── types/
│   │   └── invoice.ts (NEW)
│   ├── mocks/
│   │   ├── invoiceMocks.ts (NEW)
│   │   └── useMockInvoices.ts (NEW)
│   ├── constants/
│   │   └── accounting.ts (NEW)
│   ├── helpers/
│   │   └── invoiceHelpers.ts (NEW)
│   └── email.ts (UPDATED)
│
├── components/
│   └── AccountingModals/ (NEW)
│       ├── InvoiceFormModal.tsx
│       ├── GenerateInvoicesModal.tsx
│       ├── SendEmailsModal.tsx
│       ├── RecordPaymentModal.tsx
│       └── RecurringInvoiceFormModal.tsx
│
├── app/
│   ├── api/
│   │   ├── invoices/ (NEW)
│   │   ├── recurring-invoices/ (NEW)
│   │   ├── customer-pricing-config/ (NEW)
│   │   └── accounting/ (NEW)
│   │
│   └── (manage)/
│       └── accounting/ (NEW)
│           ├── page.tsx
│           ├── invoices/
│           ├── recurring/
│           └── statements/

prisma/
└── schema.prisma (UPDATED)
    └── Add 6 new models
```

### API Endpoints Summary

```
GET    /api/invoices
POST   /api/invoices
GET    /api/invoices/[id]
PUT    /api/invoices/[id]
DELETE /api/invoices/[id]
POST   /api/invoices/generate
POST   /api/invoices/send
POST   /api/invoices/[id]/pay

GET    /api/recurring-invoices
POST   /api/recurring-invoices
GET    /api/recurring-invoices/[id]
PUT    /api/recurring-invoices/[id]
DELETE /api/recurring-invoices/[id]

GET    /api/customer-pricing-config
POST   /api/customer-pricing-config
GET    /api/customer-pricing-config/[userId]
PUT    /api/customer-pricing-config/[userId]

GET    /api/accounting/dashboard
GET    /api/accounting/statements
GET    /api/accounting/statements/[customerId]
```

### Key Decisions Locked In

| Decision | Value | Rationale |
|----------|-------|-----------|
| Invoice Number Format | YYYYMMDDSR | User requirement |
| Invoice Generation | Manual + Auto | User requirement |
| Email Sending | Manual trigger | User requirement |
| Currency | USD | User requirement |
| Payment Terms | 30 days | User requirement |
| Data Import | CSV | User requirement |
| Timezone | Admin's timezone | User requirement |
| Recurring Frequency | Monthly | User requirement |
| Month-end Handling | Move to last day | User requirement |

---

## DOCUMENT CHANGE HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 11, 2026 | Initial comprehensive plan |

---

## CONTACT & SUPPORT

**Questions about this plan?**
- Review Phase planning section
- Check Data Safety Summary
- Refer to Rollback Plan

**Issues during implementation?**
- Rollback using `npx prisma migrate reset`
- Restore from backup if needed
- All existing data remains safe

---

**END OF DOCUMENT**

---

*This document is confidential and intended for BitFactory development team only.*

*Last Updated: January 11, 2026*
