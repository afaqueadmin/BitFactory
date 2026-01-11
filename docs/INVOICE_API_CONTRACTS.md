# Accounting Module API Contracts

**Phase**: 1 - Type Definitions & Mock Setup  
**Status**: Complete (Types & Contracts Defined)  
**Last Updated**: January 11, 2026

## Overview

This document defines the API contracts for all accounting module endpoints. These contracts serve as:

1. **Development Contract**: UI developers use these to understand the expected request/response shapes
2. **Mock Data Blueprint**: Mock generators follow these contracts exactly
3. **Backend Specification**: API developers implement exactly to these contracts
4. **Type Safety**: TypeScript types in `src/lib/types/invoice.ts` enforce these contracts

## API Structure

- **Base Path**: `/api/accounting`
- **Authentication**: All endpoints require valid JWT token
- **Authorization**: Some endpoints require ADMIN or SUPER_ADMIN role
- **Content-Type**: Application/JSON
- **Error Handling**: All errors follow standard `ApiErrorResponse` format

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { /* ... */ },
  "timestamp": "2026-01-11T10:30:00Z"
}
```

### Paginated Success Response

```json
{
  "success": true,
  "data": [ /* array of items */ ],
  "pagination": {
    "total": 100,
    "page": 1,
    "pageSize": 10,
    "totalPages": 10
  },
  "timestamp": "2026-01-11T10:30:00Z"
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message describing what went wrong",
  "code": "ERROR_CODE",
  "timestamp": "2026-01-11T10:30:00Z"
}
```

---

## Invoice Endpoints

### 1. GET /api/accounting/invoices

**Description**: List all invoices with optional filtering and pagination

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN (can view all customers' invoices)

**Query Parameters**:
```
status?     : InvoiceStatus  (DRAFT|ISSUED|PAID|OVERDUE|CANCELLED)
userId?     : string         (customer ID - filter by customer)
startDate?  : ISO string     (filter invoices >= date)
endDate?    : ISO string     (filter invoices <= date)
page?       : number         (default: 1)
pageSize?   : number         (default: 10, max: 100)
sortBy?     : string         (field name: invoiceNumber, createdAt, totalAmount, etc)
sortDir?    : 'asc'|'desc'   (default: 'desc')
```

**Response**:
```typescript
PaginatedResponse<InvoiceDisplayModel>
```

**Example Request**:
```
GET /api/accounting/invoices?status=OVERDUE&page=1&pageSize=10
```

**Example Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "invoiceNumber": "20260111001",
      "userId": "customer-uuid",
      "customer": {
        "name": "Acme Corp",
        "email": "billing@acme.com",
        "company": "Acme Corp"
      },
      "totalMiners": 50,
      "unitPrice": 150.00,
      "totalAmount": 7500.00,
      "status": "OVERDUE",
      "invoiceGeneratedDate": "2025-12-15T10:00:00Z",
      "issuedDate": "2025-12-15T10:30:00Z",
      "dueDate": "2026-01-15T00:00:00Z",
      "paidDate": null,
      "createdBy": "admin-uuid",
      "createdAt": "2025-12-15T10:00:00Z",
      "updatedBy": null,
      "updatedAt": "2025-12-15T10:00:00Z",
      "daysUntilDue": -27,
      "daysOverdue": 27,
      "isPaid": false,
      "isOverdue": true
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "pageSize": 10,
    "totalPages": 5
  },
  "timestamp": "2026-01-11T10:30:00Z"
}
```

---

### 2. GET /api/accounting/invoices/:id

**Description**: Get single invoice details

**Authentication**: Required  
**Authorization**: ADMIN/SUPER_ADMIN, or the customer who owns the invoice

**Path Parameters**:
```
id : string (Invoice UUID)
```

**Response**:
```typescript
ApiSuccessResponse<InvoiceDisplayModel>
```

