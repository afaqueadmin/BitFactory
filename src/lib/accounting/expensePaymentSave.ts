import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import {
  checkNotOverpaid,
  checkPaymentDate,
  ymd,
} from "@/lib/accounting/expense";
import { ParsedExpensePayment } from "@/lib/accounting/expenseRequest";

/** Thrown inside the transaction when the payment would overpay. */
export class OverpaidError extends Error {}

/** A payment-save rule the user broke (shown as a 400). */
export const isPaymentRuleError = (e: unknown): e is Error =>
  e instanceof OverpaidError || e instanceof PaymentDateError;

/** Thrown inside the transaction when the payment date breaks the rule. */
export class PaymentDateError extends Error {}

/**
 * Inside a transaction: locks the expense row (so two payments saved at once
 * can't both pass the balance check, and the expense date can't move under
 * it), then checks the payment date (on or after the expense, not after
 * `today`) and that the payment fits in the remaining balance. `editingId`
 * leaves the payment being edited out of the already-paid sum. Returns false
 * when the expense doesn't exist.
 */
export async function lockAndCheckBalance(
  tx: Prisma.TransactionClient,
  expenseId: string,
  data: ParsedExpensePayment["data"],
  today: string,
  editingId?: string,
): Promise<boolean> {
  const locked = await tx.$queryRaw<{ amountDueUsd: Decimal; date: Date }[]>`
    SELECT "amountDueUsd", "date" FROM "accounting_expenses"
    WHERE "id" = ${expenseId} FOR UPDATE`;
  if (locked.length === 0) return false;

  const dateError = checkPaymentDate({
    paymentDate: ymd(data.date as Date),
    expenseDate: ymd(locked[0].date),
    today,
  });
  if (dateError) throw new PaymentDateError(dateError);

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
