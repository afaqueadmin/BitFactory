import { InvoiceStatus, Prisma } from "@prisma/client";

/**
 * Shared query-parsing for the invoice list, used by both the JSON route
 * (paginated) and the admin export route (unpaginated) so the filter/sort
 * logic can never drift between the two.
 */

/**
 * `isAdmin`: whether the caller is ADMIN/SUPER_ADMIN. A customer filter hides
 * DRAFT invoices (customers never see drafts); admin pages opt out with
 * `includeDrafts=true`, which is ignored for everyone else.
 */
export function buildInvoiceListWhere(
  searchParams: URLSearchParams,
  isAdmin: boolean,
): Prisma.InvoiceWhereInput {
  const customerId = searchParams.get("customerId");
  const status = searchParams.get("status");
  const invoiceType = searchParams.get("invoiceType");
  const includeDrafts = isAdmin && searchParams.get("includeDrafts") === "true";

  const where: Record<string, unknown> = {};
  if (customerId) {
    where.userId = customerId;
    if (!includeDrafts) {
      where.status = {
        not: InvoiceStatus.DRAFT,
      };
    }
  }
  if (status) {
    where.status = status as InvoiceStatus;
  }
  if (invoiceType) {
    where.invoiceType = invoiceType;
  }
  // Note: CANCELLED invoices are now included in the dashboard table
  // They won't affect calculations (amount, outstanding, etc) as they're already excluded from those queries

  return where as Prisma.InvoiceWhereInput;
}

export function parseInvoiceListSort(searchParams: URLSearchParams): {
  sortBy: string | null;
  sortDirection: Prisma.SortOrder;
} {
  return {
    sortBy: searchParams.get("sortBy"),
    sortDirection:
      searchParams.get("sortDirection") === "desc" ? "desc" : "asc",
  };
}

/** Sorts that can't be expressed in SQL and run over the full result set. */
export function isInMemoryInvoiceSort(sortBy: string | null): boolean {
  return (
    sortBy === "paidPastDue" ||
    sortBy === "daysUntilDue" ||
    sortBy === "issuedDate"
  );
}

/**
 * Newest first. Bulk-created invoices can share a createdAt, so id breaks
 * the tie - otherwise Postgres may return tied rows in a different order on
 * each query and rows shift between table pages.
 */
export const DEFAULT_INVOICE_ORDER: Prisma.InvoiceOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

export function buildInvoiceOrderBy(
  sortBy: string | null,
  sortDirection: Prisma.SortOrder,
): Prisma.InvoiceOrderByWithRelationInput[] {
  const primary = ((): Prisma.InvoiceOrderByWithRelationInput | null => {
    switch (sortBy) {
      case "invoiceNumber":
        return { invoiceNumber: sortDirection };
      case "customer":
        return { user: { name: sortDirection } };
      case "amount":
        return { totalAmount: sortDirection };
      case "status":
        return { status: sortDirection };
      case "paidDate":
        return { paidDate: sortDirection };
      case "dueDate":
        return { dueDate: sortDirection };
      default:
        return null;
    }
  })();

  return primary
    ? [primary, ...DEFAULT_INVOICE_ORDER]
    : [...DEFAULT_INVOICE_ORDER];
}

export function getPaidPastDueDays(invoice: {
  status: InvoiceStatus;
  paidDate: Date | null;
  dueDate: Date;
}): number | null {
  if (invoice.status !== InvoiceStatus.PAID || !invoice.paidDate) {
    return null;
  }

  const diffDays = Math.ceil(
    (new Date(invoice.paidDate).getTime() -
      new Date(invoice.dueDate).getTime()) /
      (1000 * 60 * 60 * 24),
  );

  return Math.max(0, diffDays);
}

function getDaysUntilDue(invoice: {
  status: InvoiceStatus;
  dueDate: Date;
}): number | null {
  if (invoice.status === InvoiceStatus.PAID) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(invoice.dueDate);
  due.setHours(0, 0, 0, 0);

  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Applies an in-memory sort (see isInMemoryInvoiceSort) to invoices that
 * were fetched ordered by createdAt desc.
 */
export function sortInvoicesInMemory<
  T extends {
    status: InvoiceStatus;
    paidDate: Date | null;
    dueDate: Date;
    issuedDate: Date | null;
    invoiceGeneratedDate: Date;
  },
>(invoices: T[], sortBy: string | null, sortDirection: Prisma.SortOrder): T[] {
  return [...invoices].sort((a, b) => {
    if (sortBy === "daysUntilDue") {
      const aIssuedPriority = a.status === InvoiceStatus.ISSUED ? 0 : 1;
      const bIssuedPriority = b.status === InvoiceStatus.ISSUED ? 0 : 1;

      if (aIssuedPriority !== bIssuedPriority) {
        return aIssuedPriority - bIssuedPriority;
      }
    }

    if (sortBy === "issuedDate") {
      // issuedDate can be null on invoices created before it was
      // tracked (or backfilled without it) - fall back to
      // invoiceGeneratedDate, matching what the UI displays for those
      // rows, so a row's position always matches the date shown.
      const aDate = new Date(a.issuedDate || a.invoiceGeneratedDate).getTime();
      const bDate = new Date(b.issuedDate || b.invoiceGeneratedDate).getTime();
      const cmp = aDate - bDate;
      return sortDirection === "asc" ? cmp : -cmp;
    }

    const aValue =
      sortBy === "paidPastDue" ? getPaidPastDueDays(a) : getDaysUntilDue(a);
    const bValue =
      sortBy === "paidPastDue" ? getPaidPastDueDays(b) : getDaysUntilDue(b);

    // Keep rows with no sortable value at the end for both directions.
    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;
    if (bValue === null) return -1;

    const cmp = aValue - bValue;
    return sortDirection === "asc" ? cmp : -cmp;
  });
}