**Example Request**:
```
GET /api/accounting/invoices/uuid-here
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceNumber": "20260111001",
    "userId": "customer-uuid",
    "customer": {
      "name": "Acme Corp",
      "email": "billing@acme.com"
    },
    "totalMiners": 50,
    "unitPrice": 150.00,
    "totalAmount": 7500.00,
    "status": "ISSUED",
    "invoiceGeneratedDate": "2025-12-15T10:00:00Z",
    "issuedDate": "2025-12-15T10:30:00Z",
    "dueDate": "2026-01-15T00:00:00Z",
    "paidDate": null,
    "createdBy": "admin-uuid",
    "createdAt": "2025-12-15T10:00:00Z",
    "updatedBy": null,
    "updatedAt": "2025-12-15T10:00:00Z"
  },
  "timestamp": "2026-01-11T10:30:00Z"
}
```

---

### 3. POST /api/accounting/invoices

**Description**: Create a new invoice (DRAFT status)

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN only

**Request Body**:
```typescript
CreateInvoiceRequest {
  userId: string                 // Customer UUID
  totalMiners: number           // 1-10000
  unitPrice: number             // 0.01-10000.00
  dueDate: string              // ISO date string (must be >= tomorrow)
}
```

**Response**:
```typescript
ApiSuccessResponse<Invoice>
```

**Example Request**:
```json
POST /api/accounting/invoices
{
  "userId": "customer-uuid",
  "totalMiners": 50,
  "unitPrice": 150.00,
  "dueDate": "2026-02-14T00:00:00Z"
}
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "id": "new-uuid",
    "invoiceNumber": "20260111001",
    "userId": "customer-uuid",
    "totalMiners": 50,
    "unitPrice": 150.00,
    "totalAmount": 7500.00,
    "status": "DRAFT",
    "invoiceGeneratedDate": "2026-01-11T10:30:00Z",
    "issuedDate": null,
    "dueDate": "2026-02-14T00:00:00Z",
    "paidDate": null,
    "createdBy": "admin-uuid",
    "createdAt": "2026-01-11T10:30:00Z",
    "updatedBy": null,
    "updatedAt": "2026-01-11T10:30:00Z"
  },
  "timestamp": "2026-01-11T10:30:00Z"
}
```

---

### 4. PATCH /api/accounting/invoices/:id

**Description**: Update invoice (only DRAFT invoices)

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN only

**Path Parameters**:
```
id : string (Invoice UUID)
```

**Request Body**:
```typescript
UpdateInvoiceRequest {
  totalMiners?: number          // 1-10000
  unitPrice?: number            // 0.01-10000.00
  dueDate?: string             // ISO date string
}
```

**Response**:
```typescript
ApiSuccessResponse<Invoice>
```

**Example Request**:
```json
PATCH /api/accounting/invoices/uuid-here
{
  "totalMiners": 75,
  "unitPrice": 160.00
}
```

**Validation Rules**:
- Cannot update ISSUED, PAID, OVERDUE, or CANCELLED invoices (returns 400 "CANNOT_EDIT_PAID")
- totalMiners must be 1-10000
- unitPrice must be 0.01-10000.00
- dueDate must be at least 1 day from today

---

### 5. POST /api/accounting/invoices/:id/issue

**Description**: Change invoice from DRAFT to ISSUED status

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN only

**Path Parameters**:
```
id : string (Invoice UUID)
```

**Request Body**: (empty)

**Response**:
```typescript
ApiSuccessResponse<Invoice>
```

**Example Request**:
```
POST /api/accounting/invoices/uuid-here/issue
{}
```

**Side Effects**:
- Sets status to ISSUED
- Sets issuedDate to current timestamp
- Triggers AuditLog: INVOICE_SENT
- Does NOT send email (manual step)

---

### 6. POST /api/accounting/invoices/:id/cancel

**Description**: Cancel an invoice (any status except PAID)

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN only

**Path Parameters**:
```
id : string (Invoice UUID)
```

**Request Body**:
```json
{
  "reason"?: "string"           // Optional cancellation reason
}
```

**Response**:
```typescript
ApiSuccessResponse<Invoice>
```

