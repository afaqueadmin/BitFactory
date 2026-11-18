import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { headCountInclude } from "@/lib/accounting/expenseRequest";

/**
 * Every head with its expense count and totals: Amount due = Σ its
 * expenses' Amount Due; Amount paid = Σ their payments' USD (fees not
 * included). Used by the Expense Heads list and its export.
 */
export async function headsWithTotals() {
  const [heads, expenses, paid] = await Promise.all([
    prisma.accountingExpenseHead.findMany({
      include: headCountInclude,
      orderBy: { name: "asc" },
    }),
    prisma.accountingExpense.findMany({
      select: { id: true, headId: true, amountDueUsd: true },
    }),
    prisma.accountingExpensePayment.groupBy({
      by: ["expenseId"],
      _sum: { amountUsd: true },
    }),
  ]);
  const paidByExpense = new Map(
    paid.map((p) => [p.expenseId, p._sum.amountUsd ?? new Decimal(0)]),
  );
  const totals = new Map<string, { due: Decimal; paid: Decimal }>();
  for (const e of expenses) {
    const t = totals.get(e.headId) ?? {
      due: new Decimal(0),
      paid: new Decimal(0),
    };
    t.due = t.due.plus(e.amountDueUsd);
    t.paid = t.paid.plus(paidByExpense.get(e.id) ?? 0);
    totals.set(e.headId, t);
  }
  return heads.map((h) => ({
    ...h,
    amountDueUsd: (totals.get(h.id)?.due ?? new Decimal(0)).toFixed(2),
    amountPaidUsd: (totals.get(h.id)?.paid ?? new Decimal(0)).toFixed(2),
  }));
}
