# PHASE 2 QUICK START GUIDE

**Phase**: 2 - UI with Mock Data  
**Estimated Duration**: 2.5 hours  
**Status**: Ready to begin  
**Date Started**: [Waiting for approval]

---

## Overview

Phase 2 involves building 10+ React pages and components using the mock data generated in Phase 1. Everything is visible and interactive in the browser. **No database changes. No API implementations. 100% UI-focused.**

---

## File Structure to Create

```
src/
├── app/
│   └── (manage)/
│       └── accounting/
│           ├── page.tsx                    # Dashboard
│           ├── invoices/
│           │   ├── page.tsx               # Invoice list
│           │   ├── [id]/
│           │   │   └── page.tsx           # Invoice detail
│           │   └── create/
│           │       └── page.tsx           # Create invoice
│           ├── recurring/
│           │   ├── page.tsx               # Recurring list
│           │   └── create/
│           │       └── page.tsx           # Create recurring
│           ├── statements/
│           │   └── [customerId]/
│           │       └── page.tsx           # Customer statement
│           └── pricing/
│               └── page.tsx               # Pricing config
│
└── components/
    └── accounting/
        ├── dashboard/
        │   ├── StatsCard.tsx             # Summary stat widgets
        │   ├── UpcomingInvoices.tsx      # Table of upcoming
        │   ├── RecentInvoices.tsx        # Recent activity
        │   └── RecurringOverview.tsx     # Recurring status
        ├── invoices/
        │   ├── InvoiceList.tsx           # Paginated list
        │   ├── InvoiceDetail.tsx         # Full details
        │   ├── InvoiceForm.tsx           # Create/edit form
        │   └── PaymentDialog.tsx         # Record payment modal
        ├── recurring/
        │   ├── RecurringList.tsx         # List templates
        │   └── RecurringForm.tsx         # Create/edit form
        ├── statements/
        │   ├── CustomerStatement.tsx     # Full statement
        │   ├── InvoiceTable.tsx          # Aging analysis
        │   ├── PaymentHistory.tsx        # Payments table
        │   └── SummaryBox.tsx            # Balance summary
        ├── pricing/
        │   ├── PricingTable.tsx          # Customer pricing list
        │   └── PricingForm.tsx           # Edit pricing
        └── common/
            ├── StatusBadge.tsx           # Invoice status display
            ├── CurrencyDisplay.tsx       # Format currency
            └── DateDisplay.tsx           # Format dates
```

---

## How to Use Mock Data

### Example: Create Invoice List Page

```typescript
// src/app/(manage)/accounting/invoices/page.tsx
'use client';

import { useMockInvoicesPage } from '@/lib/mocks/useMockInvoices';
import { InvoiceList } from '@/components/accounting/invoices/InvoiceList';
import { Box, CircularProgress, Alert } from '@mui/material';

export default function InvoicesPage() {
  const [page, setPage] = useState(1);
  const { invoices, total, pageSize, loading, error, goToPage } = 
    useMockInvoicesPage(page, 10);

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box>
      <InvoiceList 
        invoices={invoices}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={goToPage}
      />
    </Box>
  );
}
```

### Example: Display Invoice Detail

```typescript
// src/app/(manage)/accounting/invoices/[id]/page.tsx
'use client';

import { useMockInvoiceDetail } from '@/lib/mocks/useMockInvoices';
import { useParams } from 'next/navigation';

export default function InvoiceDetailPage() {
  const params = useParams();
  const { invoice, loading, error } = useMockInvoiceDetail(params.id as string);

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!invoice) return <Alert severity="warning">Invoice not found</Alert>;

  return (
    <InvoiceDetail invoice={invoice} />
  );
}
```

### Example: Customer Statement

```typescript
// src/app/(manage)/accounting/statements/[customerId]/page.tsx
'use client';

import { useMockCustomerInvoices } from '@/lib/mocks/useMockInvoices';

export default function StatementPage() {
  const params = useParams();
  const { invoices, summary, loading } = 
    useMockCustomerInvoices(params.customerId as string);

  return (
    <CustomerStatement 
      invoices={invoices}
      summary={summary}
      loading={loading}
    />
  );
}
```

---

## Available Mock Hooks

| Hook | Returns | Use Case |
|------|---------|----------|
| `useMockInvoices()` | Complete dataset + dashboard | Dashboard page |
| `useMockInvoicesPage(page, size)` | Paginated invoices | Invoice list with pagination |
| `useMockInvoiceDetail(id)` | Single invoice | Detail page |
| `useMockCustomerInvoices(customerId)` | Customer invoices + summary | Customer statement |

---

## Constants & Enums to Import