**Side Effects**:
- Sets status to CANCELLED
- Logs to AuditLog: INVOICE_CANCELLED
- Email NOT sent automatically

---

### 7. DELETE /api/accounting/invoices/:id

**Description**: Delete an invoice (only DRAFT status)

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN only

**Path Parameters**:
```
id : string (Invoice UUID)
```

**Response**:
```typescript
ApiSuccessResponse<{ message: string }>
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "message": "Invoice deleted successfully"
  },
  "timestamp": "2026-01-11T10:30:00Z"
}
```

**Validation**:
- Only DRAFT invoices can be deleted
- ISSUED invoices must be cancelled first
- Returns 400 "CANNOT_DELETE_ISSUED" if not DRAFT

---

### 8. POST /api/accounting/invoices/:id/payments

**Description**: Record a payment for an invoice

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN only

**Path Parameters**:
```
id : string (Invoice UUID)
```

**Request Body**:
```typescript
RecordPaymentRequest {
  amountPaid: number            // USD amount (0.01 - invoice total)
}
```

**Response**:
```typescript
ApiSuccessResponse<Invoice & { payments: InvoicePayment[] }>
```

**Example Request**:
```json
POST /api/accounting/invoices/uuid-here/payments
{
  "amountPaid": 7500.00
}
```

**Side Effects**:
- Creates InvoicePayment record
- Links to CostPayment table (existing)
- If amountPaid >= totalAmount:
  - Sets status to PAID
  - Sets paidDate to current timestamp
  - Logs PAYMENT_RECEIVED
- If amountPaid < totalAmount:
  - Keeps status as ISSUED/OVERDUE
  - Logs PAYMENT_ADDED
- Triggers AuditLog entry

---

## Recurring Invoice Endpoints

### 9. GET /api/accounting/recurring-invoices

**Description**: List all recurring invoice templates

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN

**Query Parameters**:
```
isActive?   : boolean          (true|false)
userId?     : string           (filter by customer)
page?       : number           (default: 1)
pageSize?   : number           (default: 10)
```

**Response**:
```typescript
PaginatedResponse<RecurringInvoice>
```

---

### 10. POST /api/accounting/recurring-invoices

**Description**: Create recurring invoice template

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN only

**Request Body**:
```typescript
CreateRecurringInvoiceRequest {
  userId: string                // Customer UUID
  dayOfMonth: number            // 1-31
  unitPrice?: number            // Optional custom price (uses default if not set)
  startDate: string            // ISO date string
  endDate?: string             // ISO date string (optional, null = ongoing)
}
```

**Response**:
```typescript
ApiSuccessResponse<RecurringInvoice>
```

---

### 11. PATCH /api/accounting/recurring-invoices/:id

**Description**: Update recurring invoice template

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN only

**Request Body**:
```typescript
{
  dayOfMonth?: number
  unitPrice?: number
  isActive?: boolean
  endDate?: string
}
```

---

### 12. DELETE /api/accounting/recurring-invoices/:id

**Description**: Delete recurring invoice template

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN only

**Response**:
```typescript
ApiSuccessResponse<{ message: string }>
```

---

## Customer Pricing Endpoints

### 13. GET /api/accounting/pricing/:customerId

**Description**: Get pricing config for a customer

**Authentication**: Required  
**Authorization**: ADMIN/SUPER_ADMIN, or the customer themselves

**Path Parameters**:
```
customerId : string (Customer UUID)
```

**Response**:
```typescript
ApiSuccessResponse<CustomerPricingConfig>
```

---

### 14. PATCH /api/accounting/pricing/:customerId

**Description**: Update customer unit price

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN only

**Path Parameters**:
```
customerId : string (Customer UUID)
```

**Request Body**:
```json
{
  "defaultUnitPrice": 175.50,
  "effectiveFrom": "2026-02-01T00:00:00Z",
  "effectiveTo": null
}
```

**Response**:
```typescript
ApiSuccessResponse<CustomerPricingConfig>
```

