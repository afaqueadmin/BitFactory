# Invoice Status Change: Draft → Issued

## Overview
Admins and Super Admins can now change an invoice status from **DRAFT** to **ISSUED** directly from the invoice detail page.

## How to Change Invoice Status

### For Admin/Super Admin Users:

1. **Navigate to Invoice Detail Page**
   - Go to Accounting → Invoices
   - Click on any DRAFT invoice

2. **Issue the Invoice**
   - Look for the green **"Issue Invoice"** button in the top right (appears only for DRAFT invoices)
   - Click the button
   - A confirmation dialog appears explaining what will happen
   - Click **"Issue Invoice"** to confirm

3. **What Happens When Status Changes to ISSUED:**
   - ✅ Invoice status changes from `DRAFT` → `ISSUED`
   - ✅ `issuedDate` is automatically set to **today's date** (if not already set)
   - ✅ Invoice becomes available for payment recording
   - ✅ All changes are logged in the audit trail
   - ✅ Edit button becomes disabled (only DRAFT invoices can be edited)

## API Details

### Endpoint
```
PUT /api/accounting/invoices/{id}
```

### Request Body
```json
{
  "status": "ISSUED"
}
```

### Response
Returns the updated invoice object with all fields.

### Authorization
- Only `ADMIN` and `SUPER_ADMIN` roles can change invoice status
- Returns 403 Forbidden for other roles

### What the Backend Does When Changing to ISSUED:

1. **Validates Request**
   - Checks user is authenticated
   - Checks user has ADMIN or SUPER_ADMIN role
   - Checks invoice exists

2. **Auto-Sets issuedDate**
   - If status is being changed to `ISSUED` and `issuedDate` is not already set
   - The system automatically sets it to the current date/time

3. **Updates Database**
   - Changes invoice status
   - Sets issuedDate (if applicable)
   - Sets updatedBy to the admin's user ID

4. **Creates Audit Log**
   - Records the action as `INVOICE_UPDATED`
   - Includes before/after values in the changes object
   - Tracks which admin made the change and when

## Valid Invoice Statuses

- **DRAFT** - Initial state, can be edited by admins, cannot record payments
- **ISSUED** - Ready for payment, edit disabled, can record payments
- **PAID** - All payment received, cannot record additional payments
- **OVERDUE** - Payment not received by due date
- **CANCELLED** - Invoice cancelled

## UI Button Behavior

### "Issue Invoice" Button
- **Visible:** Only when user is ADMIN/SUPER_ADMIN AND invoice status is DRAFT
- **Hidden:** For CLIENT role or non-DRAFT invoices
- **Color:** Green (success) with CheckCircle icon
- **Action:** Opens confirmation dialog before processing

### "Edit" Button
- **Enabled:** Only for DRAFT invoices
- **Disabled:** For ISSUED, PAID, OVERDUE, and CANCELLED invoices

### "Record Payment" Button
- **Enabled:** For ISSUED and OVERDUE invoices
- **Disabled:** For DRAFT, PAID, and CANCELLED invoices

## Code Changes Made

### 1. New Hook: `useChangeInvoiceStatus()`
**File:** `src/lib/hooks/useInvoices.ts`

```typescript
export function useChangeInvoiceStatus() {
  const changeStatus = async (
    invoiceId: string,
    status: "ISSUED" | "PAID" | "CANCELLED" | "OVERDUE"
  ) => {
    // Makes PUT request to /api/accounting/invoices/{id}
    // Returns updated invoice or throws error
  };
}
```

### 2. Enhanced Invoice Detail Page
**File:** `src/app/(manage)/accounting/invoices/[id]/page.tsx`

- Added imports: `useChangeInvoiceStatus`, `useUser`, `Dialog` components
- Added state for dialog management and error handling
- Added "Issue Invoice" button (green, CheckCircle icon)
- Added confirmation dialog explaining the consequences
- Automatically redirects after successful status change

### 3. Enhanced API Endpoint
**File:** `src/app/api/accounting/invoices/[id]/route.ts`

- Enhanced PUT handler with auto-setting `issuedDate`
- When status changes to `ISSUED`:
  - If `issuedDate` is not already set, it gets set to current date
  - Creates detailed audit log entry

## Example Workflow

```
Admin Views Invoice: INV-2026-0001
├─ Status: DRAFT
├─ Can Edit: ✓ Yes (Edit button enabled)
├─ Can Issue: ✓ Yes (Issue Invoice button visible)
├─ Can Record Payment: ✗ No
└─ Clicks "Issue Invoice"
   ├─ Dialog appears
   ├─ Admin confirms
   ├─ PUT request sent
   ├─ Backend updates:
   │  ├─ status: DRAFT → ISSUED
   │  └─ issuedDate: null → 2026-01-15
   └─ Redirects to invoice detail page
      └─ New Status: ISSUED
         ├─ Can Edit: ✗ No
         ├─ Can Issue: ✗ No
         ├─ Can Record Payment: ✓ Yes
         └─ Shows "Record Payment" button
```

## Security

- ✅ Only ADMIN/SUPER_ADMIN users can change status
- ✅ All status changes are logged in audit trail
- ✅ User ID is recorded for each status change
- ✅ Client-side UI respects role restrictions
- ✅ Server-side API enforces role restrictions

## Testing Checklist

- [ ] As SUPER_ADMIN, issue a DRAFT invoice - verify status changes and issuedDate is set
- [ ] As ADMIN, issue a DRAFT invoice - verify it works the same as SUPER_ADMIN
- [ ] As CLIENT, verify "Issue Invoice" button is not visible
- [ ] Issue an invoice, then try to edit it - verify Edit button is disabled
- [ ] After issuing, verify "Record Payment" button becomes enabled
- [ ] Check audit logs - verify status change is recorded
- [ ] Verify the issuedDate matches the date the invoice was issued
