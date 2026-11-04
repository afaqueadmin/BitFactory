import { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatIsoDate, zonedDayStart } from "@/lib/helpers/admin/tableExport";

export interface InvoiceListSummary {
  unpaidCount: number;
  overdueCount: number;
  totalOutstanding: number;
}

/** Sent to the customer and not yet settled. */
const UNPAID_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.OVERDUE,
];

/**
 * Stat cards for an admin invoice list, over the same `where` as the table
 * so the two can never disagree. Drafts, cancelled, refunded and paid
 * invoices are not owed. Overdue: marked OVERDUE, or ISSUED with a due date
 * before today in the viewer's tz (the day the table's "Days Until Due"
 * counts from). Outstanding subtracts partial payments (voided ones don't
 * count), never below zero per invoice.
 */
export async function computeInvoiceSummary(
  where: Prisma.InvoiceWhereInput,
  tz: string,
): Promise<InvoiceListSummary> {
  const todayStart = zonedDayStart(formatIsoDate(new Date(), tz), tz);
  const unpaidWhere: Prisma.InvoiceWhereInput = {
    AND: [where, { status: { in: UNPAID_STATUSES } }],
  };

  const [unpaidCount, overdueCount, unpaid] = await Promise.all([
    prisma.invoice.count({ where: unpaidWhere }),
    prisma.invoice.count({
      where: {
        AND: [
          unpaidWhere,
          {
            OR: [
              { status: InvoiceStatus.OVERDUE },
              { dueDate: { lt: todayStart } },
            ],
          },
        ],
      },
    }),
    prisma.invoice.findMany({
      where: unpaidWhere,
      select: { id: true, totalAmount: true },
    }),
  ]);

  const paidByInvoice = new Map<string, number>();
  if (unpaid.length > 0) {
    const payments = await prisma.costPayment.groupBy({
      by: ["invoiceId"],
      where: {
        invoiceId: { in: unpaid.map((inv) => inv.id) },
        isDeleted: false,
      },
      _sum: { amount: true },
    });
    for (const p of payments) {
      if (p.invoiceId) paidByInvoice.set(p.invoiceId, p._sum.amount ?? 0);
    }
  }

  const totalOutstanding = unpaid.reduce(
    (sum, inv) =>
      sum +
      Math.max(0, Number(inv.totalAmount) - (paidByInvoice.get(inv.id) ?? 0)),
    0,
  );

  return {
    unpaidCount,
    overdueCount,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
  };
}