```typescript
// Status labels and colors
import { 
  INVOICE_STATUS_LABELS,      // { DRAFT: "Draft", ISSUED: "Issued", ... }
  INVOICE_STATUS_COLORS,      // { DRAFT: "default", ISSUED: "info", ... }
  INVOICE_STATUS_HEX_COLORS,  // { DRAFT: "#9CA3AF", ISSUED: "#3B82F6", ... }
  CURRENCY_FORMAT_OPTIONS,
  INVOICE_NUMBER_FORMAT,
  DEFAULT_DUE_DAYS,
} from '@/lib/constants/accounting';

// Type definitions
import {
  Invoice,
  InvoiceStatus,
  DashboardResponse,
  CustomerStatementResponse,
  InvoiceDisplayModel,
} from '@/lib/types/invoice';
```

---

## Component Examples

### Status Badge

```typescript
import { Chip } from '@mui/material';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/lib/constants/accounting';

<Chip 
  label={INVOICE_STATUS_LABELS[invoice.status]}
  color={INVOICE_STATUS_COLORS[invoice.status]}
/>
```

### Currency Display

```typescript
const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

<Typography>{formatter.format(invoice.totalAmount)}</Typography>
```

### Aging Analysis

```typescript
import { getAgingBucket } from '@/lib/constants/accounting';

const bucket = getAgingBucket(daysOverdue);
// Returns: 'CURRENT', 'THIRTY_PLUS', 'SIXTY_PLUS', or 'NINETY_PLUS'
```

---

## Form Handling (Mock)

For Phase 2, forms don't need to submit anywhere. Just collect values and display confirmation:

```typescript
const [formData, setFormData] = useState({
  userId: '',
  totalMiners: 50,
  unitPrice: 150,
  dueDate: new Date(),
});

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  
  // In Phase 2: Just show a toast/dialog
  toast.success('Invoice created successfully!');
  
  // In Phase 4: Replace with API call
  // const response = await fetch('/api/accounting/invoices', { ... })
};
```

---

## Navigation Structure

```
/accounting
├── /                          Dashboard
├── /invoices
│   ├── /                      List (paginated)
│   ├── /[id]                  Detail view
│   ├── /create                Create form
│   └── /[id]/edit             Edit form
├── /recurring
│   ├── /                      List templates
│   └── /create                Create template
├── /statements
│   └── /[customerId]          Customer statement
└── /pricing
    └── /                      Pricing configuration
```

---

## Testing Phase 2

After each component is built:

1. **Visual Check**: Does the UI look right?
2. **Data Display**: Are mock values showing?
3. **Pagination**: Does it work (if applicable)?
4. **Navigation**: Can you navigate between pages?
5. **Responsive**: Works on desktop and mobile?

No database needed. No API calls. Just mock data flowing through components.

---

## Phase 2 Deliverables

After Phase 2 completion:

✅ Complete UI visible in browser  
✅ All pages and components built  
✅ Mock data flowing through the system  
✅ Navigation working between sections  
✅ Forms collecting input (not submitting)  
✅ Dashboard showing statistics  
✅ Invoice list with pagination  
✅ Detail pages with full information  
✅ Customer statements working  
✅ Demo-ready (can show client)  

**Database**: Completely untouched  
**Existing Data**: 100% safe  

---

## When to Move to Phase 3

Phase 2 is complete when:
- [ ] All 10+ pages are built
- [ ] Mock data displays correctly everywhere
- [ ] Navigation works between all pages
- [ ] Forms are functional (collecting data)
- [ ] Dashboard shows stats
- [ ] Pagination works
- [ ] Responsive design verified
- [ ] Ready for team review

Then move to Phase 3 (Database Schema) with confidence that UI is exactly what we want.

---

## Phase 2 Timeline

| Task | Time | Status |
|------|------|--------|
| Dashboard page | 20 min | Not started |
| Invoice list & detail | 45 min | Not started |
| Invoice create/edit forms | 30 min | Not started |
| Recurring invoices pages | 20 min | Not started |
| Customer statements | 25 min | Not started |
| Pricing configuration | 15 min | Not started |
| Navigation & routing | 15 min | Not started |
| Responsive design pass | 15 min | Not started |
| Testing & polish | 15 min | Not started |

**Total**: ~2.5 hours

---

## Tips for Phase 2

1. **Start with Dashboard** - High visibility, shows overall system
2. **Build List First** - Base for all other pages
3. **Use MUI Components** - Already in project, consistent styling
4. **Mock All Interactions** - toast.success(), dialogs, etc
5. **Keep API Contracts Handy** - Reference for field names
6. **Test Pagination** - useMockInvoicesPage handles this
7. **Format Currencies** - Use Intl.NumberFormat consistently
8. **Status Badges** - Use color constants for consistency

---

## Ready to Start?

When Phase 2 begins:

1. Check out this guide
2. Reference the API contracts in `docs/INVOICE_API_CONTRACTS.md`
3. Use types from `src/lib/types/invoice.ts`
4. Import hooks from `src/lib/mocks/useMockInvoices.ts`
5. Use constants from `src/lib/constants/accounting.ts`
6. Build components following the file structure
7. Commit regularly to git

**All tools are in place. Phase 2 is ready to go!**

---

**Phase 1 Status**: COMPLETE ✅  
**Phase 2 Status**: READY TO BEGIN  
**Database Changes**: NONE  
**Existing Data Risk**: ZERO