---

## Dashboard Endpoints

### 15. GET /api/accounting/dashboard

**Description**: Get accounting dashboard summary

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN

**Query Parameters**:
```
timeRange?: 'week' | 'month' | 'quarter' | 'year'  (default: 'month')
```

**Response**:
```typescript
ApiSuccessResponse<DashboardResponse>
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "totalInvoices": 127,
    "unpaidInvoices": 23,
    "overdueInvoices": 5,
    "totalOutstanding": 45000.00,
    "upcomingInvoices": [
      {
        "invoiceId": "uuid",
        "invoiceNumber": "20260115001",
        "customerId": "customer-uuid",
        "customerName": "Acme Corp",
        "amount": 7500.00,
        "dueDate": "2026-01-20T00:00:00Z",
        "daysUntilDue": 9
      }
    ],
    "recentInvoices": [
      {
        "invoiceId": "uuid",
        "invoiceNumber": "20260111001",
        "customerId": "customer-uuid",
        "customerName": "Acme Corp",
        "amount": 7500.00,
        "issuedDate": "2026-01-11T10:30:00Z",
        "status": "ISSUED"
      }
    ],
    "recurringInvoices": {
      "total": 12,
      "active": 10,
      "inactive": 2
    }
  },
  "timestamp": "2026-01-11T10:30:00Z"
}
```

---

## Statement Endpoints

### 16. GET /api/accounting/statements/:customerId

**Description**: Generate customer statement (invoices & payments)

**Authentication**: Required  
**Authorization**: ADMIN/SUPER_ADMIN, or the customer themselves

**Path Parameters**:
```
customerId : string (Customer UUID)
```

**Query Parameters**:
```
startDate? : ISO string   (filter invoices >= date)
endDate?   : ISO string   (filter invoices <= date)
format?    : 'json'|'pdf' (default: 'json')
```

**Response**:
```typescript
ApiSuccessResponse<CustomerStatementResponse>
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "customer-uuid",
      "name": "Acme Corp",
      "email": "billing@acme.com",
      "company": "Acme Corp"
    },
    "invoices": [
      {
        "id": "invoice-uuid",
        "invoiceNumber": "20260111001",
        "issuedDate": "2026-01-11T00:00:00Z",
        "dueDate": "2026-02-11T00:00:00Z",
        "totalAmount": 7500.00,
        "paidAmount": 0.00,
        "status": "ISSUED",
        "agingDays": 0
      }
    ],
    "payments": [
      {
        "id": "payment-uuid",
        "amount": 5000.00,
        "date": "2025-12-20T00:00:00Z",
        "invoiceId": "invoice-uuid",
        "type": "ACH"
      }
    ],
    "summary": {
      "totalInvoiced": 22500.00,
      "totalPaid": 15000.00,
      "totalOutstanding": 7500.00,
      "currentBalance": 7500.00,
      "lastPaymentDate": "2025-12-20T00:00:00Z",
      "nextInvoiceDate": "2026-02-15T00:00:00Z"
    }
  },
  "timestamp": "2026-01-11T10:30:00Z"
}
```

---

## Email Endpoints

### 17. POST /api/accounting/invoices/:id/send-email

**Description**: Send invoice notification email to customer

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN only

**Path Parameters**:
```
id : string (Invoice UUID)
```

**Request Body**:
```json
{
  "emailType": "INVOICE_ISSUED",
  "overrideEmail"?: "customer@example.com"
}
```

**Response**:
```typescript
ApiSuccessResponse<InvoiceNotification>
```

**Side Effects**:
- Creates InvoiceNotification record
- Sends email via Nodemailer
- If failed: sets status to FAILED, schedules retry
- Logs to AuditLog

---

### 18. POST /api/accounting/send-bulk-emails

**Description**: Send notifications to multiple customers

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN only

**Request Body**:
```json
{
  "invoiceIds": ["uuid1", "uuid2", "uuid3"],
  "emailType": "INVOICE_ISSUED"
}
```

