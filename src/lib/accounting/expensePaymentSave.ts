import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import { checkNotOverpaid } from "@/lib/accounting/expense";
import { ParsedExpensePayment } from "@/lib/accounting/expenseRequest";

/** Thrown inside the transaction when the payment would overpay. */
export class OverpaidError extends Error {}

/**
 * Inside a transaction: locks the expense row (so two payments saved at once
 * can't both pass the balance check), then checks the payment fits in the
 * remaining balance. `editingId` leaves the payment being edited out of the
 * already-paid sum. Returns false when the expense doesn't exist.
 */
export async function lockAndCheckBalance(
  tx: Prisma.TransactionClient,
  expenseId: string,
  data: ParsedExpensePayment["data"],
  editingId?: string,
): Promise<boolean> {
  const locked = await tx.$queryRaw<{ amountDueUsd: Decimal }[]>`
    SELECT "amountDueUsd" FROM "accounting_expenses"
    WHERE "id" = ${expenseId} FOR UPDATE`;
  if (locked.length === 0) return false;

  const others = await tx.accountingExpensePayment.aggregate({
    where: {
      expenseId,
      ...(editingId ? { id: { not: editingId } } : {}),
    },
    _sum: { amountUsd: true },
  });
  const error = checkNotOverpaid({
    dueUsd: new Decimal(locked[0].amountDueUsd),
    otherPaidUsd: others._sum.amountUsd ?? new Decimal(0),
    thisUsd: data.amountUsd,
  });
  if (error) throw new OverpaidError(error);
  return true;
}