**Response**:
```typescript
ApiSuccessResponse<{
  sent: number,
  failed: number,
  errors: Array<{ invoiceId: string, error: string }>
}>
```

---

## Audit Log Endpoints

### 19. GET /api/accounting/audit-logs

**Description**: Get audit log entries (read-only)

**Authentication**: Required  
**Authorization**: ADMIN or SUPER_ADMIN

**Query Parameters**:
```
action?     : AuditAction    (filter by action type)
entityType? : string         (Invoice, RecurringInvoice, etc)
entityId?   : string         (specific entity)
userId?     : string         (who performed action)
startDate?  : ISO string
endDate?    : ISO string
page?       : number         (default: 1)
pageSize?   : number         (default: 10)
```

**Response**:
```typescript
PaginatedResponse<AuditLog>
```

---

## Error Codes Reference

| Code | HTTP | Meaning |
|------|------|---------|
| INVALID_REQUEST | 400 | Request validation failed |
| INVALID_STATUS_TRANSITION | 400 | Cannot perform action in current status |
| CANNOT_EDIT_PAID | 400 | Cannot edit a paid invoice |
| CANNOT_DELETE_ISSUED | 400 | Cannot delete issued invoice |
| INSUFFICIENT_PERMISSIONS | 403 | User lacks required role |
| INVOICE_NOT_FOUND | 404 | Invoice does not exist |
| CUSTOMER_NOT_FOUND | 404 | Customer does not exist |
| CONFLICT | 409 | Duplicate invoice number or conflict |
| INTERNAL_ERROR | 500 | Server error |

---

## Authentication & Authorization

### Headers Required

All endpoints require:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Role-Based Access

- **PUBLIC**: None (all endpoints require auth)
- **CLIENT**: Can view their own invoices and statements
- **ADMIN**: Can manage all invoices, send emails, view all customers
- **SUPER_ADMIN**: Full access, can manage users and settings

---

## Rate Limiting (Phase 4+)

To be implemented in Phase 4:
- API: 100 requests per minute per user
- Bulk operations: 10 requests per minute per user
- Email sends: 50 per minute (global)

---

## Summary Table

| # | Endpoint | Method | Purpose | Role |
|---|----------|--------|---------|------|
| 1 | /invoices | GET | List invoices | ADMIN+ |
| 2 | /invoices/:id | GET | Get invoice | ADMIN+ / OWNER |
| 3 | /invoices | POST | Create invoice | ADMIN+ |
| 4 | /invoices/:id | PATCH | Update invoice | ADMIN+ |
| 5 | /invoices/:id/issue | POST | Issue invoice | ADMIN+ |
| 6 | /invoices/:id/cancel | POST | Cancel invoice | ADMIN+ |
| 7 | /invoices/:id | DELETE | Delete invoice | ADMIN+ |
| 8 | /invoices/:id/payments | POST | Record payment | ADMIN+ |
| 9 | /recurring-invoices | GET | List templates | ADMIN+ |
| 10 | /recurring-invoices | POST | Create template | ADMIN+ |
| 11 | /recurring-invoices/:id | PATCH | Update template | ADMIN+ |
| 12 | /recurring-invoices/:id | DELETE | Delete template | ADMIN+ |
| 13 | /pricing/:customerId | GET | Get pricing | ADMIN+ / OWNER |
| 14 | /pricing/:customerId | PATCH | Update pricing | ADMIN+ |
| 15 | /dashboard | GET | Dashboard stats | ADMIN+ |
| 16 | /statements/:customerId | GET | Customer statement | ADMIN+ / OWNER |
| 17 | /invoices/:id/send-email | POST | Send email | ADMIN+ |
| 18 | /send-bulk-emails | POST | Bulk emails | ADMIN+ |
| 19 | /audit-logs | GET | Audit logs | ADMIN+ |

---

**Document Version**: 1.0  
**Last Updated**: January 11, 2026  
**Phase**: 1 Complete - Types & Contracts Defined
